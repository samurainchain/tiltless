import type { SupabaseClient } from '@supabase/supabase-js'
import type { Locale } from '../i18n/i18n'

// Web push on this device (SPEC section 4.10): the browser subscribes with our public VAPID key,
// push-account stores the subscription, and the hourly telegram-digest sends the evening summary
// and the review reminder to it.

/**
 * The public half of the VAPID key pair (docs/push.md). Empty until the owner creates the keys:
 * then Profile hides the section. Public by design: browsers need it to subscribe.
 */
export const VAPID_PUBLIC_KEY: string = ''

export interface PushStatus {
  subscribed: boolean
  dailySummary: boolean
  reviewReminder: boolean
}

export type PushSwitch = 'dailySummary' | 'reviewReminder'

export type PushSupport = 'ok' | 'unsupported' | 'installFirst' | 'denied'

/** Whether push can work here: iPhones and iPads need the app on the Home Screen first. */
export function pushSupport(): PushSupport {
  const apple = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const installed = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
  if (apple && !installed) return 'installFirst'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || typeof Notification === 'undefined') return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  return 'ok'
}

export function pushAvailable(): boolean {
  return VAPID_PUBLIC_KEY !== ''
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4))
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

async function current(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.ready
  return registration.pushManager.getSubscription()
}

async function call<T>(client: SupabaseClient, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await client.functions.invoke<T>('push-account', { body })
  if (error || data === null) throw error ?? new Error('No answer from push-account')
  return data
}

const OFF: PushStatus = { subscribed: false, dailySummary: true, reviewReminder: true }

/** This device's status; not subscribed when the browser has no subscription. */
export async function pushStatus(client: SupabaseClient): Promise<PushStatus> {
  const subscription = await current()
  if (!subscription) return OFF
  return call(client, { action: 'status', endpoint: subscription.endpoint })
}

/** Asks for permission, subscribes the browser and stores the subscription. */
export async function subscribePush(client: SupabaseClient, locale: Locale): Promise<PushStatus> {
  if ((await Notification.requestPermission()) !== 'granted') throw new Error('permission')
  const registration = await navigator.serviceWorker.ready
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) }))
  return call(client, {
    action: 'subscribe',
    subscription: subscription.toJSON(),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    language: locale,
  })
}

export async function unsubscribePush(client: SupabaseClient): Promise<PushStatus> {
  const subscription = await current()
  if (!subscription) return OFF
  await call(client, { action: 'unsubscribe', endpoint: subscription.endpoint }).catch(() => undefined)
  await subscription.unsubscribe()
  return OFF
}

export async function setPushSwitch(client: SupabaseClient, name: PushSwitch, value: boolean): Promise<PushStatus> {
  const subscription = await current()
  if (!subscription) return OFF
  return call(client, { action: 'settings', endpoint: subscription.endpoint, [name]: value })
}

export async function testPush(client: SupabaseClient): Promise<boolean> {
  const subscription = await current()
  if (!subscription) return false
  const { sent } = await call<{ sent: boolean }>(client, { action: 'test', endpoint: subscription.endpoint })
  return sent
}
