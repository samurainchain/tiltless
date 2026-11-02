// Run every hour by the database (pg_cron + pg_net, docs/migrations/2026-11-02-telegram.sql) with
// the header x-cron-secret. For each trader with a linked Telegram chat or a device with push
// notifications whose local evening or review day has come, reads their synced journal and
// sends the day's summary or the weekly review reminder. Each chat and device keeps its own
// time zone and its own record of what it was sent.

import { dayMessage, digest, dueMessages, lastSevenDays, localDay, openButton, reviewMessage, type Schedule, type SyncedTrade, type TelegramLink } from '../_shared/telegram.ts'
import { APP_URL, sendMessage, TelegramError } from '../_shared/telegramApi.ts'
import { sendPush, type PushRow, type VapidKeys } from '../_shared/webPush.ts'
import { env, rest } from '../_shared/server.ts'

interface RecordRow {
  collection: string
  data: Record<string, unknown> | null
}

async function journal(userId: string, since?: Date): Promise<RecordRow[]> {
  const base = `journal_records?user_id=eq.${userId}&deleted=is.false&select=collection,data`
  if (!since) return rest<RecordRow[]>(`${base}&collection=in.(accounts,profile)`)
  return rest<RecordRow[]>(`${base}&collection=eq.trades&data->>closedAt=gte.${encodeURIComponent(since.toISOString())}`)
}

/** Push keys, or undefined until the owner sets them up (docs/push.md). */
function vapid(): VapidKeys | undefined {
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY')
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY')
  const subject = Deno.env.get('VAPID_SUBJECT')
  return publicKey && privateKey && subject ? { publicKey, privateKey, subject } : undefined
}

type Target = { kind: 'telegram'; row: TelegramLink } | { kind: 'push'; row: PushRow }

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('method_not_allowed', { status: 405 })
  if (request.headers.get('x-cron-secret') !== env('TELEGRAM_CRON_SECRET')) return new Response('forbidden', { status: 403 })

  const now = new Date()
  const keys = vapid()
  const links = await rest<TelegramLink[]>('telegram_links?chat_id=not.is.null&select=*')
  const devices = keys ? await rest<PushRow[]>('push_subscriptions?select=*') : []
  const targets = new Map<string, Target[]>()
  for (const row of links) targets.set(row.user_id, [...(targets.get(row.user_id) ?? []), { kind: 'telegram', row }])
  for (const row of devices) targets.set(row.user_id, [...(targets.get(row.user_id) ?? []), { kind: 'push', row }])

  let sent = 0
  for (const [userId, list] of targets) {
    try {
      const settings = await journal(userId)
      const profile = settings.find((row) => row.collection === 'profile')?.data
      const reviewWeekday = typeof profile?.reviewWeekday === 'number' ? profile.reviewWeekday : 0
      const due = list.map((target) => ({ target, due: dueMessages(target.row as Schedule, reviewWeekday, now) })).filter((item) => item.due.daily || item.due.review)
      if (due.length === 0) continue

      const demo = new Set(settings.filter((row) => row.collection === 'accounts' && row.data?.isDemo === true).map((row) => String(row.data?.id)))
      const trades = (await journal(userId, new Date(now.getTime() - 8 * 86_400_000))).flatMap((row) => (row.data ? [row.data as unknown as SyncedTrade] : []))

      for (const { target, due: what } of due) {
        const { row } = target
        const today = localDay(now, row.time_zone)
        const update: Record<string, string> = {}
        const where = target.kind === 'telegram' ? `telegram_links?user_id=eq.${userId}` : `push_subscriptions?endpoint=eq.${encodeURIComponent(target.row.endpoint)}`
        try {
          const send = async (text: string, route: string, tag: string) => {
            if (target.kind === 'telegram') await sendMessage(target.row.chat_id!, text, openButton(target.row.language, `${APP_URL}${route}`))
            else if ((await sendPush(target.row, { title: 'Tiltless', body: text, url: `${APP_URL}${route}`, tag }, keys!)) === 'gone') throw new Error('gone')
            sent += 1
          }
          if (what.daily) {
            const day = digest(trades, demo, new Set([today]), row.time_zone)
            // A day without trades gets no message: nothing to sum up.
            if (day.count > 0) await send(dayMessage(day, row.language), '#/today', 'tiltless-day')
            update.last_daily_sent = today
          }
          if (what.review) {
            await send(reviewMessage(digest(trades, demo, lastSevenDays(now, row.time_zone), row.time_zone), row.language), '#/review', 'tiltless-review')
            update.last_review_sent = today
          }
          await rest(where, { method: 'PATCH', body: update })
        } catch (error) {
          // A blocked bot or an unsubscribed browser: stop writing to it.
          const gone = (error instanceof TelegramError && error.gone) || (error instanceof Error && error.message === 'gone')
          if (gone) await rest(where, { method: 'DELETE' }).catch(() => undefined)
          else console.error(`Digest for ${userId} (${target.kind}):`, error)
        }
      }
    } catch (error) {
      console.error(`Digest for ${userId}:`, error)
    }
  }
  return new Response(JSON.stringify({ telegram: links.length, devices: devices.length, sent }), { status: 200, headers: { 'Content-Type': 'application/json' } })
})
