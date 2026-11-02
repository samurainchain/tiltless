import { describe, expect, it } from 'vitest'
import {
  botCommand,
  botLanguage,
  dayMessage,
  digest,
  dueMessages,
  formatMoney,
  lastSevenDays,
  localClock,
  localDay,
  newLinkCode,
  sumMoney,
  tradePnl,
  validTimeZone,
  type SyncedTrade,
  type TelegramLink,
} from '../../../supabase/functions/_shared/telegram'

// The Telegram bot's pure parts, shared with the Supabase functions (web/supabase/functions).

const trade = (patch: Partial<SyncedTrade>): SyncedTrade => ({
  accountId: 'real',
  side: 'long',
  entryPrice: '100',
  exitPrice: '110',
  quantity: '1',
  contractMultiplier: '1',
  fees: '0',
  closedAt: '2026-11-02T15:00:00Z',
  ...patch,
})

describe('money', () => {
  it('computes PnL exactly, like the app', () => {
    expect(tradePnl(trade({ entryPrice: '0.1', exitPrice: '0.3', quantity: '3', fees: '0.0001' }))).toBe('0.60')
    expect(tradePnl(trade({ side: 'short', entryPrice: '5000', exitPrice: '5010.25', quantity: '2', contractMultiplier: '50', fees: '4.5' }))).toBe('-1029.50')
    expect(tradePnl(trade({ exitPrice: undefined }))).toBeUndefined()
  })

  it('sums and rounds to cents', () => {
    expect(sumMoney(['0.1', '0.2'])).toBe('0.30')
    expect(sumMoney(['-0.005'])).toBe('-0.01')
    expect(sumMoney([])).toBe('0.00')
  })

  it('formats with a sign in each language', () => {
    expect(formatMoney('1234.50', 'en')).toBe('+$1,234.50')
    expect(formatMoney('-80.00', 'ru')).toBe('−$80,00')
    expect(formatMoney('0.00', 'es')).toBe('$0.00')
  })
})

describe('days and digests', () => {
  it('reads the local day and clock in a time zone', () => {
    const at = new Date('2026-11-03T02:30:00Z')
    expect(localDay(at, 'America/Cancun')).toBe('2026-11-02')
    expect(localClock(at, 'America/Cancun')).toEqual({ hour: 21, weekday: 1 })
    expect(lastSevenDays(at, 'UTC').size).toBe(7)
  })

  it('sums the day on real accounts only', () => {
    const trades = [
      trade({}),
      trade({ exitPrice: '95' }),
      trade({ accountId: 'paper', exitPrice: '200' }),
      trade({ closedAt: '2026-11-01T15:00:00Z', exitPrice: '300' }),
      trade({ exitPrice: undefined, closedAt: undefined }),
    ]
    expect(digest(trades, new Set(['paper']), new Set(['2026-11-02']), 'UTC')).toEqual({ pnl: '5.00', count: 2, wins: 1, losses: 1 })
  })

  it('writes the day message', () => {
    expect(dayMessage({ pnl: '5.00', count: 2, wins: 1, losses: 1 }, 'en')).toContain('+$5.00 in 2 trades (1 won, 1 lost)')
  })
})

describe('what is due', () => {
  const link: TelegramLink = {
    user_id: 'u',
    chat_id: 1,
    time_zone: 'America/Cancun',
    language: 'ru',
    daily_summary: true,
    limit_alerts: true,
    review_reminder: true,
    last_daily_sent: null,
    last_review_sent: null,
    last_limit_sent: null,
  }

  it('sends the summary once after 21:00 local', () => {
    expect(dueMessages(link, 0, new Date('2026-11-02T20:00:00Z')).daily).toBe(false)
    expect(dueMessages(link, 0, new Date('2026-11-03T02:10:00Z')).daily).toBe(true)
    expect(dueMessages({ ...link, last_daily_sent: '2026-11-02' }, 0, new Date('2026-11-03T02:10:00Z')).daily).toBe(false)
    expect(dueMessages({ ...link, daily_summary: false }, 0, new Date('2026-11-03T02:10:00Z')).daily).toBe(false)
  })

  it('reminds of the review on its weekday from 10:00', () => {
    // Monday 2 November 2026, 11:00 in Cancún.
    const monday = new Date('2026-11-02T16:00:00Z')
    expect(dueMessages(link, 1, monday).review).toBe(true)
    expect(dueMessages(link, 0, monday).review).toBe(false)
    expect(dueMessages({ ...link, last_review_sent: '2026-11-02' }, 1, monday).review).toBe(false)
  })
})

describe('linking', () => {
  it('makes codes Telegram accepts in a start link', () => {
    const code = newLinkCode()
    expect(code).toMatch(/^[A-Za-z0-9_-]{32}$/)
    expect(newLinkCode()).not.toBe(code)
  })

  it('reads the bot commands', () => {
    expect(botCommand(`/start ${'a'.repeat(32)}`)).toEqual({ kind: 'start', code: 'a'.repeat(32) })
    expect(botCommand('/stop')).toEqual({ kind: 'stop' })
    expect(botCommand('/start')).toEqual({ kind: 'other' })
    expect(botCommand('hello')).toEqual({ kind: 'other' })
  })

  it('checks the language and time zone it is given', () => {
    expect(botLanguage('es')).toBe('es')
    expect(botLanguage('de')).toBe('en')
    expect(validTimeZone('America/Cancun')).toBe('America/Cancun')
    expect(validTimeZone('Mars/Base')).toBe('UTC')
  })
})
