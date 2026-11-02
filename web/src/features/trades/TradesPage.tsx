import { Calculator, ListChecks, Plus, SlidersHorizontal } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useJournal } from '../../app/journal'
import { updateSettings, useSettings } from '../../app/settings'
import { DEFAULT_SORT, pageOf, sortTrades, TRADES_PER_PAGE, type TradeSort } from '../../core/tradeTable'
import { useSheets } from '../../app/sheets'
import { Button, EmptyState, PnLText, Segmented } from '../../design/components'
import { formatDay } from '../../i18n/format'
import type { Trade } from '../../core/models'
import { useI18n } from '../../i18n/i18n'
import { PageHeader } from '../shell/PageHeader'
import { ActiveFilters, FilterSheet } from './FilterSheet'
import { activeFilterCount, filterTrades, type TradeFilter } from './tradeFilters'
import { groupByDay, useVisibleTrades } from './tradeQueries'
import { TradePanel } from './TradePanel'
import { TradeRow } from './TradeRow'
import { ColumnsMenu, TradeSummaryStrip, TradeTable } from './TradeTable'

type View = 'days' | 'table'

/** The table suits a mouse and a wide screen; phones start with the list grouped by day. */
function defaultView(): View {
  return typeof window !== 'undefined' && window.matchMedia?.('(min-width: 900px)').matches ? 'table' : 'days'
}

/**
 * All trades (SPEC section 4.5): totals for what's shown, then either the list grouped by day
 * with each day's PnL, or a sortable table whose rows open in a side panel.
 */
export function TradesPage() {
  const { t, locale } = useI18n()
  const { trades, currency } = useVisibleTrades()
  const { newTrade, openCalculator } = useSheets()
  const [filter, setFilter] = useState<TradeFilter>({})
  const [filtersOpen, setFiltersOpen] = useState(false)
  const count = activeFilterCount(filter)
  const view: View = useSettings().tradesView ?? defaultView()
  const filtered = useMemo(() => filterTrades(trades, filter, new Date()), [trades, filter])
  const days = view === 'days' ? groupByDay(filtered) : []

  return (
    <>
      <PageHeader
        title={t('tab.trades')}
        showAccountSwitcher
        trailing={
          trades.length > 0 && (
            <Button icon={<SlidersHorizontal size={18} aria-hidden="true" />} aria-label={count ? t('filters.buttonActive', { count }) : undefined} onClick={() => setFiltersOpen(true)}>
              {t('filters.button')}
              {count > 0 && <span className="badge">{count}</span>}
            </Button>
          )
        }
      />
      <ActiveFilters filter={filter} onChange={setFilter} />
      <FilterSheet open={filtersOpen} filter={filter} trades={trades} onChange={setFilter} onClose={() => setFiltersOpen(false)} />
      {trades.length > 0 && (
        <div className="trades-toolbar">
          <Segmented
            label={t('trades.view')}
            value={view}
            onChange={(tradesView) => updateSettings({ tradesView })}
            options={[
              { value: 'days', label: t('trades.view.days') },
              { value: 'table', label: t('trades.view.table') },
            ]}
          />
          <span className="trades-toolbar__actions">
            <Button icon={<Calculator size={18} aria-hidden="true" />} onClick={openCalculator}>
              {t('calc.button')}
            </Button>
            {view === 'table' && <ColumnsMenu />}
          </span>
        </div>
      )}
      {filtered.length > 0 && <TradeSummaryStrip trades={filtered} currency={currency} />}
      {filtered.length === 0 && count > 0 ? (
        <EmptyState
          icon={<SlidersHorizontal size={28} />}
          title={t('filters.emptyTitle')}
          message={t('filters.emptyMessage')}
          action={
            <Button block onClick={() => setFilter({})}>
              {t('filters.reset')}
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<ListChecks size={28} />}
          title={t('trades.emptyTitle')}
          message={t('trades.emptyMessage')}
          action={
            <Button variant="primary" block icon={<Plus size={20} aria-hidden="true" />} onClick={newTrade}>
              {t('action.newTrade')}
            </Button>
          }
        />
      ) : view === 'table' ? (
        <TableView trades={filtered} />
      ) : (
        days.map((day) => (
          <section key={day.key} className="day-group" aria-label={formatDay(day.date, locale)}>
            <header className="day-group__header">
              <h2>{formatDay(day.date, locale)}</h2>
              <PnLText amount={day.pnl} currency={currency} />
            </header>
            <div className="list-card">
              {day.trades.map((trade) => (
                <TradeRow key={trade.id} trade={trade} />
              ))}
            </div>
          </section>
        ))
      )}
    </>
  )
}

/** The table with its sort, page and the trade open in the side panel. */
function TableView({ trades }: { trades: Trade[] }) {
  const { accounts } = useJournal()
  const [sort, setSort] = useState<TradeSort>(DEFAULT_SORT)
  const [page, setPage] = useState(0)
  const [openId, setOpenId] = useState<string>()
  const sorted = useMemo(() => sortTrades(trades, sort, (id) => accounts.find((account) => account.id === id)?.name ?? ''), [trades, sort, accounts])

  // Stepping through trades in the panel turns the table's page along with it.
  const open = useCallback(
    (id: string) => {
      setOpenId(id)
      const index = sorted.findIndex((trade) => trade.id === id)
      if (index >= 0) setPage(Math.floor(index / TRADES_PER_PAGE))
    },
    [sorted],
  )
  const close = useCallback(() => setOpenId(undefined), [])

  return (
    <>
      <TradeTable
        trades={sorted}
        sort={sort}
        onSort={(next) => {
          setSort(next)
          setPage(0)
        }}
        page={pageOf(sorted, page).page}
        onPage={setPage}
        openId={openId}
        onOpen={open}
      />
      <TradePanel trades={sorted} openId={openId} onOpen={open} onClose={close} />
    </>
  )
}
