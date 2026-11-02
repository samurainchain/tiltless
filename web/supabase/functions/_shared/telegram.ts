// Pure helpers for the Telegram bot (SPEC section 4.10): linking codes, the evening summary and
// the weekly review reminder, and the messages in en/ru/es. No Deno or network, so the web app's
// tests cover them. Money stays exact: decimal strings are added and multiplied as scaled BigInts.

export type BotLanguage = 'en' | 'ru' | 'es'

/** One row of telegram_links: who gets what, and what was already sent. */
export interface TelegramLink {
  user_id: string
  chat_id: number | null
  time_zone: string
  language: BotLanguage
  daily_summary: boolean
  limit_alerts: boolean
  review_reminder: boolean
  last_daily_sent: string | null
  last_review_sent: string | null
  last_limit_sent: string | null
}

/** Local hour after which the day's summary goes out. */
export const SUMMARY_HOUR = 21
/** Local hour after which the weekly review reminder goes out on the review day. */
export const REVIEW_HOUR = 10
/** A link code is good for this long after the trader presses "Connect". */
export const LINK_CODE_MINUTES = 15

// --- Exact decimals ------------------------------------------------------------------------

interface Decimal {
  value: bigint
  scale: number
}

function parse(text: string): Decimal {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text.trim())
  if (!match) throw new Error(`Not a decimal: ${text}`)
  const fraction = match[3] ?? ''
  const value = BigInt(`${match[2]}${fraction}`)
  return { value: match[1] ? -value : value, scale: fraction.length }
}

function align(a: Decimal, b: Decimal): [bigint, bigint, number] {
  const scale = Math.max(a.scale, b.scale)
  return [a.value * 10n ** BigInt(scale - a.scale), b.value * 10n ** BigInt(scale - b.scale), scale]
}

function add(a: Decimal, b: Decimal): Decimal {
  const [x, y, scale] = align(a, b)
  return { value: x + y, scale }
}

function multiply(a: Decimal, b: Decimal): Decimal {
  return { value: a.value * b.value, scale: a.scale + b.scale }
}

/** Rounds half away from zero to cents and writes "-12.34". */
function toCents(a: Decimal): string {
  let cents: bigint
  if (a.scale <= 2) cents = a.value * 10n ** BigInt(2 - a.scale)
  else {
    const divisor = 10n ** BigInt(a.scale - 2)
    const half = divisor / 2n
    cents = a.value >= 0n ? (a.value + half) / divisor : -((-a.value + half) / divisor)
  }
  const negative = cents < 0n
  const digits = (negative ? -cents : cents).toString().padStart(3, '0')
  return `${negative ? '-' : ''}${digits.slice(0, -2)}.${digits.slice(-2)}`
}

/** Sum of decimal strings, exact, in cents. */
export function sumMoney(values: readonly string[]): string {
  return toCents(values.reduce((total, value) => add(total, parse(value)), { value: 0n, scale: 0 }))
}

// --- Trades --------------------------------------------------------------------------------

/** The synced fields of a trade the summary needs (see src/core/models.ts). */
export interface SyncedTrade {
  accountId: string
  side: 'long' | 'short'
  entryPrice: string
  exitPrice?: string
  quantity: string
  contractMultiplier: string
  fees: string
  closedAt?: string
}

/** PnL = (exit − entry) × Q × M × d − fees, as in src/core/pnl.ts; undefined while open. */
export function tradePnl(trade: SyncedTrade): string | undefined {
  if (!trade.exitPrice) return undefined
  const move = add(parse(trade.exitPrice), { ...parse(trade.entryPrice), value: -parse(trade.entryPrice).value })
  const gross = multiply(multiply(multiply(move, parse(trade.quantity)), parse(trade.contractMultiplier || '1')), { value: trade.side === 'long' ? 1n : -1n, scale: 0 })
  const fees = parse(trade.fees || '0')
  return toCents(add(gross, { ...fees, value: -fees.value }))
}

/** `YYYY-MM-DD` of a moment in a time zone. */
export function localDay(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

/** Hour 0–23 and weekday (0 = Sunday) of a moment in a time zone. */
export function localClock(date: Date, timeZone: string): { hour: number; weekday: number } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23', weekday: 'short' }).formatToParts(date)
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0)
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.find((part) => part.type === 'weekday')?.value ?? 'Sun')
  return { hour, weekday }
}

export interface Digest {
  pnl: string
  count: number
  wins: number
  losses: number
}

/** Closed trades on real accounts whose local close day is in `days`, summed up. */
export function digest(trades: readonly SyncedTrade[], demoAccounts: ReadonlySet<string>, days: ReadonlySet<string>, timeZone: string): Digest {
  const pnls = trades.flatMap((trade) => {
    if (!trade.closedAt || demoAccounts.has(trade.accountId)) return []
    if (!days.has(localDay(new Date(trade.closedAt), timeZone))) return []
    const pnl = tradePnl(trade)
    return pnl === undefined ? [] : [pnl]
  })
  return {
    pnl: sumMoney(pnls),
    count: pnls.length,
    wins: pnls.filter((pnl) => !pnl.startsWith('-') && pnl !== '0.00').length,
    losses: pnls.filter((pnl) => pnl.startsWith('-')).length,
  }
}

/** The local day keys of the 7 days ending today. */
export function lastSevenDays(now: Date, timeZone: string): Set<string> {
  return new Set(Array.from({ length: 7 }, (_, index) => localDay(new Date(now.getTime() - index * 86_400_000), timeZone)))
}

/** The schedule fields a Telegram link and a push subscription share. */
export type Schedule = Pick<TelegramLink, 'time_zone' | 'daily_summary' | 'review_reminder' | 'last_daily_sent' | 'last_review_sent'>

/** What the hourly run should send now, to a Telegram chat or a device. */
export function dueMessages(link: Schedule, reviewWeekday: number, now: Date): { daily: boolean; review: boolean } {
  const today = localDay(now, link.time_zone)
  const clock = localClock(now, link.time_zone)
  return {
    daily: link.daily_summary && clock.hour >= SUMMARY_HOUR && link.last_daily_sent !== today,
    review: link.review_reminder && clock.weekday === reviewWeekday && clock.hour >= REVIEW_HOUR && link.last_review_sent !== today,
  }
}

// --- Linking -------------------------------------------------------------------------------

/** A random link code for t.me/<bot>?start=<code>: 32 characters from [A-Za-z0-9_-]. */
export function newLinkCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** What a message to the bot asks for. */
export function botCommand(text: string | undefined): { kind: 'start'; code: string } | { kind: 'stop' } | { kind: 'other' } {
  const match = /^\/start(?:@\w+)?\s+([A-Za-z0-9_-]{16,64})\s*$/.exec(text ?? '')
  if (match) return { kind: 'start', code: match[1]! }
  if (/^\/stop(?:@\w+)?\s*$/.test(text ?? '')) return { kind: 'stop' }
  return { kind: 'other' }
}

export function botLanguage(value: unknown): BotLanguage {
  return value === 'ru' || value === 'es' ? value : 'en'
}

export function validTimeZone(value: unknown): string {
  if (typeof value !== 'string' || value.length > 64) return 'UTC'
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value })
    return value
  } catch {
    return 'UTC'
  }
}

// --- Messages ------------------------------------------------------------------------------

/** "+$1,234.50" / "−$80.00", from a cents string. */
export function formatMoney(cents: string, language: BotLanguage): string {
  const negative = cents.startsWith('-')
  const [whole = '0', fraction = '00'] = cents.replace('-', '').split('.')
  const group = language === 'en' ? ',' : language === 'es' ? ',' : ' '
  const point = language === 'ru' ? ',' : '.'
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, group)
  const sign = negative ? '−' : cents === '0.00' ? '' : '+'
  return `${sign}$${grouped}${point}${fraction}`
}

const TEXT = {
  en: {
    connected: 'Tiltless is connected. You will get the day’s summary in the evening, a note when you hit a daily limit and a reminder on review day. Change it in Profile → Telegram. Send /stop to disconnect.',
    disconnected: 'Disconnected. Tiltless will not message you any more.',
    expired: 'This link has expired. Open Profile → Telegram in Tiltless and press Connect again.',
    help: 'This is the Tiltless bot. Connect it in the app: Profile → Telegram. Send /stop to disconnect.',
    limit: 'Daily limit reached. Take a break: the next trade today is the one tilt wants.',
    day: (d: Digest, money: string) => `Today: ${money} in ${d.count} ${d.count === 1 ? 'trade' : 'trades'} (${d.wins} won, ${d.losses} lost). Two minutes for the day’s check-in: did the plan hold?`,
    review: (d: Digest, money: string) =>
      d.count > 0 ? `Weekly review day. Last 7 days: ${money} in ${d.count} trades. Ten minutes: what worked, what cost you, one habit for next week.` : 'Weekly review day. Ten minutes: what worked, what cost you, one habit for next week.',
    open: 'Open Tiltless',
  },
  ru: {
    connected: 'Tiltless подключён. Вечером придёт итог дня, при достижении дневного лимита — сообщение, в день ревью — напоминание. Настроить: Профиль → Telegram. Отключить: /stop.',
    disconnected: 'Отключено. Tiltless больше не будет писать.',
    expired: 'Ссылка устарела. Открой в Tiltless Профиль → Telegram и нажми «Подключить» ещё раз.',
    help: 'Это бот Tiltless. Подключи его в приложении: Профиль → Telegram. Отключить: /stop.',
    limit: 'Дневной лимит достигнут. Сделай паузу: следующая сделка сегодня — та, которую хочет тильт.',
    day: (d: Digest, money: string) => `Сегодня: ${money}, сделок: ${d.count} (в плюс ${d.wins}, в минус ${d.losses}). Две минуты на чек-ин дня: получилось держаться плана?`,
    review: (d: Digest, money: string) =>
      d.count > 0 ? `День еженедельного ревью. За 7 дней: ${money}, сделок: ${d.count}. Десять минут: что сработало, что стоило денег, одна привычка на следующую неделю.` : 'День еженедельного ревью. Десять минут: что сработало, что стоило денег, одна привычка на следующую неделю.',
    open: 'Открыть Tiltless',
  },
  es: {
    connected: 'Tiltless está conectado. En la noche recibirás el resumen del día, un aviso al llegar a un límite diario y un recordatorio el día de revisión. Cámbialo en Perfil → Telegram. Envía /stop para desconectar.',
    disconnected: 'Desconectado. Tiltless ya no te enviará mensajes.',
    expired: 'Este enlace venció. Abre Perfil → Telegram en Tiltless y presiona Conectar otra vez.',
    help: 'Este es el bot de Tiltless. Conéctalo en la app: Perfil → Telegram. Envía /stop para desconectar.',
    limit: 'Llegaste al límite diario. Haz una pausa: la próxima operación de hoy es la que quiere el tilt.',
    day: (d: Digest, money: string) => `Hoy: ${money} en ${d.count} ${d.count === 1 ? 'operación' : 'operaciones'} (${d.wins} ganadas, ${d.losses} perdidas). Dos minutos para el check-in del día: ¿se mantuvo el plan?`,
    review: (d: Digest, money: string) =>
      d.count > 0 ? `Día de revisión semanal. Últimos 7 días: ${money} en ${d.count} operaciones. Diez minutos: qué funcionó, qué te costó, un hábito para la próxima semana.` : 'Día de revisión semanal. Diez minutos: qué funcionó, qué te costó, un hábito para la próxima semana.',
    open: 'Abrir Tiltless',
  },
} as const

export type SimpleMessage = 'connected' | 'disconnected' | 'expired' | 'help' | 'limit'

export function simpleMessage(kind: SimpleMessage, language: BotLanguage): string {
  return TEXT[language][kind]
}

export function dayMessage(day: Digest, language: BotLanguage): string {
  return TEXT[language].day(day, formatMoney(day.pnl, language))
}

export function reviewMessage(week: Digest, language: BotLanguage): string {
  return TEXT[language].review(week, formatMoney(week.pnl, language))
}

export function openButton(language: BotLanguage, url: string): { inline_keyboard: { text: string; url: string }[][] } {
  return { inline_keyboard: [[{ text: TEXT[language].open, url }]] }
}
