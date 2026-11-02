import { useId, useState, type FormEvent } from 'react'
import { activeAccounts, useJournal, useStore } from '../../app/journal'
import { useAccess } from '../../app/entitlement'
import { canAddAccount } from '../../core/entitlements'
import { ProLock } from '../billing/ProLock'
import { useSheets } from '../../app/sheets'
import { defaultChallenge } from '../../core/challenge'
import { parsePositive } from '../../core/decimal'
import { ASSET_CLASSES, CURRENCIES, newId, TAG_COLORS, type Account, type AssetClass, type Currency, type PropChallenge } from '../../core/models'
import { Button, Field, Segmented, Sheet } from '../../design/components'
import { useI18n } from '../../i18n/i18n'

/** Create or edit an account (SPEC section 4.11). */
export function AccountSheet() {
  const { sheet, close } = useSheets()
  const { accounts } = useJournal()
  const access = useAccess()
  if (sheet.kind !== 'account') return null
  const existing = sheet.accountId ? accounts.find((account) => account.id === sheet.accountId) : undefined
  if (!existing && !canAddAccount(activeAccounts(accounts).length, access)) return <AccountLimit onClose={close} />
  return <AccountForm key={sheet.accountId ?? 'new'} existing={existing} onClose={close} />
}

function AccountForm({ existing, onClose }: { existing: Account | undefined; onClose: () => void }) {
  const { t } = useI18n()
  const store = useStore()
  const { accounts, trades } = useJournal()
  const ids = { name: useId(), venue: useId(), deposit: useId(), market: useId(), target: useId(), daily: useId(), maxLoss: useId(), days: useId(), start: useId() }

  const [name, setName] = useState(existing?.name ?? '')
  const [assetClass, setAssetClass] = useState<AssetClass>(existing?.assetClass ?? 'cryptoPerp')
  const [venue, setVenue] = useState(existing?.venue ?? '')
  const [currency, setCurrency] = useState<Currency>(existing?.currency ?? 'USDT')
  const [deposit, setDeposit] = useState(existing?.depositAmount ?? '')
  const [colorHex, setColorHex] = useState(existing?.colorHex ?? TAG_COLORS[accounts.length % TAG_COLORS.length]!)
  const [isDemo, setIsDemo] = useState(existing?.isDemo ?? false)
  const [challengeOn, setChallengeOn] = useState(Boolean(existing?.challenge))
  const [rules, setRules] = useState(() => challengeFields(existing?.challenge ?? defaultChallenge(new Date())))
  const [errors, setErrors] = useState<{ name?: string; deposit?: string; target?: string; daily?: string; maxLoss?: string; days?: string; start?: string }>({})
  const setRule = (key: keyof typeof rules) => (value: string) => setRules((current) => ({ ...current, [key]: value }))

  // The market of an account with trades is fixed: its trades' fields and math depend on it.
  const marketLocked = Boolean(existing && trades.some((trade) => trade.accountId === existing.id))

  const save = async (event: FormEvent) => {
    event.preventDefault()
    const depositAmount = deposit.trim() ? parsePositive(deposit) : undefined
    const percent = (value: string) => (value.trim() ? parsePositive(value) : undefined)
    const badPercent = (value: string) => (challengeOn && value.trim() && !percent(value) ? t('entry.error.price') : undefined)
    const days = rules.days.trim() ? Number(rules.days) : undefined
    const nextErrors = {
      name: name.trim() ? undefined : t('accounts.error.name'),
      deposit:
        deposit.trim() && !depositAmount ? t('entry.error.price') : challengeOn && !depositAmount ? t('accounts.error.challengeSize') : undefined,
      target: badPercent(rules.target),
      daily: badPercent(rules.daily),
      maxLoss: badPercent(rules.maxLoss),
      days: challengeOn && days !== undefined && !(Number.isInteger(days) && days > 0) ? t('accounts.error.days') : undefined,
      start: challengeOn && !/^\d{4}-\d{2}-\d{2}$/.test(rules.start) ? t('accounts.error.date') : undefined,
    }
    if (Object.values(nextErrors).some(Boolean)) return setErrors(nextErrors)
    const challenge: PropChallenge | undefined = challengeOn
      ? { profitTargetPct: percent(rules.target), dailyLossPct: percent(rules.daily), maxLossPct: percent(rules.maxLoss), minTradingDays: days, startDate: rules.start }
      : undefined

    const account: Account = {
      id: existing?.id ?? newId(),
      name: name.trim(),
      assetClass: marketLocked && existing ? existing.assetClass : assetClass,
      venue: venue.trim(),
      currency,
      depositAmount,
      colorHex,
      sortOrder: existing?.sortOrder ?? accounts.length,
      isArchived: existing?.isArchived ?? false,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      challenge,
      isDemo: isDemo || undefined,
    }
    await store.saveAccount(account)
    onClose()
  }

  return (
    <Sheet
      open
      title={existing ? t('accounts.editTitle') : t('accounts.newTitle')}
      onClose={onClose}
      footer={
        <Button variant="primary" block type="submit" form="account-form">
          {t('action.save')}
        </Button>
      }
    >
      <form id="account-form" className="form-stack" onSubmit={save} noValidate>
        <Field label={t('accounts.name')} htmlFor={ids.name} error={errors.name}>
          <input
            id={ids.name}
            className="input"
            value={name}
            placeholder={t('accounts.namePlaceholder')}
            autoFocus
            onChange={(event) => setName(event.target.value)}
          />
        </Field>

        <Field label={t('entry.market')} htmlFor={ids.market} hint={marketLocked ? t('accounts.marketLocked') : undefined}>
          <select id={ids.market} className="input" value={assetClass} disabled={marketLocked} onChange={(event) => setAssetClass(event.target.value as AssetClass)}>
            {ASSET_CLASSES.map((item) => (
              <option key={item} value={item}>
                {t(`market.${item}`)}
              </option>
            ))}
          </select>
        </Field>

        <Field label={t('accounts.venue')} htmlFor={ids.venue}>
          <input id={ids.venue} className="input" value={venue} placeholder="Binance, OKX, IBKR…" onChange={(event) => setVenue(event.target.value)} />
        </Field>

        <div className="form-grid">
          <Field label={t('accounts.currency')}>
            <Segmented label={t('accounts.currency')} value={currency} onChange={setCurrency} options={CURRENCIES.map((item) => ({ value: item, label: item }))} />
          </Field>
          <Field label={t('accounts.deposit')} htmlFor={ids.deposit} error={errors.deposit} hint={t('accounts.depositHint')}>
            <input id={ids.deposit} className="input numeric" inputMode="decimal" value={deposit} onChange={(event) => setDeposit(event.target.value)} />
          </Field>
        </div>

        <label className="toggle-row">
          <input type="checkbox" checked={isDemo} onChange={(event) => setIsDemo(event.target.checked)} />
          <span>
            {t('accounts.demo')}
            <span className="caption toggle-row__hint">{t('accounts.demoHint')}</span>
          </span>
        </label>

        <fieldset className="fieldset form-stack">
          <legend className="field__label">{t('accounts.challenge')}</legend>
          <label className="toggle-row">
            <input type="checkbox" checked={challengeOn} onChange={(event) => setChallengeOn(event.target.checked)} />
            <span>
              {t('accounts.challengeToggle')}
              <span className="caption toggle-row__hint">{t('accounts.challengeHint')}</span>
            </span>
          </label>
          {challengeOn && (
            <>
              <div className="form-grid">
                <Field label={t('accounts.challengeTarget')} htmlFor={ids.target} error={errors.target} hint={t('accounts.challengeTargetHint')}>
                  <input id={ids.target} className="input numeric" inputMode="decimal" value={rules.target} onChange={(event) => setRule('target')(event.target.value)} />
                </Field>
                <Field label={t('accounts.challengeDays')} htmlFor={ids.days} error={errors.days} hint={t('accounts.optional')}>
                  <input id={ids.days} className="input numeric" inputMode="numeric" value={rules.days} onChange={(event) => setRule('days')(event.target.value)} />
                </Field>
                <Field label={t('accounts.challengeDaily')} htmlFor={ids.daily} error={errors.daily}>
                  <input id={ids.daily} className="input numeric" inputMode="decimal" value={rules.daily} onChange={(event) => setRule('daily')(event.target.value)} />
                </Field>
                <Field label={t('accounts.challengeMax')} htmlFor={ids.maxLoss} error={errors.maxLoss}>
                  <input id={ids.maxLoss} className="input numeric" inputMode="decimal" value={rules.maxLoss} onChange={(event) => setRule('maxLoss')(event.target.value)} />
                </Field>
              </div>
              <Field label={t('accounts.challengeStart')} htmlFor={ids.start} error={errors.start}>
                <input id={ids.start} className="input" type="date" value={rules.start} onChange={(event) => setRule('start')(event.target.value)} />
              </Field>
            </>
          )}
        </fieldset>

        <fieldset className="fieldset">
          <legend className="field__label">{t('accounts.color')}</legend>
          <div className="color-picker">
            {TAG_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className="color-picker__swatch"
                style={{ background: color }}
                aria-pressed={color === colorHex}
                aria-label={color}
                onClick={() => setColorHex(color)}
              />
            ))}
          </div>
        </fieldset>
      </form>
    </Sheet>
  )
}

/** The challenge rules as the form's text fields. */
function challengeFields(rules: PropChallenge) {
  return {
    target: rules.profitTargetPct ?? '',
    daily: rules.dailyLossPct ?? '',
    maxLoss: rules.maxLossPct ?? '',
    days: rules.minTradingDays ? String(rules.minTradingDays) : '',
    start: rules.startDate,
  }
}

/** A second account on the free plan: what Pro gives instead of the form. */
function AccountLimit({ onClose }: { onClose: () => void }) {
  const { t } = useI18n()
  return (
    <Sheet open title={t('accounts.newTitle')} onClose={onClose}>
      <ProLock feature="multipleAccounts" onNavigate={onClose} />
    </Sheet>
  )
}
