import Big from 'big.js'
import { ChevronLeft, ChevronRight, Share2 } from 'lucide-react'
import { useEffect, useId, useMemo, useState } from 'react'
import { useJournal, useMistakeName, useStore } from '../../app/journal'
import { navigate, routeHref } from '../../app/router'
import { useWeekStart } from '../../app/settings'
import { newId, type WeeklyReview } from '../../core/models'
import { percentOfDeposit } from '../../core/pnl'
import { defaultReviewWeek, weekSummary, type WeekSummary } from '../../core/review'
import { localDayKey } from '../../core/stats'
import { Button, Card, Field, PnLText, SectionHeader } from '../../design/components'
import { formatMoney, formatPercent, formatR, formatShare, formatWeekRange } from '../../i18n/format'
import { useI18n, type Translator } from '../../i18n/i18n'
import { PageHeader } from '../shell/PageHeader'
import { useAccess } from '../../app/entitlement'
import { canUse } from '../../core/entitlements'
import { ProLock } from '../billing/ProLock'
import { dayFromKey, useVisibleTrades } from '../trades/tradeQueries'
import { TradeRow } from '../trades/TradeRow'
import { renderShareCard, shareCard, type ShareCardContent } from './shareCard'
import { WeekBreakdown } from './WeekBreakdown'

/** The week's results, three questions and a shareable card (SPEC section 4.9). */
export function WeeklyReviewPage({ week }: { week?: string }) {
  const { t, tp, locale } = useI18n()
  const store = useStore()
  const { mistakes, reviews, profile, accounts } = useJournal()
  const { trades, currency, selected } = useVisibleTrades()
  const weekStart = useWeekStart()
  const access = useAccess()

  const start = week ? dayFromKey(week) : defaultReviewWeek(new Date(), weekStart)
  const startKey = localDayKey(start)
  // Keyed on the day string: `start` is a new Date object on every render.
  const summary = useMemo(() => weekSummary(trades, mistakes, dayFromKey(startKey)), [trades, mistakes, startKey])
  const existing = reviews.find((review) => review.weekStart === startKey)
  const isFuture = start > new Date()

  // The deposit the week's % is measured against: the selected account's, or the sum over
  // accounts that traded this week when every one of them has a deposit set.
  const deposit = useMemo(() => {
    const traded = selected ? [selected] : accounts.filter((account) => summary.trades.some((item) => item.trade.accountId === account.id))
    if (traded.length === 0 || traded.some((account) => !account.depositAmount)) return undefined
    return traded.reduce((total, account) => total.plus(account.depositAmount!), new Big(0)).toString()
  }, [selected, accounts, summary])
  const percent = percentOfDeposit(summary.metrics.pnl, deposit)

  const shiftWeek = (offset: number) => {
    const next = new Date(start.getFullYear(), start.getMonth(), start.getDate() + offset * 7)
    navigate({ name: 'review', week: localDayKey(next) })
  }

  if (!canUse('weeklyReview', access)) {
    return (
      <>
        <PageHeader
          title={t('review.title')}
          leading={
            <a className="back-link" href={routeHref({ name: 'profile' })}>
              <ChevronLeft size={20} aria-hidden="true" />
              {t('tab.profile')}
            </a>
          }
        />
        <div className="card">
          <ProLock feature="weeklyReview" />
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title={t('review.title')}
        subtitle={formatWeekRange(start, locale)}
        showAccountSwitcher
        leading={
          <a className="back-link" href={routeHref({ name: 'profile' })}>
            <ChevronLeft size={20} aria-hidden="true" />
            {t('tab.profile')}
          </a>
        }
      />
      <div className="week-nav">
        <Button variant="plain" icon={<ChevronLeft size={18} aria-hidden="true" />} onClick={() => shiftWeek(-1)}>
          {t('review.previousWeek')}
        </Button>
        <Button variant="plain" onClick={() => shiftWeek(1)} disabled={isFuture}>
          {t('review.nextWeek')}
          <ChevronRight size={18} aria-hidden="true" />
        </Button>
      </div>

      <Card className="trade-summary">
        <p className="caption">{t('review.weekPnl')}</p>
        <PnLText amount={summary.metrics.pnl} currency={currency} size="hero" />
        <dl className="stat-row">
          <Stat label={t('review.totalR')} value={summary.totalR ? formatR(summary.totalR, locale) : '—'} />
          <Stat label={t('analytics.metric.winRate')} value={summary.metrics.winRate ? formatShare(summary.metrics.winRate, locale) : '—'} />
          <Stat label={t('analytics.column.trades')} value={String(summary.metrics.count)} />
          {percent && <Stat label={t('trade.percentOfDeposit')} value={formatPercent(percent, locale)} />}
        </dl>
      </Card>

      {summary.trades.length > 0 && (
        <>
          {summary.best && (
            <>
              <SectionHeader title={t('review.bestTrade')} />
              <div className="list-card">
                <TradeRow trade={summary.best.trade} />
              </div>
            </>
          )}
          {summary.worst && (
            <>
              <SectionHeader title={t('review.worstTrade')} />
              <div className="list-card">
                <TradeRow trade={summary.worst.trade} />
              </div>
            </>
          )}
          <WeekBreakdown trades={summary.trades} currency={currency} />
        </>
      )}

      <ReviewForm
        key={startKey}
        weekStart={startKey}
        existing={existing}
        suggestedFocus={summary.topMistake?.tag.id}
        onSave={(review) => store.saveReview(review)}
      />

      <SectionHeader title={t('review.shareSection')} />
      <ShareBlock
        summary={summary}
        percent={percent ? formatPercent(percent, locale) : undefined}
        nextRule={existing?.nextRule}
        showAmounts={profile.shareAmounts}
        onToggleAmounts={(shareAmounts) => void store.updateProfile({ shareAmounts })}
        weekLabel={formatWeekRange(start, locale)}
        fileName={`tiltless-week-${startKey}.png`}
      />
      <p className="caption share-note">{tp('review.tradesInWeek', summary.metrics.count)}</p>
    </>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <dt className="caption">{label}</dt>
      <dd className="numeric">{value}</dd>
    </div>
  )
}

function ReviewForm({
  weekStart,
  existing,
  suggestedFocus,
  onSave,
}: {
  weekStart: string
  existing?: WeeklyReview
  /** The week's costliest mistake, preselected as the focus of a new review. */
  suggestedFocus?: string
  onSave: (review: WeeklyReview) => Promise<void>
}) {
  const { t } = useI18n()
  const { mistakes } = useJournal()
  const mistakeName = useMistakeName()
  const ids = { worked: useId(), repeated: useId(), rule: useId(), focus: useId() }
  const [whatWorked, setWhatWorked] = useState(existing?.whatWorked ?? '')
  const [whatRepeated, setWhatRepeated] = useState(existing?.whatRepeated ?? '')
  const [nextRule, setNextRule] = useState(existing?.nextRule ?? '')
  const [focus, setFocus] = useState(existing ? (existing.focusMistakeId ?? '') : (suggestedFocus ?? ''))
  const [saved, setSaved] = useState(false)
  const focusOptions = mistakes.filter((tag) => !tag.isArchived || tag.id === focus)

  useEffect(() => setSaved(false), [whatWorked, whatRepeated, nextRule, focus])

  const save = async () => {
    const now = new Date().toISOString()
    await onSave({
      id: existing?.id ?? newId(),
      weekStart,
      whatWorked: whatWorked.trim(),
      whatRepeated: whatRepeated.trim(),
      nextRule: nextRule.trim(),
      focusMistakeId: focus || undefined,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    })
    setSaved(true)
  }

  return (
    <>
      <SectionHeader title={t('review.questions')} />
      <Card className="form-stack">
        <Field label={t('review.whatWorked')} htmlFor={ids.worked}>
          <textarea id={ids.worked} className="input" value={whatWorked} onChange={(event) => setWhatWorked(event.target.value)} />
        </Field>
        <Field label={t('review.whatRepeated')} htmlFor={ids.repeated}>
          <textarea id={ids.repeated} className="input" value={whatRepeated} onChange={(event) => setWhatRepeated(event.target.value)} />
        </Field>
        <Field label={t('review.nextRule')} htmlFor={ids.rule}>
          <textarea id={ids.rule} className="input" value={nextRule} onChange={(event) => setNextRule(event.target.value)} />
        </Field>
        <Field label={t('review.focus')} htmlFor={ids.focus} hint={t('review.focusHint')}>
          <select id={ids.focus} className="input" value={focus} onChange={(event) => setFocus(event.target.value)}>
            <option value="">{t('review.focusNone')}</option>
            {focusOptions.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {mistakeName(tag)}
              </option>
            ))}
          </select>
        </Field>
        <Button variant="primary" onClick={save}>
          {t('action.save')}
        </Button>
        {saved && (
          <p className="caption" role="status">
            {t('review.saved')}
          </p>
        )}
      </Card>
    </>
  )
}

function cardContent(
  summary: WeekSummary,
  options: { t: Translator['t']; locale: Translator['locale']; weekLabel: string; percent?: string; nextRule?: string; showAmounts: boolean; mistakeName: string | undefined; amount: string | undefined },
): ShareCardContent {
  const { t, locale } = options
  const headlineR = summary.totalR
  const rows: ShareCardContent['rows'] = [
    { label: t('analytics.column.trades'), value: String(summary.metrics.count) },
    { label: t('analytics.metric.winRate'), value: summary.metrics.winRate ? formatShare(summary.metrics.winRate, locale) : '—' },
  ]
  if (options.percent) rows.push({ label: t('trade.percentOfDeposit'), value: options.percent, tone: summary.metrics.pnl.gte(0) ? 'profit' : 'loss' })
  if (options.showAmounts && options.amount) rows.push({ label: t('review.weekPnl'), value: options.amount, tone: summary.metrics.pnl.gte(0) ? 'profit' : 'loss' })
  if (summary.best?.r) rows.push({ label: t('review.bestTrade'), value: `${summary.best.trade.symbol} ${formatR(summary.best.r, locale)}`, tone: 'profit' })
  if (options.mistakeName) rows.push({ label: t('review.topMistake'), value: options.mistakeName, tone: 'loss' })
  if (summary.worstEmotion) rows.push({ label: t('review.worstEmotion'), value: t(`emotion.${summary.worstEmotion.key}`) })

  return {
    brand: 'Tiltless',
    weekLabel: options.weekLabel,
    headline: headlineR ? formatR(headlineR, locale) : summary.metrics.winRate ? formatShare(summary.metrics.winRate, locale) : '—',
    headlineLabel: headlineR ? t('review.totalR') : t('analytics.metric.winRate'),
    headlineTone: headlineR ? (headlineR.gt(0) ? 'profit' : headlineR.lt(0) ? 'loss' : 'neutral') : 'neutral',
    rows,
    ruleLabel: options.nextRule ? t('review.nextRuleShort') : undefined,
    rule: options.nextRule,
    footer: t('review.cardFooter'),
  }
}

function ShareBlock({
  summary,
  percent,
  nextRule,
  showAmounts,
  onToggleAmounts,
  weekLabel,
  fileName,
}: {
  summary: WeekSummary
  percent?: string
  nextRule?: string
  showAmounts: boolean
  onToggleAmounts: (value: boolean) => void
  weekLabel: string
  fileName: string
}) {
  const { t, locale } = useI18n()
  const mistakeName = useMistakeName()
  const { currency } = useVisibleTrades()
  const [preview, setPreview] = useState<string>()
  const [status, setStatus] = useState<string>()
  // A string, not the naming function, so the memo below doesn't rerun on every render.
  const topMistakeName = summary.topMistake ? mistakeName(summary.topMistake.tag) : undefined

  const content = useMemo(
    () =>
      cardContent(summary, {
        t,
        locale,
        weekLabel,
        percent,
        nextRule,
        showAmounts,
        mistakeName: topMistakeName,
        amount: formatMoney(summary.metrics.pnl, currency, locale),
      }),
    [summary, t, locale, weekLabel, percent, nextRule, showAmounts, currency, topMistakeName],
  )

  useEffect(() => {
    setPreview(renderShareCard(content).toDataURL('image/png'))
  }, [content])

  const share = async () => {
    try {
      const result = await shareCard(renderShareCard(content), fileName, t('review.title'))
      setStatus(result === 'downloaded' ? t('review.downloaded') : undefined)
    } catch {
      setStatus(t('review.shareFailed'))
    }
  }

  return (
    <Card className="form-stack share-block">
      {preview && <img className="share-preview" src={preview} alt={t('review.previewAlt')} />}
      <label className="toggle-row">
        <input type="checkbox" checked={showAmounts} onChange={(event) => onToggleAmounts(event.target.checked)} />
        <span>
          {t('review.showAmounts')}
          <span className="caption toggle-row__hint">{t('review.showAmountsHint')}</span>
        </span>
      </label>
      <Button variant="primary" icon={<Share2 size={18} aria-hidden="true" />} onClick={share}>
        {t('review.share')}
      </Button>
      {status && (
        <p className="caption" role="status">
          {status}
        </p>
      )}
    </Card>
  )
}
