import { describe, expect, it } from 'vitest'
import { cellScale, clampView, fullView, isFullView, liquidationMap, liquidationPrice, outerView, panView, sameView, zoomView, type Bar, type MarketSeries } from './liquidationMap'

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

describe('map view', () => {
  const full = { from: 0, to: 168, min: 70_000, max: 84_000 }

  it('zooms in around the pointer and back out to the whole map', () => {
    const zoomed = zoomView(full, full, 0.5, { x: 1, y: 0.5 })
    expect(zoomed).toEqual({ from: 84, to: 168, min: 73_500, max: 80_500 })
    expect(isFullView(zoomed, full)).toBe(false)
    expect(zoomView(zoomed, full, 4, { x: 0.5, y: 0.5 })).toEqual(full)
  })

  it('zooms one axis at a time', () => {
    const prices = zoomView(full, full, 0.5, { x: 0.5, y: 0.5 }, { time: false, price: true })
    expect(prices.from).toBe(0)
    expect(prices.to).toBe(168)
    expect(prices.max - prices.min).toBe(7_000)
  })

  it('stops at the limits and inside the map', () => {
    const tiny = zoomView(full, full, 0.0001, { x: 0.5, y: 0.5 })
    expect(tiny.to - tiny.from).toBe(8)
    expect(tiny.max - tiny.min).toBeCloseTo(168)
    expect(panView(zoomView(full, full, 0.5, { x: 0, y: 0 }), full, -1, -1)).toEqual({ from: 0, to: 84, min: 70_000, max: 77_000 })
    expect(clampView({ from: 160, to: 200, min: 83_000, max: 90_000 }, full)).toEqual({ from: 128, to: 168, min: 77_000, max: 84_000 })
  })

  it('starts from the whole map', () => {
    const map = liquidationMap(series([100, 100, 100], [0, 2000, 2000]))!
    expect(fullView(map)).toEqual({ from: 0, to: 3, min: map.min, max: map.max })
  })

  it('bins rows over a given price range', () => {
    const map = liquidationMap(series([100, 100, 100], [0, 2000, 2000]), 10, { min: 99, max: 101 })!
    expect([map.min, map.max]).toEqual([99, 101])
    // The 100× levels sit inside; the rest fall outside the range.
    expect(map.cells.some((value) => value > 0)).toBe(true)
  })
})

describe('zooming out', () => {
  it('goes past the period to the warm-up bars and wider prices', () => {
    const home = { from: 168, to: 336, min: 70_000, max: 84_000 }
    const outer = outerView(home, 336)
    expect(outer).toEqual({ from: 0, to: 336, min: 49_000, max: 105_000 })
    const out = zoomView(home, outer, 2, { x: 1, y: 0.5 })
    expect(out.to - out.from).toBe(336)
    expect(out.max - out.min).toBe(28_000)
    expect(isFullView(zoomView(out, outer, 4, { x: 0.5, y: 0.5 }), outer)).toBe(true)
    expect(sameView(home, { ...home })).toBe(true)
    expect(sameView(home, out)).toBe(false)
  })

  it('never goes below a price of zero', () => {
    expect(outerView({ from: 0, to: 10, min: 1, max: 9 }, 10).min).toBe(0)
  })
})
