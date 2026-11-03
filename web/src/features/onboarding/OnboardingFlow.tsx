import { Bell, ChevronLeft } from 'lucide-react'
import { useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { useCloud } from '../../app/cloud'
import { useJournal, useStore } from '../../app/journal'
import { requestNotificationPermission } from '../../app/limitAlerts'
import { navigate } from '../../app/router'
import { updateSettings } from '../../app/settings'
import { ASSET_CLASSES, CURRENCIES, type AssetClass } from '../../core/models'
import {
  accountsFromAnswers,
  canFinish,
  GOALS,
  TRADE_FREQUENCIES,
  VENUE_NAMES,
  VENUES,
  WEAKNESSES,
  type OnboardingAnswers,
} from '../../core/onboarding'
import { Button, LegalLinks, Segmented } from '../../design/components'
import { useI18n, type Locale, type Translator } from '../../i18n/i18n'
import { SignInForm } from '../cloud/CloudSection'
import { parseBackup } from '../profile/backup'

/** True for a fresh journal: no onboarding yet and nothing logged. */
export function useNeedsOnboarding(): boolean {
  const { profile, accounts, trades, status } = useJournal()
  return status === 'ready' && !profile.onboarding && accounts.length === 0 && trades.length === 0
}

const STEPS = ['welcome', 'goal', 'markets', 'weaknesses', 'frequency', 'insight', 'notifications'] as const
type Step = (typeof STEPS)[number]

function accountNames(t: Translator['t']) {
  return {
    market: {
      cryptoSpot: t('onboarding.accountName.cryptoSpot'),
      cryptoPerp: t('onboarding.accountName.cryptoPerp'),
      stock: t('onboarding.accountName.stock'),
      futures: t('onboarding.accountName.futures'),
    } satisfies Record<AssetClass, string>,
    cryptoExchange: t('onboarding.accountName.cryptoExchange'),
    broker: t('onboarding.accountName.broker'),
  }
}

/** Seven one-idea screens before the first launch (SPEC section 4.1). */
export function OnboardingFlow() {
  const { t } = useI18n()
  const store = useStore()
  const [step, setStep] = useState<Step>('welcome')
  const [answers, setAnswers] = useState<OnboardingAnswers>({ markets: [], venues: [], weaknesses: [], currency: 'USDT' })
  const [finishing, setFinishing] = useState(false)
  const [importError, setImportError] = useState<string>()
  const backupInput = useRef<HTMLInputElement>(null)
  const { state: cloudState } = useCloud()
  const [signingIn, setSigningIn] = useState(false)
  const [finishError, setFinishError] = useState(false)

  const index = STEPS.indexOf(step)
  const go = (offset: number) => setStep(STEPS[Math.min(STEPS.length - 1, Math.max(0, index + offset))]!)
  const update = (patch: Partial<OnboardingAnswers>) => setAnswers((current) => ({ ...current, ...patch }))
  const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((value) => value !== item) : [...list, item])

  const canContinue: Record<Step, boolean> = {
    welcome: true,
    goal: answers.goal !== undefined,
    markets: answers.markets.length > 0,
    weaknesses: true,
    frequency: answers.tradesPerWeek !== undefined,
    insight: true,
    notifications: canFinish(answers),
  }

  const finish = async (allowNotifications: boolean) => {
    setFinishing(true)
    // Not awaited: some browsers (Brave, Chrome's quiet prompts) keep the request pending until
    // the trader answers a small icon in the address bar, and onboarding must not wait on it.
    if (allowNotifications) void requestNotificationPermission().catch(() => undefined)
    try {
      await store.completeOnboarding(answers, accountsFromAnswers(answers, accountNames(t)))
      navigate({ name: 'today' })
    } catch (error) {
      console.error('Finishing onboarding failed', error)
      setFinishError(true)
      setFinishing(false)
    }
  }

  const restore = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      await store.importData(parseBackup(await file.text()))
    } catch {
      setImportError(t('profile.importFailed'))
    }
  }

  return (
    <div className="onboarding">
      {step !== 'welcome' && (
        <header className="onboarding__top">
          <button type="button" className="icon-button" aria-label={t('onboarding.back')} onClick={() => go(-1)}>
            <ChevronLeft size={20} aria-hidden="true" />
          </button>
          <div
            className="onboarding__progress"
            role="progressbar"
            aria-label={t('onboarding.progress')}
            aria-valuemin={1}
            aria-valuemax={STEPS.length - 1}
            aria-valuenow={index}
          >
            <span style={{ width: `${(index / (STEPS.length - 1)) * 100}%` }} />
          </div>
        </header>
      )}

      <main className="onboarding__body">
        {step === 'welcome' && (
          <section className="onboarding__welcome">
            <LanguagePicker />
            <img src="/favicon.svg" alt="" width={64} height={64} />
            <h1>{t('onboarding.welcome.title')}</h1>
            <p className="secondary-text">{t('onboarding.welcome.text')}</p>
          </section>
        )}

        {step === 'goal' && (
          <Question title={t('onboarding.goal.title')}>
            {GOALS.map((goal) => (
              <Option key={goal} label={t(`onboarding.goal.${goal}`)} selected={answers.goal === goal} onClick={() => update({ goal })} />
            ))}
          </Question>
        )}

        {step === 'markets' && (
          <Question title={t('onboarding.markets.title')} hint={t('onboarding.multiple')}>
            {ASSET_CLASSES.map((market) => (
              <Option
                key={market}
                label={t(`onboarding.market.${market}`)}
                selected={answers.markets.includes(market)}
                onClick={() => update({ markets: toggle(answers.markets, market) })}
              />
            ))}
            <h2 className="onboarding__subtitle">{t('onboarding.venues.title')}</h2>
            <div className="chip-row">
              {VENUES.map((venue) => (
                <button
                  key={venue}
                  type="button"
                  className={`chip${answers.venues.includes(venue) ? ' chip--selected' : ''}`}
                  aria-pressed={answers.venues.includes(venue)}
                  onClick={() => update({ venues: toggle(answers.venues, venue) })}
                >
                  {venue === 'other' ? t('onboarding.venues.other') : VENUE_NAMES[venue]}
                </button>
              ))}
            </div>
          </Question>
        )}

        {step === 'weaknesses' && (
          <Question title={t('onboarding.weaknesses.title')} hint={t('onboarding.multiple')}>
            {WEAKNESSES.map((weakness) => (
              <Option
                key={weakness}
                label={t(`onboarding.weakness.${weakness}`)}
                selected={answers.weaknesses.includes(weakness)}
                onClick={() => update({ weaknesses: toggle(answers.weaknesses, weakness) })}
              />
            ))}
          </Question>
        )}

        {step === 'frequency' && (
          <Question title={t('onboarding.frequency.title')}>
            {TRADE_FREQUENCIES.map((frequency) => (
              <Option
                key={frequency}
                label={t('onboarding.frequency.option', { range: frequency })}
                selected={answers.tradesPerWeek === frequency}
                onClick={() => update({ tradesPerWeek: frequency })}
              />
            ))}
            <h2 className="onboarding__subtitle">{t('onboarding.currency.title')}</h2>
            <Segmented
              label={t('onboarding.currency.title')}
              value={answers.currency}
              onChange={(currency) => update({ currency })}
              options={CURRENCIES.map((currency) => ({ value: currency, label: currency }))}
            />
          </Question>
        )}

        {step === 'insight' && <Insight answers={answers} />}

        {step === 'notifications' && (
          <section className="onboarding__welcome">
            <div className="onboarding__icon" aria-hidden="true">
              <Bell size={32} />
            </div>
            <h1>{t('onboarding.notifications.title')}</h1>
            <p className="secondary-text">{t('onboarding.notifications.text')}</p>
          </section>
        )}
      </main>

      <footer className="onboarding__footer">
        {step === 'welcome' && (
          <>
            <Button variant="primary" block onClick={() => go(1)}>
              {t('onboarding.start')}
            </Button>
            {signingIn ? (
              <div className="onboarding__sign-in">
                <SignInForm compact />
              </div>
            ) : cloudState.status === 'signedOut' ? (
              <Button variant="plain" onClick={() => setSigningIn(true)}>
                {t('onboarding.signIn')}
              </Button>
            ) : cloudState.email ? (
              <p className="caption" role="status">
                {t(cloudState.status === 'synced' ? 'onboarding.cloudEmpty' : 'onboarding.syncing', { email: cloudState.email })}
              </p>
            ) : null}
            <div className="onboarding__links">
              <Button variant="plain" onClick={() => backupInput.current?.click()}>
                {t('onboarding.restore')}
              </Button>
              <Button variant="plain" onClick={() => void store.skipOnboarding()}>
                {t('onboarding.skip')}
              </Button>
            </div>
            <input ref={backupInput} type="file" accept="application/json,.json" hidden onChange={restore} />
            {importError && (
              <p className="caption loss" role="alert">
                {importError}
              </p>
            )}
            <p className="caption onboarding__disclaimer">{t('profile.disclaimer')}</p>
            <LegalLinks />
          </>
        )}
        {step !== 'welcome' && step !== 'notifications' && (
          <Button variant="primary" block disabled={!canContinue[step]} onClick={() => go(1)}>
            {t('onboarding.next')}
          </Button>
        )}
        {step === 'notifications' && (
          <>
            <Button variant="primary" block disabled={finishing || !canContinue.notifications} onClick={() => void finish(true)}>
              {t('onboarding.notifications.allow')}
            </Button>
            <Button variant="plain" disabled={finishing || !canContinue.notifications} onClick={() => void finish(false)}>
              {t('onboarding.notifications.later')}
            </Button>
            {finishError && (
              <p className="caption field__error" role="alert">
                {t('onboarding.finishFailed')}
              </p>
            )}
          </>
        )}
      </footer>
    </div>
  )
}

/** Each language named in itself, so a visitor finds theirs whatever the page shows now. */
const LANGUAGES: readonly { value: Locale; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'ru', label: 'Русский' },
  { value: 'es', label: 'Español' },
]

/** The language, chosen before the questions; it starts as the browser's and is kept in settings. */
function LanguagePicker() {
  const { t, locale } = useI18n()
  return (
    <div className="onboarding__language">
      <Segmented label={t('profile.language')} value={locale} options={LANGUAGES} onChange={(language) => updateSettings({ language })} />
    </div>
  )
}

function Question({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="onboarding__question">
      <h1>{title}</h1>
      {hint && <p className="caption">{hint}</p>}
      <div className="onboarding__options">{children}</div>
    </section>
  )
}

function Option({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button type="button" className="onboarding__option" aria-pressed={selected} onClick={onClick}>
      {label}
    </button>
  )
}

/** "Traders with your profile most often lose on…" plus an example cost-of-mistakes card. */
function Insight({ answers }: { answers: OnboardingAnswers }) {
  const { t } = useI18n()
  const shown = answers.weaknesses.length > 0 ? answers.weaknesses : (['fomo', 'revengeTrading', 'heldPastStop'] as const)
  // Illustrative only: decreasing shares of an imaginary month, never real numbers.
  const shares = [100, 72, 51, 38, 27, 19]
  const accounts = accountsFromAnswers(answers, accountNames(t))

  return (
    <section className="onboarding__question">
      <h1>{t('onboarding.insight.title')}</h1>
      <ul className="onboarding__weaknesses">
        {shown.map((weakness) => (
          <li key={weakness}>{t(`mistake.${weakness}`)}</li>
        ))}
      </ul>
      <div className="card onboarding__example" aria-label={t('onboarding.insight.exampleLabel')}>
        <p className="caption">{t('onboarding.insight.example')}</p>
        {shown.map((weakness, position) => (
          <div key={weakness} className="onboarding__example-row">
            <span>{t(`mistake.${weakness}`)}</span>
            <span className="onboarding__example-bar" aria-hidden="true">
              <span style={{ width: `${shares[position] ?? 15}%`, animationDelay: `${position * 120}ms` }} />
            </span>
          </div>
        ))}
        <p className="caption">{t('onboarding.insight.exampleNote')}</p>
      </div>
      {accounts.length > 0 && (
        <div className="onboarding__accounts">
          <p className="caption">{t('onboarding.insight.accounts')}</p>
          <ul>
            {accounts.map((account) => (
              <li key={account.name}>{account.name}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
