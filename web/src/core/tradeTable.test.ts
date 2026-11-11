import Big from 'big.js'
import { describe, expect, it } from 'vitest'
import type { Trade } from './models'
import { DEFAULT_HIDDEN_COLUMNS, DEFAULT_SORT, groupsByDay, nextSort, normalizeHiddenColumns, pageCount, pageOf, sortTrades, toggleColumn, validRating } from './tradeTable'

let sequence = 0

/** A long trade with entry 100 and the given PnL, closed `hour` o'clock on Oct 27, 2026. */
function trade(pnl: string | undefined, hour: number, overrides: Partial<Trade> = {}): Trade {
  sequence += 1
  const closedAt = new Date(2026, 9, 27, hour).toISOString()
  return {
    id: `t${sequence}`,
    accountId: 'a',
    symbol: 'BTCUSDT',
    side: 'long',
    market: 'cryptoPerp',
    entryPrice: '100',
    exitPrice: pnl === undefined ? undefined : new Big(100).plus(pnl).toString(),
    quantity: '1',
    contractMultiplier: '1',
    fees: '0',
    openedAt: new Date(2026, 9, 27, hour - 1).toISOString(),
    closedAt: pnl === undefined ? undefined : closedAt,
    mistakeIds: [],
    setupIds: [],
    brokenRuleIds: [],
    note: '',
    source: 'manual',
    createdAt: closedAt,
    updatedAt: closedAt,
    ...overrides,
  }
}

const ids = (trades: readonly Trade[]) => trades.map((item) => item.id)

describe('sortTrades', () => {
  const win = trade('40', 10, { id: 'win', symbol: 'ETHUSDT', rating: 4 })
  const loss = trade('-25', 12, { id: 'loss', symbol: 'btcusdt', stopLoss: '90', initialStopLoss: '90' })
  const open = trade(undefined, 14, { id: 'open', symbol: 'SOLUSDT', rating: 2 })
  const small = trade('5', 11, { id: 'small', symbol: 'ADAUSDT' })
  const all = [win, loss, open, small]

  it('defaults to the newest exit (or entry while open) first', () => {
    expect(ids(sortTrades(all, DEFAULT_SORT))).toEqual(['open', 'loss', 'small', 'win'])
  })

  it('sorts PnL by decimal value and keeps open trades last both ways', () => {
    expect(ids(sortTrades(all, { key: 'pnl', direction: 'desc' }))).toEqual(['win', 'small', 'loss', 'open'])
    expect(ids(sortTrades(all, { key: 'pnl', direction: 'asc' }))).toEqual(['loss', 'small', 'win', 'open'])
  })

  it('sorts symbols ignoring case', () => {
    expect(ids(sortTrades(all, { key: 'symbol', direction: 'asc' }))).toEqual(['small', 'loss', 'win', 'open'])
  })

  it('puts unrated trades and trades without a stop last', () => {
    expect(ids(sortTrades(all, { key: 'rating', direction: 'desc' }))).toEqual(['win', 'open', 'loss', 'small'])
    expect(ids(sortTrades(all, { key: 'r', direction: 'asc' }))[0]).toBe('loss')
  })

  it('sorts by account name through the lookup', () => {
    const names: Record<string, string> = { a: 'Bybit', b: 'apex' }
    const other = trade('1', 9, { id: 'other', accountId: 'b' })
    expect(ids(sortTrades([win, other], { key: 'account', direction: 'asc' }, (id) => names[id]!))).toEqual(['other', 'win'])
  })
})

describe('nextSort', () => {
  it('flips the sorted column and starts numbers high, text from A', () => {
    expect(nextSort(DEFAULT_SORT, 'closedAt')).toEqual({ key: 'closedAt', direction: 'asc' })
    expect(nextSort(DEFAULT_SORT, 'pnl')).toEqual({ key: 'pnl', direction: 'desc' })
    expect(nextSort(DEFAULT_SORT, 'symbol')).toEqual({ key: 'symbol', direction: 'asc' })
  })
})

describe('columns', () => {
  it('reads saved hidden columns defensively', () => {
    expect(normalizeHiddenColumns(undefined)).toEqual(DEFAULT_HIDDEN_COLUMNS)
    expect(normalizeHiddenColumns(['r', 'gone', 'side'])).toEqual(['side', 'r'])
    expect(normalizeHiddenColumns([])).toEqual([])
  })

  it('toggles a column, keeping the table order', () => {
    expect(toggleColumn(['r'], 'side')).toEqual(['side', 'r'])
    expect(toggleColumn(['side', 'r'], 'side')).toEqual(['r'])
  })

  it('accepts ratings from 1 to 5 only', () => {
    expect([1, 5, 0, 6, 2.5, '3', undefined].map(validRating)).toEqual([1, 5, undefined, undefined, undefined, undefined, undefined])
  })
})

describe('pageOf', () => {
  const items = Array.from({ length: 39 }, (_, index) => index)

  it('slices pages and reports the range shown', () => {
    expect(pageCount(39, 10)).toBe(4)
    expect(pageOf(items, 1, 10)).toMatchObject({ page: 1, first: 11, last: 20 })
    expect(pageOf(items, 3, 10).items).toEqual([30, 31, 32, 33, 34, 35, 36, 37, 38])
  })

  it('clamps a page past the end, e.g. after filtering', () => {
    expect(pageOf(items.slice(0, 5), 3, 10)).toMatchObject({ page: 0, first: 1, last: 5 })
    expect(pageOf([], 2, 10)).toMatchObject({ page: 0, first: 0, last: 0 })
  })
})

describe('groupsByDay', () => {
  it('groups rows under their day only when the table is sorted by time', () => {
    expect(groupsByDay(DEFAULT_SORT)).toBe(true)
    expect(groupsByDay({ key: 'openedAt', direction: 'asc' })).toBe(true)
    expect(groupsByDay({ key: 'pnl', direction: 'desc' })).toBe(false)
  })
})
