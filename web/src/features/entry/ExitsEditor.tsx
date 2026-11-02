import { Plus, X } from 'lucide-react'
import { useId } from 'react'
import { Button } from '../../design/components'
import { formatDecimal } from '../../i18n/format'
import { useI18n } from '../../i18n/i18n'
import { addExit, formExitPrice, remainingPercent, removeExit, type EntryForm, type ExitRow } from './entryForm'

/** A position closed in parts: one row per exit with its price, share and time (SPEC section 6). */
export function ExitsEditor({ form, error, onChange }: { form: EntryForm; error?: string; onChange: (form: EntryForm) => void }) {
  const { t, locale } = useI18n()
  const baseId = useId()
  const average = formExitPrice(form)
  const rest = remainingPercent(form.exits)
  const setRow = (index: number, patch: Partial<ExitRow>) =>
    onChange({ ...form, exits: form.exits.map((row, position) => (position === index ? { ...row, ...patch } : row)) })

  return (
    <fieldset className="fieldset exits" aria-describedby={error ? `${baseId}-error` : undefined}>
      <legend className="field__label">{t('entry.exits')}</legend>
      {form.exits.map((row, index) => {
        const id = `${baseId}-${index}`
        const number = String(index + 1)
        return (
          <div key={index} className="exits__row">
            <span className="exits__number caption numeric">{number}</span>
            <label className="exits__field" htmlFor={`${id}-price`}>
              <span className="caption">{t('entry.exitPrice')}</span>
              <input id={`${id}-price`} className="input numeric" inputMode="decimal" autoComplete="off" value={row.price} onChange={(event) => setRow(index, { price: event.target.value })} />
            </label>
            <label className="exits__field exits__field--percent" htmlFor={`${id}-percent`}>
              <span className="caption">{t('entry.exitPercent')}</span>
              <input id={`${id}-percent`} className="input numeric" inputMode="decimal" autoComplete="off" value={row.percent} onChange={(event) => setRow(index, { percent: event.target.value })} />
            </label>
            <label className="exits__field exits__field--time" htmlFor={`${id}-time`}>
              <span className="caption">{t('entry.exitTime')}</span>
              <input id={`${id}-time`} className="input" type="datetime-local" value={row.closedAt} onChange={(event) => setRow(index, { closedAt: event.target.value })} />
            </label>
            <button type="button" className="icon-button exits__remove" aria-label={t('entry.removeExit', { number })} onClick={() => onChange(removeExit(form, index))}>
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        )
      })}
      <div className="exits__footer">
        <Button variant="plain" icon={<Plus size={18} aria-hidden="true" />} onClick={() => onChange(addExit(form))}>
          {t('entry.addExit')}
        </Button>
        <p className="caption numeric" aria-live="polite">
          {average ? t('entry.exitsAverage', { price: formatDecimal(average, locale) }) : rest.gt(0) ? t('entry.exitsLeft', { percent: formatDecimal(rest.toString(), locale) }) : ''}
        </p>
      </div>
      {error && (
        <p id={`${baseId}-error`} className="field__error" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  )
}
