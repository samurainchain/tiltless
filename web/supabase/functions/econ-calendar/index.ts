// High-impact economic events for the week (SPEC section 4.7): rate decisions, inflation, jobs
// reports. From the weekly calendar feed Forex Factory publishes (nfs.faireconomy.media), fetched
// here because it doesn't answer browsers on other sites. The feed refuses addresses that ask
// often, and every instance of this function has its own memory, so the copy lives in the
// database (market_cache): asked at most every 30 minutes, the last good copy served when the
// feed says no. No user data involved.
// GET → { updatedAt, source, events: [{ title, country, date, forecast, previous }] }

import { cors, json, rest } from '../_shared/server.ts'

const FEEDS = ['https://nfs.faireconomy.media/ff_calendar_thisweek.json', 'https://nfs.faireconomy.media/ff_calendar_nextweek.json']
const FRESH_MS = 30 * 60_000

interface FeedEvent {
  title?: string
  country?: string
  date?: string
  impact?: string
  forecast?: string
  previous?: string
}

const KEY = 'econ-calendar'

let cached: { at: number; events: FeedEvent[] } | undefined

async function feed(url: string): Promise<FeedEvent[]> {
  const response = await fetch(url, { headers: { 'User-Agent': 'Tiltless economic calendar' } })
  // Next week's file only appears late in the week.
  if (response.status === 404) return []
  if (!response.ok) throw new Error(`Calendar feed ${response.status}`)
  const body = await response.json()
  return Array.isArray(body) ? body : []
}

/** The shared copy, or undefined before the table exists or the first fetch. */
async function stored(): Promise<{ at: number; events: FeedEvent[] } | undefined> {
  try {
    const [row] = await rest<{ data: FeedEvent[]; fetched_at: string }[]>(`market_cache?key=eq.${KEY}&select=data,fetched_at`)
    return row ? { at: Date.parse(row.fetched_at), events: row.data } : undefined
  } catch (error) {
    console.warn('market_cache unavailable:', error)
    return undefined
  }
}

async function events(): Promise<{ at: number; events: FeedEvent[] }> {
  if (cached && Date.now() - cached.at < FRESH_MS) return cached
  const shared = await stored()
  if (shared && Date.now() - shared.at < FRESH_MS) return (cached = shared)
  try {
    const all = (await Promise.all(FEEDS.map(feed))).flat()
    const high = all.filter((event) => event.impact === 'High' && event.title && event.country && event.date)
    const unique = [...new Map(high.map((event) => [`${event.date}|${event.country}|${event.title}`, event])).values()]
    cached = { at: Date.now(), events: unique }
    await rest('market_cache?on_conflict=key', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=minimal',
      body: { key: KEY, data: unique, fetched_at: new Date(cached.at).toISOString() },
    }).catch((error) => console.warn('Saving market_cache failed:', error))
  } catch (error) {
    // The last good copy is better than nothing while the feed says no.
    const fallback = cached ?? shared
    if (!fallback) throw error
    console.warn('Calendar feed failed, serving the last copy:', error)
    cached = fallback
  }
  return cached!
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors(request) })
  if (request.method !== 'GET') return json(request, { error: 'method_not_allowed' }, 405)
  try {
    const { at, events: list } = await events()
    return json(
      request,
      {
        updatedAt: new Date(at).toISOString(),
        source: 'forexfactory',
        events: list.map(({ title, country, date, forecast, previous }) => ({ title, country, date, forecast: forecast ?? '', previous: previous ?? '' })),
      },
      200,
      { 'Cache-Control': 'public, max-age=600' },
    )
  } catch (error) {
    console.error(error)
    return json(request, { error: 'upstream' }, 502)
  }
})
