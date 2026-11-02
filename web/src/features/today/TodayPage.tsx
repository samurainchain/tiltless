import { Calculator, CalendarCheck, Flame, Plus, Share2, Sun, Wallet } from 'lucide-react'
import { useState } from 'react'
import { activeAccounts, useJournal, useMistakeName } from '../../app/journal'
import { routeHref } from '../../app/router'
import { useWeekStart } from '../../app/settings'
import { useSheets } from '../../app/sheets'
import { dayLimits, effectiveLimits, ruleStreak } from '../../core/limits'
import { defaultReviewWeek } from '../../core/review'
import { totalPnl } from '../../core/pnl'
import { realTrades } from '../../core/models'
import { closedTrades, localDayKey, mistakeOfTheWeek } from '../../core/stats'
import { Button, Card, EmptyState, LimitBar, PnLText, SectionHeader } from '../../design/components'
import { formatDay, formatMoney } from '../../i18n/format'
import { useI18n } from '../../i18n/i18n'
import { DayCheckInCard } from '../checkin/DayCheckInCard'
import { BriefCard } from './BriefCard'
import { ChallengeCards } from './ChallengeCard'
import { FocusCard } from './FocusCard'
import { SessionClock } from '../sessions/SessionClock'
import { useAccess } from '../../app/entitlement'
import { canUse } from '../../core/entitlements'
import { PageHeader } from '../shell/PageHeader'
import { RecapShareSheet } from '../share/RecapShareSheet'
import { dayKey, newestFirst, tradeDayKey, useVisibleTrades } from '../trades/tradeQueries'
import { TradeRow } from '../trades/TradeRow'

/** Today's PnL, limits, streak, the mistake of the week and today's trades (SPEC section 4.3). */
export function TodayPage() {
  const { t, tp, locale } = useI18n()
  const { accounts, mistakes, trades: storedTrades, profile, reviews } = useJournal()
  const allTrades = realTrades(storedTrades, accounts)
  const weekStart = useWeekStart()
  const { trades, currency, selected } = useVisibleTrades()
  const mistakeName = useMistakeName()
  const { newTrade, newAccount, openCalculator } = useSheets()
  const access = useAccess()
  const [sharing, setSharing] = useState(false)
  const today = new Date()
  const todayTrades = trades
    .filter((trade) => tradeDayKey(trade) === dayKey(today))
    .sort(newestFirst)
  const closedCount = todayTrades.filter((trade) => trade.exitPrice !== undefined).length
  const weekMistake = mistakeOfTheWeek(closedTrades(trades), mistakes, today)
  // Limits and the streak cover all accounts: tilt is about the trader's day.
  const limitProfile = effectiveLimits(profile, accounts)
  const limits = dayLimits(allTrades, limitProfile, today)
  const streak = ruleStreak(allTrades, limitProfile, today)
  const reviewWeek = localDayKey(defaultReviewWeek(today, weekStart))
  const reviewDue = today.getDay() === profile.reviewWeekday && !reviews.some((review) => review.weekStart === reviewWeek)

  const header = (
    <PageHeader
      title={t('tab.today')}
      subtitle={formatDay(today, locale)}
      showAccountSwitcher
      trailing={
        <>
          {trades.length > 0 && (
            <Button icon={<Share2 size={18} aria-hidden="true" />} onClick={() => setSharing(true)}>
              {t('recap.button')}
            </Button>
          )}
          <Button icon={<Calculator size={18} aria-hidden="true" />} onClick={openCalculator}>
            {t('calc.button')}
          </Button>
        </>
      }
    />
  )

  if (activeAccounts(accounts).length === 0) {
    return (
      <>
        {header}
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
      </>
    )
  }

  return (
    <>
      {header}
      <RecapShareSheet open={sharing} onClose={() => setSharing(false)} initialSpan="day" />
      <Card className="today-summary">
        <p className="caption">{t('today.pnlLabel')}</p>
        <PnLText amount={totalPnl(todayTrades)} currency={currency} size="hero" />
        <p className="secondary-text">{tp('today.tradeCount', closedCount)}</p>
        {streak > 0 && (
          <p className="streak">
            <Flame size={16} aria-hidden="true" />
            {tp('today.streak', streak)}
          </p>
        )}
      </Card>

      {closedCount === 0 && <BriefCard currency={currency} />}

      <SessionClock />

      <DayCheckInCard />

      {reviewDue && canUse('weeklyReview', access) && (
        <a className="card review-reminder" href={routeHref({ name: 'review' })}>
          <CalendarCheck size={20} aria-hidden="true" />
          <span>
            <strong>{t('today.reviewDue')}</strong>
            <span className="caption">{t('today.reviewDueHint')}</span>
          </span>
        </a>
      )}

      {(limits.loss || limits.trades) && (
        <Card className="limits-card">
          {limits.reached && (
            <p className="limit-reached" role="alert">
              {t('limits.reached')}
            </p>
          )}
          {limits.loss && (
            <LimitBar
              label={t('limits.dayLoss')}
              level={limits.loss.level}
              ratio={limits.loss.ratio}
              value={t('limits.of', { used: formatMoney(limits.loss.used.times(-1), currency, locale), limit: formatMoney(limits.loss.limit, currency, locale, false) })}
            />
          )}
          {limits.trades && (
            <LimitBar
              label={t('limits.dayTrades')}
              level={limits.trades.level}
              ratio={limits.trades.ratio}
              value={t('limits.of', { used: String(limits.trades.used), limit: String(limits.trades.limit) })}
            />
          )}
        </Card>
      )}

      <ChallengeCards selected={selected} />

      {canUse('weeklyReview', access) && <FocusCard currency={currency} />}

      {weekMistake && (
        <Card className="week-mistake">
          <p className="caption">{t('today.weekMistake')}</p>
          <p className="week-mistake__row">
            <span className="week-mistake__name">{mistakeName(weekMistake.tag)}</span>
            <span className="loss numeric">{formatMoney(weekMistake.cost.times(-1), currency, locale)}</span>
          </p>
          <p className="caption">{tp('today.weekMistakeTrades', weekMistake.tradeCount)}</p>
        </Card>
      )}

      {todayTrades.length === 0 ? (
        <EmptyState
          icon={<Sun size={28} />}
          title={t(trades.length > 0 ? 'today.noTradesTitle' : 'today.emptyTitle')}
          message={t(trades.length > 0 ? 'today.noTradesMessage' : 'today.emptyMessage')}
          action={
            <Button variant="primary" block icon={<Plus size={20} aria-hidden="true" />} onClick={newTrade}>
              {t('action.newTrade')}
            </Button>
          }
        />
      ) : (
        <>
          <SectionHeader title={t('today.tradesSection')} />
          <div className="list-card">
            {todayTrades.map((trade) => (
              <TradeRow key={trade.id} trade={trade} />
            ))}
          </div>
        </>
      )}
    </>
  )
}
