import { ArrowDown, ArrowUp, ChevronLeft, Plus, Trash2 } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { useJournal, useStore } from '../../app/journal'
import { notificationPermission, requestNotificationPermission } from '../../app/limitAlerts'
import { routeHref } from '../../app/router'
import { parsePositive } from '../../core/decimal'
import { DEFAULT_REVENGE_MINUTES } from '../../core/mistakeDetector'
import type { Rule } from '../../core/models'
import { Button, Card, Field, SectionHeader, Segmented } from '../../design/components'
import { totalDeposit } from '../../core/limits'
import { formatDecimal, formatMoney, weekdayNames } from '../../i18n/format'
import { totalsCurrency } from '../trades/tradeQueries'
import { useI18n } from '../../i18n/i18n'
import { PageHeader } from '../shell/PageHeader'

/** Daily limits, alerts and personal trading rules (SPEC section 4.8). */
export function RulesPage() {
  const { t, locale } = useI18n()
  const store = useStore()
  const { profile, rules, accounts } = useJournal()
  const ids = { loss: useId(), trades: useId(), weekday: useId(), newRule: useId(), revenge: useId() }
  const percentMode = profile.dailyLossUnit === 'percent'
  const [lossLimit, setLossLimit] = useState((percentMode ? profile.dailyLossPercent : profile.dailyLossLimit) ?? '')
  const [tradeLimit, setTradeLimit] = useState(profile.dailyTradeLimit ? String(profile.dailyTradeLimit) : '')
  const [revengeMinutes, setRevengeMinutes] = useState(String(profile.revengeMinutes ?? DEFAULT_REVENGE_MINUTES))
  const [errors, setErrors] = useState<{ loss?: string; trades?: string; revenge?: string }>({})
  const [permission, setPermission] = useState(notificationPermission())
  const [newRule, setNewRule] = useState('')

  const field = percentMode ? 'dailyLossPercent' : 'dailyLossLimit'
  const saveLossLimit = () => {
    if (!lossLimit.trim()) return void store.updateProfile({ [field]: undefined }).then(() => setErrors((e) => ({ ...e, loss: undefined })))
    const value = parsePositive(lossLimit)
    if (!value || (percentMode && Number(value) > 100)) return setErrors((e) => ({ ...e, loss: t(percentMode ? 'limits.error.percent' : 'entry.error.price') }))
    setErrors((e) => ({ ...e, loss: undefined }))
    void store.updateProfile({ [field]: value })
  }

  /** Switches between money and %, keeping each unit's own value. */
  const changeUnit = (unit: 'money' | 'percent') => {
    setErrors((e) => ({ ...e, loss: undefined }))
    setLossLimit((unit === 'percent' ? profile.dailyLossPercent : profile.dailyLossLimit) ?? '')
    void store.updateProfile({ dailyLossUnit: unit })
  }

  const deposit = totalDeposit(accounts)
  const currency = totalsCurrency(undefined, accounts.filter((account) => !account.isDemo))
  const percentValue = parsePositive(lossLimit)
  const lossHint = !percentMode
    ? t('limits.lossHint')
    : !deposit
      ? t('limits.percentNoDeposit')
      : percentValue
        ? t('limits.percentHint', { percent: formatDecimal(percentValue, locale), amount: formatMoney(deposit.times(percentValue).div(100), currency, locale, false), deposit: formatMoney(deposit, currency, locale, false) })
        : t('limits.percentDeposit', { deposit: formatMoney(deposit, currency, locale, false) })

  const saveTradeLimit = () => {
    if (!tradeLimit.trim()) return void store.updateProfile({ dailyTradeLimit: undefined }).then(() => setErrors((e) => ({ ...e, trades: undefined })))
    const value = Number(tradeLimit)
    if (!Number.isInteger(value) || value < 1) return setErrors((e) => ({ ...e, trades: t('limits.error.trades') }))
    setErrors((e) => ({ ...e, trades: undefined }))
    void store.updateProfile({ dailyTradeLimit: value })
  }

  const saveRevengeMinutes = () => {
    const value = Number(revengeMinutes)
    if (!Number.isInteger(value) || value < 1 || value > 240) return setErrors((e) => ({ ...e, revenge: t('limits.error.revengeMinutes') }))
    setErrors((e) => ({ ...e, revenge: undefined }))
    void store.updateProfile({ revengeMinutes: value })
  }

  const toggleAlerts = async (enabled: boolean) => {
    await store.updateProfile({ limitAlerts: enabled })
    if (enabled && permission === 'default') setPermission(await requestNotificationPermission())
  }

  const addRule = async (event: FormEvent) => {
    event.preventDefault()
    if (!newRule.trim()) return
    await store.addRule(newRule)
    setNewRule('')
  }

  const move = (index: number, offset: -1 | 1) => {
    const order = rules.map((rule) => rule.id)
    const target = index + offset
    if (target < 0 || target >= order.length) return
    ;[order[index], order[target]] = [order[target]!, order[index]!]
    void store.reorderRules(order)
  }

  const weekdays = weekdayNames(locale, 'long')

  return (
    <>
      <PageHeader
        title={t('limits.title')}
        leading={
          <a className="back-link" href={routeHref({ name: 'profile' })}>
            <ChevronLeft size={20} aria-hidden="true" />
            {t('tab.profile')}
          </a>
        }
      />

      <SectionHeader title={t('limits.dailySection')} />
      <Card className="form-stack">
        <p className="secondary-text">{t('limits.dailyNote')}</p>
        <div className="form-grid">
          <Field label={t('limits.loss')} htmlFor={ids.loss} error={errors.loss} hint={lossHint}>
            <div className="input-with-addon">
              <input id={ids.loss} className="input numeric" inputMode="decimal" placeholder={percentMode ? '3' : '300'} value={lossLimit} onChange={(event) => setLossLimit(event.target.value)} onBlur={saveLossLimit} />
              <Segmented
                label={t('limits.lossUnit')}
                value={percentMode ? 'percent' : 'money'}
                onChange={changeUnit}
                options={[
                  { value: 'money', label: '$' },
                  { value: 'percent', label: '%' },
                ]}
              />
            </div>
          </Field>
          <Field label={t('limits.trades')} htmlFor={ids.trades} error={errors.trades}>
            <input id={ids.trades} className="input numeric" inputMode="numeric" placeholder="6" value={tradeLimit} onChange={(event) => setTradeLimit(event.target.value)} onBlur={saveTradeLimit} />
          </Field>
        </div>
        <label className="toggle-row">
          <input type="checkbox" checked={profile.limitAlerts} onChange={(event) => void toggleAlerts(event.target.checked)} />
          <span>
            {t('limits.alerts')}
            <span className="caption toggle-row__hint">
              {permission === 'unsupported' ? t('limits.alertsUnsupported') : permission === 'denied' ? t('limits.alertsDenied') : t('limits.alertsHint')}
            </span>
          </span>
        </label>
        {profile.limitAlerts && permission === 'default' && (
          <Button onClick={async () => setPermission(await requestNotificationPermission())}>{t('limits.allowNotifications')}</Button>
        )}
      </Card>

      <SectionHeader title={t('limits.autoSection')} />
      <Card className="form-stack">
        <label className="toggle-row">
          <input type="checkbox" checked={profile.autoMistakes !== false} onChange={(event) => void store.updateProfile({ autoMistakes: event.target.checked })} />
          <span>
            {t('limits.autoToggle')}
            <span className="caption toggle-row__hint">{t('limits.autoHint')}</span>
          </span>
        </label>
        {profile.autoMistakes !== false && (
          <Field label={t('limits.revengeMinutes')} htmlFor={ids.revenge} error={errors.revenge} hint={t('limits.revengeHint')}>
            <input
              id={ids.revenge}
              className="input numeric"
              inputMode="numeric"
              value={revengeMinutes}
              onChange={(event) => setRevengeMinutes(event.target.value)}
              onBlur={saveRevengeMinutes}
            />
          </Field>
        )}
      </Card>

      <SectionHeader title={t('limits.rulesSection')} />
      <Card className="form-stack">
        <p className="secondary-text">{t('limits.rulesNote')}</p>
        {rules.length > 0 && (
          <ul className="rule-list">
            {rules.map((rule, index) => (
              <RuleRow
                key={rule.id}
                rule={rule}
                first={index === 0}
                last={index === rules.length - 1}
                onMove={(offset) => move(index, offset)}
              />
            ))}
          </ul>
        )}
        <form className="rule-add" onSubmit={addRule}>
          <label htmlFor={ids.newRule} className="visually-hidden">
            {t('limits.newRule')}
          </label>
          <input id={ids.newRule} className="input" placeholder={t('limits.newRulePlaceholder')} value={newRule} onChange={(event) => setNewRule(event.target.value)} />
          <Button type="submit" variant="primary" icon={<Plus size={18} aria-hidden="true" />} disabled={!newRule.trim()}>
            {t('accounts.add')}
          </Button>
        </form>
      </Card>

      <SectionHeader title={t('review.title')} />
      <Card className="form-stack">
        <Field label={t('limits.reviewDay')} htmlFor={ids.weekday} hint={t('limits.reviewDayHint')}>
          <select id={ids.weekday} className="input" value={profile.reviewWeekday} onChange={(event) => void store.updateProfile({ reviewWeekday: Number(event.target.value) })}>
            {[1, 2, 3, 4, 5, 6, 0].map((day) => (
              <option key={day} value={day}>
                {weekdays[day]}
              </option>
            ))}
          </select>
        </Field>
      </Card>
    </>
  )
}

function RuleRow({ rule, first, last, onMove }: { rule: Rule; first: boolean; last: boolean; onMove: (offset: -1 | 1) => void }) {
  const { t } = useI18n()
  const store = useStore()
  const [text, setText] = useState(rule.text)

  const saveText = () => {
    const trimmed = text.trim()
    if (!trimmed) return setText(rule.text)
    if (trimmed !== rule.text) void store.saveRule({ ...rule, text: trimmed })
  }

  return (
    <li className={`rule-row${rule.isActive ? '' : ' rule-row--inactive'}`}>
      <input
        type="checkbox"
        checked={rule.isActive}
        aria-label={t('limits.ruleActive')}
        onChange={(event) => void store.saveRule({ ...rule, isActive: event.target.checked })}
      />
      <input className="input rule-row__text" aria-label={t('limits.ruleText')} value={text} onChange={(event) => setText(event.target.value)} onBlur={saveText} />
      <div className="rule-row__actions">
        <button type="button" className="icon-button" aria-label={t('accounts.moveUp')} disabled={first} onClick={() => onMove(-1)}>
          <ArrowUp size={16} aria-hidden="true" />
        </button>
        <button type="button" className="icon-button" aria-label={t('accounts.moveDown')} disabled={last} onClick={() => onMove(1)}>
          <ArrowDown size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="icon-button icon-button--danger"
          aria-label={t('action.delete')}
          onClick={() => {
            if (window.confirm(t('limits.deleteRuleConfirm'))) void store.deleteRule(rule.id)
          }}
        >
          <Trash2 size={16} aria-hidden="true" />
        </button>
      </div>
    </li>
  )
}
