import type { SupabaseClient } from '@supabase/supabase-js'
import type { Locale } from '../i18n/i18n'

// The app's side of the Telegram bot (SPEC section 4.10): the telegram-account function links
// the signed-in trader's chat and keeps their choices; the hourly telegram-digest sends.

/**
 * Whether the bot is set up (docs/telegram.md): its secrets, the database table and the hourly
 * job. Until then Profile hides the section; ?telegram=preview shows it in one tab for testing.
 */
export const TELEGRAM_READY = false

export function telegramShown(): boolean {
  return TELEGRAM_READY || new URLSearchParams(window.location.search).get('telegram') === 'preview'
}

export interface TelegramStatus {
  linked: boolean
  dailySummary: boolean
  limitAlerts: boolean
  reviewReminder: boolean
}

export type TelegramSwitch = 'dailySummary' | 'limitAlerts' | 'reviewReminder'

/** The browser's time zone and the app's language, so messages arrive at the trader's evening, in their language. */
function where(locale: Locale): { timeZone: string; language: Locale } {
  return { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', language: locale }
}

async function call<T>(client: SupabaseClient, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await client.functions.invoke<T>('telegram-account', { body })
  if (error || data === null) throw error ?? new Error('No answer from telegram-account')
  return data
}

export function telegramStatus(client: SupabaseClient, locale: Locale): Promise<TelegramStatus> {
  return call(client, { action: 'status', ...where(locale) })
}

/** A t.me link that opens the bot with a one-time code; pressing Start links the chat. */
export async function telegramConnectUrl(client: SupabaseClient, locale: Locale): Promise<string> {
  const { url } = await call<{ url: string }>(client, { action: 'connect', ...where(locale) })
  return url
}

export function setTelegramSwitch(client: SupabaseClient, name: TelegramSwitch, value: boolean): Promise<TelegramStatus> {
  return call(client, { action: 'settings', [name]: value })
}

export function disconnectTelegram(client: SupabaseClient): Promise<TelegramStatus> {
  return call(client, { action: 'disconnect' })
}

/** Tells the bot a daily limit was reached; it writes once a day, if the trader wants it. */
export async function telegramLimitReached(client: SupabaseClient): Promise<void> {
  await call(client, { action: 'limit' })
}
