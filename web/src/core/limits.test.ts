import Big from 'big.js'
import { describe, expect, it } from 'vitest'
import { dayLimits, effectiveLimits, ruleStreak, shouldAlert, totalDeposit } from './limits'
import { defaultProfile, type Account, type JournalProfile, type MistakeTag, type Trade } from './models'
import { defaultReviewWeek, weekSummary } from './review'

let sequence = 0

function trade(pnl: string, closedAt: Date, overrides: Partial<Trade> = {}): Trade {
  sequence += 1
  const iso = closedAt.toISOString()
  return {
    id: `t${sequence}`,
    accountId: 'a',
    symbol: 'BTCUSDT',
    side: 'long',
    market: 'cryptoSpot',
    entryPrice: '100',
    exitPrice: new Big(100).plus(pnl).toString(),
    quantity: '1',
    contractMultiplier: '1',
    fees: '0',
    openedAt: iso,
    closedAt: iso,
    mistakeIds: [],
    setupIds: [],
    brokenRuleIds: [],
    note: '',
    source: 'manual',
    createdAt: iso,
    updatedAt: iso,
    ...overrides,
  }
}

const at = (day: number, hour = 12) => new Date(2026, 9, day, hour)
const NOW = at(28, 18)
const limits = (patch: Partial<JournalProfile>): JournalProfile => ({ ...defaultProfile(), ...patch })

describe('dayLimits', () => {
  it('measures the day net loss and trade count against the limits', () => {
    const trades = [trade('-200', at(28, 10)), trade('50', at(28, 11)), trade('-500', at(27))]
    const result = dayLimits(trades, limits({ dailyLossLimit: '300', dailyTradeLimit: 4 }), NOW)
    expect(result.loss?.used.toString()).toBe('150')
    expect(result.loss?.ratio).toBe(0.5)
    expect(result.loss?.level).toBe('ok')
    expect(result.trades).toMatchObject({ used: 2, limit: 4, level: 'ok' })
    expect(result.reached).toBe(false)
  })

  it('warns at 80% and blocks at 100%', () => {
    const profile = limits({ dailyLossLimit: '100', dailyTradeLimit: 5 })
    const warning = dayLimits([trade('-80', at(28, 10)), trade('0', at(28, 11)), trade('0', at(28, 12)), trade('0', at(28, 13))], profile, NOW)
    expect(warning.loss?.level).toBe('warning')
    expect(warning.trades?.level).toBe('warning')
    const reached = dayLimits([trade('-100', at(28, 10))], profile, NOW)
    expect(reached.loss?.level).toBe('reached')
    expect(reached.reached).toBe(true)
  })

  it('counts no loss on a profitable day and skips unset limits', () => {
    const result = dayLimits([trade('70', at(28))], limits({ dailyLossLimit: '100' }), NOW)
    expect(result.loss?.used.toString()).toBe('0')
    expect(result.trades).toBeUndefined()
  })

  it('ignores open trades', () => {
    const open = trade('0', at(28), { exitPrice: undefined, closedAt: undefined })
    expect(dayLimits([open], limits({ dailyTradeLimit: 1 }), NOW).trades?.used).toBe(0)
  })
})

describe('shouldAlert', () => {
  const reached = dayLimits([trade('-300', at(28, 10))], limits({ dailyLossLimit: '300' }), NOW)

  it('alerts the first time a limit is reached each day', () => {
    expect(shouldAlert(reached, undefined, NOW)).toBe(true)
    expect(shouldAlert(reached, '2026-10-27', NOW)).toBe(true)
  })

  it('does not alert twice on the same day', () => {
    expect(shouldAlert(reached, '2026-10-28', NOW)).toBe(false)
  })

  it('does not alert below the limit', () => {
    const fine = dayLimits([trade('-10', at(28))], limits({ dailyLossLimit: '300' }), NOW)
    expect(shouldAlert(fine, undefined, NOW)).toBe(false)
  })
})

describe('ruleStreak', () => {
  it('counts trading days back from today; days without trades do not break it', () => {
    const trades = [trade('10', at(28)), trade('-5', at(26)), trade('20', at(22))]
    expect(ruleStreak(trades, defaultProfile(), NOW)).toBe(3)
  })

  it('stops at a day with a broken rule', () => {
    const trades = [trade('10', at(28)), trade('5', at(27), { brokenRuleIds: ['r1'] }), trade('20', at(26))]
    expect(ruleStreak(trades, defaultProfile(), NOW)).toBe(1)
  })

  it('stops at a day past a limit, but reaching it exactly is fine', () => {
    const profile = limits({ dailyLossLimit: '100', dailyTradeLimit: 2 })
    expect(ruleStreak([trade('-100', at(28)), trade('5', at(27))], profile, NOW)).toBe(2)
    expect(ruleStreak([trade('-101', at(28)), trade('5', at(27))], profile, NOW)).toBe(0)
    expect(ruleStreak([trade('1', at(28, 9)), trade('1', at(28, 10)), trade('1', at(28, 11)), trade('5', at(27))], profile, NOW)).toBe(0)
  })

  it('is zero without trades', () => {
    expect(ruleStreak([], defaultProfile(), NOW)).toBe(0)
  })
})

describe('weekSummary', () => {
  const fomo: MistakeTag = { id: 'fomo', name: 'FOMO', colorHex: '#000', isSystem: false, sortOrder: 0, isArchived: false }
  const trades = [
    trade('300', at(26), { stopLoss: '50', emotion: 'calm' }), // +6R
    trade('-120', at(27), { stopLoss: '60', emotion: 'fomo', mistakeIds: ['fomo'] }), // −3R
    trade('40', at(29), { emotion: 'fomo' }),
    trade('999', at(19)), // previous week
  ]
  const summary = weekSummary(trades, [fomo], new Date(2026, 9, 26))

  it('covers the seven days from the week start', () => {
    expect(summary.trades).toHaveLength(3)
    expect(summary.metrics.pnl.toString()).toBe('220')
  })

  it('picks the best and worst trades, top mistake and worst emotion', () => {
    expect(summary.best?.pnl.toString()).toBe('300')
    expect(summary.worst?.pnl.toString()).toBe('-120')
    expect(summary.topMistake?.tag.id).toBe('fomo')
    expect(summary.topMistake?.cost.toString()).toBe('120')
    expect(summary.worstEmotion?.key).toBe('fomo')
    expect(summary.worstEmotion?.pnl.toString()).toBe('-80')
  })

  it('sums R over trades with a stop', () => {
    expect(summary.totalR?.toString()).toBe('3')
  })

  it('is empty for a week without trades', () => {
    const empty = weekSummary(trades, [fomo], new Date(2026, 10, 2))
    expect(empty.trades).toHaveLength(0)
    expect(empty.best).toBeUndefined()
    expect(empty.totalR).toBeUndefined()
  })
})

describe('defaultReviewWeek', () => {
  it('is the current week, or the one that just ended on the first day of a week', () => {
    expect(defaultReviewWeek(new Date(2026, 10, 1, 19), 1)).toEqual(new Date(2026, 9, 26)) // Sunday, Monday-start weeks
    expect(defaultReviewWeek(new Date(2026, 10, 1, 19), 0)).toEqual(new Date(2026, 9, 25)) // Sunday, Sunday-start weeks
    expect(defaultReviewWeek(new Date(2026, 9, 28), 1)).toEqual(new Date(2026, 9, 26))
  })
})

describe('loss limit in % of the deposit', () => {
  const account = (depositAmount?: string, extra: Partial<Account> = {}) => ({ depositAmount, isArchived: false, ...extra }) as Account

  it('sums the deposits of active real accounts', () => {
    const accounts = [account('5000'), account('3000'), account('9000', { isDemo: true }), account('1000', { isArchived: true }), account()]
    expect(totalDeposit(accounts)?.toString()).toBe('8000')
    expect(totalDeposit([account()])).toBeUndefined()
  })

  it('turns a % limit into money', () => {
    const profile = limits({ dailyLossUnit: 'percent', dailyLossPercent: '2.5', dailyLossLimit: '999' })
    expect(effectiveLimits(profile, [account('8000')]).dailyLossLimit).toBe('200')
    expect(effectiveLimits(profile, [account()]).dailyLossLimit).toBeUndefined()
    const result = dayLimits([trade('-150', at(28, 10))], effectiveLimits(profile, [account('8000')]), NOW)
    expect(result.loss?.level).toBe('ok')
    expect(result.loss?.limit.toString()).toBe('200')
  })

  it('keeps a money limit as it is', () => {
    const profile = limits({ dailyLossLimit: '300', dailyLossPercent: '5' })
    expect(effectiveLimits(profile, [account('8000')])).toBe(profile)
  })
})
