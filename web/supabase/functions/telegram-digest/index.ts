// Run every hour by the database (pg_cron + pg_net, docs/migrations/2026-11-02-telegram.sql) with
// the header x-cron-secret. For each linked trader whose local evening or review day has come,
// reads their synced journal and sends the day's summary or the weekly review reminder.

import { dayMessage, digest, dueMessages, lastSevenDays, localDay, openButton, reviewMessage, type SyncedTrade, type TelegramLink } from '../_shared/telegram.ts'
import { APP_URL, sendMessage, TelegramError } from '../_shared/telegramApi.ts'
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

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('method_not_allowed', { status: 405 })
  if (request.headers.get('x-cron-secret') !== env('TELEGRAM_CRON_SECRET')) return new Response('forbidden', { status: 403 })

  const now = new Date()
  const links = await rest<TelegramLink[]>('telegram_links?chat_id=not.is.null&select=*')
  let sent = 0
  for (const link of links) {
    try {
      const settings = await journal(link.user_id)
      const profile = settings.find((row) => row.collection === 'profile')?.data
      const reviewWeekday = typeof profile?.reviewWeekday === 'number' ? profile.reviewWeekday : 0
      const due = dueMessages(link, reviewWeekday, now)
      if (!due.daily && !due.review) continue

      const demo = new Set(settings.filter((row) => row.collection === 'accounts' && row.data?.isDemo === true).map((row) => String(row.data?.id)))
      const trades = (await journal(link.user_id, new Date(now.getTime() - 8 * 86_400_000))).flatMap((row) => (row.data ? [row.data as unknown as SyncedTrade] : []))
      const today = localDay(now, link.time_zone)
      const update: Record<string, string> = {}

      if (due.daily) {
        const day = digest(trades, demo, new Set([today]), link.time_zone)
        // A day without trades gets no message: nothing to sum up.
        if (day.count > 0) {
          await sendMessage(link.chat_id!, dayMessage(day, link.language), openButton(link.language, `${APP_URL}#/today`))
          sent += 1
        }
        update.last_daily_sent = today
      }
      if (due.review) {
        const week = digest(trades, demo, lastSevenDays(now, link.time_zone), link.time_zone)
        await sendMessage(link.chat_id!, reviewMessage(week, link.language), openButton(link.language, `${APP_URL}#/review`))
        sent += 1
        update.last_review_sent = today
      }
      await rest(`telegram_links?user_id=eq.${link.user_id}`, { method: 'PATCH', body: update })
    } catch (error) {
      if (error instanceof TelegramError && error.gone) await rest(`telegram_links?user_id=eq.${link.user_id}`, { method: 'DELETE' }).catch(() => undefined)
      else console.error(`Telegram digest for ${link.user_id}:`, error)
    }
  }
  return new Response(JSON.stringify({ links: links.length, sent }), { status: 200, headers: { 'Content-Type': 'application/json' } })
})
