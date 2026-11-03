import { describe, expect, it } from 'vitest'
import { eventsOnDay, parseEvents, regionOf, upcoming } from './econCalendar'

const body = {
  events: [
    { title: 'CPI m/m', country: 'USD', date: '2026-11-12T08:30:00-05:00', forecast: '0.3%', previous: '0.2%' },
    { title: 'Cash Rate', country: 'AUD', date: '2026-11-02T22:30:00-05:00', forecast: '4.85%', previous: '4.60%' },
    { title: 'Broken', country: 'USD', date: 'not a date' },
    { country: 'USD', date: '2026-11-12T08:30:00-05:00' },
  ],
}

describe('econ calendar', () => {
  it('reads events, skips broken ones and sorts by time', () => {
    const events = parseEvents(body)
    expect(events.map((event) => event.title)).toEqual(['Cash Rate', 'CPI m/m'])
    expect(events[1]!.at.toISOString()).toBe('2026-11-12T13:30:00.000Z')
    expect(parseEvents({})).toEqual([])
  })

  it('keeps what is ahead and the last hour', () => {
    const events = parseEvents(body)
    expect(upcoming(events, new Date('2026-11-03T04:00:00Z')).map((event) => event.title)).toEqual(['Cash Rate', 'CPI m/m'])
    expect(upcoming(events, new Date('2026-11-03T05:00:00Z')).map((event) => event.title)).toEqual(['CPI m/m'])
  })

  it('picks a local day and currencies', () => {
    const events = parseEvents(body)
    const cpi = events[1]!.at
    const day = new Date(cpi.getFullYear(), cpi.getMonth(), cpi.getDate())
    expect(eventsOnDay(events, day).map((event) => event.title)).toContain('CPI m/m')
    expect(eventsOnDay(events, day, ['EUR'])).toEqual([])
  })

  it('knows the regions of the main currencies', () => {
    expect(regionOf('USD')).toBe('US')
    expect(regionOf('AUD')).toBe('AU')
    expect(regionOf('XYZ')).toBeUndefined()
  })
})
