import type { Trade } from './models'

// The price chart of a crypto trade (SPEC section 4.6): candles around the trade from Binance's
// public market data, with the entry, the exits and the stop drawn over them. Pure helpers here;
// the request and the drawing live in features/trades/TradeChart.tsx. Prices are only drawn,
// never used for money, so plain numbers are fine.

export interface Candle {
  /** Open time, ms. */
  time: number
  open: number
  high: number
  low: number
  close: number
}

/** Binance's kline intervals the chart picks from, with their length in ms. */
export const INTERVALS = [
  ['1m', 60_000],
  ['3m', 180_000],
  ['5m', 300_000],
  ['15m', 900_000],
  ['30m', 1_800_000],
  ['1h', 3_600_000],
  ['2h', 7_200_000],
  ['4h', 14_400_000],
  ['6h', 21_600_000],
  ['12h', 43_200_000],
  ['1d', 86_400_000],
  ['1w', 604_800_000],
] as const

export type ChartInterval = (typeof INTERVALS)[number][0]

/** Most candles the chart asks for; enough to read, few enough to stay light. */
export const MAX_CANDLES = 120

const QUOTES = ['USDT', 'USDC', 'FDUSD', 'BUSD', 'BTC', 'ETH', 'BNB', 'EUR', 'TRY', 'BRL']

/**
 * The trade's pair as Binance spells it: "BTC/USDT", "BTC-USDT-SWAP", "BTCUSDT.P" and
 * "BTCUSDTPERP" all become "BTCUSDT"; a pair quoted in USD reads as USDT, where crypto trades.
 * Undefined when nothing pair-like is left.
 */
export function binanceSymbol(symbol: string): string | undefined {
  let value = symbol.toUpperCase().trim()
  value = value.replace(/^[A-Z]+:/, '')
  value = value.replace(/[-_](SWAP|PERP|PERPETUAL)$/, '').replace(/\.P$/, '').replace(/PERP$/, '')
  value = value.replace(/[^A-Z0-9]/g, '')
  if (value.length < 5) return undefined
  if (!QUOTES.some((quote) => value.endsWith(quote) && value.length > quote.length) && value.endsWith('USD')) value = `${value}T`
  return QUOTES.some((quote) => value.endsWith(quote) && value.length > quote.length) ? value : undefined
}

export interface ChartWindow {
  interval: ChartInterval
  start: number
  end: number
  limit: number
}

/**
 * Candles around a trade: the trade takes about half the chart, with a quarter of its length
 * before the entry and after the exit (at least a few candles each side), on the shortest
 * interval that fits in `MAX_CANDLES`. An open trade runs to now.
 */
export function chartWindow(trade: Pick<Trade, 'openedAt' | 'closedAt'>, now: Date): ChartWindow {
  const opened = Date.parse(trade.openedAt)
  const closed = Math.min(trade.closedAt ? Date.parse(trade.closedAt) : now.getTime(), now.getTime())
  const length = Math.max(closed - opened, 60_000)
  const span = length * 2
  const [interval, ms] = INTERVALS.find(([, size]) => span / size <= MAX_CANDLES - 8) ?? INTERVALS[INTERVALS.length - 1]!
  const pad = Math.max(length / 2, ms * 4)
  const start = Math.floor((opened - pad) / ms) * ms
  const end = Math.min(closed + pad, now.getTime())
  return { interval, start, end, limit: Math.min(Math.ceil((end - start) / ms) + 1, 1000) }
}

/** Reads Binance's kline rows: [openTime, open, high, low, close, …] with prices as strings. */
export function parseKlines(rows: unknown): Candle[] {
  if (!Array.isArray(rows)) return []
  return rows.flatMap((row) => {
    if (!Array.isArray(row) || row.length < 5) return []
    const [time, open, high, low, close] = row.slice(0, 5).map(Number)
    return [time, open, high, low, close].every((value) => Number.isFinite(value)) ? [{ time: time!, open: open!, high: high!, low: low!, close: close! }] : []
  })
}

export function klinesUrl(symbol: string, window: ChartWindow): string {
  const params = new URLSearchParams({ symbol, interval: window.interval, startTime: String(window.start), endTime: String(window.end), limit: String(window.limit) })
  return `https://data-api.binance.vision/api/v3/klines?${params.toString()}`
}

/** Low and high of the candles and the trade's levels, with a little room above and below. */
export function priceRange(candles: readonly Candle[], levels: readonly number[]): { min: number; max: number } {
  const values = [...candles.flatMap((candle) => [candle.low, candle.high]), ...levels].filter((value) => Number.isFinite(value) && value > 0)
  if (values.length === 0) return { min: 0, max: 1 }
  const low = Math.min(...values)
  const high = Math.max(...values)
  const room = (high - low || high * 0.01) * 0.06
  return { min: low - room, max: high + room }
}
