import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { CloudController, CloudProvider } from './app/cloud'
import { AccessProvider } from './app/entitlement'
import { registerServiceWorker } from './app/install'
import { captureReferral } from './app/referral'
import { applyAppearance, currentSettings } from './app/settings'
import { JournalProvider } from './app/journal'
import { SheetProvider } from './app/sheets'
import { IndexedDbBackend } from './core/storage/indexedDbBackend'
import { JournalStore } from './core/storage/journalStore'
import { SyncingBackend } from './core/sync/cloudSync'
import './design/tokens.css'
import './design/base.css'
import './design/components.css'
import './design/glow.css'
import './design/soft.css'
import './design/graphite.css'
import './features/shell/shell.css'
import './features/analytics/analytics.css'
import './features/trades/trades.css'
import './features/onboarding/onboarding.css'
import { AppShell } from './features/shell/AppShell'
import { I18nProvider } from './i18n/i18n'

captureReferral()
// Before the first render, so the page never flashes in the default look.
applyAppearance(currentSettings())
const local = new IndexedDbBackend()
const backend = new SyncingBackend(local, local.syncState())
const store = new JournalStore(backend, local.imageBlobs())
const cloud = new CloudController(backend, store)
void store.load().then(() => cloud.start())
registerServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <JournalProvider store={store}>
      <CloudProvider value={cloud}>
        <I18nProvider>
          <AccessProvider>
            <SheetProvider>
              <AppShell />
            </SheetProvider>
          </AccessProvider>
        </I18nProvider>
      </CloudProvider>
    </JournalProvider>
  </StrictMode>,
)
