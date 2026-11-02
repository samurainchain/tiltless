import { useSyncExternalStore } from 'react'
import type { WeekStart } from '../core/stats'

export type LanguageSetting = 'system' | 'en' | 'ru' | 'es'
export type ThemeSetting = 'system' | 'dark' | 'light'
export type WeekStartSetting = 'auto' | 'monday' | 'sunday'
export type StyleSetting = 'glow' | 'flat'
export const ACCENTS = ['green', 'amber', 'violet', 'blue', 'pink'] as const
export type AccentSetting = (typeof ACCENTS)[number]
/** `all` or an account id. */
export type AccountSelection = string

export interface Settings {
  language: LanguageSetting
  theme: ThemeSetting
  /** Glow (the accent's light behind the page and on what's active) or flat. */
  style: StyleSetting
  accent: AccentSetting
  selectedAccount: AccountSelection
  weekStart: WeekStartSetting
  /** The analytics dashboard's blocks; read through normalizeLayout (core/dashboard). */
  dashboard?: unknown
  /** Trades screen: grouped by day, or the table; unset picks by screen width. */
  tradesView?: 'days' | 'table'
  /** Columns hidden in the trade table; read through normalizeHiddenColumns (core/tradeTable). */
  hiddenTradeColumns?: unknown
  /** The position size calculator's last risk, e.g. 1 percent. */
  calculatorRisk?: { mode: 'percent' | 'amount'; value: string }
  /** The trader turned on Investing.com's calendar on Today (it loads a third-party frame). */
  economicCalendar?: boolean
  /** The trader turned on price charts of crypto trades (candles load from Binance's public data). */
  tradeCharts?: boolean
  /** Ids of the bell's notices already seen (core/notices). */
  seenNotices?: string[]
}

// Storage keys keep the app's first name, so saved settings survive the rename.
const STORAGE_KEY = 'mirror.settings'
const DEFAULTS: Settings = { language: 'system', theme: 'system', style: 'glow', accent: 'green', selectedAccount: 'all', weekStart: 'auto' }

// Per-browser preferences. They live in localStorage, apart from the journal data, and are
// read defensively: storage can be unavailable (private mode) or hold stale shapes.

let current: Settings = read()
const listeners = new Set<() => void>()

function read(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) } : DEFAULTS
  } catch {
    return DEFAULTS
  }
}

export function updateSettings(patch: Partial<Settings>): void {
  current = { ...current, ...patch }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current))
  } catch {
    // Not persisted; the change still applies for this session.
  }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, () => current)
}

/** First day of the week as `Date.getDay()`: the setting, or the browser locale's convention. */
export function useWeekStart(): WeekStart {
  const { weekStart } = useSettings()
  if (weekStart === 'monday') return 1
  if (weekStart === 'sunday') return 0
  return localeWeekStart()
}

function localeWeekStart(): WeekStart {
  try {
    const locale = new Intl.Locale(navigator.language) as Intl.Locale & {
      getWeekInfo?: () => { firstDay: number }
      weekInfo?: { firstDay: number }
    }
    const firstDay = locale.getWeekInfo?.().firstDay ?? locale.weekInfo?.firstDay
    // Intl numbers days 1 (Monday) to 7 (Sunday).
    if (firstDay !== undefined) return firstDay === 7 ? 0 : 1
  } catch {
    // Fall through to Monday.
  }
  return 1
}

/** Puts the theme, style and accent on <html>, where the tokens and glow.css read them. */
export function applyAppearance({ theme, style, accent }: Pick<Settings, 'theme' | 'style' | 'accent'>): void {
  const root = document.documentElement
  if (theme === 'system') delete root.dataset.theme
  else root.dataset.theme = theme
  root.dataset.style = style
  if (accent === 'green') delete root.dataset.accent
  else root.dataset.accent = accent
}

/** The current settings outside React, e.g. to paint the right look before the first render. */
export function currentSettings(): Settings {
  return current
}
