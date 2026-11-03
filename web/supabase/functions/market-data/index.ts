// Public market data for the liquidation map (SPEC section 4.7): OKX perpetual candles and open
// interest for one coin and period, fetched here because OKX's open-interest endpoint doesn't
// answer browsers on other sites. No user data involved; the answer is the same for everyone.
// GET ?coin=BTC&period=7d → { coin, bar, candles: [[t, o, h, l, c]], oi: [[t, usd]] }, oldest first,
// with a warm-up stretch before the period so positions opened earlier are on the map.

import { cors, json } from '../_shared/server.ts'

const COINS = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE'] as const
/** Bar and number of bars per period; twice as many are fetched, the first half warming up. */
const PERIODS: Record<string, { bar: string; count: number }> = {
  '24h': { bar: '15m', count: 96 },
  '3d': { bar: '1H', count: 72 },
  '7d': { bar: '1H', count: 168 },
  '14d': { bar: '4H', count: 84 },
  '30d': { bar: '4H', count: 180 },
  '90d': { bar: '1D', count: 90 },
}
const PAGE = 100

async function okx(path: string): Promise<string[][]> {
  const response = await fetch(`https://www.okx.com${path}`)
  const body = (await response.json().catch(() => ({}))) as { code?: string; msg?: string; data?: string[][] }
  if (!response.ok || body.code !== '0' || !Array.isArray(body.data)) throw new Error(`OKX ${path}: ${response.status} ${body.msg ?? ''}`)
  return body.data
}

/** Newest-first pages walked back with the `after`/`end` cursor until `total` rows are in. */
async function pages(build: (cursor?: string) => string, total: number): Promise<string[][]> {
  const rows: string[][] = []
  let cursor: string | undefined
  while (rows.length < total) {
    const page = await okx(build(cursor))
    if (page.length === 0) break
    rows.push(...page)
    cursor = page.at(-1)![0]
    if (page.length < PAGE) break
  }
  // The open-interest cursor is inclusive: drop the row each page repeats.
  const unique = [...new Map(rows.map((row) => [row[0], row])).values()]
  return unique.slice(0, total).reverse()
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors(request) })
  if (request.method !== 'GET') return json(request, { error: 'method_not_allowed' }, 405)
  const url = new URL(request.url)
  const coin = (url.searchParams.get('coin') ?? 'BTC').toUpperCase()
  const period = PERIODS[url.searchParams.get('period') ?? '7d']
  if (!(COINS as readonly string[]).includes(coin) || !period) return json(request, { error: 'bad_request' }, 400)
  const inst = `${coin}-USDT-SWAP`
  const total = period.count * 2
  try {
    const [candles, oi] = await Promise.all([
      pages((after) => `/api/v5/market/history-candles?instId=${inst}&bar=${period.bar}&limit=${PAGE}${after ? `&after=${after}` : ''}`, total),
      pages((end) => `/api/v5/rubik/stat/contracts/open-interest-history?instId=${inst}&period=${period.bar}&limit=${PAGE}${end ? `&end=${end}` : ''}`, total),
    ])
    return json(
      request,
      {
        coin,
        bar: period.bar,
        count: period.count,
        candles: candles.map((row) => row.slice(0, 5).map(Number)),
        oi: oi.map((row) => [Number(row[0]), Number(row[3])]),
        source: 'okx',
      },
      200,
      { 'Cache-Control': 'public, max-age=120' },
    )
  } catch (error) {
    console.error(error)
    return json(request, { error: 'upstream' }, 502)
  }
})
