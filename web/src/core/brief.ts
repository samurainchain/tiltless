import Big from 'big.js'
import type { MistakeTag, Rule, Trade } from './models'
import { closedTrades, localDayKey, mistakeCosts, startOfDay, type MistakeCost } from './stats'

// The morning brief on Today (SPEC section 4.3): what to keep in mind before the first trade,
// from the trader's own history, their rules and the scheduled Fed decisions. Pure, so tested.

/**
 * Federal Reserve rate decisions: the statement at 2:00 pm New York time on the second day of
 * each FOMC meeting, from federalreserve.gov/monetarypolicy/fomccalendars.htm (read 2026-11-02).
 * Update this list when the Fed publishes the next year's calendar.
 */
export const FED_DECISIONS: readonly string[] = [
  '2026-01-28T14:00:00-05:00',
  '2026-03-18T14:00:00-04:00',
  '2026-04-29T14:00:00-04:00',
  '2026-06-17T14:00:00-04:00',
  '2026-07-29T14:00:00-04:00',
  '2026-09-16T14:00:00-04:00',
  '2026-10-28T14:00:00-04:00',
  '2026-12-09T14:00:00-05:00',
  '2027-01-27T14:00:00-05:00',
  '2027-03-17T14:00:00-04:00',
  '2027-04-28T14:00:00-04:00',
  '2027-06-09T14:00:00-04:00',
  '2027-07-28T14:00:00-04:00',
  '2027-09-15T14:00:00-04:00',
  '2027-10-27T14:00:00-04:00',
  '2027-12-08T14:00:00-05:00',
]

/** How far ahead the brief looks for a Fed decision. */
export const EVENT_DAYS = 7
/** History the brief's patterns are drawn from. */
export const PATTERN_DAYS = 90
/** A pattern needs at least this many trades before it is worth a line. */
export const PATTERN_MIN_TRADES = 5

export interface BriefPattern<K> {
  key: K
  pnl: Big
  count: number
}

export interface MorningBrief {
  /** The next Fed decision from the start of today to a week ahead. */
  fed?: { at: Date; today: boolean }
  /** The last day with closed trades before today. */
  lastDay?: { day: string; pnl: Big; count: number; topMistake?: MistakeCost }
  /** Today's weekday over the last 90 days, when it lost money. */
  weekday?: BriefPattern<number>
  /** The entry hour that lost the most over the last 90 days. */
  hour?: BriefPattern<number>
  /** One of the active rules, a different one each day. */
  rule?: Rule
}

export function nextFedDecision(now: Date, decisions: readonly string[] = FED_DECISIONS): MorningBrief['fed'] {
  const from = startOfDay(now)
  const until = new Date(from.getFullYear(), from.getMonth(), from.getDate() + EVENT_DAYS)
  const at = decisions.map((iso) => new Date(iso)).find((date) => date >= from && date < until)
  return at && { at, today: localDayKey(at) === localDayKey(now) }
}

/** The worst losing bucket with enough trades, if any lost money. */
function worstBucket<K>(groups: Map<K, BriefPattern<K>>): BriefPattern<K> | undefined {
  const [worst] = [...groups.values()].filter((group) => group.count >= PATTERN_MIN_TRADES && group.pnl.lt(0)).sort((a, b) => a.pnl.cmp(b.pnl))
  return worst
}

function group<K>(items: readonly { key: K; pnl: Big }[]): Map<K, BriefPattern<K>> {
  const groups = new Map<K, BriefPattern<K>>()
  for (const item of items) {
    const current = groups.get(item.key) ?? { key: item.key, pnl: new Big(0), count: 0 }
    groups.set(item.key, { key: item.key, pnl: current.pnl.plus(item.pnl), count: current.count + 1 })
  }
  return groups
}

/** Days since a fixed date, so the rule of the day changes at local midnight. */
function dayNumber(now: Date): number {
  return Math.floor((startOfDay(now).getTime() - new Date(2026, 0, 1).getTime()) / 86_400_000 + 0.5)
}

export function morningBrief(trades: readonly Trade[], tags: readonly MistakeTag[], rules: readonly Rule[], now: Date): MorningBrief {
  const today = startOfDay(now)
  const before = closedTrades(trades).filter((item) => item.closedAt < today)
  const brief: MorningBrief = { fed: nextFedDecision(now) }

  const last = before.at(-1)
  if (last) {
    const day = localDayKey(last.closedAt)
    const items = before.filter((item) => localDayKey(item.closedAt) === day)
    const [top] = mistakeCosts(items, tags)
    brief.lastDay = {
      day,
      pnl: items.reduce((sum, item) => sum.plus(item.pnl), new Big(0)),
      count: items.length,
      topMistake: top?.cost.gt(0) ? top : undefined,
    }
  }

  const since = new Date(today.getFullYear(), today.getMonth(), today.getDate() - PATTERN_DAYS)
  const recent = before.filter((item) => item.closedAt >= since)
  const weekday = group(recent.map((item) => ({ key: new Date(item.trade.openedAt).getDay(), pnl: item.pnl }))).get(now.getDay())
  if (weekday && weekday.count >= PATTERN_MIN_TRADES && weekday.pnl.lt(0)) brief.weekday = weekday
  brief.hour = worstBucket(group(recent.map((item) => ({ key: new Date(item.trade.openedAt).getHours(), pnl: item.pnl }))))

  const active = rules.filter((rule) => rule.isActive).sort((a, b) => a.sortOrder - b.sortOrder)
  if (active.length > 0) brief.rule = active[dayNumber(now) % active.length]
  return brief
}

/** Whether the brief has anything to say. */
export function briefIsEmpty(brief: MorningBrief): boolean {
  return !brief.fed && !brief.lastDay && !brief.weekday && !brief.hour && !brief.rule
}
