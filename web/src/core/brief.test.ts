import Big from 'big.js'
import { describe, expect, it } from 'vitest'
import { briefIsEmpty, morningBrief, nextFedDecision } from './brief'
import type { MistakeTag, Rule, Trade } from './models'

let sequence = 0

function trade(pnl: string, openedAt: Date, mistakeIds: string[] = []): Trade {
  sequence += 1
  const iso = openedAt.toISOString()
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
    mistakeIds,
    setupIds: [],
    brokenRuleIds: [],
    note: '',
    source: 'manual',
    createdAt: iso,
    updatedAt: iso,
  }
}

const TAGS: MistakeTag[] = [{ id: 'fomo', name: 'FOMO', colorHex: '#000000', isSystem: false, sortOrder: 0, isArchived: false }]
const rule = (id: string, sortOrder: number, isActive = true): Rule => ({ id, text: id, isActive, sortOrder })
// Monday, 2 November 2026, 8:00.
const NOW = new Date(2026, 10, 2, 8)
const day = (date: number, hour = 12) => new Date(2026, 9, date, hour)

describe('nextFedDecision', () => {
  it('finds a decision within the week and marks today', () => {
    const decisions = ['2026-11-04T14:00:00-05:00', '2026-12-09T14:00:00-05:00']
    expect(nextFedDecision(NOW, decisions)?.at.toISOString()).toBe('2026-11-04T19:00:00.000Z')
    expect(nextFedDecision(NOW, decisions)?.today).toBe(false)
    // The decision's own local day, in whatever time zone the tests run.
    const at = new Date('2026-11-04T19:00:00Z')
    expect(nextFedDecision(new Date(at.getFullYear(), at.getMonth(), at.getDate(), 0, 30), decisions)?.today).toBe(true)
    expect(nextFedDecision(new Date(2026, 10, 10), decisions)).toBeUndefined()
  })

  it('knows the scheduled decisions', () => {
    expect(nextFedDecision(new Date(2026, 11, 7))?.at.toISOString()).toBe('2026-12-09T19:00:00.000Z')
  })
})

describe('morningBrief', () => {
  it('sums up the last trading day with its costliest mistake', () => {
    const brief = morningBrief([trade('-50', day(29)), trade('-80', day(30, 10), ['fomo']), trade('30', day(30, 11)), trade('500', new Date(2026, 10, 2, 7))], TAGS, [], NOW)
    expect(brief.lastDay?.day).toBe('2026-10-30')
    expect(brief.lastDay?.pnl.toString()).toBe('-50')
    expect(brief.lastDay?.count).toBe(2)
    expect(brief.lastDay?.topMistake?.tag.id).toBe('fomo')
  })

  it('flags a losing weekday and hour with enough trades', () => {
    // Five Mondays at 22:00, all losing; other days winning.
    const mondays = [5, 12, 19, 26].map((date) => trade('-20', day(date, 22)))
    const trades = [...mondays, trade('-20', new Date(2026, 8, 28, 22)), trade('40', day(27, 10)), trade('40', day(28, 10))]
    const brief = morningBrief(trades, TAGS, [], NOW)
    expect(brief.weekday).toEqual({ key: 1, pnl: new Big(-100), count: 5 })
    expect(brief.hour).toEqual({ key: 22, pnl: new Big(-100), count: 5 })
  })

  it('needs five trades before calling a pattern', () => {
    const brief = morningBrief([5, 12, 19, 26].map((date) => trade('-20', day(date, 22))), TAGS, [], NOW)
    expect(brief.weekday).toBeUndefined()
    expect(brief.hour).toBeUndefined()
  })

  it('rotates the active rules day by day', () => {
    const rules = [rule('b', 1), rule('a', 0), rule('off', 2, false)]
    const today = morningBrief([], TAGS, rules, NOW).rule?.id
    const tomorrow = morningBrief([], TAGS, rules, new Date(2026, 10, 3, 8)).rule?.id
    expect(new Set([today, tomorrow])).toEqual(new Set(['a', 'b']))
  })

  it('is empty without history, rules or events', () => {
    expect(briefIsEmpty(morningBrief([], TAGS, [], new Date(2026, 10, 16)))).toBe(true)
  })
})
