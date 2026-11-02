import { useEffect } from 'react'
import { dayLimits, effectiveLimits, shouldAlert } from '../core/limits'
import { realTrades } from '../core/models'
import { useCloud } from './cloud'
import { telegramLimitReached, telegramShown } from './telegram'
import { localDayKey } from '../core/stats'
import { useI18n } from '../i18n/i18n'
import { useJournal } from './journal'

const LAST_ALERT_KEY = 'mirror.lastLimitAlert'

// Browser notifications only show while the site is open; there is no server to push them.

export function notificationsSupported(): boolean {
  return typeof Notification !== 'undefined'
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  return notificationsSupported() ? Notification.permission : 'unsupported'
}

export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!notificationsSupported()) return 'unsupported'
  return Notification.requestPermission()
}

function readLastAlert(): string | undefined {
  try {
    return localStorage.getItem(LAST_ALERT_KEY) ?? undefined
  } catch {
    return undefined
  }
}

function writeLastAlert(day: string): void {
  try {
    localStorage.setItem(LAST_ALERT_KEY, day)
  } catch {
    // Without storage the alert may repeat after a reload; acceptable.
  }
}

/**
 * Watches today's trades and shows a "take a break" notification the first time a daily
 * limit is reached, at most once a day (SPEC section 6, anti-tilt).
 */
export function useLimitAlerts(): void {
  const { trades: stored, accounts, profile, status } = useJournal()
  const trades = realTrades(stored, accounts)
  const { t } = useI18n()
  const { cloud, state: cloudState } = useCloud()
  const signedIn = Boolean(cloud.supabase && cloudState.email)

  useEffect(() => {
    if (status !== 'ready' || !profile.limitAlerts) return
    const now = new Date()
    const limits = dayLimits(trades, effectiveLimits(profile, accounts), now)
    if (!shouldAlert(limits, readLastAlert(), now)) return
    writeLastAlert(localDayKey(now))
    if (notificationPermission() === 'granted') {
      new Notification(t('limits.alertTitle'), { body: t('limits.alertBody'), tag: 'tiltless-limit' })
    }
    // Also in Telegram when linked; the server sends at most one a day across devices.
    if (signedIn && cloud.supabase && telegramShown()) void telegramLimitReached(cloud.supabase).catch(() => undefined)
  }, [trades, accounts, profile, status, t, signedIn, cloud])
}
