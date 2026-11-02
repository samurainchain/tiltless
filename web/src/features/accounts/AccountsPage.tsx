import { Archive, ArchiveRestore, ArrowDown, ArrowUp, ChevronLeft, Pencil, Plus, Trash2, Wallet } from 'lucide-react'
import { useJournal, useStore } from '../../app/journal'
import { routeHref } from '../../app/router'
import { useSheets } from '../../app/sheets'
import type { Account } from '../../core/models'
import { Button, EmptyState } from '../../design/components'
import { useI18n } from '../../i18n/i18n'
import { PageHeader } from '../shell/PageHeader'

/** Account list: create, edit, archive, reorder, delete with trades (SPEC section 4.11). */
export function AccountsPage() {
  const { t, tp } = useI18n()
  const store = useStore()
  const { accounts, trades } = useJournal()
  const { newAccount, editAccount } = useSheets()

  const move = (index: number, offset: -1 | 1) => {
    const ids = accounts.map((account) => account.id)
    const target = index + offset
    if (target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target]!, ids[index]!]
    void store.reorderAccounts(ids)
  }

  const remove = (account: Account, tradeCount: number) => {
    const message = tradeCount > 0 ? tp('accounts.deleteWithTradesConfirm', tradeCount, { name: account.name }) : t('accounts.deleteConfirm', { name: account.name })
    if (window.confirm(message)) void store.deleteAccount(account.id)
  }

  const back = (
    <a className="back-link" href={routeHref({ name: 'profile' })}>
      <ChevronLeft size={20} aria-hidden="true" />
      {t('tab.profile')}
    </a>
  )

  return (
    <>
      <PageHeader
        title={t('accounts.title')}
        leading={back}
        trailing={
          accounts.length > 0 && (
            <Button variant="primary" icon={<Plus size={18} aria-hidden="true" />} onClick={newAccount}>
              {t('accounts.add')}
            </Button>
          )
        }
      />
      {accounts.length === 0 ? (
        <EmptyState
          icon={<Wallet size={28} />}
          title={t('today.noAccountTitle')}
          message={t('today.noAccountMessage')}
          action={
            <Button variant="primary" block icon={<Plus size={20} aria-hidden="true" />} onClick={newAccount}>
              {t('accounts.create')}
            </Button>
          }
        />
      ) : (
        <ul className="list-card account-list">
          {accounts.map((account, index) => {
            const tradeCount = trades.filter((trade) => trade.accountId === account.id).length
            return (
              <li key={account.id} className={`account-item${account.isArchived ? ' account-item--archived' : ''}`}>
                <span className="account-item__color" style={{ background: account.colorHex }} aria-hidden="true" />
                <div className="account-item__info">
                  <p className="account-item__name">
                    {account.name}
                    {account.isArchived && <span className="caption"> · {t('accounts.archived')}</span>}
                  </p>
                  <p className="caption">
                    {[account.isDemo ? t('accounts.demoTag') : '', t(`market.${account.assetClass}`), account.venue, account.currency, tp('accounts.tradeCount', tradeCount)].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <div className="account-item__actions">
                  <button type="button" className="icon-button" aria-label={t('accounts.moveUp')} disabled={index === 0} onClick={() => move(index, -1)}>
                    <ArrowUp size={18} aria-hidden="true" />
                  </button>
                  <button type="button" className="icon-button" aria-label={t('accounts.moveDown')} disabled={index === accounts.length - 1} onClick={() => move(index, 1)}>
                    <ArrowDown size={18} aria-hidden="true" />
                  </button>
                  <button type="button" className="icon-button" aria-label={t('action.edit')} onClick={() => editAccount(account.id)}>
                    <Pencil size={18} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={account.isArchived ? t('accounts.unarchive') : t('accounts.archive')}
                    onClick={() => void store.saveAccount({ ...account, isArchived: !account.isArchived })}
                  >
                    {account.isArchived ? <ArchiveRestore size={18} aria-hidden="true" /> : <Archive size={18} aria-hidden="true" />}
                  </button>
                  <button type="button" className="icon-button icon-button--danger" aria-label={t('action.delete')} onClick={() => remove(account, tradeCount)}>
                    <Trash2 size={18} aria-hidden="true" />
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
