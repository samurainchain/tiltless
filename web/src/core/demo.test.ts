import { describe, expect, it } from 'vitest'
import { demoAccountIds, realTrades, type Account } from './models'

const account = (id: string, isDemo?: boolean) => ({ id, isDemo }) as Account

describe('practice accounts', () => {
  const accounts = [account('real'), account('paper', true), account('other', false)]

  it('lists the practice accounts', () => {
    expect([...demoAccountIds(accounts)]).toEqual(['paper'])
  })

  it('keeps only trades on real accounts', () => {
    const trades = [{ accountId: 'real' }, { accountId: 'paper' }, { accountId: 'other' }]
    expect(realTrades(trades, accounts)).toEqual([{ accountId: 'real' }, { accountId: 'other' }])
    expect(realTrades(trades, [account('real')])).toHaveLength(3)
  })
})
