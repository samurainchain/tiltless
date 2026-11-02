// The signed-in trader's Telegram link, called by the app with the user's access token.
// POST { action: 'status' | 'connect' | 'settings' | 'disconnect' | 'limit', … }:
//   status     → { linked, dailySummary, limitAlerts, reviewReminder }; refreshes time zone and language
//   connect    → { url } of t.me/<bot>?start=<code>, good for 15 minutes
//   settings   → saves the three switches
//   disconnect → forgets the chat (and says so in it)
//   limit      → the daily limit was reached: one message a day, if the trader wants it

import { botLanguage, LINK_CODE_MINUTES, localDay, newLinkCode, openButton, simpleMessage, validTimeZone, type TelegramLink } from '../_shared/telegram.ts'
import { APP_URL, sendMessage, TelegramError } from '../_shared/telegramApi.ts'
import { cors, currentUser, env, json, rest } from '../_shared/server.ts'

type Body = {
  action?: unknown
  timeZone?: unknown
  language?: unknown
  dailySummary?: unknown
  limitAlerts?: unknown
  reviewReminder?: unknown
}

async function findLink(userId: string): Promise<TelegramLink | undefined> {
  const [row] = await rest<TelegramLink[]>(`telegram_links?user_id=eq.${userId}&select=*`)
  return row
}

const patch = (userId: string, body: Record<string, unknown>) => rest(`telegram_links?user_id=eq.${userId}`, { method: 'PATCH', body })

function status(link: TelegramLink | undefined) {
  return {
    linked: Boolean(link?.chat_id),
    dailySummary: link?.daily_summary ?? true,
    limitAlerts: link?.limit_alerts ?? true,
    reviewReminder: link?.review_reminder ?? true,
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors(request) })
  if (request.method !== 'POST') return json(request, { error: 'method_not_allowed' }, 405)
  try {
    const user = await currentUser(request)
    if (!user) return json(request, { error: 'signed_out' }, 401)
    const body = (await request.json().catch(() => ({}))) as Body
    const link = await findLink(user.id)
    const timeZone = validTimeZone(body.timeZone)
    const language = botLanguage(body.language)

    switch (body.action) {
      case 'status': {
        if (link && (link.time_zone !== timeZone || link.language !== language) && body.timeZone) await patch(user.id, { time_zone: timeZone, language })
        return json(request, status(link))
      }
      case 'connect': {
        const code = newLinkCode()
        await rest('telegram_links?on_conflict=user_id', {
          method: 'POST',
          prefer: 'resolution=merge-duplicates,return=minimal',
          body: { user_id: user.id, link_code: code, link_code_expires_at: new Date(Date.now() + LINK_CODE_MINUTES * 60_000).toISOString(), time_zone: timeZone, language },
        })
        return json(request, { url: `https://t.me/${env('TELEGRAM_BOT_USERNAME')}?start=${code}` })
      }
      case 'settings': {
        if (!link) return json(request, { error: 'not_linked' }, 404)
        const next: Record<string, boolean> = {}
        if (typeof body.dailySummary === 'boolean') next.daily_summary = body.dailySummary
        if (typeof body.limitAlerts === 'boolean') next.limit_alerts = body.limitAlerts
        if (typeof body.reviewReminder === 'boolean') next.review_reminder = body.reviewReminder
        await patch(user.id, next)
        return json(request, status({ ...link, ...next }))
      }
      case 'disconnect': {
        if (link?.chat_id) await sendMessage(link.chat_id, simpleMessage('disconnected', link.language)).catch(() => undefined)
        await rest(`telegram_links?user_id=eq.${user.id}`, { method: 'DELETE' })
        return json(request, status(undefined))
      }
      case 'limit': {
        if (!link?.chat_id || !link.limit_alerts) return json(request, { sent: false })
        const today = localDay(new Date(), link.time_zone)
        if (link.last_limit_sent === today) return json(request, { sent: false })
        // Claim the day first, so two devices reaching the limit together send one message.
        const claimed = await rest<unknown[]>(`telegram_links?user_id=eq.${user.id}&or=(last_limit_sent.is.null,last_limit_sent.neq.${today})`, {
          method: 'PATCH',
          body: { last_limit_sent: today },
          prefer: 'return=representation',
        })
        if (!claimed?.length) return json(request, { sent: false })
        try {
          await sendMessage(link.chat_id, simpleMessage('limit', link.language), openButton(link.language, `${APP_URL}#/today`))
        } catch (error) {
          if (error instanceof TelegramError && error.gone) await rest(`telegram_links?user_id=eq.${user.id}`, { method: 'DELETE' })
          else throw error
        }
        return json(request, { sent: true })
      }
      default:
        return json(request, { error: 'bad_action' }, 400)
    }
  } catch (error) {
    console.error(error)
    return json(request, { error: 'server_error' }, 500)
  }
})
