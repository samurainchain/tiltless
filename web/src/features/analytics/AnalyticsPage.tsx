import { ChartColumn, LayoutGrid, Plus, Share2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { updateSettings, useSettings } from '../../app/settings'
import { useSheets } from '../../app/sheets'
import { defaultLayout, normalizeLayout, type DashboardLayout } from '../../core/dashboard'
import { closedTrades, inPeriod, metrics, PERIODS, type Period } from '../../core/stats'
import { Button, EmptyState, Segmented } from '../../design/components'
import { useI18n } from '../../i18n/i18n'
import { PageHeader } from '../shell/PageHeader'
import { useVisibleTrades } from '../trades/tradeQueries'
import { Dashboard } from './Dashboard'
import { useAccess } from '../../app/entitlement'
import { periodUnlocked } from '../../core/entitlements'
import { ProLock } from '../billing/ProLock'
import { RecapShareSheet } from '../share/RecapShareSheet'

/**
 * Analytics as a dashboard of blocks (SPEC section 4.7): cost of mistakes, performance,
 * streaks, calendar, breakdowns and more, arranged by the trader and kept in this browser.
 */
export function AnalyticsPage() {
  const { t } = useI18n()
  const { trades, currency } = useVisibleTrades()
  const { newTrade } = useSheets()
  const settings = useSettings()
  const [period, setPeriod] = useState<Period>('month')
  const [draft, setDraft] = useState<DashboardLayout>()
  const [sharing, setSharing] = useState(false)
  const access = useAccess()

  const closed = useMemo(() => closedTrades(trades), [trades])
  const inRange = useMemo(() => inPeriod(closed, period, new Date()), [closed, period])
  const summary = useMemo(() => metrics(inRange), [inRange])
  // One object per change of data, so moving blocks around doesn't redraw their charts.
  const data = useMemo(() => ({ inRange, closed, summary, currency }), [inRange, closed, summary, currency])
  const saved = useMemo(() => normalizeLayout(settings.dashboard), [settings.dashboard])
  const editing = draft !== undefined
  const layout = draft ?? saved

  const tools = editing ? (
    <>
      <Button variant="plain" onClick={() => setDraft(defaultLayout())}>
        {t('dashboard.reset')}
      </Button>
      <Button onClick={() => setDraft(undefined)}>{t('dashboard.cancel')}</Button>
      <Button
        variant="primary"
        onClick={() => {
          updateSettings({ dashboard: draft })
          setDraft(undefined)
        }}
      >
        {t('dashboard.done')}
      </Button>
    </>
  ) : (
    closed.length > 0 && (
      <>
        <Button icon={<Share2 size={18} aria-hidden="true" />} onClick={() => setSharing(true)}>
          {t('recap.button')}
        </Button>
        <Button icon={<LayoutGrid size={18} aria-hidden="true" />} onClick={() => setDraft(saved)}>
          {t('dashboard.customize')}
        </Button>
      </>
    )
  )

  const header = <PageHeader title={t('tab.analytics')} showAccountSwitcher trailing={tools} />

  if (closed.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          icon={<ChartColumn size={28} />}
          title={t('analytics.emptyTitle')}
          message={t('analytics.emptyMessage')}
          action={
            <Button variant="primary" block icon={<Plus size={20} aria-hidden="true" />} onClick={newTrade}>
              {t('action.newTrade')}
            </Button>
          }
        />
      </>
    )
  }

  return (
    <>
      {header}
      <RecapShareSheet open={sharing} onClose={() => setSharing(false)} initialSpan={period === 'week' ? 'week' : 'month'} />
      <Segmented label={t('analytics.period')} value={period} onChange={setPeriod} options={PERIODS.map((value) => ({ value, label: t(`analytics.period.${value}`) }))} />
      {editing && <p className="dash-edit-hint caption">{t('dashboard.editHint')}</p>}
      {inRange.length === 0 && periodUnlocked(period, access) && <p className="analytics-empty-period secondary-text">{t('analytics.emptyPeriod')}</p>}
      {periodUnlocked(period, access) ? (
        <Dashboard layout={layout} editing={editing} onChange={setDraft} data={data} />
      ) : (
        <div className="card analytics-lock">
          <ProLock feature="longPeriods" />
        </div>
      )}
    </>
  )
}
