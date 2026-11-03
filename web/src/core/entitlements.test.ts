import { describe, expect, it } from 'vitest'
import { WIDGET_IDS } from './dashboard'
import { canAddAccount, canUse, countRead, FREE_SCREENSHOT_READS, freeReadsLeft, launchOfferOn, periodUnlocked, PRO_FEATURES, proActive, trialDays, widgetUnlocked } from './entitlements'

const open = { gated: false, pro: false }
const free = { gated: true, pro: false }
const pro = { gated: true, pro: true }

describe('entitlements', () => {
  it('opens everything while Pro is not on sale', () => {
    expect(PRO_FEATURES.every((feature) => canUse(feature, open))).toBe(true)
    expect(WIDGET_IDS.every((id) => widgetUnlocked(id, open))).toBe(true)
    expect(canAddAccount(5, open)).toBe(true)
  })

  it('keeps the journal and core analytics free once it is', () => {
    expect(PRO_FEATURES.some((feature) => canUse(feature, free))).toBe(false)
    expect(WIDGET_IDS.filter((id) => widgetUnlocked(id, free))).toEqual(['performance', 'tradeCount', 'streaks', 'equity', 'tradeStats', 'calendar', 'econCalendar'])
    expect(['week', 'month', 'quarter', 'all'].filter((period) => periodUnlocked(period as never, free))).toEqual(['week', 'month'])
    expect([canAddAccount(0, free), canAddAccount(1, free)]).toEqual([true, false])
  })

  it('unlocks everything with Pro', () => {
    expect(PRO_FEATURES.every((feature) => canUse(feature, pro))).toBe(true)
    expect(WIDGET_IDS.every((id) => widgetUnlocked(id, pro))).toBe(true)
    expect(canAddAccount(3, pro)).toBe(true)
  })

  it('counts Pro as running until its end', () => {
    const now = new Date('2026-11-01T12:00:00Z')
    expect(proActive(new Date('2026-11-01T12:00:01Z'), now)).toBe(true)
    expect(proActive(now, now)).toBe(false)
    expect(proActive(undefined, now)).toBe(false)
  })
})

describe('launch offer', () => {
  it('gives 30 days to accounts made through November 30 in the Americas, then 7', () => {
    expect(trialDays(new Date('2026-10-28T20:00:00Z'))).toBe(30)
    // 11:59 PM on Nov 30 in Los Angeles is 07:59 UTC on Dec 1.
    expect(trialDays(new Date('2026-12-01T07:59:00Z'))).toBe(30)
    expect(trialDays(new Date('2026-12-01T12:00:00Z'))).toBe(7)
    expect(launchOfferOn(new Date('2026-12-02T00:00:00Z'))).toBe(false)
  })
})

describe('free screenshot reads', () => {
  const now = new Date(2026, 10, 3)
  it('gives five a month and starts over in a new month', () => {
    expect(freeReadsLeft(undefined, now)).toBe(FREE_SCREENSHOT_READS)
    let used = countRead(undefined, now)
    expect(used).toEqual({ month: '2026-11', count: 1 })
    for (let index = 0; index < 6; index += 1) used = countRead(used, now)
    expect(freeReadsLeft(used, now)).toBe(0)
    expect(freeReadsLeft(used, new Date(2026, 11, 1))).toBe(5)
    expect(countRead(used, new Date(2026, 11, 1))).toEqual({ month: '2026-12', count: 1 })
  })
})
