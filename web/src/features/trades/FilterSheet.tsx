import { X } from 'lucide-react'
import { useId } from 'react'
import { useJournal, useMistakeName } from '../../app/journal'
import { EMOTIONS, type Emotion, type Trade } from '../../core/models'
import type { Period } from '../../core/stats'
import { Button, Field, Segmented, Sheet } from '../../design/components'
import { useI18n } from '../../i18n/i18n'
import { symbolsByUse, type TradeFilter } from './tradeFilters'

type FilterPeriod = Exclude<Period, 'all'>
const PERIODS: FilterPeriod[] = ['week', 'month', 'quarter']

/** Filters for the trade list in a sheet; changes apply as they're made. */
export function FilterSheet({
  open,
  filter,
  trades,
  onChange,
  onClose,
}: {
  open: boolean
  filter: TradeFilter
  trades: readonly Trade[]
  onChange: (filter: TradeFilter) => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const { mistakes, setups } = useJournal()
  const mistakeName = useMistakeName()
  const ids = { period: useId(), symbol: useId(), emotion: useId(), mistake: useId(), setup: useId(), rating: useId() }
  const set = (patch: Partial<TradeFilter>) => onChange({ ...filter, ...patch })
  const value = (raw: string) => (raw === '' ? undefined : raw)

  return (
    <Sheet
      open={open}
      title={t('filters.title')}
      onClose={onClose}
      footer={
        <div className="action-row action-row--wrap">
          <Button onClick={() => onChange({})}>{t('filters.reset')}</Button>
          <Button variant="primary" onClick={onClose}>
            {t('filters.done')}
          </Button>
        </div>
      }
    >
      <div className="form-stack">
        <Field label={t('filters.period')} htmlFor={ids.period}>
          <select id={ids.period} className="input" value={filter.period ?? ''} onChange={(event) => set({ period: value(event.target.value) as FilterPeriod | undefined })}>
            <option value="">{t('filters.any')}</option>
            {PERIODS.map((period) => (
              <option key={period} value={period}>
                {t(`analytics.period.${period}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('filters.result')}>
          <Segmented
            label={t('filters.result')}
            value={filter.result ?? 'any'}
            onChange={(result) => set({ result: result === 'any' ? undefined : result })}
            options={[
              { value: 'any', label: t('filters.any') },
              { value: 'profit', label: t('filters.profit'), tone: 'profit' },
              { value: 'loss', label: t('filters.loss'), tone: 'loss' },
            ]}
          />
        </Field>
        <Field label={t('entry.symbol')} htmlFor={ids.symbol}>
          <select id={ids.symbol} className="input" value={filter.symbol ?? ''} onChange={(event) => set({ symbol: value(event.target.value) })}>
            <option value="">{t('filters.any')}</option>
            {symbolsByUse(trades).map((symbol) => (
              <option key={symbol} value={symbol}>
                {symbol}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('entry.emotion')} htmlFor={ids.emotion}>
          <select id={ids.emotion} className="input" value={filter.emotion ?? ''} onChange={(event) => set({ emotion: value(event.target.value) as Emotion | undefined })}>
            <option value="">{t('filters.any')}</option>
            {EMOTIONS.map((emotion) => (
              <option key={emotion} value={emotion}>
                {t(`emotion.${emotion}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('entry.mistakes')} htmlFor={ids.mistake}>
          <select id={ids.mistake} className="input" value={filter.mistakeId ?? ''} onChange={(event) => set({ mistakeId: value(event.target.value) })}>
            <option value="">{t('filters.any')}</option>
            {mistakes.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {mistakeName(tag)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('rating.label')} htmlFor={ids.rating}>
          <select
            id={ids.rating}
            className="input"
            value={filter.rating ?? ''}
            onChange={(event) => set({ rating: event.target.value === '' ? undefined : event.target.value === 'none' ? 'none' : Number(event.target.value) })}
          >
            <option value="">{t('filters.any')}</option>
            {[5, 4, 3, 2, 1].map((stars) => (
              <option key={stars} value={stars}>
                {t('rating.star', { value: String(stars) })}
              </option>
            ))}
            <option value="none">{t('rating.none')}</option>
          </select>
        </Field>
        {setups.length > 0 && (
          <Field label={t('entry.setups')} htmlFor={ids.setup}>
            <select id={ids.setup} className="input" value={filter.setupId ?? ''} onChange={(event) => set({ setupId: value(event.target.value) })}>
              <option value="">{t('filters.any')}</option>
              {setups.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.name}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
    </Sheet>
  )
}

/** The active filters as chips; tapping one removes it. */
export function ActiveFilters({ filter, onChange }: { filter: TradeFilter; onChange: (filter: TradeFilter) => void }) {
  const { t } = useI18n()
  const { mistakes, setups } = useJournal()
  const mistakeName = useMistakeName()
  const labels: { key: keyof TradeFilter; label: string }[] = []
  if (filter.period) labels.push({ key: 'period', label: t(`analytics.period.${filter.period}`) })
  if (filter.result) labels.push({ key: 'result', label: t(filter.result === 'profit' ? 'filters.profit' : 'filters.loss') })
  if (filter.symbol) labels.push({ key: 'symbol', label: filter.symbol })
  if (filter.emotion) labels.push({ key: 'emotion', label: t(`emotion.${filter.emotion}`) })
  if (filter.side) labels.push({ key: 'side', label: t(`side.${filter.side}`) })
  const mistake = mistakes.find((tag) => tag.id === filter.mistakeId)
  if (mistake) labels.push({ key: 'mistakeId', label: mistakeName(mistake) })
  const setup = setups.find((tag) => tag.id === filter.setupId)
  if (setup) labels.push({ key: 'setupId', label: setup.name })
  if (filter.rating !== undefined) labels.push({ key: 'rating', label: filter.rating === 'none' ? t('rating.none') : t('rating.value', { value: String(filter.rating) }) })
  if (labels.length === 0) return null

  return (
    <div className="chip-row active-filters">
      {labels.map(({ key, label }) => (
        <button key={key} type="button" className="chip chip--selected" aria-label={t('filters.remove', { name: label })} onClick={() => onChange({ ...filter, [key]: undefined })}>
          {label}
          <X size={14} aria-hidden="true" />
        </button>
      ))}
    </div>
  )
}
