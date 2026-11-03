// High-impact economic events for the week (SPEC section 4.7): rate decisions, inflation, jobs
// reports. From the weekly calendar feed Forex Factory publishes (nfs.faireconomy.media), fetched
// here because it doesn't answer browsers on other sites, and kept 30 minutes: the feed limits
// how often one address may ask. No user data involved.
// GET → { updatedAt, source, events: [{ title, country, date, forecast, previous }] }

import { cors, json } from '../_shared/server.ts'

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

let cached: { at: number; events: FeedEvent[] } | undefined

async function feed(url: string): Promise<FeedEvent[]> {
  const response = await fetch(url, { headers: { 'User-Agent': 'Tiltless economic calendar' } })
  // Next week's file only appears late in the week.
  if (response.status === 404) return []
  if (!response.ok) throw new Error(`Calendar feed ${response.status}`)
  const body = await response.json()
  return Array.isArray(body) ? body : []
}

async function events(): Promise<{ at: number; events: FeedEvent[] }> {
  if (cached && Date.now() - cached.at < FRESH_MS) return cached
  try {
    const all = (await Promise.all(FEEDS.map(feed))).flat()
    const high = all.filter((event) => event.impact === 'High' && event.title && event.country && event.date)
    const unique = [...new Map(high.map((event) => [`${event.date}|${event.country}|${event.title}`, event])).values()]
    cached = { at: Date.now(), events: unique }
  } catch (error) {
    // The last good copy is better than nothing while the feed is busy.
    if (!cached) throw error
    console.warn('Calendar feed failed, serving the cached copy:', error)
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
