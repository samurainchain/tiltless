// This device's push notifications (SPEC section 4.10), called by the app with the user's token.
// POST { action, endpoint, … }:
//   subscribe   { subscription: { endpoint, keys: { p256dh, auth } }, timeZone, language } → status
//   status      → { subscribed, dailySummary, reviewReminder } for this endpoint
//   settings    { dailySummary?, reviewReminder? } → status
//   unsubscribe → forgets this endpoint
//   test        → sends a test notification to this endpoint
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (docs/push.md).

import { botLanguage, validTimeZone, type BotLanguage } from '../_shared/telegram.ts'
import { APP_URL } from '../_shared/telegramApi.ts'
import { pushEndpointAllowed, sendPush, type PushRow, type VapidKeys } from '../_shared/webPush.ts'
import { cors, currentUser, env, json, rest } from '../_shared/server.ts'

const TEST: Record<BotLanguage, string> = {
  en: 'Notifications are on. The day’s summary arrives after 9 pm, the review reminder on review day.',
  ru: 'Уведомления включены. Итог дня придёт после 21:00, напоминание о ревью — в день ревью.',
  es: 'Las notificaciones están activas. El resumen del día llega después de las 9 pm y el recordatorio el día de revisión.',
}

const vapid = (): VapidKeys => ({ publicKey: env('VAPID_PUBLIC_KEY'), privateKey: env('VAPID_PRIVATE_KEY'), subject: env('VAPID_SUBJECT') })

function status(row: PushRow | undefined) {
  return { subscribed: Boolean(row), dailySummary: row?.daily_summary ?? true, reviewReminder: row?.review_reminder ?? true }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors(request) })
  if (request.method !== 'POST') return json(request, { error: 'method_not_allowed' }, 405)
  try {
    const user = await currentUser(request)
    if (!user) return json(request, { error: 'signed_out' }, 401)
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const subscription = body.subscription as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | undefined
    const endpoint = body.action === 'subscribe' ? subscription?.endpoint : body.endpoint
    if (!pushEndpointAllowed(endpoint)) return json(request, { error: 'bad_endpoint' }, 400)
    const filter = `endpoint=eq.${encodeURIComponent(endpoint)}&user_id=eq.${user.id}`
    const [row] = await rest<PushRow[]>(`push_subscriptions?${filter}&select=*`)

    switch (body.action) {
      case 'subscribe': {
        const p256dh = subscription?.keys?.p256dh
        const auth = subscription?.keys?.auth
        if (typeof p256dh !== 'string' || typeof auth !== 'string' || p256dh.length > 200 || auth.length > 100) return json(request, { error: 'bad_keys' }, 400)
        const [saved] = await rest<PushRow[]>('push_subscriptions?on_conflict=endpoint', {
          method: 'POST',
          prefer: 'resolution=merge-duplicates,return=representation',
          body: { endpoint, user_id: user.id, p256dh, auth, time_zone: validTimeZone(body.timeZone), language: botLanguage(body.language) },
        })
        return json(request, status(saved))
      }
      case 'status':
        return json(request, status(row))
      case 'settings': {
        if (!row) return json(request, { error: 'not_subscribed' }, 404)
        const next: Record<string, boolean> = {}
        if (typeof body.dailySummary === 'boolean') next.daily_summary = body.dailySummary
        if (typeof body.reviewReminder === 'boolean') next.review_reminder = body.reviewReminder
        await rest(`push_subscriptions?${filter}`, { method: 'PATCH', body: next })
        return json(request, status({ ...row, ...next }))
      }
      case 'unsubscribe':
        await rest(`push_subscriptions?${filter}`, { method: 'DELETE' })
        return json(request, status(undefined))
      case 'test': {
        if (!row) return json(request, { error: 'not_subscribed' }, 404)
        const result = await sendPush(row, { title: 'Tiltless', body: TEST[row.language], url: `${APP_URL}#/today`, tag: 'tiltless-test' }, vapid())
        if (result === 'gone') await rest(`push_subscriptions?${filter}`, { method: 'DELETE' })
        return json(request, { sent: result === 'sent' })
      }
      default:
        return json(request, { error: 'bad_action' }, 400)
    }
  } catch (error) {
    console.error(error)
    return json(request, { error: 'server_error' }, 500)
  }
})
