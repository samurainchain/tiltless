import Big from 'big.js'
import { describe, expect, it } from 'vitest'
import { challengeStatus } from './challenge'
import type { Account, PropChallenge, Trade } from './models'

let sequence = 0

function trade(pnl: string, closedAt: Date, accountId = 'prop'): Trade {
  sequence += 1
  const iso = closedAt.toISOString()
  return {
    id: `t${sequence}`,
    accountId,
    symbol: 'EURUSD',
    side: 'long',
    market: 'futures',
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
  }
}

const RULES: PropChallenge = { profitTargetPct: '10', dailyLossPct: '5', maxLossPct: '10', startDate: '2026-11-02' }

function account(challenge: PropChallenge = RULES): Account {
  return {
    id: 'prop',
    name: 'Challenge',
    assetClass: 'futures',
    venue: '',
    currency: 'USD',
    depositAmount: '10000',
    colorHex: '#000000',
    sortOrder: 0,
    isArchived: false,
    createdAt: '',
    challenge,
  }
}

const at = (day: number, hour = 12) => new Date(2026, 10, day, hour)
const NOW = at(6, 18)

describe('challengeStatus', () => {
  it('needs rules and an account size', () => {
    expect(challengeStatus({ ...account(), challenge: undefined }, [], NOW)).toBeUndefined()
    expect(challengeStatus({ ...account(), depositAmount: undefined }, [], NOW)).toBeUndefined()
  })

  it('measures progress and the room under each limit', () => {
    const trades = [trade('300', at(3)), trade('-100', at(4)), trade('-200', at(6, 10)), trade('50', at(6, 11))]
    const status = challengeStatus(account(), trades, NOW)!
    expect(status.state).toBe('active')
    expect(status.profit.toString()).toBe('50')
    expect(status.balance.toString()).toBe('10050')
    expect(status.target).toEqual({ amount: new Big(1000), ratio: 0.05, reached: false })
    expect(status.daily?.used.toString()).toBe('150')
    expect(status.daily?.limit.toString()).toBe('500')
    expect(status.daily?.level).toBe('ok')
    expect(status.maxLoss?.used.toString()).toBe('0')
    expect(status.tradingDays).toBe(3)
  })

  it('counts only this account from the start date to now', () => {
    const trades = [trade('-900', at(1)), trade('-900', at(3), 'other'), trade('-900', at(7)), trade('100', at(2))]
    const status = challengeStatus(account(), trades, NOW)!
    expect(status.profit.toString()).toBe('100')
    expect(status.tradingDays).toBe(1)
  })

  it('passes at the target once there are enough trading days', () => {
    const trades = [trade('600', at(2)), trade('500', at(3))]
    expect(challengeStatus(account(), trades, NOW)!.state).toBe('passed')
    const status = challengeStatus(account({ ...RULES, minTradingDays: 4 }), trades, NOW)!
    expect(status.state).toBe('active')
    expect(status.target?.reached).toBe(true)
  })

  it('fails on a day that lost more than the daily limit, even after a recovery', () => {
    const trades = [trade('-300', at(3, 10)), trade('-250', at(3, 11)), trade('400', at(3, 12)), trade('1500', at(4))]
    const status = challengeStatus(account(), trades, NOW)!
    expect(status.state).toBe('failed')
    expect(status.breach).toEqual({ rule: 'dailyLoss', day: '2026-11-03' })
  })

  it('allows a loss exactly at the limit', () => {
    const status = challengeStatus(account(), [trade('-500', at(3))], NOW)!
    expect(status.state).toBe('active')
  })

  it('fails when the balance drops past the overall limit', () => {
    const trades = [trade('-450', at(2)), trade('-450', at(3)), trade('-200', at(4)), trade('2000', at(5))]
    const status = challengeStatus(account(), trades, NOW)!
    expect(status.breach).toEqual({ rule: 'maxLoss', day: '2026-11-04' })
    expect(status.state).toBe('failed')
  })

  it('has no target on a funded account and warns near a limit', () => {
    const status = challengeStatus(account({ ...RULES, profitTargetPct: undefined }), [trade('-420', at(6))], NOW)!
    expect(status.target).toBeUndefined()
    expect(status.state).toBe('active')
    expect(status.daily?.level).toBe('warning')
  })
})
