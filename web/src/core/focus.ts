import Big from 'big.js'
import type { MistakeTag, Trade, WeeklyReview } from './models'
import { closedTrades, localDayKey, startOfWeek, type ClosedTrade, type WeekStart } from './stats'

// The focus habit (SPEC section 4.9): at the weekly review the trader picks one mistake to work
// on next week, and Today shows how often it came back. One habit at a time.

/** A focus stays on Today for this many weeks after its review unless a newer one replaces it. */
export const FOCUS_WEEKS = 4

export interface ActiveFocus {
  review: WeeklyReview
  tag: MistakeTag
}

function dayFromKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year!, month! - 1, day!)
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

/**
 * The focus for the current week: from the latest review of an earlier week that picked one, as
 * long as it is under `FOCUS_WEEKS` old and the mistake still exists. A review written for the
 * current week sets the focus for the next one.
 */
export function activeFocus(reviews: readonly WeeklyReview[], tags: readonly MistakeTag[], now: Date, weekStart: WeekStart): ActiveFocus | undefined {
  const current = startOfWeek(now, weekStart)
  const oldest = localDayKey(addDays(current, -7 * FOCUS_WEEKS))
  const currentKey = localDayKey(current)
  const [latest] = reviews
    .filter((review) => review.focusMistakeId && review.weekStart < currentKey && review.weekStart >= oldest)
    .sort((a, b) => b.weekStart.localeCompare(a.weekStart))
  const tag = latest && tags.find((item) => item.id === latest.focusMistakeId && !item.isArchived)
  return latest && tag ? { review: latest, tag } : undefined
}

export interface FocusCount {
  /** Closed trades carrying the mistake. */
  count: number
  /** Losses on those trades, split evenly between each trade's mistakes, as in the mistake cost. */
  cost: Big
  /** Closed trades in the span, with or without the mistake. */
  trades: number
}

function focusCount(trades: readonly ClosedTrade[], tag: MistakeTag, tags: readonly MistakeTag[]): FocusCount {
  const tagged = trades.filter((item) => item.trade.mistakeIds.includes(tag.id))
  const cost = tagged
    .filter((item) => item.pnl.lt(0))
    .reduce((total, item) => {
      const known = item.trade.mistakeIds.filter((id) => tags.some((other) => other.id === id)).length
      return total.plus(item.pnl.abs().div(known))
    }, new Big(0))
  return { count: tagged.length, cost, trades: trades.length }
}

export interface FocusProgress {
  /** This week so far. */
  current: FocusCount
  /** The week the focus was picked in. */
  before: FocusCount
}

/** How often the focus mistake came back this week, next to the week it was picked in. */
export function focusProgress(trades: readonly Trade[], focus: ActiveFocus, tags: readonly MistakeTag[], now: Date, weekStart: WeekStart): FocusProgress {
  const closed = closedTrades(trades)
  const current = startOfWeek(now, weekStart)
  const reviewed = dayFromKey(focus.review.weekStart)
  const within = (from: Date, to: Date) => closed.filter((item) => item.closedAt >= from && item.closedAt < to)
  return {
    current: focusCount(within(current, addDays(current, 7)), focus.tag, tags),
    before: focusCount(within(reviewed, addDays(reviewed, 7)), focus.tag, tags),
  }
}
