import Big from 'big.js'
import { describe, expect, it } from 'vitest'
import type { Trade } from '../../core/models'
import { activeFilterCount, filterTrades, symbolsByUse } from './tradeFilters'

let sequence = 0
function trade(pnl: string | undefined, closedAt: Date, overrides: Partial<Trade> = {}): Trade {
  sequence += 1
  const iso = closedAt.toISOString()
  return {
    id: `t${sequence}`, accountId: 'a', symbol: 'BTCUSDT', side: 'long', market: 'cryptoSpot', entryPrice: '100',
    exitPrice: pnl === undefined ? undefined : new Big(100).plus(pnl).toString(), quantity: '1', contractMultiplier: '1', fees: '0',
    openedAt: iso, closedAt: pnl === undefined ? undefined : iso, mistakeIds: [], setupIds: [], brokenRuleIds: [], note: '',
    source: 'manual', createdAt: iso, updatedAt: iso, ...overrides,
  }
}

const NOW = new Date(2026, 9, 28, 12) // Wednesday
const trades = [
  trade('50', new Date(2026, 9, 27), { symbol: 'ETHUSDT', emotion: 'calm', setupIds: ['breakout'] }),
  trade('-20', new Date(2026, 9, 26), { emotion: 'fomo', mistakeIds: ['m-fomo'] }),
  trade('-5', new Date(2026, 8, 20), { emotion: 'fomo', mistakeIds: ['m-fomo', 'm-early'] }), // more than 30 days ago
  trade(undefined, new Date(2026, 9, 28)),
]
const ids = (list: Trade[]) => list.map((item) => item.id)

describe('filterTrades', () => {
  it('returns everything without filters', () => {
    expect(filterTrades(trades, {}, NOW)).toHaveLength(4)
  })

  it('filters by period, symbol, emotion, mistake and setup', () => {
    expect(ids(filterTrades(trades, { period: 'week' }, NOW))).toEqual([trades[0]!.id, trades[1]!.id, trades[3]!.id])
    expect(ids(filterTrades(trades, { symbol: 'ETHUSDT' }, NOW))).toEqual([trades[0]!.id])
    expect(filterTrades(trades, { emotion: 'fomo' }, NOW)).toHaveLength(2)
    expect(ids(filterTrades(trades, { mistakeId: 'm-early' }, NOW))).toEqual([trades[2]!.id])
    expect(ids(filterTrades(trades, { setupId: 'breakout' }, NOW))).toEqual([trades[0]!.id])
  })

  it('filters by result, leaving out open trades', () => {
    expect(ids(filterTrades(trades, { result: 'profit' }, NOW))).toEqual([trades[0]!.id])
    expect(filterTrades(trades, { result: 'loss' }, NOW)).toHaveLength(2)
  })

  it('combines filters', () => {
    expect(ids(filterTrades(trades, { emotion: 'fomo', period: 'month' }, NOW))).toEqual([trades[1]!.id])
  })
})

describe('helpers', () => {
  it('counts active filters', () => {
    expect(activeFilterCount({})).toBe(0)
    expect(activeFilterCount({ symbol: 'BTCUSDT', result: 'loss' })).toBe(2)
  })

  it('lists symbols by how often they were traded', () => {
    expect(symbolsByUse(trades)).toEqual(['BTCUSDT', 'ETHUSDT'])
  })
})

describe('rating filter', () => {
  const rated = [trade('10', NOW, { id: 'five', rating: 5 }), trade('-10', NOW, { id: 'two', rating: 2 }), trade('1', NOW, { id: 'none' })]

  it('keeps trades with exactly that many stars, or the unrated ones', () => {
    expect(ids(filterTrades(rated, { rating: 5 }, NOW))).toEqual(['five'])
    expect(ids(filterTrades(rated, { rating: 'none' }, NOW))).toEqual(['none'])
    expect(activeFilterCount({ rating: 'none' })).toBe(1)
  })
})
