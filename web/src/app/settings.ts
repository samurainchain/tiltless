import { useSyncExternalStore } from 'react'
import type { WeekStart } from '../core/stats'

export type LanguageSetting = 'system' | 'en' | 'ru' | 'es'
export type ThemeSetting = 'system' | 'dark' | 'light'
export type WeekStartSetting = 'auto' | 'monday' | 'sunday'
export type StyleSetting = 'soft' | 'glow' | 'flat' | 'graphite'
export const ACCENTS = ['green', 'amber', 'violet', 'blue', 'pink'] as const
export type AccentSetting = (typeof ACCENTS)[number]
/** `all` or an account id. */
export type AccountSelection = string

export interface Settings {
  language: LanguageSetting
  theme: ThemeSetting
  /** Glow (the accent's light behind the page and on what's active, the default), soft (calm
   *  greys and rounded panels), flat, or graphite (flat's colors with big rounded cards). */
  style: StyleSetting
  /** Set once glow became the default again for this browser (see read). */
  glowStyle?: true
  accent: AccentSetting
  selectedAccount: AccountSelection
  weekStart: WeekStartSetting
  /** The analytics dashboard's blocks; read through normalizeLayout (core/dashboard). */
  dashboard?: unknown
  /** Trades screen: grouped by day, or the table; unset picks by screen width. */
  tradesView?: 'days' | 'table'
  /** Columns hidden in the trade table; read through normalizeHiddenColumns (core/tradeTable). */
  hiddenTradeColumns?: unknown
  /** Set once the columns were picked after the Nov 11, 2026 table; older choices start from the new default. */
  tradeColumnsV2?: true
  /** The position size calculator's last risk, e.g. 1 percent. */
  calculatorRisk?: { mode: 'percent' | 'amount'; value: string }
  /** The trader turned on price charts of crypto trades (candles load from Binance's public data). */
  tradeCharts?: boolean
  /** Free screenshot reads used this month (core/entitlements). */
  screenshotReads?: { month: string; count: number }
  /** The liquidation map's coin and period. */
  liquidationMap?: { coin: string; period: string }
  /** Ids of the bell's notices already seen (core/notices). */
  seenNotices?: string[]
}

// Storage keys keep the app's first name, so saved settings survive the rename.
const STORAGE_KEY = 'mirror.settings'
const DEFAULTS: Settings = { language: 'system', theme: 'system', style: 'glow', glowStyle: true, accent: 'green', selectedAccount: 'all', weekStart: 'auto' }

// Per-browser preferences. They live in localStorage, apart from the journal data, and are
// read defensively: storage can be unavailable (private mode) or hold stale shapes.

let current: Settings = read()
const listeners = new Set<() => void>()

function read(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    const stored = JSON.parse(raw) as Partial<Settings>
    const saved: Settings = { ...DEFAULTS, ...stored }
    // Soft was the default from Nov 6 to Nov 11, 2026, and saved settings can't tell a choice from
    // the default, so it moves to glow, the default again, once; whoever wants soft picks it again.
    if (!stored.glowStyle && saved.style === 'soft') saved.style = 'glow'
    return saved
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
