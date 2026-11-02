import Big from 'big.js'
import type { Emotion, MistakeTag, Trade } from './models'
import { rMultiple, tradePnl } from './pnl'

// StatsEngine (SPEC section 6): pure functions over trades. Only closed trades count.
// Dates are bucketed in the browser's time zone.

export type Period = 'week' | 'month' | 'quarter' | 'all'
export const PERIODS: readonly Period[] = ['week', 'month', 'quarter', 'all']

/** 0 = Sunday … 6 = Saturday, as in `Date.getDay()`. */
export type WeekStart = 0 | 1

export interface ClosedTrade {
  trade: Trade
  pnl: Big
  r?: Big
  closedAt: Date
}

/** Closed trades with their PnL, oldest exit first. */
export function closedTrades(trades: readonly Trade[]): ClosedTrade[] {
  return trades
    .flatMap((trade) => {
      const pnl = tradePnl(trade)
      if (!pnl) return []
      return [{ trade, pnl, r: rMultiple(trade), closedAt: new Date(trade.closedAt ?? trade.openedAt) }]
    })
    .sort((a, b) => a.closedAt.getTime() - b.closedAt.getTime())
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function startOfWeek(date: Date, weekStart: WeekStart): Date {
  const day = startOfDay(date)
  const offset = (day.getDay() - weekStart + 7) % 7
  day.setDate(day.getDate() - offset)
  return day
}

/** Days in each rolling period, today included. */
export const PERIOD_DAYS: Record<Exclude<Period, 'all'>, number> = { week: 7, month: 30, quarter: 90 }

/**
 * First moment of a period: the start of the day 6, 29 or 89 days ago, so "week" is the last 7
 * days, "month" the last 30 and "quarter" the last 90, or undefined for all time. Rolling, not
 * calendar periods: on the first days of a week or a month the analytics still show recent trades.
 */
export function periodStart(period: Period, now: Date): Date | undefined {
  if (period === 'all') return undefined
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - (PERIOD_DAYS[period] - 1))
}

export function inPeriod(trades: readonly ClosedTrade[], period: Period, now: Date): ClosedTrade[] {
  const start = periodStart(period, now)
  return start ? trades.filter((item) => item.closedAt >= start) : [...trades]
}

const sum = (values: readonly Big[]) => values.reduce((total, value) => total.plus(value), new Big(0))
const mean = (values: readonly Big[]) => (values.length ? sum(values).div(values.length) : undefined)

export interface Metrics {
  count: number
  pnl: Big
  /** 0–1, wins over all closed trades. */
  winRate?: Big
  /** Mean R over trades that have a stop. */
  averageR?: Big
  /** winRate × average win − (1 − winRate) × average loss, in money per trade. */
  expectancy?: Big
  /** Gross profit / |gross loss|; undefined when there are no losses. */
  profitFactor?: Big
  grossProfit: Big
  grossLoss: Big
  /** Largest fall of cumulative PnL from a previous peak, as a positive amount. */
  maxDrawdown: Big
}

export function metrics(trades: readonly ClosedTrade[]): Metrics {
  const wins = trades.filter((item) => item.pnl.gt(0)).map((item) => item.pnl)
  const losses = trades.filter((item) => item.pnl.lt(0)).map((item) => item.pnl.abs())
  const grossProfit = sum(wins)
  const grossLoss = sum(losses)
  const count = trades.length
  const winRate = count ? new Big(wins.length).div(count) : undefined
  const averageWin = mean(wins) ?? new Big(0)
  const averageLoss = mean(losses) ?? new Big(0)
  const rs = trades.flatMap((item) => (item.r ? [item.r] : []))

  return {
    count,
    pnl: sum(trades.map((item) => item.pnl)),
    winRate,
    averageR: mean(rs),
    expectancy: winRate ? winRate.times(averageWin).minus(new Big(1).minus(winRate).times(averageLoss)) : undefined,
    profitFactor: grossLoss.gt(0) ? grossProfit.div(grossLoss) : undefined,
    grossProfit,
    grossLoss,
    maxDrawdown: maxDrawdown(trades),
  }
}

export interface EquityPoint {
  at: Date
  equity: Big
}

/** Cumulative PnL after each closed trade, in exit order. */
export function equityCurve(trades: readonly ClosedTrade[]): EquityPoint[] {
  let equity = new Big(0)
  return trades.map((item) => {
    equity = equity.plus(item.pnl)
    return { at: item.closedAt, equity }
  })
}

export function maxDrawdown(trades: readonly ClosedTrade[]): Big {
  let peak = new Big(0)
  let worst = new Big(0)
  for (const { equity } of equityCurve(trades)) {
    if (equity.gt(peak)) peak = equity
    const drawdown = peak.minus(equity)
    if (drawdown.gt(worst)) worst = drawdown
  }
  return worst
}

export interface MistakeCost {
  tag: MistakeTag
  /** Money lost to this mistake: losing trades' |PnL|, split evenly between their mistakes. */
  cost: Big
  /** Closed trades carrying this mistake, winners included. */
  tradeCount: number
  winRate?: Big
}

/** Cost of each mistake, most expensive first; tags never used in the period are left out. */
export function mistakeCosts(trades: readonly ClosedTrade[], tags: readonly MistakeTag[]): MistakeCost[] {
  return tags
    .flatMap((tag) => {
      const tagged = trades.filter((item) => item.trade.mistakeIds.includes(tag.id))
      if (tagged.length === 0) return []
      const cost = sum(
        tagged.filter((item) => item.pnl.lt(0)).map((item) => item.pnl.abs().div(knownMistakeCount(item.trade, tags))),
      )
      const wins = tagged.filter((item) => item.pnl.gt(0)).length
      return [{ tag, cost, tradeCount: tagged.length, winRate: new Big(wins).div(tagged.length) }]
    })
    .sort((a, b) => b.cost.cmp(a.cost))
}

/** Mistakes on a trade that still exist; a deleted tag shouldn't absorb part of the loss. */
function knownMistakeCount(trade: Trade, tags: readonly MistakeTag[]): number {
  return trade.mistakeIds.filter((id) => tags.some((tag) => tag.id === id)).length
}

/** "Without these mistakes you'd be at…": current PnL plus every mistake's cost. An estimate. */
export function pnlWithoutMistakes(trades: readonly ClosedTrade[], costs: readonly MistakeCost[]): Big {
  return sum(trades.map((item) => item.pnl)).plus(sum(costs.map((item) => item.cost)))
}

export interface Breakdown<K> {
  key: K
  count: number
  pnl: Big
  winRate: Big
  averageR?: Big
}

/** Groups trades by one or more keys each (a trade with two setups counts in both). */
export function breakdown<K>(trades: readonly ClosedTrade[], keysOf: (item: ClosedTrade) => readonly K[]): Breakdown<K>[] {
  const groups = new Map<K, ClosedTrade[]>()
  for (const item of trades) {
    for (const key of keysOf(item)) groups.set(key, [...(groups.get(key) ?? []), item])
  }
  return [...groups].map(([key, items]) => ({
    key,
    count: items.length,
    pnl: sum(items.map((item) => item.pnl)),
    winRate: new Big(items.filter((item) => item.pnl.gt(0)).length).div(items.length),
    averageR: mean(items.flatMap((item) => (item.r ? [item.r] : []))),
  }))
}

export const byEmotion = (trades: readonly ClosedTrade[]) =>
  breakdown<Emotion>(trades, (item) => (item.trade.emotion ? [item.trade.emotion] : []))
export const bySymbol = (trades: readonly ClosedTrade[]) => breakdown(trades, (item) => [item.trade.symbol])
export const bySetup = (trades: readonly ClosedTrade[]) => breakdown(trades, (item) => item.trade.setupIds)

/** PnL per hour of entry, 0–23, every hour present. */
export function byHour(trades: readonly ClosedTrade[]): Big[] {
  const hours = Array.from({ length: 24 }, () => new Big(0))
  for (const item of trades) {
    const hour = new Date(item.trade.openedAt).getHours()
    hours[hour] = hours[hour]!.plus(item.pnl)
  }
  return hours
}

/** PnL per weekday of entry, index as `Date.getDay()` (0 = Sunday). */
export function byWeekday(trades: readonly ClosedTrade[]): Big[] {
  const days = Array.from({ length: 7 }, () => new Big(0))
  for (const item of trades) {
    const day = new Date(item.trade.openedAt).getDay()
    days[day] = days[day]!.plus(item.pnl)
  }
  return days
}

/** PnL and trade count per local day, keyed `YYYY-MM-DD`. */
export function dailyPnl(trades: readonly ClosedTrade[]): Map<string, { pnl: Big; count: number }> {
  const days = new Map<string, { pnl: Big; count: number }>()
  for (const item of trades) {
    const key = localDayKey(item.closedAt)
    const day = days.get(key) ?? { pnl: new Big(0), count: 0 }
    days.set(key, { pnl: day.pnl.plus(item.pnl), count: day.count + 1 })
  }
  return days
}

export function localDayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** The most expensive mistake over the last 7 days (SPEC section 4.3), if any cost money. */
export function mistakeOfTheWeek(trades: readonly ClosedTrade[], tags: readonly MistakeTag[], now: Date): MistakeCost | undefined {
  const since = startOfDay(now)
  since.setDate(since.getDate() - 6)
  const [top] = mistakeCosts(
    trades.filter((item) => item.closedAt >= since),
    tags,
  )
  return top && top.cost.gt(0) ? top : undefined
}
