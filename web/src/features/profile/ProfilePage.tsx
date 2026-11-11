import { CalendarCheck, ChevronRight, HandCoins, Sparkles, Download, FileSpreadsheet, FileUp, ShieldCheck, Smartphone, Tags, Trash2, Upload, Wallet } from 'lucide-react'
import { lazy, Suspense, useId, useRef, useState, type ChangeEvent } from 'react'
import { useFlaggedTrades, useJournal, useMistakeName, useStore } from '../../app/journal'
import { downloadCsv, tradesToCsv } from '../../core/export/csv'
import { navigate, routeHref } from '../../app/router'
import { updateSettings, useSettings, type LanguageSetting, type ThemeSetting, type WeekStartSetting } from '../../app/settings'
import { Button, Card, Field, LegalLinks, SectionHeader } from '../../design/components'
import { formatDate } from '../../i18n/format'
import { useI18n } from '../../i18n/i18n'
import { useCloud } from '../../app/cloud'
import { useInstall } from '../../app/install'
import { useAccess } from '../../app/entitlement'
import { canUse } from '../../core/entitlements'
import { CloudSection } from '../cloud/CloudSection'
import { TelegramSection } from './TelegramSection'
import { telegramShown } from '../../app/telegram'
import { pushAvailable } from '../../app/push'
import { PushSection } from './PushSection'
import { FeedbackSection } from '../feedback/FeedbackSection'
import { AppearanceGrid } from './AppearanceGrid'
import { PageHeader } from '../shell/PageHeader'
import { downloadBackup, parseBackup, serializeBackup } from './backup'

// The CSV importer loads only when opened.
const ImportSheet = lazy(() => import('../import/ImportSheet').then((module) => ({ default: module.ImportSheet })))

/** Settings, accounts and data management (SPEC section 4.10, web subset). */
export function ProfilePage() {
  const { t, tp, locale } = useI18n()
  const access = useAccess()
  const store = useStore()
  const { accounts, trades, rules, mistakes } = useJournal()
  const flaggedTrades = useFlaggedTrades()
  const mistakeName = useMistakeName()
  const settings = useSettings()
  const { state: cloudState } = useCloud()
  const install = useInstall()
  const fileInput = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState<string>()
  const [importOpen, setImportOpen] = useState(false)
  const ids = { language: useId(), theme: useId(), weekStart: useId() }

  const importBackup = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const data = parseBackup(await file.text())
      if (!window.confirm(tp('profile.importConfirm', data.trades.length))) return
      await store.importData(data)
      updateSettings({ selectedAccount: 'all' })
      setMessage(t('profile.importDone'))
    } catch {
      setMessage(t('profile.importFailed'))
    }
  }

  const deleteAll = async () => {
    if (!window.confirm(t('profile.deleteAllConfirm'))) return
    await store.deleteAll()
    updateSettings({ selectedAccount: 'all' })
    setMessage(t('profile.deleteAllDone'))
  }

  return (
    <>
      <PageHeader title={t('tab.profile')} />

      <SectionHeader title={t('profile.journalSection')} />
      <div className="list-card">
        <a className="nav-row" href={routeHref({ name: 'accounts' })}>
          <Wallet size={20} aria-hidden="true" />
          <span className="nav-row__label">{t('accounts.title')}</span>
          <span className="caption">{tp('profile.accountCount', accounts.length)}</span>
          <ChevronRight size={18} aria-hidden="true" className="secondary-text" />
        </a>
        <a className="nav-row" href={routeHref({ name: 'rules' })}>
          <ShieldCheck size={20} aria-hidden="true" />
          <span className="nav-row__label">{t('limits.title')}</span>
          <span className="caption">{tp('profile.ruleCount', rules.length)}</span>
          <ChevronRight size={18} aria-hidden="true" className="secondary-text" />
        </a>
        <a className="nav-row" href={routeHref({ name: 'tags' })}>
          <Tags size={20} aria-hidden="true" />
          <span className="nav-row__label">{t('tags.title')}</span>
          <ChevronRight size={18} aria-hidden="true" className="secondary-text" />
        </a>
        <a className="nav-row" href={routeHref({ name: 'review' })}>
          <CalendarCheck size={20} aria-hidden="true" />
          <span className="nav-row__label">{t('review.title')}</span>
          <ChevronRight size={18} aria-hidden="true" className="secondary-text" />
        </a>
        <a className="nav-row" href={routeHref({ name: 'partners' })}>
          <HandCoins size={20} aria-hidden="true" />
          <span className="nav-row__label">{t('partners.title')}</span>
          <ChevronRight size={18} aria-hidden="true" className="secondary-text" />
        </a>
      </div>

      {(install.state === 'prompt' || install.state === 'ios') && (
        <>
          <SectionHeader title={t('install.section')} />
          <Card className="form-stack">
            <p className="cloud-line">
              <Smartphone size={18} aria-hidden="true" />
              <span>{t(install.state === 'ios' ? 'install.iosHint' : 'install.hint')}</span>
            </p>
            {install.state === 'prompt' && (
              <Button variant="primary" onClick={() => void install.install()}>
                {t('install.button')}
              </Button>
            )}
          </Card>
        </>
      )}

      <SectionHeader title={t('profile.appearanceSection')} />
      <Card className="form-stack">
        <Field label={t('profile.language')} htmlFor={ids.language}>
          <select id={ids.language} className="input" value={settings.language} onChange={(event) => updateSettings({ language: event.target.value as LanguageSetting })}>
            <option value="system">{t('profile.system')}</option>
            <option value="en">English</option>
            <option value="ru">Русский</option>
            <option value="es">Español</option>
          </select>
        </Field>
        <Field label={t('profile.theme')} htmlFor={ids.theme}>
          <select id={ids.theme} className="input" value={settings.theme} onChange={(event) => updateSettings({ theme: event.target.value as ThemeSetting })}>
            <option value="system">{t('profile.system')}</option>
            <option value="dark">{t('profile.themeDark')}</option>
            <option value="light">{t('profile.themeLight')}</option>
          </select>
        </Field>
        <div className="field">
          <p className="field__label">{t('appearance.styleAndAccent')}</p>
          <AppearanceGrid />
        </div>
        <Field label={t('profile.weekStart')} htmlFor={ids.weekStart}>
          <select id={ids.weekStart} className="input" value={settings.weekStart} onChange={(event) => updateSettings({ weekStart: event.target.value as WeekStartSetting })}>
            <option value="auto">{t('profile.system')}</option>
            <option value="monday">{t('profile.monday')}</option>
            <option value="sunday">{t('profile.sunday')}</option>
          </select>
        </Field>
      </Card>

      {cloudState.status !== 'unavailable' && (
        <>
          <SectionHeader title={t('cloud.section')} />
          <CloudSection />
          {pushAvailable() && (
            <>
              <SectionHeader title={t('push.section')} />
              <PushSection />
            </>
          )}
          {telegramShown() && (
            <>
              <SectionHeader title="Telegram" />
              <TelegramSection />
            </>
          )}
        </>
      )}

      {access.gated && (
        <div className="list-card profile-pro">
          <a className="nav-row" href={routeHref({ name: 'pro' })}>
            <Sparkles size={20} aria-hidden="true" />
            <span className="nav-row__label">
              Tiltless Pro
              <span className="caption"> · {access.pro && access.until ? t('proPage.activeUntil', { date: formatDate(access.until, locale) }) : t('proPage.freePlan')}</span>
            </span>
            <ChevronRight size={18} aria-hidden="true" className="secondary-text" />
          </a>
        </div>
      )}

      <FeedbackSection className="profile-feedback" />

      <SectionHeader title={t('profile.dataSection')} />
      <Card className="form-stack">
        <p className="secondary-text">{t(cloudState.email ? 'profile.storageNoteSynced' : 'profile.storageNote')}</p>
        <div className="action-row action-row--wrap">
          <Button icon={<FileUp size={18} aria-hidden="true" />} onClick={() => (canUse('exchangeImport', access) ? setImportOpen(true) : navigate({ name: 'pro' }))}>
            {t('import.button')}
          </Button>
          <Button icon={<Download size={18} aria-hidden="true" />} disabled={trades.length === 0 && accounts.length === 0} onClick={() => downloadBackup(serializeBackup(store.exportData()))}>
            {t('profile.export')}
          </Button>
          <Button
            icon={<FileSpreadsheet size={18} aria-hidden="true" />}
            disabled={trades.length === 0}
            onClick={() => {
              // Mistakes as the journal shows them: the trader's tags plus automatic flags.
              const data = { ...store.exportData(), trades: flaggedTrades }
              downloadCsv(tradesToCsv(data, (id) => {
                const tag = mistakes.find((item) => item.id === id)
                return tag ? mistakeName(tag) : undefined
              }))
            }}
          >
            {t('profile.exportCsv')}
          </Button>
          <Button icon={<Upload size={18} aria-hidden="true" />} onClick={() => fileInput.current?.click()}>
            {t('profile.import')}
          </Button>
          <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={importBackup} />
          {importOpen && (
            <Suspense fallback={null}>
              <ImportSheet open onClose={() => setImportOpen(false)} onDone={setMessage} />
            </Suspense>
          )}
          <Button variant="danger" icon={<Trash2 size={18} aria-hidden="true" />} onClick={deleteAll}>
            {t('profile.deleteAll')}
          </Button>
        </div>
        {message && (
          <p className="caption" role="status">
            {message}
          </p>
        )}
      </Card>

      <p className="disclaimer caption">{t('profile.disclaimer')}</p>
      <LegalLinks />
    </>
  )
}
