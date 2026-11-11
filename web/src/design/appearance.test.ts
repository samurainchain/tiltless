import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ACCENT_COLORS, SURFACES } from './appearance'

// The previews' copy of the palette must match the real tokens.

const tokens = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8')
const soft = readFileSync(new URL('./soft.css', import.meta.url), 'utf8')

function block(source: string, selector: string): Record<string, string> {
  const start = source.indexOf(selector)
  if (start < 0) throw new Error(`no rule ${selector}`)
  const body = source.slice(source.indexOf('{', start) + 1, source.indexOf('}', start))
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((match) => [match[1]!, match[2]!.toLowerCase()]))
}

describe('appearance previews', () => {
  it('use the accents of tokens.css', () => {
    for (const [accent, colors] of Object.entries(ACCENT_COLORS)) {
      const values = accent === 'green' ? block(tokens, ':root {') : block(tokens, `:root[data-accent='${accent}']`)
      expect({ dark: values['accent-dark'], fillDark: values['accent-fill-dark'], light: values['accent-light'], fillLight: values['accent-fill-light'] }, accent).toEqual(colors)
    }
  })

  it('use the surfaces of tokens.css and soft.css', () => {
    const pick = (values: Record<string, string>) => ({
      background: values['color-background'],
      surface: values['color-surface'],
      text: values['color-text-primary'],
      secondary: values['color-text-secondary'],
      border: values['color-border'],
    })
    const darkBase = block(tokens, ':root {')
    const lightBase = { ...darkBase, ...block(tokens, ":root[data-theme='light']") }
    expect(pick(darkBase)).toMatchObject({ background: SURFACES.base.dark.background, surface: SURFACES.base.dark.surface, text: SURFACES.base.dark.text, secondary: SURFACES.base.dark.secondary, border: SURFACES.base.dark.border })
    expect(pick(lightBase)).toMatchObject({ background: SURFACES.base.light.background, surface: SURFACES.base.light.surface, text: SURFACES.base.light.text, secondary: SURFACES.base.light.secondary, border: SURFACES.base.light.border })
    expect(darkBase['color-profit']).toBe(SURFACES.base.dark.profit)
    expect(darkBase['color-loss']).toBe(SURFACES.base.dark.loss)
    expect(lightBase['color-profit']).toBe(SURFACES.base.light.profit)
    expect(lightBase['color-loss']).toBe(SURFACES.base.light.loss)
    const softDark = pick({ ...darkBase, ...block(soft, ":root[data-style='soft'] {") })
    const softLight = pick({ ...lightBase, ...block(soft, ":root[data-style='soft'][data-theme='light']") })
    expect(softDark).toMatchObject({ background: SURFACES.soft.dark.background, surface: SURFACES.soft.dark.surface, text: SURFACES.soft.dark.text, secondary: SURFACES.soft.dark.secondary, border: SURFACES.soft.dark.border })
    expect(softLight).toMatchObject({ background: SURFACES.soft.light.background, surface: SURFACES.soft.light.surface, text: SURFACES.soft.light.text, secondary: SURFACES.soft.light.secondary, border: SURFACES.soft.light.border })
  })
})
