// Telegram calls this with every message to the bot. Checks Telegram's secret header, then:
// "/start <code>" links the chat to the trader who pressed Connect, "/stop" unlinks it.
// GET ?setup=<TELEGRAM_WEBHOOK_SECRET> registers this address with Telegram (open it once).

import { botCommand, openButton, simpleMessage, type TelegramLink } from '../_shared/telegram.ts'
import { APP_URL, sendMessage, telegram } from '../_shared/telegramApi.ts'
import { env, rest } from '../_shared/server.ts'

const ok = () => new Response('ok', { status: 200 })

interface Update {
  message?: { text?: string; chat?: { id?: number; type?: string }; from?: { language_code?: string } }
}

Deno.serve(async (request) => {
  const secret = env('TELEGRAM_WEBHOOK_SECRET')
  if (request.method === 'GET') {
    const url = new URL(request.url)
    if (url.searchParams.get('setup') !== secret) return new Response('not_found', { status: 404 })
    const self = `${env('SUPABASE_URL')}/functions/v1/telegram-webhook`
    await telegram('setWebhook', { url: self, secret_token: secret, allowed_updates: ['message'], drop_pending_updates: true })
    await telegram('setMyCommands', { commands: [{ command: 'stop', description: 'Disconnect Tiltless' }] })
    return new Response(`Webhook set to ${self}`, { status: 200 })
  }
  if (request.method !== 'POST') return new Response('method_not_allowed', { status: 405 })
  if (request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== secret) return new Response('forbidden', { status: 403 })

  try {
    const update = (await request.json().catch(() => ({}))) as Update
    const chatId = update.message?.chat?.id
    // Only private chats: a group would show a trader's results to everyone in it.
    if (typeof chatId !== 'number' || update.message?.chat?.type !== 'private') return ok()
    const fallback = update.message?.from?.language_code === 'ru' ? 'ru' : update.message?.from?.language_code === 'es' ? 'es' : 'en'
    const command = botCommand(update.message?.text)

    if (command.kind === 'start') {
      const [link] = await rest<(TelegramLink & { link_code_expires_at: string | null })[]>(`telegram_links?link_code=eq.${command.code}&select=*`)
      if (!link || !link.link_code_expires_at || Date.parse(link.link_code_expires_at) < Date.now()) {
        await sendMessage(chatId, simpleMessage('expired', link?.language ?? fallback))
        return ok()
      }
      // One chat belongs to one journal: a chat linked before to another account moves here.
      await rest(`telegram_links?chat_id=eq.${chatId}&user_id=neq.${link.user_id}`, { method: 'DELETE' })
      await rest(`telegram_links?user_id=eq.${link.user_id}`, {
        method: 'PATCH',
        body: { chat_id: chatId, link_code: null, link_code_expires_at: null, linked_at: new Date().toISOString() },
      })
      await sendMessage(chatId, simpleMessage('connected', link.language), openButton(link.language, `${APP_URL}#/today`))
      return ok()
    }
    if (command.kind === 'stop') {
      const [link] = await rest<TelegramLink[]>(`telegram_links?chat_id=eq.${chatId}&select=*`)
      await rest(`telegram_links?chat_id=eq.${chatId}`, { method: 'DELETE' })
      await sendMessage(chatId, simpleMessage('disconnected', link?.language ?? fallback))
      return ok()
    }
    const [link] = await rest<TelegramLink[]>(`telegram_links?chat_id=eq.${chatId}&select=language`)
    await sendMessage(chatId, simpleMessage('help', link?.language ?? fallback))
    return ok()
  } catch (error) {
    // Answer 200 anyway: Telegram would otherwise retry the same update again and again.
    console.error(error)
    return ok()
  }
})
