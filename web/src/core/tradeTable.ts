import Big from 'big.js'
import type { Trade } from './models'
import { rMultiple, tradeDuration, tradePnl } from './pnl'

// The trade table on wide screens (SPEC section 4.5): which columns it shows, how it sorts and
// how it pages. Pure functions; the trader's column choice lives in the browser's settings.

export const TRADE_COLUMNS = ['side', 'account', 'entryPrice', 'exitPrice', 'openedAt', 'closedAt', 'duration', 'quantity', 'pnl', 'r', 'tags', 'emotion', 'rating'] as const
export type TradeColumn = (typeof TRADE_COLUMNS)[number]
/** The symbol always shows, so it's a sort key but not a column you can hide. */
export type SortKey = TradeColumn | 'symbol'

export const DEFAULT_HIDDEN_COLUMNS: readonly TradeColumn[] = ['account', 'openedAt', 'duration']
export const TRADES_PER_PAGE = 25

export interface TradeSort {
  key: SortKey
  direction: 'asc' | 'desc'
}

/** Newest exit first, like the list grouped by day. */
export const DEFAULT_SORT: TradeSort = { key: 'closedAt', direction: 'desc' }

/** Hidden columns from saved settings, dropping anything that is no longer a column. */
export function normalizeHiddenColumns(saved: unknown): TradeColumn[] {
  if (!Array.isArray(saved)) return [...DEFAULT_HIDDEN_COLUMNS]
  return TRADE_COLUMNS.filter((column) => saved.includes(column))
}

export function toggleColumn(hidden: readonly TradeColumn[], column: TradeColumn): TradeColumn[] {
  return hidden.includes(column) ? hidden.filter((item) => item !== column) : TRADE_COLUMNS.filter((item) => item === column || hidden.includes(item))
}

/** A star rating from stored data, or undefined when it isn't a whole number from 1 to 5. */
export function validRating(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5 ? value : undefined
}

type SortValue = string | number | Big | undefined

function sortValue(trade: Trade, key: SortKey, accountName: (id: string) => string): SortValue {
  switch (key) {
    case 'symbol':
      return trade.symbol.toLowerCase()
    case 'side':
      return trade.side
    case 'account':
      return accountName(trade.accountId).toLowerCase()
    case 'entryPrice':
      return new Big(trade.entryPrice)
    case 'exitPrice':
      return trade.exitPrice === undefined ? undefined : new Big(trade.exitPrice)
    case 'openedAt':
      return Date.parse(trade.openedAt)
    case 'closedAt':
      return Date.parse(trade.closedAt ?? trade.openedAt)
    case 'duration':
      return tradeDuration(trade)
    case 'quantity':
      return new Big(trade.quantity)
    case 'pnl':
      return tradePnl(trade)
    case 'r':
      return rMultiple(trade)
    case 'tags':
      return trade.mistakeIds.length || undefined
    case 'emotion':
      return trade.emotion
    case 'rating':
      return validRating(trade.rating)
  }
}

function compare(a: Exclude<SortValue, undefined>, b: Exclude<SortValue, undefined>): number {
  if (a instanceof Big && b instanceof Big) return a.cmp(b)
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b))
}

/**
 * Sorts by a column. Trades without a value there (open trades by PnL, no stop by R, unrated
 * by rating) go last in either direction; ties keep the newest exit first.
 */
export function sortTrades(trades: readonly Trade[], sort: TradeSort, accountName: (id: string) => string = () => ''): Trade[] {
  const sign = sort.direction === 'asc' ? 1 : -1
  const newest = (a: Trade, b: Trade) => Date.parse(b.closedAt ?? b.openedAt) - Date.parse(a.closedAt ?? a.openedAt) || b.createdAt.localeCompare(a.createdAt)
  return trades
    .map((trade) => ({ trade, value: sortValue(trade, sort.key, accountName) }))
    .sort((a, b) => {
      if (a.value === undefined || b.value === undefined) return a.value === b.value ? newest(a.trade, b.trade) : a.value === undefined ? 1 : -1
      return sign * compare(a.value, b.value) || newest(a.trade, b.trade)
    })
    .map((item) => item.trade)
}

/** Sorted by time, the table reads like the journal: rows grouped under their day. */
export function groupsByDay(sort: TradeSort): boolean {
  return sort.key === 'closedAt' || sort.key === 'openedAt'
}

/** Clicking the sorted column flips it; another column starts descending (biggest, newest first), text ascending. */
export function nextSort(current: TradeSort, key: SortKey): TradeSort {
  if (current.key === key) return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
  return { key, direction: key === 'symbol' || key === 'side' || key === 'account' || key === 'emotion' ? 'asc' : 'desc' }
}

export function pageCount(total: number, perPage = TRADES_PER_PAGE): number {
  return Math.max(1, Math.ceil(total / perPage))
}

/** The trades on a page (0-based), with the page clamped to the ones that exist. */
export function pageOf<T>(items: readonly T[], page: number, perPage = TRADES_PER_PAGE): { items: T[]; page: number; first: number; last: number } {
  const clamped = Math.min(Math.max(0, page), pageCount(items.length, perPage) - 1)
  const start = clamped * perPage
  const slice = items.slice(start, start + perPage)
  return { items: slice, page: clamped, first: slice.length ? start + 1 : 0, last: start + slice.length }
}
