import Big from 'big.js'
import { toBig } from './decimal'
import type { DecimalString, Side, Trade, TradeExit } from './models'

// Per-trade math from SPEC section 6. Pure functions: no UI, no storage.

type PnlInput = Pick<Trade, 'side' | 'entryPrice' | 'exitPrice' | 'quantity' | 'contractMultiplier' | 'fees'>
type RiskInput = Pick<Trade, 'entryPrice' | 'quantity' | 'contractMultiplier' | 'initialStopLoss' | 'stopLoss'>

function direction(side: Side): number {
  return side === 'long' ? 1 : -1
}

/**
 * PnL = (exit − entry) × Q × M × d − fees, in the account currency.
 * Leverage doesn't affect PnL. Undefined for an open trade.
 */
export function tradePnl(trade: PnlInput): Big | undefined {
  const exit = toBig(trade.exitPrice)
  if (!exit) return undefined
  return exit
    .minus(trade.entryPrice)
    .times(trade.quantity)
    .times(trade.contractMultiplier)
    .times(direction(trade.side))
    .minus(trade.fees)
}

/**
 * Money at risk: |entry − stop| × Q × M. Uses the stop at entry when there is one, since R
 * measures the result against the risk planned when the trade was opened.
 * Undefined without a stop, or when the stop equals the entry.
 */
export function riskAmount(trade: RiskInput): Big | undefined {
  const stop = toBig(trade.initialStopLoss ?? trade.stopLoss)
  if (!stop) return undefined
  const risk = new Big(trade.entryPrice).minus(stop).abs().times(trade.quantity).times(trade.contractMultiplier)
  return risk.gt(0) ? risk : undefined
}

/** PnL before fees: (exit − entry) × Q × M × d. Undefined for an open trade. */
export function grossPnl(trade: PnlInput): Big | undefined {
  return tradePnl(trade)?.plus(trade.fees)
}

/** How far the price moved in the trade's favour, as a percentage of the entry price. */
export function priceMovePercent(trade: Pick<Trade, 'side' | 'entryPrice' | 'exitPrice'>): Big | undefined {
  const exit = toBig(trade.exitPrice)
  const entry = new Big(trade.entryPrice)
  if (!exit || entry.eq(0)) return undefined
  return exit.minus(entry).div(entry).times(100).times(direction(trade.side))
}

/** R multiple = PnL / Risk. */
export function rMultiple(trade: PnlInput & RiskInput): Big | undefined {
  const pnl = tradePnl(trade)
  const risk = riskAmount(trade)
  if (!pnl || !risk) return undefined
  return pnl.div(risk)
}

export function isWin(trade: PnlInput): boolean | undefined {
  const pnl = tradePnl(trade)
  return pnl ? pnl.gt(0) : undefined
}

/** Milliseconds between entry and exit, or undefined while the trade is open. */
export function tradeDuration(trade: Pick<Trade, 'openedAt' | 'closedAt'>): number | undefined {
  if (!trade.closedAt) return undefined
  return Math.max(0, Date.parse(trade.closedAt) - Date.parse(trade.openedAt))
}

/** PnL as a percentage of the account deposit, when a deposit is set. */
export function percentOfDeposit(pnl: Big, deposit: DecimalString | undefined): Big | undefined {
  const amount = toBig(deposit)
  if (!amount || amount.eq(0)) return undefined
  return pnl.div(amount).times(100)
}

/** Sum of PnL over the closed trades in the list. */
export function totalPnl(trades: readonly PnlInput[]): Big {
  return trades.reduce((sum, trade) => sum.plus(tradePnl(trade) ?? 0), new Big(0))
}

/**
 * Average exit of a position closed in parts, weighted by each part's share: Σ price × share.
 * Undefined unless the shares add up to exactly 100%.
 */
export function averageExit(exits: readonly Pick<TradeExit, 'price' | 'percent'>[]): DecimalString | undefined {
  if (exits.length === 0) return undefined
  const total = exits.reduce((sum, exit) => sum.plus(exit.percent), new Big(0))
  if (!total.eq(100)) return undefined
  return exits.reduce((sum, exit) => sum.plus(new Big(exit.price).times(exit.percent).div(100)), new Big(0)).toString()
}

export interface ExitPart {
  exit: TradeExit
  /** The part's PnL before fees: (exit − entry) × Q × share × M × d. */
  pnl: Big
}

/** Each part of a position closed in parts, oldest first; empty for a single exit. */
export function exitParts(trade: Pick<Trade, 'side' | 'entryPrice' | 'quantity' | 'contractMultiplier' | 'exits'>): ExitPart[] {
  return [...(trade.exits ?? [])]
    .sort((a, b) => Date.parse(a.closedAt) - Date.parse(b.closedAt))
    .map((exit) => ({
      exit,
      pnl: new Big(exit.price)
        .minus(trade.entryPrice)
        .times(trade.quantity)
        .times(exit.percent)
        .div(100)
        .times(trade.contractMultiplier)
        .times(direction(trade.side)),
    }))
}

/** Converts a position size entered in quote currency (e.g. USDT) into base units. */
export function quoteToBaseQuantity(notional: DecimalString, entryPrice: DecimalString): DecimalString | undefined {
  const price = new Big(entryPrice)
  if (price.eq(0)) return undefined
  return new Big(notional).div(price).toString()
}
