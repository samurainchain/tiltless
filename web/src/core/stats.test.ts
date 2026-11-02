import Big from 'big.js'
import { describe, expect, it } from 'vitest'
import type { MistakeTag, Side, Trade } from './models'
import {
  byEmotion,
  byHour,
  bySetup,
  bySymbol,
  byWeekday,
  closedTrades,
  dailyPnl,
  equityCurve,
  inPeriod,
  maxDrawdown,
  metrics,
  mistakeCosts,
  mistakeOfTheWeek,
  periodStart,
  pnlWithoutMistakes,
} from './stats'

let sequence = 0

/** A trade whose PnL is exactly `pnl` (entry 100, size 1), closed at `closedAt` local time. */
function trade(pnl: string, closedAt: Date, overrides: Partial<Trade> = {}): Trade {
  sequence += 1
  const side: Side = 'long'
  const iso = closedAt.toISOString()
  return {
    id: `t${sequence}`,
    accountId: 'a',
    symbol: 'BTCUSDT',
    side,
    market: 'cryptoSpot',
    entryPrice: '100',
    exitPrice: new Big(100).plus(pnl).toString(),
    quantity: '1',
    contractMultiplier: '1',
    fees: '0',
    openedAt: iso,
    closedAt: iso,
    mistakeIds: [],
    setupIds: [],
    brokenRuleIds: [],
    note: '',
    source: 'manual',
    createdAt: iso,
    updatedAt: iso,
    ...overrides,
  }
}

function tag(id: string): MistakeTag {
  return { id, name: id, colorHex: '#000000', isSystem: false, sortOrder: 0, isArchived: false }
}

const day = (d: number, h = 12) => new Date(2026, 9, d, h)
const str = (value: Big | undefined) => value?.toString()

describe('closedTrades', () => {
  it('skips open trades and sorts by exit time', () => {
    const late = trade('10', day(20))
    const early = trade('-5', day(10))
    const open = trade('0', day(15), { exitPrice: undefined, closedAt: undefined })
    expect(closedTrades([late, open, early]).map((item) => item.trade.id)).toEqual([early.id, late.id])
  })
})

describe('metrics', () => {
  // +300, −100, +100, −200, 0 → wins 2 of 5
  const trades = closedTrades([
    trade('300', day(1)),
    trade('-100', day(2)),
    trade('100', day(3)),
    trade('-200', day(4)),
    trade('0', day(5)),
  ])
  const result = metrics(trades)

  it('sums PnL and counts', () => {
    expect(result.count).toBe(5)
    expect(str(result.pnl)).toBe('100')
  })

  it('computes win rate over all closed trades', () => {
    expect(str(result.winRate)).toBe('0.4')
  })

  it('computes expectancy as winRate × avg win − (1 − winRate) × avg loss', () => {
    // 0.4 × 200 − 0.6 × 150 = 80 − 90 = −10
    expect(str(result.expectancy)).toBe('-10')
  })

  it('computes profit factor as gross profit over gross loss', () => {
    expect(str(result.grossProfit)).toBe('400')
    expect(str(result.grossLoss)).toBe('300')
    expect(result.profitFactor?.toFixed(4)).toBe('1.3333')
  })

  it('leaves profit factor undefined without losses', () => {
    expect(metrics(closedTrades([trade('50', day(1))])).profitFactor).toBeUndefined()
  })

  it('averages R only over trades with a stop', () => {
    const withStops = closedTrades([
      trade('20', day(1), { stopLoss: '90' }), // 2R
      trade('-5', day(2), { stopLoss: '95' }), // −1R
      trade('100', day(3)), // no stop
    ])
    expect(str(metrics(withStops).averageR)).toBe('0.5')
  })

  it('handles an empty period', () => {
    const empty = metrics([])
    expect(empty.count).toBe(0)
    expect(str(empty.pnl)).toBe('0')
    expect(empty.winRate).toBeUndefined()
    expect(empty.expectancy).toBeUndefined()
    expect(str(empty.maxDrawdown)).toBe('0')
  })
})

describe('equity curve and drawdown', () => {
  it('accumulates PnL in exit order', () => {
    const curve = equityCurve(closedTrades([trade('100', day(1)), trade('-30', day(2)), trade('50', day(3))]))
    expect(curve.map((point) => point.equity.toString())).toEqual(['100', '70', '120'])
  })

  it('measures the largest fall from a previous peak', () => {
    // equity: 100, 300 (peak), 150, 50, 250, 400 (peak), 380 → worst fall 300 − 50 = 250
    const trades = closedTrades(['100', '200', '-150', '-100', '200', '150', '-20'].map((pnl, index) => trade(pnl, day(index + 1))))
    expect(str(maxDrawdown(trades))).toBe('250')
  })

  it('counts a loss from the start as drawdown from zero', () => {
    expect(str(maxDrawdown(closedTrades([trade('-40', day(1)), trade('10', day(2))])))).toBe('40')
  })
})

describe('mistake costs', () => {
  const fomo = tag('fomo')
  const revenge = tag('revenge')
  const early = tag('early')
  const trades = closedTrades([
    trade('-300', day(1), { mistakeIds: ['fomo', 'revenge'] }), // split 150 / 150
    trade('-100', day(2), { mistakeIds: ['fomo'] }),
    trade('200', day(3), { mistakeIds: ['fomo'] }), // a winner: counts in trades, costs nothing
    trade('-50', day(4)), // no mistakes
    trade('80', day(5), { mistakeIds: ['early'] }),
  ])
  const costs = mistakeCosts(trades, [early, revenge, fomo])

  it('splits a loss evenly between its mistakes and sorts by cost', () => {
    expect(costs.map((item) => [item.tag.id, item.cost.toString()])).toEqual([
      ['fomo', '250'],
      ['revenge', '150'],
      ['early', '0'],
    ])
  })

  it('never counts a loss twice', () => {
    const totalCost = costs.reduce((total, item) => total.plus(item.cost), new Big(0))
    const taggedLosses = new Big(300).plus(100)
    expect(totalCost.toString()).toBe(taggedLosses.toString())
  })

  it('reports how many trades carry each mistake and their win rate', () => {
    const fomoCost = costs.find((item) => item.tag.id === 'fomo')!
    expect(fomoCost.tradeCount).toBe(3)
    expect(fomoCost.winRate?.toFixed(4)).toBe('0.3333')
  })

  it('adds the cost of mistakes back for the "without mistakes" estimate', () => {
    // PnL −170, mistakes cost 400 → +230
    expect(str(pnlWithoutMistakes(trades, costs))).toBe('230')
  })

  it('ignores deleted tags when splitting a loss', () => {
    const [only] = mistakeCosts(closedTrades([trade('-90', day(1), { mistakeIds: ['fomo', 'deleted'] })]), [fomo])
    expect(str(only?.cost)).toBe('90')
  })

  it('picks the most expensive mistake of the last 7 days', () => {
    const now = day(20, 18)
    const recent = closedTrades([
      trade('-500', day(10), { mistakeIds: ['revenge'] }), // older than 7 days
      trade('-40', day(14), { mistakeIds: ['fomo'] }),
      trade('-60', day(19), { mistakeIds: ['early'] }),
    ])
    expect(mistakeOfTheWeek(recent, [fomo, revenge, early], now)?.tag.id).toBe('early')
    expect(mistakeOfTheWeek(closedTrades([trade('10', day(19), { mistakeIds: ['fomo'] })]), [fomo], now)).toBeUndefined()
  })
})

describe('periods', () => {
  const now = new Date(2026, 9, 28, 15) // Wednesday 28 Oct 2026

  it('rolls: the last 7, 30 and 90 days, today included', () => {
    expect(periodStart('week', now)).toEqual(new Date(2026, 9, 22))
    expect(periodStart('month', now)).toEqual(new Date(2026, 8, 29))
    expect(periodStart('quarter', now)).toEqual(new Date(2026, 6, 31))
    expect(periodStart('all', now)).toBeUndefined()
  })

  it('still shows last week on the first days of a new week and month', () => {
    const monday = new Date(2026, 10, 2, 9) // Monday 2 Nov 2026
    const trades = closedTrades([trade('5', new Date(2026, 9, 28, 14)), trade('-3', new Date(2026, 9, 30, 11))])
    expect(inPeriod(trades, 'week', monday)).toHaveLength(2)
    expect(inPeriod(trades, 'month', monday)).toHaveLength(2)
  })

  it('filters trades by exit time', () => {
    const trades = closedTrades([trade('1', new Date(2026, 9, 21, 23)), trade('2', new Date(2026, 9, 22, 0, 5))])
    expect(inPeriod(trades, 'week', now).map((item) => item.pnl.toString())).toEqual(['2'])
    expect(inPeriod(trades, 'all', now)).toHaveLength(2)
  })
})

describe('breakdowns', () => {
  const trades = closedTrades([
    trade('100', new Date(2026, 9, 26, 9), { emotion: 'calm', symbol: 'ETHUSDT', setupIds: ['breakout', 'retest'] }),
    trade('-50', new Date(2026, 9, 26, 9, 30), { emotion: 'fomo', setupIds: ['breakout'] }),
    trade('-30', new Date(2026, 9, 27, 22), { emotion: 'fomo' }),
  ])

  it('groups by emotion', () => {
    const fomo = byEmotion(trades).find((item) => item.key === 'fomo')!
    expect(fomo.count).toBe(2)
    expect(str(fomo.pnl)).toBe('-80')
    expect(str(fomo.winRate)).toBe('0')
  })

  it('counts a trade under each of its setups', () => {
    const setups = Object.fromEntries(bySetup(trades).map((item) => [item.key, item.pnl.toString()]))
    expect(setups).toEqual({ breakout: '50', retest: '100' })
  })

  it('groups by symbol', () => {
    expect(bySymbol(trades).map((item) => [item.key, item.count])).toEqual([
      ['ETHUSDT', 1],
      ['BTCUSDT', 2],
    ])
  })

  it('sums PnL by entry hour and weekday', () => {
    const hours = byHour(trades)
    expect(hours).toHaveLength(24)
    expect(str(hours[9])).toBe('50')
    expect(str(hours[22])).toBe('-30')
    const weekdays = byWeekday(trades)
    expect(str(weekdays[1])).toBe('50') // Monday 26 Oct
    expect(str(weekdays[2])).toBe('-30') // Tuesday 27 Oct
  })

  it('sums PnL per local day', () => {
    const days = dailyPnl(trades)
    expect(days.get('2026-10-26')).toEqual({ pnl: new Big(50), count: 2 })
    expect(str(days.get('2026-10-27')?.pnl)).toBe('-30')
  })
})
