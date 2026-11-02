import Big from 'big.js'
import { describe, expect, it } from 'vitest'
import { activeFocus, focusProgress } from './focus'
import type { MistakeTag, Trade, WeeklyReview } from './models'

let sequence = 0

function trade(pnl: string, closedAt: Date, mistakeIds: string[] = []): Trade {
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
    mistakeIds,
    setupIds: [],
    brokenRuleIds: [],
    note: '',
    source: 'manual',
    createdAt: iso,
    updatedAt: iso,
  }
}

function tag(id: string, isArchived = false): MistakeTag {
  return { id, name: id, colorHex: '#000000', isSystem: false, sortOrder: 0, isArchived }
}

function review(weekStart: string, focusMistakeId?: string): WeeklyReview {
  return { id: weekStart, weekStart, whatWorked: '', whatRepeated: '', nextRule: '', focusMistakeId, createdAt: '', updatedAt: '' }
}

const TAGS = [tag('revenge'), tag('fomo'), tag('old', true)]
// Wednesday, 4 November 2026; weeks start on Monday.
const NOW = new Date(2026, 10, 4, 18)
const at = (month: number, day: number, hour = 12) => new Date(2026, month, day, hour)

describe('activeFocus', () => {
  it('takes the latest earlier review that picked a mistake', () => {
    const reviews = [review('2026-10-19', 'fomo'), review('2026-10-26', 'revenge'), review('2026-10-12', 'fomo')]
    expect(activeFocus(reviews, TAGS, NOW, 1)?.tag.id).toBe('revenge')
  })

  it('skips reviews without a focus', () => {
    expect(activeFocus([review('2026-10-19', 'fomo'), review('2026-10-26')], TAGS, NOW, 1)?.tag.id).toBe('fomo')
  })

  it('leaves the review of the current week for next week', () => {
    expect(activeFocus([review('2026-11-02', 'fomo'), review('2026-10-26', 'revenge')], TAGS, NOW, 1)?.tag.id).toBe('revenge')
    expect(activeFocus([review('2026-11-02', 'fomo')], TAGS, NOW, 1)).toBeUndefined()
  })

  it('expires after four weeks', () => {
    expect(activeFocus([review('2026-10-05', 'fomo')], TAGS, NOW, 1)?.tag.id).toBe('fomo')
    expect(activeFocus([review('2026-09-28', 'fomo')], TAGS, NOW, 1)).toBeUndefined()
  })

  it('ignores archived and deleted mistakes', () => {
    expect(activeFocus([review('2026-10-26', 'old')], TAGS, NOW, 1)).toBeUndefined()
    expect(activeFocus([review('2026-10-26', 'gone')], TAGS, NOW, 1)).toBeUndefined()
  })
})

describe('focusProgress', () => {
  const focus = { review: review('2026-10-26', 'revenge'), tag: TAGS[0]! }

  it('counts the mistake this week and in the reviewed week', () => {
    const trades = [
      trade('-100', at(9, 27), ['revenge']),
      trade('-60', at(9, 28), ['revenge', 'fomo']),
      trade('40', at(9, 29), ['revenge']),
      trade('-10', at(9, 30)),
      trade('-50', at(10, 3), ['revenge']),
      trade('30', at(10, 4)),
      // Before the reviewed week and after this one: left out.
      trade('-500', at(9, 25), ['revenge']),
      trade('-500', at(10, 9), ['revenge']),
    ]
    const result = focusProgress(trades, focus, TAGS, NOW, 1)
    expect(result.before.count).toBe(3)
    expect(result.before.cost.toString()).toBe('130')
    expect(result.before.trades).toBe(4)
    expect(result.current.count).toBe(1)
    expect(result.current.cost.toString()).toBe('50')
    expect(result.current.trades).toBe(2)
  })

  it('is zero for a clean week', () => {
    const result = focusProgress([trade('20', at(10, 2))], focus, TAGS, NOW, 1)
    expect(result.current).toEqual({ count: 0, cost: new Big(0), trades: 1 })
  })

  it('follows a Sunday week start', () => {
    // Week of Sunday 1 November.
    const result = focusProgress([trade('-20', at(10, 1), ['revenge'])], focus, TAGS, NOW, 0)
    expect(result.current.count).toBe(1)
  })
})
