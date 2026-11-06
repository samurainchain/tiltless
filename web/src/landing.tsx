import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { captureReferral } from './app/referralLink'
import { applyAppearance, currentSettings } from './app/settings'
import './design/tokens.css'
import './design/base.css'
import './design/components.css'
import './design/glow.css'
import './design/soft.css'
import { LandingPage } from './features/landing/LandingPage'
import { I18nProvider } from './i18n/i18n'

// The site's front page, tiltless.xyz (SPEC section 4.0). The journal itself lives at /app/.

/** Where the journal opens. */
const APP_PATH = '/app/'

/**
 * Addresses that belong to the journal arrive here too: links from before the journal moved
 * (tiltless.xyz/#/today), sign-in links that come back with ?code=…, and the app installed on a
 * home screen before the move, which still opens the front page. They go on to /app/ with their
 * query and route.
 */
function journalAddress(): string | undefined {
  const url = new URL(window.location.href)
  const route = url.hash.replace(/^#\/?/, '')
  const signIn = ['code', 'error', 'error_description'].some((name) => url.searchParams.has(name)) || /error_description=/.test(url.hash)
  const installed = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
  if (route === '' && !signIn && !installed) return undefined
  return `${APP_PATH}${url.search}${route === '' && installed ? '#/today' : url.hash}`
}

const target = journalAddress()
if (target) {
  window.location.replace(target)
} else {
  // A partner's link (?ref=…) is kept for when the visitor signs up in the journal.
  captureReferral()
  applyAppearance(currentSettings())
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <I18nProvider>
        <LandingPage onStart={() => window.location.assign(APP_PATH)} />
      </I18nProvider>
    </StrictMode>,
  )
}
