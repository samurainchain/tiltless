import { ChevronDown, ListChecks, Plus, Search, SlidersHorizontal } from 'lucide-react'
import { useCallback, useId, useMemo, useState, type ReactNode } from 'react'
import { useJournal, useMistakeName } from '../../app/journal'
import { updateSettings, useSettings } from '../../app/settings'
import { DEFAULT_SORT, pageOf, sortTrades, TRADES_PER_PAGE, type TradeSort } from '../../core/tradeTable'
import { useSheets } from '../../app/sheets'
import { Button, EmptyState, PnLText, Segmented } from '../../design/components'
import { formatDay } from '../../i18n/format'
import { EMOTIONS, type Emotion, type Trade } from '../../core/models'
import { useI18n } from '../../i18n/i18n'
import { PageHeader } from '../shell/PageHeader'
import { ActiveFilters, FilterSheet } from './FilterSheet'
import { activeFilterCount, filterTrades, type TradeFilter } from './tradeFilters'
import { groupByDay, useVisibleTrades } from './tradeQueries'
import { TradePanel } from './TradePanel'
import { TradeRow } from './TradeRow'
import { ColumnsMenu, TradeSummaryCards, TradeTable } from './TradeTable'

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
  const { newTrade } = useSheets()
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
            <>
              <Segmented
                label={t('trades.view')}
                value={view}
                onChange={(tradesView) => updateSettings({ tradesView })}
                options={[
                  { value: 'days', label: t('trades.view.days') },
                  { value: 'table', label: t('trades.view.table') },
                ]}
              />
              {/* Phones: the filters in a sheet; wide screens have the filter bar below. */}
              <Button className="trades-filters-button" icon={<SlidersHorizontal size={18} aria-hidden="true" />} aria-label={count ? t('filters.buttonActive', { count }) : undefined} onClick={() => setFiltersOpen(true)}>
                {t('filters.button')}
                {count > 0 && <span className="badge">{count}</span>}
              </Button>
            </>
          )
        }
      />
      <ActiveFilters filter={filter} onChange={setFilter} />
      <FilterSheet open={filtersOpen} filter={filter} trades={trades} onChange={setFilter} onClose={() => setFiltersOpen(false)} />
      {filtered.length > 0 && <TradeSummaryCards trades={filtered} currency={currency} period={filter.period ? t(`analytics.period.${filter.period}`) : undefined} />}
      {trades.length > 0 && <FilterBar filter={filter} onChange={setFilter} columns={view === 'table'} />}
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

/**
 * The filter bar on wide screens: a search over symbols and notes, then the period, side, mistake
 * and emotion as chips that open a menu, and the column picker on the right.
 */
function FilterBar({ filter, onChange, columns }: { filter: TradeFilter; onChange: (filter: TradeFilter) => void; columns: boolean }) {
  const { t } = useI18n()
  const { mistakes } = useJournal()
  const mistakeName = useMistakeName()
  const searchId = useId()
  const set = (patch: Partial<TradeFilter>) => onChange({ ...filter, ...patch })
  const active = mistakes.filter((tag) => !tag.isArchived)

  const chip = (label: string, value: string, change: (value: string) => void, options: ReactNode, on: boolean) => (
    <label className={on ? 'filter-chip filter-chip--on' : 'filter-chip'}>
      <span className="visually-hidden">{label}</span>
      <select value={value} onChange={(event) => change(event.target.value)}>
        {options}
      </select>
      <ChevronDown size={14} aria-hidden="true" />
    </label>
  )

  return (
    <div className="filter-bar">
      <div className="filter-bar__chips">
        <label className="filter-search" htmlFor={searchId}>
          <Search size={15} aria-hidden="true" />
          <span className="visually-hidden">{t('filters.search')}</span>
          <input id={searchId} type="search" placeholder={t('filters.search')} value={filter.query ?? ''} onChange={(event) => set({ query: event.target.value || undefined })} />
        </label>
        {chip(
          t('filters.period'),
          filter.period ?? '',
          (value) => set({ period: (value || undefined) as TradeFilter['period'] }),
          <>
            <option value="">{t('filters.allTime')}</option>
            {(['week', 'month', 'quarter'] as const).map((period) => (
              <option key={period} value={period}>
                {t('filters.last', { period: t(`analytics.period.${period}`) })}
              </option>
            ))}
          </>,
          Boolean(filter.period),
        )}
        {chip(
          t('trades.column.side'),
          filter.side ?? '',
          (value) => set({ side: (value || undefined) as TradeFilter['side'] }),
          <>
            <option value="">{t('filters.sideChip', { value: t('filters.all') })}</option>
            <option value="long">{t('filters.sideChip', { value: t('side.long') })}</option>
            <option value="short">{t('filters.sideChip', { value: t('side.short') })}</option>
          </>,
          Boolean(filter.side),
        )}
        {chip(
          t('trades.column.tags'),
          filter.mistakeId ?? '',
          (value) => set({ mistakeId: value || undefined }),
          <>
            <option value="">{t('filters.tagsChip', { value: t('filters.all') })}</option>
            {active.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {t('filters.tagsChip', { value: mistakeName(tag) })}
              </option>
            ))}
          </>,
          Boolean(filter.mistakeId),
        )}
        {chip(
          t('trades.column.emotion'),
          filter.emotion ?? '',
          (value) => set({ emotion: (value || undefined) as Emotion | undefined }),
          <>
            <option value="">{t('filters.emotionChip', { value: t('filters.all') })}</option>
            {EMOTIONS.map((emotion) => (
              <option key={emotion} value={emotion}>
                {t('filters.emotionChip', { value: t(`emotion.${emotion}`) })}
              </option>
            ))}
          </>,
          Boolean(filter.emotion),
        )}
      </div>
      {columns && <ColumnsMenu />}
    </div>
  )
}
