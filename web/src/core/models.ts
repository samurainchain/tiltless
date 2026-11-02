import type { OnboardingAnswers } from './onboarding'

// Data model, mirroring SPEC section 5. Money and prices are decimal strings so they keep
// full precision (and the precision the user typed); math goes through big.js in `pnl.ts`.

export type DecimalString = string
/** ISO 8601 timestamp. */
export type Timestamp = string

export const ASSET_CLASSES = ['cryptoSpot', 'cryptoPerp', 'stock', 'futures'] as const
export type AssetClass = (typeof ASSET_CLASSES)[number]

export const SIDES = ['long', 'short'] as const
export type Side = (typeof SIDES)[number]

export const EMOTIONS = ['calm', 'confident', 'fomo', 'anger', 'boredom', 'fear', 'greed'] as const
export type Emotion = (typeof EMOTIONS)[number]

export const CURRENCIES = ['USD', 'USDT'] as const
export type Currency = (typeof CURRENCIES)[number]

export type TradeSource = 'manual' | 'ocr' | 'csvImport'

export interface Account {
  id: string
  name: string
  assetClass: AssetClass
  /** Exchange or broker. */
  venue: string
  currency: Currency
  depositAmount?: DecimalString
  colorHex: string
  sortOrder: number
  isArchived: boolean
  createdAt: Timestamp
  /** Rules of a prop firm's challenge or funded account, measured against `depositAmount`. */
  challenge?: PropChallenge
  /**
   * A practice account (paper or demo trading). Its trades stay out of "All accounts", the
   * daily limits, the streak and the focus habit; selecting the account shows them.
   */
  isDemo?: boolean
}

/** Ids of practice accounts. */
export function demoAccountIds(accounts: readonly Account[]): Set<string> {
  return new Set(accounts.filter((account) => account.isDemo).map((account) => account.id))
}

/** Trades on real accounts only: practice trades don't count toward the trader's real day. */
export function realTrades<T extends Pick<Trade, 'accountId'>>(trades: readonly T[], accounts: readonly Account[]): T[] {
  const demo = demoAccountIds(accounts)
  return demo.size === 0 ? [...trades] : trades.filter((trade) => !demo.has(trade.accountId))
}

/**
 * A prop firm's rules (SPEC section 4.11). Percentages are of the account size (`depositAmount`),
 * as most firms count them; a missing rule is not checked.
 */
export interface PropChallenge {
  /** Profit that passes the challenge; missing for a funded account. */
  profitTargetPct?: DecimalString
  /** Largest loss within one day. */
  dailyLossPct?: DecimalString
  /** Largest loss from the account size, overall. */
  maxLossPct?: DecimalString
  /** Days with at least one closed trade needed to pass. */
  minTradingDays?: number
  /** Local date `YYYY-MM-DD`; trades closed earlier don't count. */
  startDate: string
}

export interface Trade {
  id: string
  accountId: string
  symbol: string
  side: Side
  /** Copied from the account when the trade is created. */
  market: AssetClass
  /** Crypto perpetuals only. */
  leverage?: DecimalString
  entryPrice: DecimalString
  /** Missing means the trade is still open. With `exits`, their average weighted by size. */
  exitPrice?: DecimalString
  /**
   * A position closed in parts (SPEC section 6): two or more exits whose shares add up to 100%.
   * `exitPrice` holds their weighted average and `closedAt` the last one, so every PnL and R
   * formula works on the whole trade unchanged.
   */
  exits?: TradeExit[]
  /** In the base asset: coins, shares or contracts. */
  quantity: DecimalString
  /** Value of one point for futures, copied from the preset at entry time; "1" elsewhere. */
  contractMultiplier: DecimalString
  /** Stop at entry; compared with `stopLoss` to tell whether the stop was moved. */
  initialStopLoss?: DecimalString
  /** Latest stop. */
  stopLoss?: DecimalString
  takeProfit?: DecimalString
  /** In the account currency. */
  fees: DecimalString
  openedAt: Timestamp
  closedAt?: Timestamp
  emotion?: Emotion
  /** The trader's own grade of how well the trade was executed, 1–5 stars. */
  rating?: number
  mistakeIds: string[]
  setupIds: string[]
  /** Personal rules the trader marked as broken on this trade. */
  brokenRuleIds: string[]
  /** Identifies a trade imported from an exchange file, so importing it again adds nothing. */
  importKey?: string
  /** Automatic mistake flags the trader said were wrong (SPEC section 13). */
  dismissedFlags?: SystemMistakeKey[]
  note: string
  source: TradeSource
  createdAt: Timestamp
  updatedAt: Timestamp
}

/** One part of a position closed at its own price. */
export interface TradeExit {
  price: DecimalString
  /** Share of the position closed here, in percent. */
  percent: DecimalString
  closedAt: Timestamp
}

export interface MistakeTag {
  id: string
  /** Empty for a system tag the user hasn't renamed: the UI shows the translated name. */
  name: string
  colorHex: string
  isSystem: boolean
  /** Stable key of a seeded system tag. */
  systemKey?: SystemMistakeKey
  sortOrder: number
  isArchived: boolean
}

export interface SetupTag {
  id: string
  name: string
  colorHex: string
  sortOrder: number
  isArchived: boolean
}

export const SYSTEM_MISTAKES = [
  'fomo',
  'revengeTrading',
  'heldPastStop',
  'highLeverage',
  'overtrading',
  'earlyExit',
  'noStop',
  'offPlan',
  'badHour',
] as const
export type SystemMistakeKey = (typeof SYSTEM_MISTAKES)[number]

/**
 * A screenshot attached to a trade (up to 3). The record holds what syncs as data; the JPEG
 * itself lives in the browser and in cloud file storage, keyed by the same id.
 */
export interface TradeImage {
  id: string
  tradeId: string
  width: number
  height: number
  createdAt: Timestamp
}

export const MAX_IMAGES_PER_TRADE = 3

/** A personal trading rule (SPEC section 4.8). */
export interface Rule {
  id: string
  text: string
  isActive: boolean
  sortOrder: number
}

/** Answers to the weekly review questions (SPEC section 4.9). */
export interface WeeklyReview {
  id: string
  /** Local date `YYYY-MM-DD` of the week's first day. */
  weekStart: string
  whatWorked: string
  whatRepeated: string
  nextRule: string
  /** The one mistake to work on next week (a `MistakeTag` id), shown on Today. */
  focusMistakeId?: string
  createdAt: Timestamp
  updatedAt: Timestamp
}

export const SLEEP_LEVELS = ['poor', 'ok', 'good'] as const
export type SleepLevel = (typeof SLEEP_LEVELS)[number]
export const PLAN_KEPT = ['yes', 'partly', 'no'] as const
export type PlanKept = (typeof PLAN_KEPT)[number]

/**
 * The day's check-in: how the trader starts the session and how it went. One per local day;
 * every part is optional, so a quick "slept badly, anxious" counts.
 */
export interface DayCheckIn {
  id: string
  /** Local date `YYYY-MM-DD`. */
  date: string
  sleep?: SleepLevel
  /** How the trader feels before the first trade. */
  mood?: Emotion
  /** Setups, levels, what not to do today. */
  plan: string
  /** After the session: whether the plan held. */
  planKept?: PlanKept
  review: string
  createdAt: Timestamp
  updatedAt: Timestamp
}

export const PROFILE_ID = 'profile'

/** Limits and review preferences: one record per journal. */
export interface JournalProfile {
  id: typeof PROFILE_ID
  /** Daily loss limit in money, across all accounts. */
  dailyLossLimit?: DecimalString
  /** How the daily loss limit is set: in money (default) or as a % of the accounts' deposits. */
  dailyLossUnit?: 'money' | 'percent'
  /** Daily loss limit as a % of the deposits of the active real accounts. */
  dailyLossPercent?: DecimalString
  /** Maximum closed trades per day, across all accounts. */
  dailyTradeLimit?: number
  /** Notify when a limit is reached (at most once a day). */
  limitAlerts: boolean
  /** `Date.getDay()` of the weekly review: 0 = Sunday. */
  reviewWeekday: number
  /** Show dollar amounts on the shared review card instead of only R and %. */
  shareAmounts: boolean
  /** Flag mistakes automatically (SPEC section 13); on unless turned off. */
  autoMistakes?: boolean
  /** Minutes after a losing trade within which a new trade counts as revenge; 15 when missing. */
  revengeMinutes?: number
  /** Onboarding answers, once onboarding is finished or skipped (SPEC section 4.1). */
  onboarding?: OnboardingAnswers & { completedAt: Timestamp; skipped?: boolean }
}

export function defaultProfile(): JournalProfile {
  return { id: PROFILE_ID, limitAlerts: true, reviewWeekday: 0, shareAmounts: false }
}

export interface JournalData {
  accounts: Account[]
  trades: Trade[]
  mistakes: MistakeTag[]
  setups: SetupTag[]
  rules: Rule[]
  reviews: WeeklyReview[]
  checkins: DayCheckIn[]
  images: TradeImage[]
  profile: JournalProfile
}

export const TAG_COLORS = ['#7C6CFF', '#3DDC97', '#FF5C6C', '#FFB547', '#4FB3FF', '#FF7AC6', '#8E8E99'] as const

export function newId(): string {
  return crypto.randomUUID()
}
