import { ExternalLink } from 'lucide-react'
import { useEconCalendar } from '../../app/econCalendar'
import { regionOf, upcoming, type EconEvent } from '../../core/econCalendar'
import { intlLocale } from '../../i18n/format'
import { useI18n } from '../../i18n/i18n'
import './calendar.css'

/**
 * The week's high-impact events (SPEC section 4.7): rate decisions, inflation, jobs reports.
 * From the Forex Factory weekly feed through the econ-calendar function; times in the trader's zone.
 */
export function EconomicCalendar() {
  const { t, locale } = useI18n()
  const calendar = useEconCalendar()
  const now = new Date()

  if (calendar === undefined) {
    return (
      <p className="caption econ__status" role="status">
        {t('calendar.loading')}
      </p>
    )
  }
  if (calendar === null) return <p className="secondary-text econ__status">{t('calendar.error')}</p>

  const events = upcoming(calendar.events, now)
  const time = new Intl.DateTimeFormat(intlLocale(locale), { hour: '2-digit', minute: '2-digit' })
  return (
    <div className="econ">
      <div className="econ__head">
        <p className="caption">{t('calendar.subtitle')}</p>
        {calendar.updatedAt && <span className="econ__updated caption">{t('calendar.updated', { time: time.format(calendar.updatedAt) })}</span>}
      </div>
      {events.length === 0 ? (
        <p className="secondary-text">{t('calendar.empty')}</p>
      ) : (
        <ul className="econ__list">
          {events.map((event) => (
            <EventRow key={`${event.at.getTime()}-${event.country}-${event.title}`} event={event} past={event.at < now} />
          ))}
        </ul>
      )}
      <p className="caption econ__footer">
        <span>{t('calendar.source')}</span>
        <a href="https://www.forexfactory.com/calendar" target="_blank" rel="noopener noreferrer nofollow">
          Forex Factory <ExternalLink size={12} aria-hidden="true" />
        </a>
      </p>
    </div>
  )
}

function EventRow({ event, past }: { event: EconEvent; past: boolean }) {
  const { t, locale } = useI18n()
  const intl = intlLocale(locale)
  const region = regionOf(event.country)
  const country = region ? (new Intl.DisplayNames([intl], { type: 'region' }).of(region) ?? event.country) : t('calendar.allCountries')
  const day = new Intl.DateTimeFormat(intl, { weekday: 'short', day: 'numeric', month: 'short' }).format(event.at)
  const hour = new Intl.DateTimeFormat(intl, { hour: '2-digit', minute: '2-digit' }).format(event.at)
  const numbers = [event.forecast && t('calendar.forecast', { value: event.forecast }), event.previous && t('calendar.previous', { value: event.previous })].filter(Boolean)

  return (
    <li className={past ? 'econ__event econ__event--past' : 'econ__event'}>
      <span className="econ__region" title={event.country}>
        {region ?? event.country}
      </span>
      <span className="econ__when">
        <span>{day}</span>
        <span className="caption numeric">{hour}</span>
      </span>
      <span className="econ__what">
        <strong>{event.title}</strong>
        <span className="caption">{numbers.length ? `${country} · ${numbers.join(' · ')}` : country}</span>
      </span>
      <span className="econ__impact" role="img" aria-label={t('calendar.highImpact')}>
        <span />
        <span />
        <span />
      </span>
    </li>
  )
}
