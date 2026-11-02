import type Big from 'big.js'
import { useMemo } from 'react'
import { useFlaggedTrades, useJournal, useSelectedAccount } from '../../app/journal'
import { realTrades, type Account, type Currency, type Trade } from '../../core/models'
import { totalPnl } from '../../core/pnl'

/** Local calendar day a trade counts toward: its exit, or its entry while open. */
export function tradeDayKey(trade: Trade): string {
  const date = new Date(trade.closedAt ?? trade.openedAt)
  return dayKey(date)
}

export function dayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function dayFromKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year!, month! - 1, day!)
}

function tradeTime(trade: Trade): number {
  return Date.parse(trade.closedAt ?? trade.openedAt)
}

/** Newest first by exit (or entry) time; trades from the same minute by when they were logged. */
export function newestFirst(a: Trade, b: Trade): number {
  return tradeTime(b) - tradeTime(a) || Date.parse(b.createdAt) - Date.parse(a.createdAt)
}

export interface TradeDay {
  key: string
  date: Date
  trades: Trade[]
  pnl: Big
}

/** Groups trades by local day, newest day first and newest trade first within a day. */
export function groupByDay(trades: readonly Trade[]): TradeDay[] {
  const groups = new Map<string, Trade[]>()
  for (const trade of [...trades].sort(newestFirst)) {
    const key = tradeDayKey(trade)
    groups.set(key, [...(groups.get(key) ?? []), trade])
  }
  return [...groups].map(([key, dayTrades]) => ({ key, date: dayFromKey(key), trades: dayTrades, pnl: totalPnl(dayTrades) }))
}

/** Currency for totals: the selected account's, or the one all accounts share; USD otherwise. */
export function totalsCurrency(selected: Account | undefined, accounts: readonly Account[]): Currency {
  if (selected) return selected.currency
  const currencies = new Set(accounts.map((account) => account.currency))
  return currencies.size === 1 ? [...currencies][0]! : 'USD'
}

/**
 * Trades of the account picked in the switcher, or of all accounts, with automatic mistake
 * flags merged in. For editing, read the stored trade instead: flags are not the trader's tags.
 */
export function useVisibleTrades(): { trades: Trade[]; currency: Currency; selected: Account | undefined } {
  const { accounts } = useJournal()
  const trades = useFlaggedTrades()
  const selected = useSelectedAccount()
  return useMemo(
    () => ({
      // "All accounts" leaves practice accounts out; selecting one shows its trades.
      trades: selected ? trades.filter((trade) => trade.accountId === selected.id) : realTrades(trades, accounts),
      currency: totalsCurrency(selected, accounts),
      selected,
    }),
    [trades, accounts, selected],
  )
}
