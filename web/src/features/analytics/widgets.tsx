import Big from 'big.js'
import { memo, type ReactNode } from 'react'
import { useJournal, useMistakeName } from '../../app/journal'
import { useWeekStart } from '../../app/settings'
import type { WidgetId } from '../../core/dashboard'
import type { Currency } from '../../core/models'
import {
  byEmotion,
  byHour,
  bySetup,
  bySymbol,
  byWeekday,
  equityCurve,
  mistakeCosts,
  pnlWithoutMistakes,
  type Breakdown,
  type ClosedTrade,
  type Metrics,
} from '../../core/stats'
import { byHoldTime, byRating, streaks, tradesPerDay, tradeTotals, type Streak } from '../../core/tradeStats'
import { PnLText } from '../../design/components'
import { formatDuration, formatMoney, formatR, formatRatio, formatShare, intlLocale, weekdayNames } from '../../i18n/format'
import { useI18n } from '../../i18n/i18n'
import type { MessageKey } from '../../i18n/messages/en'
import { CheckInResults } from '../checkin/CheckInResults'
import { EconomicCalendar } from '../calendar/EconomicCalendar'
import { LiquidationMap } from '../market/LiquidationMap'
import { SessionResults } from '../sessions/SessionResults'
import { EMOTION_ICONS } from '../trades/TradeRow'
import { ColumnChart, CostBarList, EquityCurve, SignedBarList } from './charts'
import { PnlCalendar } from './PnlCalendar'

/** What every block gets: the period's closed trades, all closed trades and their totals. */
export interface WidgetData {
  inRange: readonly ClosedTrade[]
  closed: readonly ClosedTrade[]
  summary: Metrics
  currency: Currency
}

/** Title key of each block, and whether it needs trades in the period (the calendar doesn't). */
export const WIDGETS: Record<WidgetId, { title: MessageKey; needsTrades: boolean }> = {
  performance: { title: 'dashboard.performance', needsTrades: true },
  tradeCount: { title: 'dashboard.tradeCount', needsTrades: true },
  streaks: { title: 'dashboard.streaks', needsTrades: true },
  equity: { title: 'analytics.equity', needsTrades: true },
  tradeStats: { title: 'dashboard.tradeStats', needsTrades: true },
  mistakeCost: { title: 'analytics.mistakeCost', needsTrades: true },
  byEmotion: { title: 'analytics.byEmotion', needsTrades: true },
  calendar: { title: 'analytics.calendar', needsTrades: false },
  econCalendar: { title: 'calendar.title', needsTrades: false },
  liquidations: { title: 'liq.title', needsTrades: false },
  sessions: { title: 'analytics.bySession', needsTrades: true },
  checkins: { title: 'analytics.checkins', needsTrades: true },
  byWeekday: { title: 'analytics.byWeekday', needsTrades: true },
  byHour: { title: 'analytics.byHour', needsTrades: true },
  bySetup: { title: 'analytics.bySetup', needsTrades: true },
  bySymbol: { title: 'analytics.bySymbol', needsTrades: true },
  byHold: { title: 'dashboard.byHold', needsTrades: true },
  byRating: { title: 'dashboard.byRating', needsTrades: true },
  metrics: { title: 'analytics.keyMetrics', needsTrades: true },
}

/** A block's content; it only redraws when its data changes, not when blocks move. */
export const WidgetBody = memo(function WidgetBody({ id, data }: { id: WidgetId; data: WidgetData }) {
  const { inRange, closed, currency } = data
  switch (id) {
    case 'performance':
      return <Performance data={data} />
    case 'tradeCount':
      return <TradeCount trades={inRange} />
    case 'streaks':
      return <Streaks trades={inRange} />
    case 'equity':
      return <Equity trades={inRange} currency={currency} />
    case 'tradeStats':
      return <TradeStats data={data} />
    case 'mistakeCost':
      return <MistakeCost trades={inRange} currency={currency} />
    case 'byEmotion':
      return <ByEmotion trades={inRange} currency={currency} />
    case 'calendar':
      return <PnlCalendar trades={closed as ClosedTrade[]} currency={currency} />
    case 'econCalendar':
      return <EconomicCalendar />
    case 'liquidations':
      return <LiquidationMap />
    case 'sessions':
      return <SessionResults trades={inRange} currency={currency} />
    case 'checkins':
      return <CheckInResults trades={inRange} currency={currency} />
    case 'byWeekday':
      return <ByWeekday trades={inRange} currency={currency} />
    case 'byHour':
      return <ByHour trades={inRange} currency={currency} />
    case 'bySetup':
      return <BySetup trades={inRange} currency={currency} />
    case 'bySymbol':
      return <BySymbol trades={inRange} currency={currency} />
    case 'byHold':
      return <ByHold trades={inRange} currency={currency} />
    case 'byRating':
      return <ByRating trades={inRange} currency={currency} />
    case 'metrics':
      return <KeyMetrics data={data} />
  }
})

/** Net PnL, win rate, profit factor, expectancy, average R, and how far the win rate is from break-even. */
function Performance({ data }: { data: WidgetData }) {
  const { t, locale } = useI18n()
  const { summary, currency, inRange } = data
  const { breakevenWinRate } = tradeTotals(inRange)
  const winRate = summary.winRate
  const margin = winRate && breakevenWinRate ? winRate.minus(breakevenWinRate).times(100) : undefined
  return (
    <div className="dash-performance">
      <PnLText amount={summary.pnl} currency={currency} size="hero" />
      <dl className="dash-stats dash-stats--three">
        <Stat label={t('analytics.metric.winRate')}>{winRate ? formatShare(winRate, locale) : '—'}</Stat>
        <Stat label={t('analytics.metric.profitFactor')}>{summary.profitFactor ? formatRatio(summary.profitFactor, locale) : summary.grossProfit.gt(0) ? '∞' : '—'}</Stat>
        <Stat label={t('analytics.metric.expectancy')}>{summary.expectancy ? <PnLText amount={summary.expectancy} currency={currency} /> : '—'}</Stat>
      </dl>
      {winRate && breakevenWinRate && margin && (
        <div className="breakeven">
          <div className="breakeven__track" aria-hidden="true">
            <span className={`breakeven__fill ${margin.gte(0) ? 'breakeven__fill--profit' : 'breakeven__fill--loss'}`} style={{ width: `${Number(winRate.times(100).toFixed(1))}%` }} />
            <span className="breakeven__mark" style={{ left: `${Number(breakevenWinRate.times(100).toFixed(1))}%` }} />
          </div>
          <p className="breakeven__text caption">
            <span>{t(margin.gte(0) ? 'dashboard.breakeven.above' : 'dashboard.breakeven.below', { points: new Intl.NumberFormat(intlLocale(locale), { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Number(margin.abs().toFixed(1))) })}</span>
            <span>{t('dashboard.breakeven.rate', { rate: formatShare(breakevenWinRate, locale) })}</span>
          </p>
        </div>
      )}
      {summary.averageR && <p className="caption">{t('dashboard.averageR', { value: formatR(summary.averageR, locale) })}</p>}
    </div>
  )
}

/** How many trades, with a small bar per trading day. */
function TradeCount({ trades }: { trades: readonly ClosedTrade[] }) {
  const { t, tp, locale } = useI18n()
  const days = tradesPerDay(trades)
  const most = Math.max(1, ...days.map((day) => day.count))
  const perDay = days.length ? trades.length / days.length : 0
  return (
    <div className="dash-count">
      <p className="dash-count__total numeric">{trades.length}</p>
      <div className="dash-count__bars" aria-hidden="true">
        {days.map((day) => (
          <span key={day.day} title={`${day.day}: ${day.count}`} style={{ height: `${Math.max(8, (day.count / most) * 100)}%` }} />
        ))}
      </div>
      <p className="caption">
        {tp('dashboard.tradingDays', days.length)} · {t('dashboard.perDay', { value: new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 1 }).format(perDay) })} · {t('dashboard.mostInDay', { value: String(most) })}
      </p>
    </div>
  )
}

function StreakPart({ title, streak, unit }: { title: string; streak: Streak; unit: 'days' | 'trades' }) {
  const { t, tp } = useI18n()
  const tone = streak.current > 0 ? 'profit' : streak.current < 0 ? 'loss' : ''
  const now =
    streak.current > 0
      ? tp(unit === 'days' ? 'dashboard.streak.greenDays' : 'dashboard.streak.wins', streak.current)
      : streak.current < 0
        ? tp(unit === 'days' ? 'dashboard.streak.redDays' : 'dashboard.streak.losses', -streak.current)
        : t('dashboard.streak.none')
  return (
    <div className="dash-streak">
      <h3 className="caption">{title}</h3>
      <p className={`dash-streak__now numeric ${tone}`}>{streak.current === 0 ? '0' : Math.abs(streak.current)}</p>
      <p className="secondary-text">{now}</p>
      <p className="dash-streak__records">
        <span className="dash-streak__record">
          {t('dashboard.streak.best')} <strong className="numeric profit">{streak.bestWin}</strong>
        </span>
        <span className="dash-streak__record">
          {t('dashboard.streak.worst')} <strong className="numeric loss">{streak.worstLoss}</strong>
        </span>
      </p>
    </div>
  )
}

/** Current and record runs of green and red days, and of winning and losing trades. */
function Streaks({ trades }: { trades: readonly ClosedTrade[] }) {
  const { t } = useI18n()
  const result = streaks(trades)
  return (
    <div className="dash-streaks">
      <StreakPart title={t('dashboard.streak.days')} streak={result.days} unit="days" />
      <StreakPart title={t('dashboard.streak.trades')} streak={result.trades} unit="trades" />
    </div>
  )
}

/** Average win and loss, holding time, fees, current and maximum drawdown. */
function TradeStats({ data }: { data: WidgetData }) {
  const { t, locale } = useI18n()
  const { inRange, summary, currency } = data
  const totals = tradeTotals(inRange)
  const money = (value: Big | undefined, sign = -1) => (value ? formatMoney(value.times(sign), currency, locale) : '—')
  return (
    <dl className="dash-list">
      <Row label={t('dashboard.avgWin')}>{totals.averageWin ? <PnLText amount={totals.averageWin} currency={currency} /> : '—'}</Row>
      <Row label={t('dashboard.avgLoss')}>{totals.averageLoss ? <span className="loss">{money(totals.averageLoss)}</span> : '—'}</Row>
      <Row label={t('dashboard.avgHold')}>{totals.averageHoldMs !== undefined ? formatDuration(totals.averageHoldMs, locale) : '—'}</Row>
      <Row label={t('dashboard.fees')}>{totals.fees.gt(0) ? money(totals.fees) : formatMoney(new Big(0), currency, locale, false)}</Row>
      <Row label={t('dashboard.currentDrawdown')}>
        <span className={totals.currentDrawdown.gt(0) ? 'loss' : ''}>{money(totals.currentDrawdown)}</span>
      </Row>
      <Row label={t('analytics.metric.maxDrawdown')}>
        <span className={summary.maxDrawdown.gt(0) ? 'loss' : ''}>{money(summary.maxDrawdown)}</span>
      </Row>
    </dl>
  )
}

function Equity({ trades, currency }: { trades: readonly ClosedTrade[]; currency: Currency }) {
  const { t } = useI18n()
  return <EquityCurve points={equityCurve(trades as ClosedTrade[])} currency={currency} label={t('analytics.equity')} />
}

function MistakeCost({ trades, currency }: { trades: readonly ClosedTrade[]; currency: Currency }) {
  const { t, tp, locale } = useI18n()
  const { mistakes } = useJournal()
  const mistakeName = useMistakeName()
  const costs = mistakeCosts(trades as ClosedTrade[], mistakes)
  if (!costs.some((item) => item.cost.gt(0))) return <p className="secondary-text">{t('analytics.noMistakeCost')}</p>
  return (
    <div className="form-stack">
      <CostBarList
        currency={currency}
        items={costs
          .filter((item) => item.cost.gt(0))
          .map((item) => ({
            key: item.tag.id,
            label: mistakeName(item.tag),
            value: item.cost,
            caption: `${tp('analytics.tradeCount', item.tradeCount)} · ${t('analytics.winRateShort', { value: formatShare(item.winRate ?? new Big(0), locale) })}`,
          }))}
      />
      <p className="mistake-total">
        {t('analytics.withoutMistakes')} <PnLText amount={pnlWithoutMistakes(trades as ClosedTrade[], costs)} currency={currency} />
        <span className="caption"> · {t('analytics.estimate')}</span>
      </p>
    </div>
  )
}

function ByEmotion({ trades, currency }: { trades: readonly ClosedTrade[]; currency: Currency }) {
  const { t, tp } = useI18n()
  const groups = byEmotion(trades as ClosedTrade[])
  if (groups.length === 0) return <p className="secondary-text">{t('analytics.noEmotions')}</p>
  return (
    <SignedBarList
      currency={currency}
      items={groups
        .sort((a, b) => a.pnl.cmp(b.pnl))
        .map((item) => {
          const Icon = EMOTION_ICONS[item.key]
          return {
            key: item.key,
            label: (
              <span className="inline-icon">
                <Icon size={16} aria-hidden="true" />
                {t(`emotion.${item.key}`)}
              </span>
            ),
            value: item.pnl,
            caption: tp('analytics.tradeCount', item.count),
          }
        })}
    />
  )
}

function ByWeekday({ trades, currency }: { trades: readonly ClosedTrade[]; currency: Currency }) {
  const { locale } = useI18n()
  const weekStart = useWeekStart()
  const weekdays = weekdayNames(locale)
  const pnl = byWeekday(trades as ClosedTrade[])
  const order = Array.from({ length: 7 }, (_, index) => (weekStart + index) % 7)
  return <SignedBarList currency={currency} items={order.map((day) => ({ key: String(day), label: weekdays[day], value: pnl[day]! }))} />
}

function ByHour({ trades, currency }: { trades: readonly ClosedTrade[]; currency: Currency }) {
  const { t } = useI18n()
  return (
    <ColumnChart
      label={t('analytics.byHour')}
      currency={currency}
      values={byHour(trades as ClosedTrade[])}
      labels={Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, '0'))}
      tickEvery={3}
      formatLabel={(hour) => `${hour}:00`}
    />
  )
}

function BySetup({ trades, currency }: { trades: readonly ClosedTrade[]; currency: Currency }) {
  const { t } = useI18n()
  const { setups } = useJournal()
  const rows = bySetup(trades as ClosedTrade[]).flatMap((row) => {
    const name = setups.find((tag) => tag.id === row.key)?.name
    return name ? [{ ...row, key: name }] : []
  })
  return <BreakdownTable rows={rows} nameLabel={t('entry.setups')} emptyText={t('analytics.noSetups')} currency={currency} />
}

function BySymbol({ trades, currency }: { trades: readonly ClosedTrade[]; currency: Currency }) {
  const { t } = useI18n()
  return <BreakdownTable rows={bySymbol(trades as ClosedTrade[])} nameLabel={t('entry.symbol')} emptyText="" currency={currency} />
}

/** PnL by how long trades were held: are quick scalps or longer holds paying? */
function ByHold({ trades, currency }: { trades: readonly ClosedTrade[]; currency: Currency }) {
  const { t, tp, locale } = useI18n()
  return (
    <SignedBarList
      currency={currency}
      items={byHoldTime(trades as ClosedTrade[]).map((row) => ({
        key: row.key,
        label: t(`dashboard.hold.${row.key}`),
        value: row.pnl,
        caption: `${tp('analytics.tradeCount', row.count)} · ${t('analytics.winRateShort', { value: formatShare(row.winRate, locale) })}`,
      }))}
    />
  )
}

/** PnL by the trader's star rating: do the trades graded as well executed earn more? */
function ByRating({ trades, currency }: { trades: readonly ClosedTrade[]; currency: Currency }) {
  const { t, tp, locale } = useI18n()
  const rows = byRating(trades as ClosedTrade[])
  return (
    <div className="form-stack">
      <SignedBarList
        currency={currency}
        items={rows.map((row) => ({
          key: String(row.key),
          label:
            row.key === 'none' ? (
              t('rating.none')
            ) : (
              <span className="rating-label">
                <span aria-hidden="true">{'★'.repeat(row.key) + '☆'.repeat(5 - row.key)}</span>
                <span className="visually-hidden">{t('rating.star', { value: String(row.key) })}</span>
              </span>
            ),
          value: row.pnl,
          caption: `${tp('analytics.tradeCount', row.count)} · ${t('analytics.winRateShort', { value: formatShare(row.winRate, locale) })}`,
        }))}
      />
      {rows.every((row) => row.key === 'none') && <p className="caption">{t('dashboard.byRating.empty')}</p>}
    </div>
  )
}

/** The six key-metric tiles. */
function KeyMetrics({ data }: { data: WidgetData }) {
  const { t, tp, locale } = useI18n()
  const { summary, currency } = data
  return (
    <div className="form-stack">
      <p className="caption">{tp('analytics.tradeCount', summary.count)}</p>
      <div className="metric-grid">
        <Metric label={t('analytics.metric.pnl')}>
          <PnLText amount={summary.pnl} currency={currency} />
        </Metric>
        <Metric label={t('analytics.metric.winRate')}>{summary.winRate ? formatShare(summary.winRate, locale) : '—'}</Metric>
        <Metric label={t('analytics.metric.averageR')}>{summary.averageR ? formatR(summary.averageR, locale) : '—'}</Metric>
        <Metric label={t('analytics.metric.expectancy')}>{summary.expectancy ? <PnLText amount={summary.expectancy} currency={currency} /> : '—'}</Metric>
        <Metric label={t('analytics.metric.profitFactor')}>
          {summary.profitFactor ? formatRatio(summary.profitFactor, locale) : summary.grossProfit.gt(0) ? '∞' : '—'}
        </Metric>
        <Metric label={t('analytics.metric.maxDrawdown')}>
          <span className={summary.maxDrawdown.gt(0) ? 'loss' : ''}>{formatMoney(summary.maxDrawdown.times(-1), currency, locale)}</span>
        </Metric>
      </div>
    </div>
  )
}

function Metric({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="metric">
      <span className="caption">{label}</span>
      <span className="metric__value numeric">{children}</span>
    </div>
  )
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="dash-stat">
      <dt className="caption">{label}</dt>
      <dd className="numeric">{children}</dd>
    </div>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="dash-list__row">
      <dt>{label}</dt>
      <dd className="numeric">{children}</dd>
    </div>
  )
}

function BreakdownTable({ rows, nameLabel, emptyText, currency }: { rows: Breakdown<string>[]; nameLabel: string; emptyText: string; currency: Currency }) {
  const { t, locale } = useI18n()
  if (rows.length === 0) return <p className="secondary-text">{emptyText}</p>
  return (
    <div className="table-scroll">
      <table className="breakdown-table">
        <thead>
          <tr>
            <th scope="col">{nameLabel}</th>
            <th scope="col">PnL</th>
            <th scope="col">{t('analytics.column.trades')}</th>
            <th scope="col">{t('analytics.metric.winRate')}</th>
            <th scope="col">{t('analytics.metric.averageR')}</th>
          </tr>
        </thead>
        <tbody>
          {[...rows]
            .sort((a, b) => b.pnl.cmp(a.pnl))
            .map((row) => (
              <tr key={row.key}>
                <th scope="row">{row.key}</th>
                <td>
                  <PnLText amount={row.pnl} currency={currency} />
                </td>
                <td className="numeric">{row.count}</td>
                <td className="numeric">{formatShare(row.winRate, locale)}</td>
                <td className="numeric">{row.averageR ? formatR(row.averageR, locale) : '—'}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  )
}
