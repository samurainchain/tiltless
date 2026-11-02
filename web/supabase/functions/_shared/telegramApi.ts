// Talks to the Telegram Bot API. Secrets (Supabase Dashboard → Edge Functions → Secrets):
// TELEGRAM_BOT_TOKEN from @BotFather, TELEGRAM_BOT_USERNAME (without @), TELEGRAM_WEBHOOK_SECRET
// (any long random string; Telegram sends it back with every update) and TELEGRAM_CRON_SECRET
// (the hourly job's key, also stored in the database vault; see docs/migrations/2026-11-02-telegram.sql).

import { env } from './server.ts'

export const APP_URL = 'https://tiltless.xyz/app/'

export class TelegramError extends Error {
  constructor(
    readonly method: string,
    readonly status: number,
    description: string,
  ) {
    super(`Telegram ${method}: ${status} ${description}`)
  }

  /** The trader blocked the bot or deleted the chat: stop writing to it. */
  get gone(): boolean {
    return this.status === 403 || (this.status === 400 && /chat not found/i.test(this.message))
  }
}

export async function telegram<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`https://api.telegram.org/bot${env('TELEGRAM_BOT_TOKEN')}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const answer = (await response.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string }
  if (!response.ok || !answer.ok) throw new TelegramError(method, response.status, answer.description ?? '')
  return answer.result as T
}

export function sendMessage(chatId: number, text: string, replyMarkup?: unknown): Promise<unknown> {
  return telegram('sendMessage', { chat_id: chatId, text, disable_web_page_preview: true, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) })
}
