import { CalendarClock, History, Landmark, Newspaper, ScrollText, Timer } from 'lucide-react'
import type { ReactNode } from 'react'
import { useFlaggedTrades, useJournal, useMistakeName } from '../../app/journal'
import { useEconCalendar } from '../../app/econCalendar'
import { briefIsEmpty, morningBrief } from '../../core/brief'
import { eventsOnDay, regionOf } from '../../core/econCalendar'
import { realTrades, type Currency } from '../../core/models'
import { Card } from '../../design/components'
import { formatMoney, formatTime, intlLocale } from '../../i18n/format'
import { useI18n } from '../../i18n/i18n'
import { dayFromKey } from '../trades/tradeQueries'

/**
 * What to keep in mind before the first trade of the day (SPEC section 4.3): the next Fed
 * decision, the last trading day, a losing weekday or hour, and a rule. Real accounts only.
 */
export function BriefCard({ currency }: { currency: Currency }) {
  const { t, tp, locale } = useI18n()
  const { accounts, mistakes, rules } = useJournal()
  const trades = realTrades(useFlaggedTrades(), accounts)
  const mistakeName = useMistakeName()
  const now = new Date()
  const brief = morningBrief(trades, mistakes, rules, now)
  const calendar = useEconCalendar()
  // Today's high-impact releases still ahead (or within the hour); with the calendar loaded they
  // replace the built-in list of Fed decisions, which the calendar also carries.
  const releases = calendar ? eventsOnDay(calendar.events, now).filter((event) => event.at.getTime() >= now.getTime() - 3_600_000) : []
  if (calendar) brief.fed = undefined
  if (briefIsEmpty(brief) && releases.length === 0) return null

  const intl = intlLocale(locale)
  const money = (amount: Parameters<typeof formatMoney>[0]) => formatMoney(amount, currency, locale)
  const hour = (value: number) => new Intl.DateTimeFormat(intl, { hour: 'numeric', minute: '2-digit' }).format(new Date(2026, 0, 1, value))

  return (
    <Card className="brief-card">
      <p className="caption">{t('brief.title')}</p>
      <ul className="brief-card__list">
        {releases.length > 0 && (
          <Line icon={<Newspaper size={18} />}>
            {t('brief.releases', {
              list: releases
                .slice(0, 3)
                .map((event) => `${formatTime(event.at.toISOString(), locale)} ${event.title} (${regionOf(event.country) ?? event.country})`)
                .join(', '),
            })}
            {releases.length > 3 && <> {t('brief.releasesMore', { count: String(releases.length - 3) })}</>}
          </Line>
        )}
        {brief.fed && (
          <Line icon={<Landmark size={18} />}>
            {brief.fed.today
              ? t('brief.fedToday', { time: formatTime(brief.fed.at.toISOString(), locale) })
              : t('brief.fedNext', {
                  date: new Intl.DateTimeFormat(intl, { weekday: 'long', day: 'numeric', month: 'short' }).format(brief.fed.at),
                  time: formatTime(brief.fed.at.toISOString(), locale),
                })}
          </Line>
        )}
        {brief.lastDay && (
          <Line icon={<History size={18} />}>
            {tp('brief.lastDay', brief.lastDay.count, {
              date: new Intl.DateTimeFormat(intl, { weekday: 'long', day: 'numeric', month: 'short' }).format(dayFromKey(brief.lastDay.day)),
              pnl: money(brief.lastDay.pnl),
            })}
            {brief.lastDay.topMistake && (
              <> {t('brief.lastDayMistake', { name: mistakeName(brief.lastDay.topMistake.tag), cost: money(brief.lastDay.topMistake.cost.times(-1)) })}</>
            )}
          </Line>
        )}
        {brief.weekday && (
          <Line icon={<CalendarClock size={18} />}>
            {t('brief.weekday', {
              weekday: new Intl.DateTimeFormat(intl, { weekday: 'long' }).format(now),
              pnl: money(brief.weekday.pnl),
              count: String(brief.weekday.count),
            })}
          </Line>
        )}
        {brief.hour && (
          <Line icon={<Timer size={18} />}>
            {t('brief.hour', { from: hour(brief.hour.key), to: hour((brief.hour.key + 1) % 24), pnl: money(brief.hour.pnl), count: String(brief.hour.count) })}
          </Line>
        )}
        {brief.rule && (
          <Line icon={<ScrollText size={18} />}>
            <span className="brief-card__rule-label">{t('brief.rule')}</span> {brief.rule.text}
          </Line>
        )}
      </ul>
    </Card>
  )
}

function Line({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="brief-card__line">
      <span className="brief-card__icon" aria-hidden="true">
        {icon}
      </span>
      <span>{children}</span>
    </li>
  )
}
