import type { WidgetId } from './dashboard'
import type { Period } from './stats'

// What Pro unlocks on the web (SPEC section 8, "Бесплатно и Pro на сайте"). The journal itself
// is free: trades without a limit, Today, the day check-in, limits, the calculator, pictures of
// trades and the core analytics for up to a month. Pro adds the deeper analysis and the
// time savers. Pure, so the split is tested; the UI asks `canUse`.

export type ProFeature =
  /** Analytics periods longer than a month. */
  | 'longPeriods'
  /** The dashboard blocks beyond the free ones below. */
  | 'deepAnalytics'
  /** Reading a trade from an exchange screenshot. */
  | 'screenshotReader'
  /** Importing trades from exchange CSV files. */
  | 'exchangeImport'
  /** More than one active account. */
  | 'multipleAccounts'
  /** The weekly review and its card. */
  | 'weeklyReview'

export const PRO_FEATURES: readonly ProFeature[] = ['deepAnalytics', 'longPeriods', 'screenshotReader', 'exchangeImport', 'multipleAccounts', 'weeklyReview']

/** Dashboard blocks everyone gets; the rest need Pro. */
export const FREE_WIDGETS: readonly WidgetId[] = ['performance', 'tradeCount', 'streaks', 'equity', 'tradeStats', 'calendar', 'econCalendar']
export const FREE_PERIODS: readonly Period[] = ['week', 'month']
export const FREE_ACCOUNTS = 1
/** Pro for a new account, from sign-up (written by the database, start_pro_trial). */
export const TRIAL_DAYS = 7
/**
 * Launch offer: accounts created before this moment get 30 days instead of 7. Noon UTC on
 * December 1 is still November 30 everywhere in the Americas, so "until November 30" holds for
 * the whole audience. Keep in step with start_pro_trial in supabase/schema.sql.
 */
export const LAUNCH_TRIAL_DAYS = 30
export const LAUNCH_OFFER_ENDS = new Date('2026-12-01T12:00:00Z')

/** The trial a new account gets if it signs up at `now`. */
export function trialDays(now: Date): number {
  return now < LAUNCH_OFFER_ENDS ? LAUNCH_TRIAL_DAYS : TRIAL_DAYS
}

export function launchOfferOn(now: Date): boolean {
  return now < LAUNCH_OFFER_ENDS
}

export interface Access {
  /** Whether Pro limits apply at all: only once Pro is on sale (or previewed). */
  gated: boolean
  pro: boolean
}

/** Every Pro feature opens with Pro today; the feature names the reason on the lock. */
export function canUse(_feature: ProFeature, access: Access): boolean {
  return !access.gated || access.pro
}

/** Screenshot reads a month on the free plan; Pro reads without a limit. */
export const FREE_SCREENSHOT_READS = 5

/** Screenshot reads used in a month, kept in the browser. */
export interface ScreenshotReads {
  /** `YYYY-MM`, local time. */
  month: string
  count: number
}

function monthKey(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

/** Free reads left this month; a new month starts over. */
export function freeReadsLeft(used: ScreenshotReads | undefined, now: Date): number {
  const count = used?.month === monthKey(now) ? used.count : 0
  return Math.max(0, FREE_SCREENSHOT_READS - count)
}

/** The usage after one more read. */
export function countRead(used: ScreenshotReads | undefined, now: Date): ScreenshotReads {
  const month = monthKey(now)
  return { month, count: (used?.month === month ? used.count : 0) + 1 }
}

export function widgetUnlocked(id: WidgetId, access: Access): boolean {
  return FREE_WIDGETS.includes(id) || canUse('deepAnalytics', access)
}

export function periodUnlocked(period: Period, access: Access): boolean {
  return FREE_PERIODS.includes(period) || canUse('longPeriods', access)
}

/** Whether another account can be added next to `activeAccounts` existing ones. */
export function canAddAccount(activeAccounts: number, access: Access): boolean {
  return activeAccounts < FREE_ACCOUNTS || canUse('multipleAccounts', access)
}

/** Pro is running when its end is still ahead. */
export function proActive(until: Date | undefined, now: Date): boolean {
  return until !== undefined && until.getTime() > now.getTime()
}
