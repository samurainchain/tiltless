import { describe, expect, it } from 'vitest'
import { cellScale, liquidationMap, liquidationPrice, type Bar, type MarketSeries } from './liquidationMap'

const HOUR = 3_600_000
/** Flat bars at `price` with the given open interest, an hour apart. */
function series(prices: number[], oi: number[], count = prices.length, spread = 1): MarketSeries {
  const candles: Bar[] = prices.map((price, index) => [index * HOUR, price, price + spread, price - spread, price])
  return { candles, oi: oi.map((usd, index) => [index * HOUR, usd]), count }
}

const sum = (cells: Float64Array, from: number, to: number) => Array.from(cells.slice(from, to)).reduce((a, b) => a + b, 0)

describe('liquidationPrice', () => {
  it('sits below a long and above a short, closer with more leverage', () => {
    expect(liquidationPrice(100, 10, 'long')).toBeCloseTo(90.5)
    expect(liquidationPrice(100, 10, 'short')).toBeCloseTo(109.5)
    expect(liquidationPrice(100, 100, 'long')).toBeCloseTo(99.5)
  })
})

describe('liquidationMap', () => {
  it('places new open interest as long levels below and short levels above', () => {
    const map = liquidationMap(series([100, 100, 100], [1000, 3000, 3000]))!
    expect(map.times).toHaveLength(3)
    const last = (map.times.length - 1) * map.rows
    const priceRow = Math.floor((100 - map.min) / ((map.max - map.min) / map.rows))
    const below = sum(map.cells, last, last + priceRow)
    const above = sum(map.cells, last + priceRow + 1, last + map.rows)
    expect(below).toBeGreaterThan(0)
    expect(below).toBeCloseTo(above)
    // The first column comes before the open interest grew.
    expect(sum(map.cells, 0, map.rows)).toBe(0)
  })

  it('removes a level once the price reaches it', () => {
    // $2,000 opens at 100; then the price drops through every long level down to 80.
    const map = liquidationMap(series([100, 100, 100, 80, 80], [0, 2000, 2000, 2000, 2000]))!
    expect(map.below).toBeUndefined()
    expect(map.nearLongs).toBe(0)
    expect(map.above?.usd).toBeGreaterThan(0)
  })

  it('closes positions in proportion when open interest falls', () => {
    const full = liquidationMap(series([100, 100, 100], [0, 2000, 2000]))!
    const half = liquidationMap(series([100, 100, 100], [0, 2000, 1000]))!
    expect(half.nearLongs + half.nearShorts).toBeCloseTo((full.nearLongs + full.nearShorts) / 2)
  })

  it('shows only the last `count` bars but counts positions from the warm-up', () => {
    const map = liquidationMap(series([100, 100, 100, 100], [0, 2000, 2000, 2000], 2))!
    expect(map.times).toEqual([2 * HOUR, 3 * HOUR])
    expect(sum(map.cells, 0, map.rows)).toBeGreaterThan(0)
  })

  it('needs bars with open interest', () => {
    expect(liquidationMap({ candles: [[0, 1, 1, 1, 1]], oi: [], count: 1 })).toBeUndefined()
  })

  it('scales colors by a high percentile', () => {
    const cells = new Float64Array([0, ...Array.from({ length: 999 }, (_, index) => index + 1), 10_000])
    expect(cellScale(cells)).toBe(996)
    expect(cellScale(new Float64Array(3))).toBe(1)
  })
})
