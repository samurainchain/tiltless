// The economic calendar (SPEC section 4.7): high-impact events of the week, from the
// econ-calendar function. Pure helpers, so tested; the list lives in features/calendar.

export interface EconEvent {
  title: string
  /** Currency the event moves: USD, EUR, GBP… */
  country: string
  at: Date
  forecast: string
  previous: string
}

/** Region of each currency, for the badge and the country's name (Intl.DisplayNames). */
const REGIONS: Record<string, string> = {
  USD: 'US',
  EUR: 'EU',
  GBP: 'GB',
  JPY: 'JP',
  AUD: 'AU',
  NZD: 'NZ',
  CAD: 'CA',
  CHF: 'CH',
  CNY: 'CN',
}

export function regionOf(currency: string): string | undefined {
  return REGIONS[currency]
}

/** Reads the function's answer, dropping anything malformed; soonest first. */
export function parseEvents(body: unknown): EconEvent[] {
  const list = (body as { events?: unknown })?.events
  if (!Array.isArray(list)) return []
  return list
    .flatMap((item) => {
      const event = item as Record<string, unknown>
      const at = new Date(String(event.date ?? ''))
      if (typeof event.title !== 'string' || typeof event.country !== 'string' || Number.isNaN(at.getTime())) return []
      return [{ title: event.title, country: event.country, at, forecast: String(event.forecast ?? ''), previous: String(event.previous ?? '') }]
    })
    .sort((a, b) => a.at.getTime() - b.at.getTime())
}

/** Events still ahead, plus those of the last `graceMinutes` (a release is news for a while). */
export function upcoming(events: readonly EconEvent[], now: Date, graceMinutes = 60): EconEvent[] {
  const from = now.getTime() - graceMinutes * 60_000
  return events.filter((event) => event.at.getTime() >= from)
}

/** Events on the trader's local day, in the currencies they watch (all when none is given). */
export function eventsOnDay(events: readonly EconEvent[], day: Date, currencies?: readonly string[]): EconEvent[] {
  return events.filter(
    (event) =>
      event.at.getFullYear() === day.getFullYear() &&
      event.at.getMonth() === day.getMonth() &&
      event.at.getDate() === day.getDate() &&
      (!currencies || currencies.includes(event.country)),
  )
}
