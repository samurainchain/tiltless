import Big from 'big.js'
import type { JournalProfile, Trade } from './models'
import { closedTrades, localDayKey, type ClosedTrade } from './stats'

// Anti-tilt (SPEC section 6): daily limits, alerts and the rule streak. Limits apply to all
// accounts together, because tilt is about the trader's day, not one account.

export type LimitLevel = 'ok' | 'warning' | 'reached'

const WARNING_RATIO = 0.8

export interface LimitGauge<T> {
  used: T
  limit: T
  /** used / limit, not capped at 1. */
  ratio: number
  level: LimitLevel
}

export interface DayLimits {
  /** Today's net loss against the daily loss limit (0 when the day is in profit). */
  loss?: LimitGauge<Big>
  /** Closed trades today against the daily trade limit. */
  trades?: LimitGauge<number>
  reached: boolean
}

/** 'warning' from 80% of a limit, 'reached' from 100%. */
export function limitLevel(ratio: number): LimitLevel {
  if (ratio >= 1) return 'reached'
  if (ratio >= WARNING_RATIO) return 'warning'
  return 'ok'
}

function dayTrades(trades: readonly ClosedTrade[], day: string): ClosedTrade[] {
  return trades.filter((item) => localDayKey(item.closedAt) === day)
}

function netLoss(trades: readonly ClosedTrade[]): Big {
  const pnl = trades.reduce((total, item) => total.plus(item.pnl), new Big(0))
  return pnl.lt(0) ? pnl.abs() : new Big(0)
}

export function dayLimits(trades: readonly Trade[], profile: JournalProfile, now: Date): DayLimits {
  const today = dayTrades(closedTrades(trades), localDayKey(now))
  const result: DayLimits = { reached: false }

  if (profile.dailyLossLimit && new Big(profile.dailyLossLimit).gt(0)) {
    const limit = new Big(profile.dailyLossLimit)
    const used = netLoss(today)
    const ratio = Number(used.div(limit).toFixed(4))
    result.loss = { used, limit, ratio, level: limitLevel(ratio) }
  }
  if (profile.dailyTradeLimit && profile.dailyTradeLimit > 0) {
    const ratio = today.length / profile.dailyTradeLimit
    result.trades = { used: today.length, limit: profile.dailyTradeLimit, ratio, level: limitLevel(ratio) }
  }
  result.reached = result.loss?.level === 'reached' || result.trades?.level === 'reached'
  return result
}

/** Alert once a day, the first time a limit is reached. `lastAlertDay` is a `YYYY-MM-DD` key. */
export function shouldAlert(limits: DayLimits, lastAlertDay: string | undefined, now: Date): boolean {
  return limits.reached && lastAlertDay !== localDayKey(now)
}

/**
 * Days in a row with at least one trade and no broken rules or exceeded limits, counting back
 * from today. Days without trades don't break the streak. Reaching a limit exactly is fine;
 * going past it breaks the streak. Uses the limits as they are set now.
 */
export function ruleStreak(trades: readonly Trade[], profile: JournalProfile, now: Date): number {
  const closed = closedTrades(trades).filter((item) => item.closedAt <= now)
  const days = [...new Set(closed.map((item) => localDayKey(item.closedAt)))].sort().reverse()
  const lossLimit = profile.dailyLossLimit ? new Big(profile.dailyLossLimit) : undefined
  let streak = 0
  for (const day of days) {
    const items = dayTrades(closed, day)
    const brokeRule = items.some((item) => item.trade.brokenRuleIds.length > 0)
    const overLoss = lossLimit?.gt(0) ? netLoss(items).gt(lossLimit) : false
    const overTrades = profile.dailyTradeLimit ? items.length > profile.dailyTradeLimit : false
    if (brokeRule || overLoss || overTrades) break
    streak += 1
  }
  return streak
}
