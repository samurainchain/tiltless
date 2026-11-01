import { ChartColumn, CircleUser, ListChecks, Plus, Sun, type LucideIcon } from 'lucide-react'
import { lazy, Suspense, useEffect, useState } from 'react'
import { useJournal } from '../../app/journal'
import { useLimitAlerts } from '../../app/limitAlerts'
import { useReferralClaim } from '../../app/referral'
import { routeHref, useRoute, type Route } from '../../app/router'
import { applyAppearance, useSettings } from '../../app/settings'
import { useSheets } from '../../app/sheets'
import { useI18n } from '../../i18n/i18n'
import type { MessageKey } from '../../i18n/messages/en'
import { AccountSheet } from '../accounts/AccountSheet'
import { AccountsPage } from '../accounts/AccountsPage'
import { OnboardingFlow, useNeedsOnboarding } from '../onboarding/OnboardingFlow'
import { PositionSizeSheet } from '../calculator/PositionSizeSheet'
import { TradeEntrySheet } from '../entry/TradeEntrySheet'
import { ProfilePage } from '../profile/ProfilePage'
import { RulesPage } from '../rules/RulesPage'
import { TagsPage } from '../tags/TagsPage'
import { TodayPage } from '../today/TodayPage'
import { TradeDetailPage } from '../trades/TradeDetailPage'
import { TradesPage } from '../trades/TradesPage'
import { AppBar } from './AppBar'

// Heavier screens load when first opened, keeping the first download small; the service worker
// still caches them for offline use.
const AnalyticsPage = lazy(() => import('../analytics/AnalyticsPage').then((module) => ({ default: module.AnalyticsPage })))
const ProPage = lazy(() => import('../billing/ProPage').then((module) => ({ default: module.ProPage })))
const PartnersPage = lazy(() => import('../partners/PartnersPage').then((module) => ({ default: module.PartnersPage })))
const WeeklyReviewPage = lazy(() => import('../review/WeeklyReviewPage').then((module) => ({ default: module.WeeklyReviewPage })))
const LandingPage = lazy(() => import('../landing/LandingPage').then((module) => ({ default: module.LandingPage })))

const STARTED_KEY = 'tiltless.started'

/**
 * A new visitor who opens the bare address (from a bio, an ad or a partner's link) sees the
 * landing page before onboarding. A link into the app (#/…), a sign-in link (?code=…) or a
 * visitor who already pressed "Start" in this tab goes straight on. Read when the app loads,
 * before the sign-in code is taken off the address.
 */
function landingWanted(): boolean {
  try {
    if (sessionStorage.getItem(STARTED_KEY)) return false
  } catch {
    // Storage blocked: show the landing page; "Start" still works for this visit.
  }
  const url = new URL(window.location.href)
  const hash = url.hash.replace(/^#\/?/, '')
  return hash === '' && !['code', 'error', 'error_description'].some((name) => url.searchParams.has(name))
}

const LANDING_ON_ARRIVAL = landingWanted()

interface Tab {
  route: Route['name']
  label: MessageKey
  icon: LucideIcon
  /** Child routes that keep this tab highlighted. */
  matches: Route['name'][]
}

const TABS: Tab[] = [
  { route: 'today', label: 'tab.today', icon: Sun, matches: ['today'] },
  { route: 'trades', label: 'tab.trades', icon: ListChecks, matches: ['trades', 'trade'] },
  { route: 'analytics', label: 'tab.analytics', icon: ChartColumn, matches: ['analytics'] },
  { route: 'profile', label: 'tab.profile', icon: CircleUser, matches: ['profile', 'accounts', 'rules', 'review', 'tags', 'partners', 'pro'] },
]

/**
 * Four tabs and a center "+" that opens trade entry (SPEC section 3): a bottom bar on
 * phones, a sidebar on wide screens.
 */
export function AppShell() {
  const { t } = useI18n()
  const route = useRoute()
  const { status } = useJournal()
  const { newTrade } = useSheets()
  useThemeAttribute()
  useLimitAlerts()
  useReferralClaim()
  const needsOnboarding = useNeedsOnboarding()
  const [landing, setLanding] = useState(LANDING_ON_ARRIVAL)

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [route.name])

  // Name the page after the screen, so screen readers announce where navigation went.
  useEffect(() => {
    // The landing page names itself.
    if (document.querySelector('.landing')) return
    const heading = document.querySelector('.content h1')?.textContent
    document.title = heading ? `${heading} — Tiltless` : 'Tiltless'
  })

  if (needsOnboarding && landing) {
    const start = () => {
      try {
        sessionStorage.setItem(STARTED_KEY, '1')
      } catch {
        // Not remembered: a reload shows the landing page again.
      }
      setLanding(false)
      window.scrollTo(0, 0)
    }
    return (
      <Suspense fallback={null}>
        <LandingPage onStart={start} />
      </Suspense>
    )
  }
  if (needsOnboarding) return <OnboardingFlow />

  const tabLink = (tab: Tab) => {
    const Icon = tab.icon
    const current = tab.matches.includes(route.name)
    return (
      <a key={tab.route} className="nav-link" href={routeHref({ name: tab.route } as Route)} aria-current={current ? 'page' : undefined}>
        <Icon size={22} aria-hidden="true" />
        <span>{t(tab.label)}</span>
      </a>
    )
  }

  const addButton = (
    <button type="button" className="nav-add" onClick={newTrade}>
      <Plus size={24} aria-hidden="true" />
      <span>{t('action.newTrade')}</span>
    </button>
  )

  return (
    <div className="shell">
      <nav className="sidebar" aria-label={t('nav.label')}>
        <div className="sidebar__brand">
          <img src="./favicon.svg" alt="" width={28} height={28} />
          <span>Tiltless</span>
        </div>
        {addButton}
        {TABS.map(tabLink)}
      </nav>

      <main className="content">
        {status === 'loading' && <p className="caption loading">{t('common.loading')}</p>}
        {status === 'error' && (
          <p className="caption loading" role="alert">
            {t('common.loadError')}
          </p>
        )}
        {status === 'ready' && <AppBar />}
        {status === 'ready' && (
          <Suspense fallback={null}>
            <Page route={route} />
          </Suspense>
        )}
      </main>

      <nav className="tabbar" aria-label={t('nav.label')}>
        {TABS.slice(0, 2).map(tabLink)}
        {addButton}
        {TABS.slice(2).map(tabLink)}
      </nav>

      <TradeEntrySheet />
      <AccountSheet />
      <PositionSizeSheet />
    </div>
  )
}

function Page({ route }: { route: Route }) {
  switch (route.name) {
    case 'today':
      return <TodayPage />
    case 'trades':
      return <TradesPage />
    case 'trade':
      return <TradeDetailPage id={route.id} />
    case 'analytics':
      return <AnalyticsPage />
    case 'profile':
      return <ProfilePage />
    case 'accounts':
      return <AccountsPage />
    case 'partners':
      return <PartnersPage />
    case 'pro':
      return <ProPage />
    case 'rules':
      return <RulesPage />
    case 'tags':
      return <TagsPage />
    case 'review':
      return <WeeklyReviewPage key={route.week ?? 'current'} week={route.week} />
  }
}

/** Mirrors the theme setting onto <html data-theme>; "system" removes it so CSS follows the OS. */
function useThemeAttribute() {
  const { theme, style, accent } = useSettings()
  useEffect(() => applyAppearance({ theme, style, accent }), [theme, style, accent])
}
