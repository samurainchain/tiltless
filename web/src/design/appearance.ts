import type { AccentSetting, StyleSetting } from '../app/settings'

// The colors the appearance previews in Profile draw with: a copy of the tokens for each accent,
// theme and style, so every preview can show its own combination at once (the real tokens apply
// to the whole page). appearance.test.ts checks them against tokens.css and soft.css, so a palette
// change can't leave the previews behind.

export const STYLES: readonly StyleSetting[] = ['glow', 'soft', 'flat', 'graphite']

export interface AccentColors {
  dark: string
  fillDark: string
  light: string
  fillLight: string
}

export const ACCENT_COLORS: Record<AccentSetting, AccentColors> = {
  green: { dark: '#3ecf8e', fillDark: '#006239', light: '#00744a', fillLight: '#006239' },
  amber: { dark: '#fbbf24', fillDark: '#92400e', light: '#92400e', fillLight: '#92400e' },
  violet: { dark: '#a78bfa', fillDark: '#5b21b6', light: '#6d28d9', fillLight: '#5b21b6' },
  blue: { dark: '#60a5fa', fillDark: '#1e40af', light: '#1d4ed8', fillLight: '#1e40af' },
  pink: { dark: '#f472b6', fillDark: '#9d174d', light: '#be185d', fillLight: '#9d174d' },
}

export interface Surfaces {
  background: string
  surface: string
  text: string
  secondary: string
  border: string
  profit: string
  loss: string
}

/** Glow, flat and graphite share the theme's tokens; soft has its own greys (soft.css). */
export const SURFACES: Record<'base' | 'soft', Record<'dark' | 'light', Surfaces>> = {
  base: {
    dark: { background: '#121212', surface: '#171717', text: '#ededed', secondary: '#a0a0a0', border: '#2e2e2e', profit: '#3ecf8e', loss: '#f87171' },
    light: { background: '#fcfcfc', surface: '#ffffff', text: '#171717', secondary: '#666666', border: '#e4e4e4', profit: '#0a7d4f', loss: '#c92c40' },
  },
  soft: {
    dark: { background: '#1e1e1e', surface: '#262626', text: '#e8e8e8', secondary: '#a3a3a3', border: '#333333', profit: '#3ecf8e', loss: '#f87171' },
    light: { background: '#f5f5f5', surface: '#ffffff', text: '#222222', secondary: '#5c5c5c', border: '#e3e3e3', profit: '#0a7d4f', loss: '#c92c40' },
  },
}

export function previewColors(style: StyleSetting, accent: AccentSetting, theme: 'dark' | 'light'): Surfaces & { accent: string; fill: string } {
  const surfaces = SURFACES[style === 'soft' ? 'soft' : 'base'][theme]
  const colors = ACCENT_COLORS[accent]
  return { ...surfaces, accent: theme === 'dark' ? colors.dark : colors.light, fill: theme === 'dark' ? colors.fillDark : colors.fillLight }
}
