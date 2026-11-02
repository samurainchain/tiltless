import { Target } from 'lucide-react'
import { useJournal, useMistakeName } from '../../app/journal'
import { useWeekStart } from '../../app/settings'
import { activeFocus, focusProgress } from '../../core/focus'
import type { Currency } from '../../core/models'
import { Card } from '../../design/components'
import { formatMoney } from '../../i18n/format'
import { useI18n } from '../../i18n/i18n'

/**
 * The habit picked at the last weekly review and how often it came back this week (SPEC 4.9).
 * Counts every account: a habit belongs to the trader, like the daily limits.
 */
export function FocusCard({ currency }: { currency: Currency }) {
  const { t, tp, locale } = useI18n()
  const { reviews, mistakes, trades } = useJournal()
  const mistakeName = useMistakeName()
  const weekStart = useWeekStart()
  const now = new Date()
  const focus = activeFocus(reviews, mistakes, now, weekStart)
  if (!focus) return null
  const { current, before } = focusProgress(trades, focus, mistakes, now, weekStart)
  const clean = current.count === 0

  return (
    <Card className="focus-card">
      <p className="caption focus-card__label">
        <Target size={16} aria-hidden="true" />
        {t('today.focus')}
      </p>
      <p className="focus-card__row">
        <span className="focus-card__name">{mistakeName(focus.tag)}</span>
        {current.cost.gt(0) && <span className="loss numeric">{formatMoney(current.cost.times(-1), currency, locale)}</span>}
      </p>
      <p className={clean && current.trades > 0 ? 'focus-card__status focus-card__status--clean' : 'focus-card__status'}>
        {current.trades === 0 ? t('today.focusNoTrades') : clean ? t('today.focusClean') : tp('today.focusCount', current.count)}
      </p>
      {before.count > 0 && (
        <p className="caption">{tp('today.focusBefore', before.count, { cost: formatMoney(before.cost.times(-1), currency, locale) })}</p>
      )}
    </Card>
  )
}
