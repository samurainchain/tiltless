import { useEffect, useState } from 'react'
import { parseEvents, type EconEvent } from '../core/econCalendar'
import { SUPABASE_URL } from './cloudConfig'

// High-impact events from the econ-calendar function, fetched once per tab and kept 10 minutes.

export interface EconCalendar {
  events: EconEvent[]
  updatedAt?: Date
}

let cache: { at: number; value: Promise<EconCalendar> } | undefined

export function loadEconCalendar(): Promise<EconCalendar> {
  if (cache && Date.now() - cache.at < 10 * 60_000) return cache.value
  const value = fetch(`${SUPABASE_URL}/functions/v1/econ-calendar`)
    .then(async (response) => {
      if (!response.ok) throw new Error(`econ-calendar ${response.status}`)
      const body = (await response.json()) as { updatedAt?: string }
      return { events: parseEvents(body), updatedAt: body.updatedAt ? new Date(body.updatedAt) : undefined }
    })
    .catch((error: unknown) => {
      cache = undefined
      throw error
    })
  cache = { at: Date.now(), value }
  return value
}

/** The week's events: undefined while loading, null when the calendar couldn't load. */
export function useEconCalendar(): EconCalendar | null | undefined {
  const [state, setState] = useState<EconCalendar | null>()
  useEffect(() => {
    let current = true
    loadEconCalendar().then(
      (value) => current && setState(value),
      () => current && setState(null),
    )
    return () => {
      current = false
    }
  }, [])
  return state
}
