import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Columns3 } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { useJournal, useMistakeName } from '../../app/journal'
import { updateSettings, useSettings } from '../../app/settings'
import type { Currency, Trade } from '../../core/models'
import { rMultiple, totalPnl, tradeDuration, tradePnl } from '../../core/pnl'
import { closedTrades, metrics } from '../../core/stats'
import { tradeTotals } from '../../core/tradeStats'
import { groupsByDay, nextSort, normalizeHiddenColumns, pageCount, pageOf, toggleColumn, TRADE_COLUMNS, type SortKey, type TradeColumn, type TradeSort } from '../../core/tradeTable'
import { PnLText } from '../../design/components'
import { formatDate, formatDay, formatDecimal, formatDuration, formatR, formatRatio, formatShare, formatTime } from '../../i18n/format'
import { useI18n } from '../../i18n/i18n'
import { StarRating } from './StarRating'
import { EMOTION_ICONS } from './TradeRow'
import { dayFromKey, tradeDayKey } from './tradeQueries'

/** Net PnL, win rate, profit factor, average hold, count and expectancy of the trades shown. */
export function TradeSummaryStrip({ trades, currency }: { trades: readonly Trade[]; currency: Currency }) {
  const { t, locale } = useI18n()
  const closed = useMemo(() => closedTrades(trades), [trades])
  const summary = useMemo(() => metrics(closed), [closed])
  const { averageHoldMs } = useMemo(() => tradeTotals(closed), [closed])
  if (closed.length === 0) return null

  const stats: [string, ReactNode][] = [
    [t('trade.netPnl'), <PnLText amount={summary.pnl} currency={currency} />],
    [t('analytics.metric.winRate'), summary.winRate ? formatShare(summary.winRate, locale) : '—'],
    [t('analytics.metric.profitFactor'), summary.profitFactor ? formatRatio(summary.profitFactor, locale) : summary.grossProfit.gt(0) ? '∞' : '—'],
    [t('dashboard.avgHold'), averageHoldMs !== undefined ? formatDuration(averageHoldMs, locale) : '—'],
    [t('dashboard.tradeCount'), String(summary.count)],
    [t('analytics.metric.expectancy'), summary.expectancy ? <PnLText amount={summary.expectancy} currency={currency} /> : '—'],
  ]
  return (
    <section className="trade-strip card" aria-label={t('trades.summary')}>
      <dl className="trade-strip__list">
        {stats.map(([label, value]) => (
          <div key={label} className="trade-strip__item">
            <dt className="label">{label}</dt>
            <dd className="numeric">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

/** The column picker: a menu of checkboxes, kept in this browser's settings. */
export function ColumnsMenu() {
  const { t } = useI18n()
  const hidden = normalizeHiddenColumns(useSettings().hiddenTradeColumns)
  return (
    <details className="columns-menu">
      <summary className="button button--secondary">
        <Columns3 size={18} aria-hidden="true" />
        {t('trades.columns')}
      </summary>
      <fieldset className="columns-menu__list">
        <legend className="visually-hidden">{t('trades.columns')}</legend>
        {TRADE_COLUMNS.map((column) => (
          <label key={column} className="columns-menu__item">
            <input type="checkbox" checked={!hidden.includes(column)} onChange={() => updateSettings({ hiddenTradeColumns: toggleColumn(hidden, column) })} />
            {t(`trades.column.${column}`)}
          </label>
        ))}
      </fieldset>
    </details>
  )
}

/**
 * Trades as a sortable table, a page at a time (SPEC section 4.5). A row opens the trade in the
 * side panel; the star rating is set right in its cell.
 */
export function TradeTable({
  trades,
  sort,
  onSort,
  page,
  onPage,
  openId,
  onOpen,
}: {
  trades: readonly Trade[]
  sort: TradeSort
  onSort: (sort: TradeSort) => void
  page: number
  onPage: (page: number) => void
  openId: string | undefined
  onOpen: (id: string) => void
}) {
  const { t, locale } = useI18n()
  const { accounts, mistakes } = useJournal()
  const mistakeName = useMistakeName()
  const hidden = normalizeHiddenColumns(useSettings().hiddenTradeColumns)
  const columns = TRADE_COLUMNS.filter((column) => !hidden.includes(column))
  const shown = pageOf(trades, page)
  const grouped = groupsByDay(sort)
  const pages = pageCount(trades.length)
  const accountOf = (trade: Trade) => accounts.find((item) => item.id === trade.accountId)

  const header = (key: SortKey) => {
    const active = sort.key === key
    const Arrow = sort.direction === 'asc' ? ArrowUp : ArrowDown
    return (
      <th key={key} scope="col" aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined} className={`trade-table__${key}`}>
        <button type="button" className="trade-table__sort" onClick={() => onSort(nextSort(sort, key))}>
          {t(`trades.column.${key}`)}
          {active && <Arrow size={14} aria-hidden="true" />}
        </button>
      </th>
    )
  }

  const when = (iso: string | undefined) =>
    iso ? (
      <span className="trade-table__when">
        <span>{formatDate(new Date(iso), locale)}</span>
        <span className="caption">{formatTime(iso, locale)}</span>
      </span>
    ) : (
      '—'
    )

  const cell = (trade: Trade, column: TradeColumn): ReactNode => {
    const currency = accountOf(trade)?.currency ?? 'USD'
    switch (column) {
      case 'side':
        return <span className={`side-badge side-badge--${trade.side}`}>{t(`side.${trade.side}`)}</span>
      case 'account':
        return accountOf(trade)?.name ?? '—'
      case 'entryPrice':
        return formatDecimal(trade.entryPrice, locale)
      case 'exitPrice':
        return trade.exitPrice ? formatDecimal(trade.exitPrice, locale) : '—'
      case 'openedAt':
        return when(trade.openedAt)
      case 'closedAt':
        // Under its day's heading the time is enough.
        return grouped && trade.closedAt ? formatTime(trade.closedAt, locale) : when(trade.closedAt)
      case 'duration': {
        const duration = tradeDuration(trade)
        return duration === undefined ? '—' : formatDuration(duration, locale)
      }
      case 'quantity':
        return formatDecimal(trade.quantity, locale)
      case 'pnl': {
        const pnl = tradePnl(trade)
        return pnl ? <PnLText amount={pnl} currency={currency} /> : <span className="caption">{t('trade.open')}</span>
      }
      case 'r': {
        const r = rMultiple(trade)
        return r ? formatR(r, locale) : '—'
      }
      case 'tags': {
        const tags = mistakes.filter((tag) => trade.mistakeIds.includes(tag.id))
        return tags.length === 0 ? null : (
          <span className="trade-table__flags">
            {tags.map((tag) => (
              <span key={tag.id} className="flag-tag">
                {mistakeName(tag)}
              </span>
            ))}
          </span>
        )
      }
      case 'emotion': {
        if (!trade.emotion) return null
        const Icon = EMOTION_ICONS[trade.emotion]
        return (
          <span className="emotion-label">
            <Icon size={15} aria-hidden="true" />
            {t(`emotion.${trade.emotion}`)}
          </span>
        )
      }
      case 'rating':
        return <StarRating trade={trade} />
    }
  }

  // A heading row with the day's total before each day's first trade, when sorted by time.
  const dayRow = (key: string, first: Trade) => {
    const currency = accountOf(first)?.currency ?? 'USD'
    const total = totalPnl(trades.filter((trade) => tradeDayKey(trade) === key))
    return (
      <tr key={`day-${key}`} className="trade-table__day">
        <th scope="rowgroup" colSpan={columns.length}>
          {formatDay(dayFromKey(key), locale)}
        </th>
        <td className="numeric">
          <span className="visually-hidden">{t('trades.dayTotal')} </span>
          <PnLText amount={total} currency={currency} />
        </td>
      </tr>
    )
  }

  return (
    <div className="trade-table card">
      <div className="table-scroll">
        <table className="trade-table__table">
          <thead>
            <tr>
              {header('symbol')}
              {columns.map(header)}
            </tr>
          </thead>
          <tbody>
            {shown.items.map((trade, index) => [
              grouped && (index === 0 || tradeDayKey(shown.items[index - 1]!) !== tradeDayKey(trade)) ? dayRow(tradeDayKey(trade), trade) : null,
              <tr key={trade.id} className={trade.id === openId ? 'trade-table__row trade-table__row--open' : 'trade-table__row'} onClick={() => onOpen(trade.id)}>
                <th scope="row" className="trade-table__symbol">
                  <button
                    type="button"
                    className="trade-table__open"
                    aria-label={t('trades.openTrade', { symbol: trade.symbol, time: formatDate(new Date(trade.closedAt ?? trade.openedAt), locale) + ' ' + formatTime(trade.closedAt ?? trade.openedAt, locale) })}
                    onClick={(event) => {
                      event.stopPropagation()
                      onOpen(trade.id)
                    }}
                  >
                    {trade.symbol}
                  </button>
                </th>
                {columns.map((column) => (
                  <td key={column} className={`trade-table__${column} numeric`} onClick={column === 'rating' ? (event) => event.stopPropagation() : undefined}>
                    {cell(trade, column)}
                  </td>
                ))}
              </tr>,
            ])}
          </tbody>
        </table>
      </div>
      <nav className="trade-table__pages" aria-label={t('trades.pageOf', { page: String(shown.page + 1), count: String(pages) })}>
        <span className="caption numeric">{t('trades.range', { first: String(shown.first), last: String(shown.last), total: String(trades.length) })}</span>
        <span className="trade-table__page-buttons">
          <button type="button" className="icon-button" aria-label={t('trades.previousPage')} disabled={shown.page === 0} onClick={() => onPage(shown.page - 1)}>
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          <span className="caption numeric">{t('trades.pageOf', { page: String(shown.page + 1), count: String(pages) })}</span>
          <button type="button" className="icon-button" aria-label={t('trades.nextPage')} disabled={shown.page >= pages - 1} onClick={() => onPage(shown.page + 1)}>
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        </span>
      </nav>
    </div>
  )
}
