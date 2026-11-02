import Big from 'big.js'
import { parseDecimalInput, parsePositive } from '../../core/decimal'
import { newId, type Account, type AssetClass, type Emotion, type Side, type Trade, type TradeExit, type TradeSource } from '../../core/models'
import type { Confidence, ParsedScreenshot } from '../../core/ocr/parseScreenshot'
import { averageExit, quoteToBaseQuantity, rMultiple, tradePnl } from '../../core/pnl'
import { FUTURES_PRESETS } from '../../core/presets'
import type { MessageKey } from '../../i18n/messages/en'

/** The entry sheet's state, kept as typed text until it's saved (SPEC section 4.4). */
export interface EntryForm {
  accountId: string
  symbol: string
  side: Side
  /** Crypto perpetuals only, 1–125. */
  leverage: number
  /** Futures only: a preset symbol or `custom`. */
  contract: string
  /** Futures only: value of one point, used with a custom contract. */
  multiplier: string
  entryPrice: string
  exitPrice: string
  /** A position closed in parts: two or more rows; empty for a single exit at `exitPrice`. */
  exits: ExitRow[]
  size: string
  /** Crypto only: size typed in coins (`base`) or in USDT (`quote`). */
  sizeUnit: 'base' | 'quote'
  stopLoss: string
  fees: string
  /** `datetime-local` values. */
  openedAt: string
  closedAt: string
  emotion?: Emotion
  mistakeIds: string[]
  setupIds: string[]
  brokenRuleIds: string[]
  note: string
  /** `ocr` once fields were filled from a screenshot. */
  source: TradeSource
}

/** One partial exit as typed: price, share of the position in %, and a `datetime-local` time. */
export interface ExitRow {
  price: string
  percent: string
  closedAt: string
}

export type EntryField = 'symbol' | 'multiplier' | 'entryPrice' | 'exitPrice' | 'exits' | 'size' | 'stopLoss' | 'fees' | 'closedAt'
export type EntryErrors = Partial<Record<EntryField, MessageKey>>

export const CUSTOM_CONTRACT = 'custom'
const DEFAULT_LEVERAGE = 10

export function isCrypto(market: AssetClass): boolean {
  return market === 'cryptoSpot' || market === 'cryptoPerp'
}

/** `datetime-local` value for a date in the browser's time zone. */
export function toLocalInput(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function fromLocalInput(value: string): string | undefined {
  const time = Date.parse(value)
  return Number.isNaN(time) ? undefined : new Date(time).toISOString()
}

/** A blank form for a new trade on `account`, reusing the leverage last used there. */
export function newEntryForm(account: Account | undefined, trades: readonly Trade[], now = new Date()): EntryForm {
  const lastLeverage = trades
    .filter((trade) => trade.accountId === account?.id && trade.leverage)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0]?.leverage
  const firstPreset = FUTURES_PRESETS[0]!
  return {
    accountId: account?.id ?? '',
    symbol: account?.assetClass === 'futures' ? firstPreset.symbol : '',
    side: 'long',
    leverage: lastLeverage ? Number(lastLeverage) : DEFAULT_LEVERAGE,
    contract: firstPreset.symbol,
    multiplier: firstPreset.multiplier,
    entryPrice: '',
    exitPrice: '',
    exits: [],
    size: '',
    sizeUnit: 'base',
    stopLoss: '',
    fees: '',
    openedAt: toLocalInput(now),
    closedAt: toLocalInput(now),
    mistakeIds: [],
    setupIds: [],
    brokenRuleIds: [],
    note: '',
    source: 'manual',
  }
}

/** The form filled from an existing trade, for editing. */
export function editEntryForm(trade: Trade): EntryForm {
  const preset = FUTURES_PRESETS.find((item) => item.symbol === trade.symbol && new Big(item.multiplier).eq(trade.contractMultiplier))
  return {
    accountId: trade.accountId,
    symbol: trade.symbol,
    side: trade.side,
    leverage: trade.leverage ? Number(trade.leverage) : DEFAULT_LEVERAGE,
    contract: preset ? preset.symbol : CUSTOM_CONTRACT,
    multiplier: trade.contractMultiplier,
    entryPrice: trade.entryPrice,
    exitPrice: trade.exitPrice ?? '',
    exits: (trade.exits ?? []).map((exit) => ({ price: exit.price, percent: exit.percent, closedAt: toLocalInput(new Date(exit.closedAt)) })),
    size: trade.quantity,
    sizeUnit: 'base',
    stopLoss: trade.stopLoss ?? '',
    fees: trade.fees === '0' ? '' : trade.fees,
    openedAt: toLocalInput(new Date(trade.openedAt)),
    closedAt: toLocalInput(new Date(trade.closedAt ?? trade.openedAt)),
    emotion: trade.emotion,
    mistakeIds: trade.mistakeIds,
    setupIds: trade.setupIds,
    brokenRuleIds: trade.brokenRuleIds,
    note: trade.note,
    source: trade.source,
  }
}

/** Applies a futures contract choice: a preset sets the symbol and its multiplier. */
export function selectContract(form: EntryForm, contract: string): EntryForm {
  const preset = FUTURES_PRESETS.find((item) => item.symbol === contract)
  if (!preset) return { ...form, contract: CUSTOM_CONTRACT, symbol: '', multiplier: '' }
  return { ...form, contract, symbol: preset.symbol, multiplier: preset.multiplier }
}

/** Turns a single exit into two parts: the typed exit for half the position, and an empty half. */
export function splitExit(form: EntryForm): EntryForm {
  return {
    ...form,
    exits: [
      { price: form.exitPrice, percent: '50', closedAt: form.closedAt },
      { price: '', percent: '50', closedAt: form.closedAt },
    ],
  }
}

/** Share of the position the exit rows don't cover yet, never below zero. */
export function remainingPercent(exits: readonly ExitRow[]): Big {
  const used = exits.reduce((sum, row) => sum.plus(parseDecimalInput(row.percent) ?? '0'), new Big(0))
  return used.gte(100) ? new Big(0) : new Big(100).minus(used)
}

/** Adds an exit row for the rest of the position, at the last row's time. */
export function addExit(form: EntryForm): EntryForm {
  const last = form.exits.at(-1)
  const rest = remainingPercent(form.exits)
  return { ...form, exits: [...form.exits, { price: '', percent: rest.gt(0) ? rest.toString() : '', closedAt: last?.closedAt ?? form.closedAt }] }
}

/** Removes an exit row; with one row left the trade goes back to a single exit at its price. */
export function removeExit(form: EntryForm, index: number): EntryForm {
  const exits = form.exits.filter((_, position) => position !== index)
  if (exits.length > 1) return { ...form, exits }
  const [only] = exits
  return { ...form, exits: [], exitPrice: only?.price ?? form.exitPrice, closedAt: only?.closedAt ?? form.closedAt }
}

/** The exit price the trade's math uses: the typed one, or the average of complete exit rows. */
export function formExitPrice(form: EntryForm): string | undefined {
  if (form.exits.length === 0) return parsePositive(form.exitPrice)
  const rows = form.exits.map((row) => ({ price: parsePositive(row.price), percent: parsePositive(row.percent) }))
  if (rows.some((row) => !row.price || !row.percent)) return undefined
  return averageExit(rows as { price: string; percent: string }[])
}

/** Position size in base units, converting from USDT when the user typed a notional. */
function baseQuantity(form: EntryForm, market: AssetClass, entryPrice: string): string | undefined {
  const size = parsePositive(form.size)
  if (!size) return undefined
  return isCrypto(market) && form.sizeUnit === 'quote' ? quoteToBaseQuantity(size, entryPrice) : size
}

function multiplierFor(form: EntryForm, market: AssetClass): string | undefined {
  return market === 'futures' ? parsePositive(form.multiplier) : '1'
}

/** Live PnL and R for the header of the sheet, once prices and size are filled. */
export function previewResult(form: EntryForm, market: AssetClass): { pnl?: Big; r?: Big } {
  const entryPrice = parsePositive(form.entryPrice)
  const exitPrice = formExitPrice(form)
  if (!entryPrice || !exitPrice) return {}
  const quantity = baseQuantity(form, market, entryPrice)
  const contractMultiplier = multiplierFor(form, market)
  if (!quantity || !contractMultiplier) return {}
  const input = {
    side: form.side,
    entryPrice,
    exitPrice,
    quantity,
    contractMultiplier,
    fees: parseDecimalInput(form.fees) ?? '0',
    stopLoss: parsePositive(form.stopLoss),
  }
  return { pnl: tradePnl(input), r: rMultiple(input) }
}

/**
 * Validates the form and builds the trade to save. Only pair, side, entry, exit and size are
 * required. `existing` is the trade being edited, if any.
 */
export function buildTrade(
  form: EntryForm,
  account: Account,
  existing: Trade | undefined,
  now = new Date(),
): { trade: Trade; errors?: undefined } | { trade?: undefined; errors: EntryErrors } {
  const market = existing?.market ?? account.assetClass
  const errors: EntryErrors = {}

  const symbol = form.symbol.trim().toUpperCase()
  if (!symbol) errors.symbol = 'entry.error.symbol'

  const entryPrice = parsePositive(form.entryPrice)
  if (!entryPrice) errors.entryPrice = 'entry.error.price'
  let exits: TradeExit[] | undefined
  let exitPrice: string | undefined
  let lastExit: string | undefined
  if (form.exits.length > 0) {
    const rows = form.exits.map((row) => ({ price: parsePositive(row.price), percent: parsePositive(row.percent), closedAt: fromLocalInput(row.closedAt) }))
    if (rows.some((row) => !row.price || !row.percent || !row.closedAt)) errors.exits = 'entry.error.exitRows'
    else {
      exitPrice = averageExit(rows as TradeExit[])
      if (!exitPrice) errors.exits = 'entry.error.exitsTotal'
      else {
        exits = rows as TradeExit[]
        lastExit = exits.reduce((latest, row) => (Date.parse(row.closedAt) > Date.parse(latest) ? row.closedAt : latest), exits[0]!.closedAt)
      }
    }
  } else {
    exitPrice = parsePositive(form.exitPrice)
    if (!exitPrice) errors.exitPrice = 'entry.error.price'
  }

  const contractMultiplier = multiplierFor(form, market)
  if (!contractMultiplier) errors.multiplier = 'entry.error.multiplier'

  const quantity = entryPrice ? baseQuantity(form, market, entryPrice) : parsePositive(form.size)
  if (!quantity) errors.size = 'entry.error.size'

  const stopLoss = form.stopLoss.trim() ? parsePositive(form.stopLoss) : undefined
  if (form.stopLoss.trim() && !stopLoss) errors.stopLoss = 'entry.error.price'

  const fees = form.fees.trim() ? parseDecimalInput(form.fees) : '0'
  if (fees === undefined) errors.fees = 'entry.error.fees'

  const openedAt = fromLocalInput(form.openedAt) ?? now.toISOString()
  const closedAt = lastExit ?? fromLocalInput(form.closedAt) ?? now.toISOString()
  if (exits?.some((row) => Date.parse(row.closedAt) < Date.parse(openedAt))) errors.exits = 'entry.error.closedBeforeOpened'
  else if (Date.parse(closedAt) < Date.parse(openedAt)) errors.closedAt = 'entry.error.closedBeforeOpened'

  if (Object.keys(errors).length > 0 || !entryPrice || !exitPrice || !quantity || !contractMultiplier || fees === undefined) {
    return { errors }
  }

  const timestamp = now.toISOString()
  const trade: Trade = {
    id: existing?.id ?? newId(),
    accountId: account.id,
    symbol,
    side: form.side,
    market,
    leverage: market === 'cryptoPerp' ? String(form.leverage) : undefined,
    entryPrice,
    exitPrice,
    exits,
    quantity,
    contractMultiplier,
    // The stop at entry is fixed when the trade is first logged; later edits move `stopLoss` only.
    initialStopLoss: existing ? (existing.initialStopLoss ?? stopLoss) : stopLoss,
    stopLoss,
    takeProfit: existing?.takeProfit,
    fees,
    openedAt,
    closedAt,
    emotion: form.emotion,
    rating: existing?.rating,
    mistakeIds: form.mistakeIds,
    setupIds: form.setupIds,
    brokenRuleIds: form.brokenRuleIds,
    dismissedFlags: existing?.dismissedFlags,
    note: form.note.trim(),
    source: existing?.source ?? form.source,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  }
  return { trade }
}

/** Fields filled from a screenshot, with how sure the recognition was about each. */
export type RecognizedFields = Partial<Record<'symbol' | 'side' | 'entryPrice' | 'exitPrice' | 'size' | 'leverage' | 'fees' | 'openedAt' | 'closedAt', Confidence>>

/**
 * Prefills the form from a parsed screenshot. Only recognized fields change; the rest of
 * what the user already typed stays. For futures, a known contract symbol picks its preset.
 */
export function applyScreenshot(form: EntryForm, parsed: ParsedScreenshot, market: AssetClass): { form: EntryForm; recognized: RecognizedFields } {
  let next: EntryForm = { ...form, source: 'ocr' }
  const recognized: RecognizedFields = {}

  if (parsed.symbol) {
    const preset = market === 'futures' ? FUTURES_PRESETS.find((item) => item.symbol === parsed.symbol!.value) : undefined
    next = preset ? selectContract(next, preset.symbol) : market === 'futures' ? { ...next, contract: CUSTOM_CONTRACT, symbol: parsed.symbol.value } : { ...next, symbol: parsed.symbol.value }
    recognized.symbol = parsed.symbol.confidence
  }
  if (parsed.side) {
    next.side = parsed.side.value
    recognized.side = parsed.side.confidence
  }
  if (parsed.entryPrice) {
    next.entryPrice = parsed.entryPrice.value
    recognized.entryPrice = parsed.entryPrice.confidence
  }
  if (parsed.exitPrice) {
    next.exitPrice = parsed.exitPrice.value
    next.exits = []
    recognized.exitPrice = parsed.exitPrice.confidence
  }
  if (parsed.quantity) {
    next.size = parsed.quantity.value
    next.sizeUnit = isCrypto(market) && parsed.quantityUnit === 'quote' ? 'quote' : 'base'
    recognized.size = parsed.quantity.confidence
  }
  if (parsed.leverage && market === 'cryptoPerp') {
    next.leverage = Math.min(125, Math.max(1, Number(parsed.leverage.value)))
    recognized.leverage = parsed.leverage.confidence
  }
  for (const field of ['fees', 'openedAt', 'closedAt'] as const) {
    const value = parsed[field]
    if (!value) continue
    next[field] = value.value
    recognized[field] = value.confidence
  }
  return { form: next, recognized }
}
