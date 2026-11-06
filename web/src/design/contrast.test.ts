import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// WCAG AA contrast for the design tokens (SPEC section 9, principle 6): 4.5:1 for text,
// in both themes and in the soft style's greys. Reads tokens.css and soft.css themselves, so a
// palette change is checked automatically.

/** A rule's custom properties: hex colors, or `var(--name)` references kept as `@name`. */
function block(selector: string, source = css): Record<string, string> {
  const start = source.indexOf(selector)
  if (start < 0) throw new Error(`no rule ${selector}`)
  const body = source.slice(source.indexOf('{', start) + 1, source.indexOf('}', start))
  return Object.fromEntries(
    [...body.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6}|var\(--([\w-]+)\))/gi)].map((match) => [match[1]!, match[3] ? `@${match[3]}` : match[2]!.toLowerCase()]),
  )
}

/** Follows `@name` references to their hex values. */
function resolve(tokens: Record<string, string>): Record<string, string> {
  const value = (name: string): string => {
    const raw = tokens[name]!
    return raw?.startsWith('@') ? value(raw.slice(1)) : raw
  }
  return Object.fromEntries(Object.keys(tokens).map((name) => [name, value(name)]))
}

const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8')
const softCss = readFileSync(new URL('./soft.css', import.meta.url), 'utf8')

const ACCENTS = ['default', 'amber', 'violet', 'blue', 'pink'] as const
const accentBlock = (accent: (typeof ACCENTS)[number]) => (accent === 'default' ? {} : block(`:root[data-accent='${accent}']`))

type Style = 'glow' | 'soft'
/** The soft style's own greys, put over the theme's (soft.css). */
const softBlock = (name: 'dark' | 'light') =>
  name === 'light' ? block(":root[data-style='soft'][data-theme='light']", softCss) : block(":root[data-style='soft'] {", softCss)

const theme = (name: 'dark' | 'light', accent: (typeof ACCENTS)[number] = 'default', style: Style = 'glow') =>
  resolve({
    ...block(':root {'),
    ...(name === 'light' ? block(":root[data-theme='light']") : {}),
    ...(style === 'soft' ? softBlock(name) : {}),
    ...accentBlock(accent),
  })

const dark = theme('dark')
const light = theme('light')
const softDark = theme('dark', 'default', 'soft')
const softLight = theme('light', 'default', 'soft')
/** Every theme the tone checks below run on. */
const THEMES = [
  ['dark', dark],
  ['light', light],
  ['soft dark', softDark],
  ['soft light', softLight],
] as const

function luminance(hex: string): number {
  const channel = (offset: number) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
}

export function contrast(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (high + 0.05) / (low + 0.05)
}

// Text color on the backgrounds it's used on.
const TEXT_PAIRS: [text: string, backgrounds: string[]][] = [
  ['color-text-primary', ['color-background', 'color-surface', 'color-surface-elevated']],
  ['color-text-secondary', ['color-background', 'color-surface', 'color-surface-elevated']],
  ['color-accent', ['color-background', 'color-surface', 'color-surface-elevated']],
  ['color-profit', ['color-background', 'color-surface']],
  ['color-loss', ['color-background', 'color-surface']],
  ['color-warning', ['color-background', 'color-surface']],
  ['color-accent-contrast', ['color-accent-fill']],
]

it('defines the light theme the same way for the system setting and the manual switch', () => {
  expect(block(":root:not([data-theme='dark'])")).toEqual(block(":root[data-theme='light']"))
  expect(block(":root[data-style='soft']:not([data-theme='dark'])", softCss)).toEqual(softBlock('light'))
})

describe.each(
  (['glow', 'soft'] as const).flatMap((style) =>
    ACCENTS.flatMap((accent) => (['dark', 'light'] as const).map((name) => [`${style} ${name} ${accent}`, theme(name, accent, style)] as const)),
  ),
)('%s theme', (_name, tokens) => {
  it.each(TEXT_PAIRS.flatMap(([text, backgrounds]) => backgrounds.map((background) => [text, background] as const)))(
    '%s on %s is at least 4.5:1',
    (text, background) => {
      expect(tokens[text], text).toBeDefined()
      expect(tokens[background], background).toBeDefined()
      expect(contrast(tokens[text]!, tokens[background]!)).toBeGreaterThanOrEqual(4.5)
    },
  )
})

// Chart marks are graphics, not text: 3:1 against the card (WCAG 1.4.11).
const MARKS = ['color-chart-profit', 'color-chart-loss']

/** Mixes `share` (0...1) of `color` into `base`, like CSS color-mix in sRGB. */
function mix(color: string, base: string, share: number): string {
  const channel = (hex: string, offset: number) => parseInt(hex.slice(offset, offset + 2), 16)
  return `#${[1, 3, 5]
    .map((offset) => Math.round(channel(color, offset) * share + channel(base, offset) * (1 - share)).toString(16).padStart(2, '0'))
    .join('')}`
}

describe.each(THEMES)('%s theme charts', (_name, tokens) => {
  it.each(MARKS)('%s is at least 3:1 on the card', (mark) => {
    expect(contrast(tokens[mark]!, tokens['color-surface']!)).toBeGreaterThanOrEqual(3)
  })

  // The calendar fills a day with up to 45% of the mark color (PnlCalendar).
  it.each(MARKS)('text stays readable on the strongest %s calendar day', (mark) => {
    const fill = mix(tokens[mark]!, tokens['color-surface-elevated']!, 0.45)
    expect(contrast(tokens['color-text-primary']!, fill)).toBeGreaterThanOrEqual(4.5)
  })
})

// Side badges and the long/short toggle: tone text on an 8% tint of the card.
describe.each(THEMES)('%s theme tints', (_name, tokens) => {
  it.each(['color-profit', 'color-loss'])('%s text on its own tint is at least 4.5:1', (tone) => {
    const tint = mix(tokens[tone]!, tokens['color-surface']!, 0.08)
    expect(contrast(tokens[tone]!, tint)).toBeGreaterThanOrEqual(4.5)
  })
})

// Control edges (text fields, the chosen segmented option) against what surrounds them.
describe.each(THEMES)('%s theme controls', (_name, tokens) => {
  it.each(['color-background', 'color-surface', 'color-surface-elevated'])('control border on %s is at least 3:1', (background) => {
    expect(contrast(tokens['color-border-control']!, tokens[background]!)).toBeGreaterThanOrEqual(3)
  })
})
