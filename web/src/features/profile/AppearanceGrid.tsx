import { Check } from 'lucide-react'
import type { CSSProperties } from 'react'
import { ACCENTS, updateSettings, useSettings } from '../../app/settings'
import { previewColors, STYLES } from '../../design/appearance'
import { useI18n } from '../../i18n/i18n'

/** The theme the previews show: the picked one, or the system's. */
function shownTheme(theme: 'system' | 'dark' | 'light'): 'dark' | 'light' {
  if (theme !== 'system') return theme
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

/**
 * Style and accent picked from previews: every style with every accent, in the current theme, each
 * a small screen of its own. All of them pass WCAG AA (contrast.test.ts); there is no red accent,
 * because red means a loss.
 */
export function AppearanceGrid() {
  const { t } = useI18n()
  const settings = useSettings()
  const theme = shownTheme(settings.theme)

  return (
    <div className="appearance-grid">
      {STYLES.map((style) => (
        <div key={style} role="radiogroup" aria-label={t(`appearance.style.${style}`)} className="appearance-grid__group">
          <p className="label">{t(`appearance.style.${style}`)}</p>
          <div className="appearance-grid__row">
            {ACCENTS.map((accent) => {
              const colors = previewColors(style, accent, theme)
              const selected = settings.style === style && settings.accent === accent
              const vars = {
                '--ap-bg': colors.background,
                '--ap-surface': colors.surface,
                '--ap-text': colors.text,
                '--ap-secondary': colors.secondary,
                '--ap-border': colors.border,
                '--ap-accent': colors.accent,
                '--ap-fill': colors.fill,
                '--ap-profit': colors.profit,
                '--ap-loss': colors.loss,
              } as CSSProperties
              return (
                <button
                  key={accent}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={t('appearance.previewLabel', { style: t(`appearance.style.${style}`), accent: t(`appearance.accent.${accent}`) })}
                  className={`ap ap--${style}`}
                  style={vars}
                  onClick={() => updateSettings({ style, accent })}
                >
                  <span className="ap__screen" aria-hidden="true">
                    <span className="ap__side">
                      <i className="ap__mark" />
                      <i className="ap__line ap__line--on" />
                      <i className="ap__line" />
                      <i className="ap__line" />
                    </span>
                    <span className="ap__body">
                      <span className="ap__card">
                        <span className="ap__label">PnL</span>
                        <span className="ap__num">+$118.50</span>
                      </span>
                      <span className="ap__row">
                        <span className="ap__btn">+</span>
                        <span className="ap__loss">−$85</span>
                      </span>
                    </span>
                    <span className="ap__aa">
                      <Check size={9} strokeWidth={3} />
                      AA
                    </span>
                  </span>
                  <span className="ap__name">
                    {selected && <Check size={14} aria-hidden="true" />}
                    {t(`appearance.accent.${accent}`)}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
      <p className="caption appearance-grid__note">{t('appearance.aaNote')}</p>
    </div>
  )
}
