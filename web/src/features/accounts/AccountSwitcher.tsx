import { ChevronDown } from 'lucide-react'
import { activeAccounts, useJournal } from '../../app/journal'
import { updateSettings, useSettings } from '../../app/settings'
import { useI18n } from '../../i18n/i18n'

/**
 * Picks the account the Today, Trades and Analytics tabs show. The choice is remembered.
 * With a single account it just shows that account's name.
 */
export function AccountSwitcher() {
  const { t } = useI18n()
  const { accounts } = useJournal()
  const { selectedAccount } = useSettings()
  const active = activeAccounts(accounts)

  if (active.length === 0) return null
  if (active.length === 1) {
    return <span className="account-pill account-pill--static">{active[0]!.name}</span>
  }

  const value = selectedAccount === 'all' || accounts.some((account) => account.id === selectedAccount) ? selectedAccount : 'all'
  return (
    <label className="account-pill">
      <span className="visually-hidden">{t('accounts.switcherLabel')}</span>
      <select value={value} onChange={(event) => updateSettings({ selectedAccount: event.target.value })}>
        <option value="all">{t('accounts.all')}</option>
        {active.map((account) => (
          <option key={account.id} value={account.id}>
            {account.isDemo ? `${account.name} · ${t('accounts.demoTag')}` : account.name}
          </option>
        ))}
      </select>
      <ChevronDown size={16} aria-hidden="true" />
    </label>
  )
}
