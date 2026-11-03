// Liquidation map (SPEC section 4.7): an estimate of where leveraged positions would be
// liquidated, from a perpetual's candles and open interest. Open interest that grows during a bar
// is new positions opened near that bar's price, split evenly between longs and shorts and spread
// over typical leverages; each lands a liquidation level below (longs) or above (shorts) the
// entry. When open interest shrinks by a share, that share of every position closes; a level the price reaches is
// liquidated and leaves the map. A model, not the exchanges' books: it shows where the fuel
// sits, never where the price will go. Pure, so tested; drawing lives in features/market.

/** One bar: open time in ms, then open, high, low, close. */
export type Bar = [time: number, open: number, high: number, low: number, close: number]
/** Open interest at a bar's open time, in USD. */
export type OpenInterest = [time: number, usd: number]

export interface MarketSeries {
  candles: Bar[]
  oi: OpenInterest[]
  /** Bars on the map; the ones before them only warm the model up. */
  count: number
}

/** Leverage and the share of new positions taking it: most retail perps sit at 10–25×. */
export const LEVERAGE_MIX: readonly (readonly [leverage: number, share: number])[] = [
  [5, 0.1],
  [10, 0.25],
  [25, 0.3],
  [50, 0.2],
  [100, 0.15],
]
/** Maintenance margin: liquidation comes this much before the whole margin is gone. */
const MAINTENANCE = 0.005

export type Side = 'long' | 'short'

interface Level {
  price: number
  usd: number
  side: Side
}

/** Liquidation price of a position opened at `entry` with `leverage`. */
export function liquidationPrice(entry: number, leverage: number, side: Side): number {
  const move = 1 / leverage - MAINTENANCE
  return side === 'long' ? entry * (1 - move) : entry * (1 + move)
}

export interface LiquidationMap {
  /** Open times of the bars on the map. */
  times: number[]
  candles: Bar[]
  /** Price of the lowest and highest row edges. */
  min: number
  max: number
  rows: number
  /** USD per cell, column by column: cells[column * rows + row], row 0 at the bottom. */
  cells: Float64Array
  /** The last close: below it the map holds longs' liquidations, above it shorts'. */
  price: number
  /** Where the most is waiting now, above the price (shorts) and below it (longs). */
  above?: { price: number; usd: number }
  below?: { price: number; usd: number }
  /** Totals within 5% of the price now. */
  nearLongs: number
  nearShorts: number
}

/** Rows on the price axis. */
export const ROWS = 120
/** Width of a price bucket for the "most is waiting at" summary, as a share of the price. */
const BUCKET = 0.0025
const NEAR = 0.05

/** Rows' price range: the bars' range with room for the clusters around it. */
function priceRange(candles: readonly Bar[]): { min: number; max: number } {
  const low = Math.min(...candles.map((bar) => bar.at(3)!))
  const high = Math.max(...candles.map((bar) => bar.at(2)!))
  const last = candles.at(-1)![4]
  const pad = Math.max((high - low) * 0.25, last * 0.03)
  return { min: Math.max(0, low - pad), max: high + pad }
}

function biggest(levels: readonly Level[], side: Side, price: number): { price: number; usd: number } | undefined {
  const buckets = new Map<number, number>()
  const step = price * BUCKET
  for (const level of levels) {
    if (level.side !== side || level.usd <= 0) continue
    const key = Math.round(level.price / step)
    buckets.set(key, (buckets.get(key) ?? 0) + level.usd)
  }
  let best: { price: number; usd: number } | undefined
  for (const [key, usd] of buckets) if (!best || usd > best.usd) best = { price: key * step, usd }
  return best
}

/**
 * The map over the period. `range` fixes the price rows (a zoomed view gets fine rows for the
 * prices it shows); without it the rows cover the bars with room around them.
 */
export function liquidationMap(series: MarketSeries, rows = ROWS, range?: { min: number; max: number }): LiquidationMap | undefined {
  const oiAt = new Map(series.oi.map(([time, usd]) => [time, usd]))
  const candles = series.candles.filter((bar) => oiAt.has(bar[0]))
  if (candles.length < 2) return undefined
  const shown = candles.slice(-Math.min(series.count, candles.length))
  const firstShown = shown[0]![0]
  const { min, max } = range ?? priceRange(shown)
  const height = (max - min) / rows
  const cells = new Float64Array(shown.length * rows)

  let levels: Level[] = []
  let previous: number | undefined
  let column = 0
  for (const bar of candles) {
    const [time, , high, low, close] = bar
    const oi = oiAt.get(time)!
    // Levels the bar's range reached are liquidated.
    levels = levels.filter((level) => (level.side === 'long' ? low > level.price : high < level.price))
    if (previous !== undefined) {
      const change = oi - previous
      if (change > 0) {
        const entry = (high + low + close) / 3
        for (const [leverage, share] of LEVERAGE_MIX) {
          for (const side of ['long', 'short'] as const) levels.push({ price: liquidationPrice(entry, leverage, side), usd: (change * share) / 2, side })
        }
      } else if (change < 0 && previous > 0) {
        // Open interest fell by a share: that share of every position was closed.
        const keep = Math.max(0, oi / previous)
        for (const level of levels) level.usd *= keep
      }
    }
    previous = oi
    if (time >= firstShown) {
      for (const level of levels) {
        const row = Math.floor((level.price - min) / height)
        if (row >= 0 && row < rows) cells[column * rows + row] = cells[column * rows + row]! + level.usd
      }
      column += 1
    }
  }

  const price = shown.at(-1)![4]
  const near = (side: Side) =>
    levels.filter((level) => level.side === side && Math.abs(level.price - price) <= price * NEAR).reduce((sum, level) => sum + level.usd, 0)
  return {
    times: shown.map((bar) => bar[0]),
    candles: shown,
    min,
    max,
    rows,
    cells,
    price,
    // Only what's on the map, so the reader can find the level the summary names.
    above: biggest(levels.filter((level) => level.price > price && level.price <= max), 'short', price),
    below: biggest(levels.filter((level) => level.price < price && level.price >= min), 'long', price),
    nearLongs: near('long'),
    nearShorts: near('short'),
  }
}

/** Value a cell is drawn against: a high percentile, so one huge cluster doesn't wash out the rest. */
export function cellScale(cells: Float64Array): number {
  const values = Array.from(cells).filter((value) => value > 0).sort((a, b) => a - b)
  if (values.length === 0) return 1
  return values[Math.min(values.length - 1, Math.floor(values.length * 0.995))]!
}

/** What part of the map is on screen: bars by index (fractional) and prices. */
export interface MapView {
  from: number
  to: number
  min: number
  max: number
}

/** Fewest bars and the narrowest price span a view zooms in to. */
const MIN_BARS = 8
const MIN_PRICE_SPAN = 0.002

export function fullView(map: Pick<LiquidationMap, 'times' | 'min' | 'max'>): MapView {
  return { from: 0, to: map.times.length, min: map.min, max: map.max }
}

/** Keeps a view inside the map and no smaller than the limits, keeping its size when it can. */
export function clampView(view: MapView, full: MapView): MapView {
  const bars = Math.min(full.to - full.from, Math.max(MIN_BARS, view.to - view.from))
  const from = Math.min(Math.max(full.from, view.from), full.to - bars)
  const span = Math.min(full.max - full.min, Math.max(full.max * MIN_PRICE_SPAN, view.max - view.min))
  const min = Math.min(Math.max(full.min, view.min), full.max - span)
  return { from, to: from + bars, min, max: min + span }
}

/**
 * Zooms around a point given as shares of the view (0 = left or bottom, 1 = right or top).
 * `factor` below 1 zooms in. Time and price can zoom separately.
 */
export function zoomView(view: MapView, full: MapView, factor: number, at: { x: number; y: number }, axes: { time: boolean; price: boolean } = { time: true, price: true }): MapView {
  const bars = view.to - view.from
  const span = view.max - view.min
  const next = { ...view }
  if (axes.time) {
    const pivot = view.from + bars * at.x
    next.from = pivot - (pivot - view.from) * factor
    next.to = next.from + bars * factor
  }
  if (axes.price) {
    const pivot = view.min + span * at.y
    next.min = pivot - (pivot - view.min) * factor
    next.max = next.min + span * factor
  }
  return clampView(next, full)
}

/** Moves a view by shares of its size: positive `x` shows later bars, positive `y` higher prices. */
export function panView(view: MapView, full: MapView, x: number, y: number): MapView {
  const bars = view.to - view.from
  const span = view.max - view.min
  return clampView({ from: view.from + bars * x, to: view.to + bars * x, min: view.min + span * y, max: view.max + span * y }, full)
}

export function isFullView(view: MapView, full: MapView): boolean {
  return view.from <= full.from && view.to >= full.to && view.min <= full.min && view.max >= full.max
}

/** How far out a view may go: every bar fetched (the warm-up too) and prices `times`× wider. */
export function outerView(home: MapView, bars: number, times = 4): MapView {
  const middle = (home.min + home.max) / 2
  const half = ((home.max - home.min) * times) / 2
  return { from: 0, to: bars, min: Math.max(0, middle - half), max: middle + half }
}

export function sameView(a: MapView, b: MapView): boolean {
  return Math.abs(a.from - b.from) < 1e-6 && Math.abs(a.to - b.to) < 1e-6 && Math.abs(a.min - b.min) < 1e-9 && Math.abs(a.max - b.max) < 1e-9
}
