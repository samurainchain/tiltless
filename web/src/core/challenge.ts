import Big from 'big.js'
import { limitLevel, type LimitGauge } from './limits'
import type { Account, PropChallenge, Trade } from './models'
import { closedTrades, localDayKey } from './stats'

// Prop firm challenge (SPEC section 4.11): progress to the profit target and the room left under
// the daily and overall loss limits, from the account's closed trades. Firms also count open
// positions and may compute limits their own way, so this is a guide, not the firm's verdict.

export type ChallengeState = 'active' | 'passed' | 'failed'
export type ChallengeRule = 'dailyLoss' | 'maxLoss'

export interface ChallengeStatus {
  state: ChallengeState
  /** The first rule broken and the local day it happened. */
  breach?: { rule: ChallengeRule; day: string }
  size: Big
  /** Net PnL since the start date. */
  profit: Big
  balance: Big
  target?: { amount: Big; ratio: number; reached: boolean }
  /** Today's net loss against the daily limit (0 when today is in profit). */
  daily?: LimitGauge<Big>
  /** Loss from the account size against the overall limit (0 when in profit). */
  maxLoss?: LimitGauge<Big>
  tradingDays: number
  minTradingDays?: number
}

function percentOf(size: Big, pct: string | undefined): Big | undefined {
  if (!pct) return undefined
  const value = new Big(pct)
  return value.gt(0) ? size.times(value).div(100) : undefined
}

function gauge(used: Big, limit: Big): LimitGauge<Big> {
  const ratio = Number(used.div(limit).toFixed(4))
  return { used, limit, ratio, level: limitLevel(ratio) }
}

const ZERO = new Big(0)
const lossOf = (pnl: Big) => (pnl.lt(0) ? pnl.abs() : ZERO)

/** Where an account stands in its challenge, or undefined without rules or an account size. */
export function challengeStatus(account: Account, trades: readonly Trade[], now: Date): ChallengeStatus | undefined {
  const rules: PropChallenge | undefined = account.challenge
  if (!rules || !account.depositAmount) return undefined
  const size = new Big(account.depositAmount)
  if (size.lte(0)) return undefined

  const targetAmount = percentOf(size, rules.profitTargetPct)
  const dailyLimit = percentOf(size, rules.dailyLossPct)
  const maxLimit = percentOf(size, rules.maxLossPct)
  const today = localDayKey(now)

  const closed = closedTrades(trades.filter((trade) => trade.accountId === account.id)).filter((item) => {
    const day = localDayKey(item.closedAt)
    return day >= rules.startDate && day <= today
  })

  // Walk the trades in order: the balance's low point and each day's low point (losses taken
  // before a recovery still count, as with a firm's equity check) find the first broken rule.
  let profit = ZERO
  let breach: ChallengeStatus['breach']
  const days = new Map<string, Big>()
  for (const item of closed) {
    const day = localDayKey(item.closedAt)
    const dayPnl = (days.get(day) ?? ZERO).plus(item.pnl)
    days.set(day, dayPnl)
    profit = profit.plus(item.pnl)
    if (breach) continue
    if (dailyLimit && lossOf(dayPnl).gt(dailyLimit)) breach = { rule: 'dailyLoss', day }
    else if (maxLimit && lossOf(profit).gt(maxLimit)) breach = { rule: 'maxLoss', day }
  }

  const tradingDays = days.size
  const target = targetAmount && { amount: targetAmount, ratio: Number(profit.div(targetAmount).toFixed(4)), reached: profit.gte(targetAmount) }
  const enoughDays = !rules.minTradingDays || tradingDays >= rules.minTradingDays
  const state: ChallengeState = breach ? 'failed' : target?.reached && enoughDays ? 'passed' : 'active'

  return {
    state,
    breach,
    size,
    profit,
    balance: size.plus(profit),
    target,
    daily: dailyLimit && gauge(lossOf(days.get(today) ?? ZERO), dailyLimit),
    maxLoss: maxLimit && gauge(lossOf(profit), maxLimit),
    tradingDays,
    minTradingDays: rules.minTradingDays,
  }
}

/** Typical rules of a first challenge phase, filled in when the trader turns a challenge on. */
export function defaultChallenge(now: Date): PropChallenge {
  return { profitTargetPct: '10', dailyLossPct: '5', maxLossPct: '10', startDate: localDayKey(now) }
}
