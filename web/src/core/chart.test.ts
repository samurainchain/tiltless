import { describe, expect, it } from 'vitest'
import { binanceSymbol, chartWindow, klinesUrl, MAX_CANDLES, parseKlines, priceRange } from './chart'

describe('binanceSymbol', () => {
  it('normalizes exchange spellings', () => {
    expect(binanceSymbol('BTCUSDT')).toBe('BTCUSDT')
    expect(binanceSymbol('btc/usdt')).toBe('BTCUSDT')
    expect(binanceSymbol('BTC-USDT-SWAP')).toBe('BTCUSDT')
    expect(binanceSymbol('BTCUSDT.P')).toBe('BTCUSDT')
    expect(binanceSymbol('BINANCE:ETHUSDTPERP')).toBe('ETHUSDT')
    expect(binanceSymbol('SOL-USD')).toBe('SOLUSDT')
    expect(binanceSymbol('ETHBTC')).toBe('ETHBTC')
  })

  it('gives up on what is not a crypto pair', () => {
    expect(binanceSymbol('AAPL')).toBeUndefined()
    expect(binanceSymbol('NQ')).toBeUndefined()
  })
})

describe('chartWindow', () => {
  const now = new Date('2026-11-02T18:00:00Z')

  it('picks a short interval for a short trade, with room around it', () => {
    const window = chartWindow({ openedAt: '2026-11-02T10:00:00Z', closedAt: '2026-11-02T10:40:00Z' }, now)
    expect(window.interval).toBe('1m')
    expect(window.start).toBeLessThanOrEqual(Date.parse('2026-11-02T09:40:00Z'))
    expect(window.end).toBe(Date.parse('2026-11-02T11:00:00Z'))
    expect(window.limit).toBeLessThanOrEqual(MAX_CANDLES)
  })

  it('picks hours for a trade held for days and stops at now', () => {
    const window = chartWindow({ openedAt: '2026-10-30T12:00:00Z', closedAt: '2026-11-02T12:00:00Z' }, now)
    expect(window.interval).toBe('2h')
    expect(window.end).toBe(now.getTime())
    expect(window.limit).toBeLessThanOrEqual(MAX_CANDLES)
  })

  it('runs an open trade to now', () => {
    const window = chartWindow({ openedAt: '2026-11-02T17:00:00Z' }, now)
    expect(window.end).toBe(now.getTime())
  })

  it('builds the request', () => {
    const url = new URL(klinesUrl('BTCUSDT', { interval: '15m', start: 1, end: 2, limit: 3 }))
    expect(url.host).toBe('data-api.binance.vision')
    expect(Object.fromEntries(url.searchParams)).toEqual({ symbol: 'BTCUSDT', interval: '15m', startTime: '1', endTime: '2', limit: '3' })
  })
})

describe('parseKlines and priceRange', () => {
  it('reads rows and skips broken ones', () => {
    const candles = parseKlines([[1, '10', '12', '9', '11', '5'], ['x'], [2, '11', 'oops', '10', '10.5']])
    expect(candles).toEqual([{ time: 1, open: 10, high: 12, low: 9, close: 11 }])
    expect(parseKlines({ code: -1121 })).toEqual([])
  })

  it('covers the candles and the levels', () => {
    const range = priceRange([{ time: 1, open: 10, high: 12, low: 9, close: 11 }], [8, 13])
    expect(range.min).toBeLessThan(8)
    expect(range.max).toBeGreaterThan(13)
  })
})
