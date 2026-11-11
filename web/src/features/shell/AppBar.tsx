import { Bell, CalendarCheck, Check, Flame, MessageSquare, Monitor, Moon, Sun, TriangleAlert, type LucideIcon } from 'lucide-react'
import { useMemo } from 'react'
import { useAutoFlags, useJournal } from '../../app/journal'
import { routeHref, useRoute, type Route } from '../../app/router'
import { ACCENTS, updateSettings, useSettings, useWeekStart, type LanguageSetting, type ThemeSetting } from '../../app/settings'
import { useCloud } from '../../app/cloud'
import { effectiveLimits } from '../../core/limits'
import { realTrades } from '../../core/models'
import { markSeen, notices, unseenCount, type Notice, type NoticeKind } from '../../core/notices'
import { useI18n } from '../../i18n/i18n'
import { FeedbackForm } from '../feedback/FeedbackForm'
import { useAccess } from '../../app/entitlement'
import { canUse } from '../../core/entitlements'
import { Popover } from './Popover'
import { AccountSwitcher } from '../accounts/AccountSwitcher'

/** Screens whose numbers follow the picked account: the top bar shows the switcher on them. */
const ACCOUNT_ROUTES: Route['name'][] = ['today', 'trades', 'analytics', 'review']

const LANGUAGES: { value: LanguageSetting; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'ru', label: 'Русский' },
  { value: 'es', label: 'Español' },
]

const THEME_ICONS: Record<ThemeSetting, LucideIcon> = { system: Monitor, dark: Moon, light: Sun }

const NOTICE_LINKS: Record<NoticeKind, { route: Route; icon: LucideIcon }> = {
  limitReached: { route: { name: 'today' }, icon: TriangleAlert },
  limitWarning: { route: { name: 'today' }, icon: TriangleAlert },
  revenge: { route: { name: 'trades' }, icon: Flame },
  reviewDue: { route: { name: 'review' }, icon: CalendarCheck },
  checkIn: { route: { name: 'today' }, icon: Sun },
}

/**
 * The top-right bar on every screen (SPEC section 3): language and theme without a trip to
 * Profile, feedback, and the bell with what needs attention today.
 */
export function AppBar() {
  const { t, locale } = useI18n()
  const settings = useSettings()
  const { state } = useCloud()
  const route = useRoute()
  const ThemeIcon = THEME_ICONS[settings.theme]
  const today = new Intl.DateTimeFormat(locale, { weekday: 'long', month: 'short', day: 'numeric' }).format(new Date())

  const option = (selected: boolean, label: string, onSelect: () => void, close: () => void) => (
    <button
      key={label}
      type="button"
      role="radio"
      aria-checked={selected}
      className="popover__option"
      onClick={() => {
        onSelect()
        close()
      }}
    >
      <span>{label}</span>
      {selected && <Check size={16} aria-hidden="true" />}
    </button>
  )

  return (
    <div className="app-bar">
      <p className="app-bar__date">{today}</p>
      {ACCOUNT_ROUTES.includes(route.name) && (
        <div className="app-bar__account">
          <AccountSwitcher />
        </div>
      )}
      {/* Phones keep language, look and feedback here; wide screens have them in Profile. */}
      <div className="app-bar__extras">
      <Popover label={t('profile.language')} trigger={<span className="app-bar__code">{locale.toUpperCase()}</span>}>
        {(close) => (
          <div role="radiogroup" aria-label={t('profile.language')} className="popover__options">
            {option(settings.language === 'system', t('profile.system'), () => updateSettings({ language: 'system' }), close)}
            {LANGUAGES.map((item) => option(settings.language === item.value, item.label, () => updateSettings({ language: item.value }), close))}
          </div>
        )}
      </Popover>
      <Popover label={t('appearance.title')} trigger={<ThemeIcon size={18} aria-hidden="true" />}>
        {() => {
          const stay = () => {}
          return (
            <div className="popover__groups">
              <p className="label popover__heading">{t('profile.theme')}</p>
              <div role="radiogroup" aria-label={t('profile.theme')} className="popover__options">
                {option(settings.theme === 'system', t('profile.system'), () => updateSettings({ theme: 'system' }), stay)}
                {option(settings.theme === 'dark', t('profile.themeDark'), () => updateSettings({ theme: 'dark' }), stay)}
                {option(settings.theme === 'light', t('profile.themeLight'), () => updateSettings({ theme: 'light' }), stay)}
              </div>
              <p className="label popover__heading">{t('appearance.style')}</p>
              <div role="radiogroup" aria-label={t('appearance.style')} className="popover__options">
                {option(settings.style === 'soft', t('appearance.style.soft'), () => updateSettings({ style: 'soft' }), stay)}
                {option(settings.style === 'glow', t('appearance.style.glow'), () => updateSettings({ style: 'glow' }), stay)}
                {option(settings.style === 'flat', t('appearance.style.flat'), () => updateSettings({ style: 'flat' }), stay)}
                {option(settings.style === 'graphite', t('appearance.style.graphite'), () => updateSettings({ style: 'graphite' }), stay)}
              </div>
              <p className="label popover__heading">{t('appearance.accent')}</p>
              <AccentPicker />
            </div>
          )
        }}
      </Popover>
      {state.status !== 'unavailable' && (
        <Popover label={t('feedback.section')} trigger={<MessageSquare size={18} aria-hidden="true" />} className="popover--wide">
          {() => (
            <div className="popover__section">
              <p className="label">{t('feedback.section')}</p>
              <FeedbackForm />
            </div>
          )}
        </Popover>
      )}
      </div>
      <NoticeBell />
    </div>
  )
}

function NoticeBell() {
  const { t, tp } = useI18n()
  const { trades: stored, accounts, profile, reviews, checkins } = useJournal()
  const trades = useMemo(() => realTrades(stored, accounts), [stored, accounts])
  const autoFlags = useAutoFlags()
  const weekStart = useWeekStart()
  const seen = useSettings().seenNotices ?? []
  const access = useAccess()
  const reviewsOpen = canUse('weeklyReview', access)
  const list = useMemo(
    () => notices({ trades, profile: effectiveLimits(profile, accounts), reviews, checkins, autoFlags, now: new Date(), weekStart }).filter((notice) => reviewsOpen || notice.kind !== 'reviewDue'),
    [trades, profile, accounts, reviews, checkins, autoFlags, weekStart, reviewsOpen],
  )
  const unseen = unseenCount(seen, list)

  const text = (notice: Notice) => {
    switch (notice.kind) {
      case 'limitReached':
        return t('limits.reached')
      case 'limitWarning':
        return t('notices.limitWarning')
      case 'revenge':
        return tp('notices.revenge', notice.count ?? 1)
      case 'reviewDue':
        return t('today.reviewDue')
      case 'checkIn':
        return t('notices.checkIn')
    }
  }

  return (
    <Popover
      label={unseen ? t('notices.titleUnseen', { count: String(unseen) }) : t('notices.title')}
      trigger={
        <>
          <Bell size={18} aria-hidden="true" />
          {unseen > 0 && (
            <span className="app-bar__badge numeric" aria-hidden="true">
              {unseen}
            </span>
          )}
        </>
      }
      className="popover--wide"
      onClose={() => updateSettings({ seenNotices: markSeen(list) })}
    >
      {(close) => (
        <div className="popover__section">
          <p className="label">{t('notices.title')}</p>
          {list.length === 0 ? (
            <p className="secondary-text">{t('notices.empty')}</p>
          ) : (
            <ul className="notice-list">
              {list.map((notice) => {
                const { route, icon: Icon } = NOTICE_LINKS[notice.kind]
                const fresh = !seen.includes(notice.id)
                return (
                  <li key={notice.id}>
                    <a className={`notice${fresh ? ' notice--fresh' : ''} notice--${notice.kind}`} href={routeHref(route)} onClick={close}>
                      <Icon size={18} aria-hidden="true" />
                      <span>{text(notice)}</span>
                    </a>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </Popover>
  )
}

/** The accent colors as swatches; each is a radio named after its color. */
export function AccentPicker() {
  const { t } = useI18n()
  const { accent } = useSettings()
  return (
    <div role="radiogroup" aria-label={t('appearance.accent')} className="accent-picker">
      {ACCENTS.map((value) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={accent === value}
          aria-label={t(`appearance.accent.${value}`)}
          title={t(`appearance.accent.${value}`)}
          className={`accent-picker__swatch accent-picker__swatch--${value}`}
          onClick={() => updateSettings({ accent: value })}
        >
          {accent === value && <Check size={16} aria-hidden="true" />}
        </button>
      ))}
    </div>
  )
}
