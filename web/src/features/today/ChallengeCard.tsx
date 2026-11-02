import { Trophy } from 'lucide-react'
import { activeAccounts, useJournal } from '../../app/journal'
import { challengeStatus } from '../../core/challenge'
import type { Account } from '../../core/models'
import { Card, LimitBar } from '../../design/components'
import { formatDate, formatMoney } from '../../i18n/format'
import { useI18n } from '../../i18n/i18n'
import { dayFromKey } from '../trades/tradeQueries'

/** Prop firm challenges of the accounts in view: the selected one, or every active one (SPEC 4.11). */
export function ChallengeCards({ selected }: { selected: Account | undefined }) {
  const { accounts } = useJournal()
  const inView = selected ? [selected] : activeAccounts(accounts)
  return (
    <>
      {inView
        .filter((account) => account.challenge)
        .map((account) => (
          <ChallengeCard key={account.id} account={account} />
        ))}
    </>
  )
}

function ChallengeCard({ account }: { account: Account }) {
  const { t, tp, locale } = useI18n()
  const { trades } = useJournal()
  const status = challengeStatus(account, trades, new Date())
  if (!status) return null
  const money = (amount: Parameters<typeof formatMoney>[0], signed = true) => formatMoney(amount, account.currency, locale, signed)
  const daysLeft = status.minTradingDays ? Math.max(status.minTradingDays - status.tradingDays, 0) : 0

  let message: string | undefined
  if (status.breach) message = t(`challenge.failed.${status.breach.rule}`, { date: formatDate(dayFromKey(status.breach.day), locale) })
  else if (status.state === 'passed') message = t('challenge.passed')
  else if (status.target?.reached && daysLeft > 0) message = tp('challenge.daysLeft', daysLeft)

  return (
    <Card className="challenge-card">
      <p className="caption challenge-card__label">
        <Trophy size={16} aria-hidden="true" />
        {t('challenge.title', { name: account.name })}
      </p>
      <p className="challenge-card__balance">
        <span className="numeric">{money(status.balance, false)}</span>
        <span className={`numeric ${status.profit.gt(0) ? 'profit' : status.profit.lt(0) ? 'loss' : ''}`}>{money(status.profit)}</span>
      </p>
      {message && (
        <p className={`challenge-card__state challenge-card__state--${status.state}`} role={status.state === 'failed' ? 'alert' : 'status'}>
          {message}
        </p>
      )}
      {status.target && (
        <LimitBar
          label={t('challenge.target')}
          level="ok"
          tone="progress"
          ratio={Math.max(status.target.ratio, 0)}
          value={t('limits.of', { used: money(status.profit), limit: money(status.target.amount, false) })}
        />
      )}
      {status.daily && (
        <LimitBar
          label={t('challenge.dailyLoss')}
          level={status.daily.level}
          ratio={status.daily.ratio}
          value={t('limits.of', { used: money(status.daily.used.times(-1)), limit: money(status.daily.limit, false) })}
        />
      )}
      {status.maxLoss && (
        <LimitBar
          label={t('challenge.maxLoss')}
          level={status.maxLoss.level}
          ratio={status.maxLoss.ratio}
          value={t('limits.of', { used: money(status.maxLoss.used.times(-1)), limit: money(status.maxLoss.limit, false) })}
        />
      )}
      <p className="caption">
        {status.minTradingDays
          ? t('challenge.daysOf', { count: String(status.tradingDays), min: String(status.minTradingDays) })
          : tp('challenge.days', status.tradingDays)}
      </p>
      <p className="caption">{t('challenge.note')}</p>
    </Card>
  )
}
