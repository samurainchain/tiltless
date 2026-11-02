import type { Emotion, Trade } from '../../core/models'
import { tradePnl } from '../../core/pnl'
import { periodStart, type Period } from '../../core/stats'
import { validRating } from '../../core/tradeTable'

/** Filters for the trade list (SPEC section 4.5). Unset fields don't filter. */
export interface TradeFilter {
  period?: Exclude<Period, 'all'>
  symbol?: string
  result?: 'profit' | 'loss'
  emotion?: Emotion
  mistakeId?: string
  setupId?: string
  /** Stars 1–5, or trades not rated yet. */
  rating?: number | 'none'
}

export function activeFilterCount(filter: TradeFilter): number {
  return Object.values(filter).filter((value) => value !== undefined).length
}

export function filterTrades(trades: readonly Trade[], filter: TradeFilter, now: Date): Trade[] {
  const since = filter.period ? periodStart(filter.period, now) : undefined
  return trades.filter((trade) => {
    if (since && new Date(trade.closedAt ?? trade.openedAt) < since) return false
    if (filter.symbol && trade.symbol !== filter.symbol) return false
    if (filter.emotion && trade.emotion !== filter.emotion) return false
    if (filter.mistakeId && !trade.mistakeIds.includes(filter.mistakeId)) return false
    if (filter.setupId && !trade.setupIds.includes(filter.setupId)) return false
    if (filter.rating !== undefined && (validRating(trade.rating) ?? 'none') !== filter.rating) return false
    if (filter.result) {
      const pnl = tradePnl(trade)
      if (!pnl) return false
      if (filter.result === 'profit' ? !pnl.gt(0) : !pnl.lt(0)) return false
    }
    return true
  })
}

/** Symbols traded, most used first, for the symbol filter. */
export function symbolsByUse(trades: readonly Trade[]): string[] {
  const counts = new Map<string, number>()
  for (const trade of trades) counts.set(trade.symbol, (counts.get(trade.symbol) ?? 0) + 1)
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([symbol]) => symbol)
}
