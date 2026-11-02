import { describe, expect, it } from 'vitest'
import { parseDecimalInput, parsePositive } from './decimal'
import type { Side, Trade } from './models'
import { averageExit, exitParts, grossPnl, isWin, percentOfDeposit, priceMovePercent, quoteToBaseQuantity, riskAmount, rMultiple, totalPnl, tradeDuration, tradePnl } from './pnl'

type Input = Parameters<typeof rMultiple>[0]

function trade(overrides: Partial<Input> & { side: Side }): Input {
  return {
    entryPrice: '100',
    exitPrice: '110',
    quantity: '1',
    contractMultiplier: '1',
    fees: '0',
    ...overrides,
  }
}

describe('tradePnl', () => {
  it.each([
    // market, side, entry, exit, quantity, multiplier, fees, expected
    ['crypto spot long', 'long', '60000', '61500.5', '0.2', '1', '12.3', '287.8'],
    ['crypto spot short', 'short', '60000', '61500.5', '0.2', '1', '12.3', '-312.4'],
    ['crypto perp long (leverage ignored)', 'long', '3000', '2950', '1.5', '1', '0', '-75'],
    ['crypto perp short', 'short', '3000', '2950', '1.5', '1', '2', '73'],
    ['stock long', 'long', '187.25', '190.10', '100', '1', '1', '284'],
    ['stock short', 'short', '187.25', '190.10', '100', '1', '1', '-286'],
    ['ES futures long', 'long', '5000', '5010.25', '2', '50', '4.5', '1020.5'],
    ['ES futures short', 'short', '5000', '5010.25', '2', '50', '4.5', '-1029.5'],
    ['MES futures short', 'short', '5000', '4990', '3', '5', '0', '150'],
    ['CL futures long', 'long', '78.40', '78.15', '1', '1000', '2.5', '-252.5'],
  ] as const)('%s', (_name, side, entryPrice, exitPrice, quantity, contractMultiplier, fees, expected) => {
    const pnl = tradePnl(trade({ side, entryPrice, exitPrice, quantity, contractMultiplier, fees }))
    expect(pnl?.toString()).toBe(expected)
  })

  it('keeps full decimal precision', () => {
    const pnl = tradePnl(trade({ side: 'long', entryPrice: '0.1', exitPrice: '0.3', quantity: '3' }))
    expect(pnl?.toString()).toBe('0.6')
  })

  it('is undefined for an open trade', () => {
    expect(tradePnl(trade({ side: 'long', exitPrice: undefined }))).toBeUndefined()
  })
})

describe('risk and R', () => {
  it('uses the stop distance times size and multiplier', () => {
    const input = trade({ side: 'long', entryPrice: '5000', exitPrice: '5020', quantity: '2', contractMultiplier: '50', stopLoss: '4990' })
    expect(riskAmount(input)?.toString()).toBe('1000')
    expect(rMultiple(input)?.toString()).toBe('2')
  })

  it('gives a negative R for a losing short', () => {
    const input = trade({ side: 'short', entryPrice: '100', exitPrice: '105', quantity: '10', stopLoss: '110' })
    expect(rMultiple(input)?.toString()).toBe('-0.5')
  })

  it('prefers the stop at entry over a moved stop', () => {
    const input = trade({ side: 'long', entryPrice: '100', exitPrice: '120', initialStopLoss: '90', stopLoss: '110' })
    expect(rMultiple(input)?.toString()).toBe('2')
  })

  it('is undefined without a stop or with a stop at entry', () => {
    expect(rMultiple(trade({ side: 'long' }))).toBeUndefined()
    expect(rMultiple(trade({ side: 'long', stopLoss: '100' }))).toBeUndefined()
  })
})

describe('other per-trade values', () => {
  it('counts only positive PnL as a win', () => {
    expect(isWin(trade({ side: 'long' }))).toBe(true)
    expect(isWin(trade({ side: 'long', exitPrice: '100' }))).toBe(false)
    expect(isWin(trade({ side: 'long', exitPrice: undefined }))).toBeUndefined()
  })

  it('measures duration between entry and exit', () => {
    const times: Pick<Trade, 'openedAt' | 'closedAt'> = { openedAt: '2026-10-27T10:00:00Z', closedAt: '2026-10-27T11:30:00Z' }
    expect(tradeDuration(times)).toBe(90 * 60 * 1000)
    expect(tradeDuration({ openedAt: times.openedAt })).toBeUndefined()
  })

  it('computes percent of deposit when a deposit is set', () => {
    const pnl = tradePnl(trade({ side: 'long', quantity: '5' }))!
    expect(percentOfDeposit(pnl, '1000')?.toString()).toBe('5')
    expect(percentOfDeposit(pnl, undefined)).toBeUndefined()
  })

  it('sums only closed trades', () => {
    const total = totalPnl([trade({ side: 'long' }), trade({ side: 'short' }), trade({ side: 'long', exitPrice: undefined })])
    expect(total.toString()).toBe('0')
  })

  it('converts a quote-currency size into base units', () => {
    expect(quoteToBaseQuantity('1500', '60000')).toBe('0.025')
    expect(quoteToBaseQuantity('100', '0')).toBeUndefined()
  })
})

describe('decimal input', () => {
  it('accepts comma or dot and ignores spaces', () => {
    expect(parseDecimalInput('61 500,5')).toBe('61500.5')
    expect(parseDecimalInput(' 0.25 ')).toBe('0.25')
  })

  it('rejects anything that is not a non-negative number', () => {
    expect(parseDecimalInput('')).toBeUndefined()
    expect(parseDecimalInput('-5')).toBeUndefined()
    expect(parseDecimalInput('1.2.3')).toBeUndefined()
    expect(parseDecimalInput('abc')).toBeUndefined()
    expect(parsePositive('0')).toBeUndefined()
  })
})

describe('grossPnl and priceMovePercent', () => {
  it('adds the fees back for gross PnL', () => {
    expect(grossPnl(trade({ side: 'long', fees: '1.5' }))?.toString()).toBe('10')
    expect(grossPnl(trade({ side: 'short', fees: '1.5' }))?.toString()).toBe('-10')
  })

  it('measures the move in the trade\'s favour', () => {
    expect(priceMovePercent(trade({ side: 'long' }))?.toString()).toBe('10')
    expect(priceMovePercent(trade({ side: 'short' }))?.toString()).toBe('-10')
    expect(priceMovePercent(trade({ side: 'short', entryPrice: '1.1455', exitPrice: '1.1468' }))?.toFixed(4)).toBe('-0.1135')
  })

  it('is undefined while the trade is open', () => {
    expect(grossPnl(trade({ side: 'long', exitPrice: undefined }))).toBeUndefined()
    expect(priceMovePercent(trade({ side: 'long', exitPrice: undefined }))).toBeUndefined()
  })
})

describe('partial exits', () => {
  it('averages the exits by share', () => {
    expect(averageExit([{ price: '105', percent: '50' }, { price: '110', percent: '50' }])).toBe('107.5')
    expect(averageExit([{ price: '100', percent: '33.33' }, { price: '103', percent: '33.33' }, { price: '106', percent: '33.34' }])).toBe('103.0003')
  })

  it('needs shares adding up to 100%', () => {
    expect(averageExit([{ price: '105', percent: '50' }, { price: '110', percent: '40' }])).toBeUndefined()
    expect(averageExit([])).toBeUndefined()
  })

  it('splits the PnL between the parts, matching the trade PnL before fees', () => {
    const exits = [
      { price: '110', percent: '50', closedAt: '2026-11-02T12:00:00Z' },
      { price: '100', percent: '50', closedAt: '2026-11-02T11:00:00Z' },
    ]
    const trade = { side: 'long' as const, entryPrice: '100', quantity: '2', contractMultiplier: '1', fees: '1', exits, exitPrice: averageExit(exits) }
    const parts = exitParts(trade)
    expect(parts.map((part) => part.exit.price)).toEqual(['100', '110'])
    expect(parts.map((part) => part.pnl.toString())).toEqual(['0', '10'])
    expect(tradePnl(trade)?.toString()).toBe('9')
  })

  it('signs short parts', () => {
    const exits = [{ price: '90', percent: '100', closedAt: '2026-11-02T12:00:00Z' }]
    expect(exitParts({ side: 'short', entryPrice: '100', quantity: '1', contractMultiplier: '5', exits })[0]!.pnl.toString()).toBe('50')
  })
})
