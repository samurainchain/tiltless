import Big from 'big.js'
import { ArrowRight, Bitcoin, Camera, ChartColumn, Check, ListChecks, Scale, ShieldCheck, Sparkles, Sprout, Timer, Trophy } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { DEFAULT_CRYPTO_PRICES, fetchCryptoPrices } from '../../app/billing'
import { updateSettings } from '../../app/settings'
import { launchOfferOn, LAUNCH_OFFER_ENDS, trialDays } from '../../core/entitlements'
import { Button, LegalLinks } from '../../design/components'
import { formatMoney } from '../../i18n/format'
import { LOCALES, useI18n, type Locale } from '../../i18n/i18n'
import type { MessageKey } from '../../i18n/messages/en'
import './landing.css'

// What a new visitor sees at tiltless.xyz before onboarding (SPEC section 4.1): what Tiltless
// does, how it differs, what it costs. Every amount comes from the demo month the reels show
// and is labelled as demo; nothing here is a promise of results.

const LANGUAGE_NAMES: Record<Locale, string> = { es: 'ES', en: 'EN', ru: 'RU' }

/** The demo month's costliest mistakes (the same numbers as the app's demo journal). */
const DEMO_COSTS: { key: MessageKey; cost: string }[] = [
  { key: 'mistake.badHour', cost: '332.50' },
  { key: 'mistake.heldPastStop', cost: '280.00' },
  { key: 'mistake.fomo', cost: '260.00' },
  { key: 'mistake.revengeTrading', cost: '182.50' },
]

const DEMO_EMOTIONS: { key: MessageKey; pnl: string }[] = [
  { key: 'emotion.anger', pnl: '-680' },
  { key: 'emotion.fomo', pnl: '-390' },
  { key: 'emotion.confident', pnl: '710' },
  { key: 'emotion.calm', pnl: '885' },
]

const AUTO_FLAGS: MessageKey[] = ['mistake.revengeTrading', 'mistake.noStop', 'mistake.heldPastStop', 'mistake.badHour', 'mistake.overtrading', 'mistake.highLeverage']
const EXCHANGES = ['Binance', 'Bybit', 'OKX', 'BingX', 'TradingView']
const FAQ = ['data', 'api', 'markets', 'prop', 'pay', 'after', 'iphone'] as const

export function LandingPage({ onStart }: { onStart: () => void }) {
  const { t, locale } = useI18n()
  const [prices, setPrices] = useState<{ monthly: string; annual: string }>(DEFAULT_CRYPTO_PRICES)
  const now = new Date()
  const offer = launchOfferOn(now)
  const days = trialDays(now)
  const money = (amount: string, signed = true) => formatMoney(new Big(amount), 'USD', locale, signed)
  const offerDate = new Intl.DateTimeFormat(locale === 'es' ? 'es-MX' : locale, { day: 'numeric', month: 'long', timeZone: 'America/Mexico_City' }).format(
    new Date(LAUNCH_OFFER_ENDS.getTime() - 24 * 3600_000),
  )

  useEffect(() => {
    document.title = t('landing.pageTitle')
    let current = true
    fetchCryptoPrices().then(
      (loaded) => current && setPrices({ monthly: loaded.monthly, annual: loaded.annual }),
      () => undefined,
    )
    return () => {
      current = false
    }
  }, [t])

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  const start = (
    <Button variant="primary" icon={<ArrowRight size={18} aria-hidden="true" />} onClick={onStart}>
      {t('landing.cta')}
    </Button>
  )
  const largest = Number(DEMO_COSTS[0]!.cost)

  return (
    <div className="landing">
      <header className="landing__bar">
        <a className="landing__brand" href="/" aria-label="Tiltless">
          <img src="/favicon.svg" alt="" width={28} height={28} />
          <span>Tiltless</span>
        </a>
        <nav className="landing__nav" aria-label={t('landing.navLabel')}>
          <button type="button" onClick={() => scrollTo('landing-features')}>
            {t('landing.nav.features')}
          </button>
          <button type="button" onClick={() => scrollTo('landing-pricing')}>
            {t('landing.nav.pricing')}
          </button>
          <button type="button" onClick={() => scrollTo('landing-faq')}>
            {t('landing.nav.faq')}
          </button>
        </nav>
        <button type="button" className="landing__signin" onClick={onStart}>
          {t('landing.signIn')}
        </button>
        <div className="landing__languages" role="group" aria-label={t('profile.language')}>
          {LOCALES.map((code) => (
            <button key={code} type="button" lang={code} aria-pressed={code === locale} onClick={() => updateSettings({ language: code })}>
              {LANGUAGE_NAMES[code]}
            </button>
          ))}
        </div>
      </header>

      <main>
        <section className="landing__hero">
          <div className="landing__hero-text">
            {offer && <p className="landing__badge">{t('landing.offerBadge', { days, date: offerDate })}</p>}
            <h1>{t('landing.title')}</h1>
            <p className="landing__lead">{t('landing.lead')}</p>
            <div className="landing__actions">
              {start}
              <Button variant="secondary" onClick={() => scrollTo('landing-how')}>
                {t('landing.howLink')}
              </Button>
            </div>
            <p className="caption">{t('landing.reassure')}</p>
          </div>

          <div className="landing__hero-visual" aria-hidden="true">
            <div className="landing__mock card">
              <p className="landing__mock-label">
                {t('landing.mock.costTitle')} <span>· {t('landing.demo')}</span>
              </p>
              {DEMO_COSTS.map((row, index) => (
                <div key={row.key} className={`landing__cost${index === 0 ? ' landing__cost--top' : ''}`}>
                  <div className="landing__cost-head">
                    <span>{t(row.key)}</span>
                    <span className="numeric loss">{money(`-${row.cost}`)}</span>
                  </div>
                  <span className="landing__bar-track">
                    <span style={{ width: `${(Number(row.cost) / largest) * 100}%` }} />
                  </span>
                </div>
              ))}
            </div>
            <div className="landing__float landing__float--flag card">
              <span className="landing__flag">{t('mistake.revengeTrading')}</span>
              <span className="caption">{t('landing.mock.flagNote')}</span>
            </div>
            <div className="landing__float landing__float--without card">
              <span className="caption">{t('landing.mock.without')}</span>
              <span className="numeric profit landing__float-big">{money('1595')}</span>
              <span className="caption">
                {t('landing.mock.actual')} <span className="numeric profit">{money('255')}</span>
              </span>
            </div>
          </div>
        </section>

        <section className="landing__section">
          <p className="landing__eyebrow">{t('landing.problem.eyebrow')}</p>
          <h2>{t('landing.problem.title')}</h2>
          <div className="landing__grid landing__grid--3">
            <Fact value={t('landing.problem.revenge.value')} text={t('landing.problem.revenge.text')} />
            <Fact value={money('-280')} text={t('landing.problem.stop.text')} />
            <Fact value={`${money('-680')} / ${money('885')}`} text={t('landing.problem.anger.text')} />
          </div>
          <p className="caption landing__note">{t('landing.demoNote')}</p>
        </section>

        <section className="landing__section" id="landing-features">
          <p className="landing__eyebrow">{t('landing.features.eyebrow')}</p>
          <h2>{t('landing.features.title')}</h2>
          <div className="landing__grid landing__grid--bento">
            <Feature icon={<Scale size={20} />} title={t('landing.f.cost.title')} text={t('landing.f.cost.text')} wide>
              <div className="landing__compare">
                <div>
                  <span className="caption">{t('landing.mock.without')}</span>
                  <span className="numeric profit">{money('1595')}</span>
                </div>
                <div>
                  <span className="caption">{t('landing.mock.actualShort')}</span>
                  <span className="numeric profit">{money('255')}</span>
                </div>
                <div>
                  <span className="caption">{t('landing.mock.mistakes')}</span>
                  <span className="numeric loss">{money('-1340')}</span>
                </div>
              </div>
            </Feature>
            <Feature icon={<Sparkles size={20} />} title={t('landing.f.flags.title')} text={t('landing.f.flags.text')}>
              <div className="landing__chips">
                {AUTO_FLAGS.map((flag) => (
                  <span key={flag} className="landing__chip">
                    {t(flag)}
                  </span>
                ))}
              </div>
            </Feature>
            <Feature icon={<Camera size={20} />} title={t('landing.f.screenshot.title')} text={t('landing.f.screenshot.text')}>
              <div className="landing__chips">
                {EXCHANGES.map((exchange) => (
                  <span key={exchange} className="landing__chip landing__chip--plain">
                    {exchange}
                  </span>
                ))}
              </div>
            </Feature>
            <Feature icon={<ChartColumn size={20} />} title={t('landing.f.breakdowns.title')} text={t('landing.f.breakdowns.text')} wide>
              <div className="landing__bars">
                {DEMO_EMOTIONS.map((row) => {
                  const value = Number(row.pnl)
                  return (
                    <div key={row.key} className="landing__bars-row">
                      <span>{t(row.key)}</span>
                      <span className="landing__bars-track">
                        <span className={value < 0 ? 'loss-fill' : 'profit-fill'} style={{ width: `${(Math.abs(value) / 885) * 100}%` }} />
                      </span>
                      <span className={`numeric ${value < 0 ? 'loss' : 'profit'}`}>{money(row.pnl)}</span>
                    </div>
                  )
                })}
              </div>
            </Feature>
            <Feature icon={<ShieldCheck size={20} />} title={t('landing.f.rules.title')} text={t('landing.f.rules.text')} />
            <Feature icon={<ListChecks size={20} />} title={t('landing.f.review.title')} text={t('landing.f.review.text')} />
            <Feature icon={<Timer size={20} />} title={t('landing.f.markets.title')} text={t('landing.f.markets.text')} />
          </div>
        </section>

        <section className="landing__section" id="landing-who">
          <p className="landing__eyebrow">{t('landing.who.eyebrow')}</p>
          <h2>{t('landing.who.title')}</h2>
          <div className="landing__grid landing__grid--3">
            <Feature icon={<Bitcoin size={20} />} title={t('landing.who.crypto.title')} text={t('landing.who.crypto.text')} />
            <Feature icon={<Trophy size={20} />} title={t('landing.who.prop.title')} text={t('landing.who.prop.text')} />
            <Feature icon={<Sprout size={20} />} title={t('landing.who.new.title')} text={t('landing.who.new.text')} />
          </div>
        </section>

        <section className="landing__section" id="landing-how">
          <p className="landing__eyebrow">{t('landing.how.eyebrow')}</p>
          <h2>{t('landing.how.title')}</h2>
          <ol className="landing__grid landing__grid--3 landing__steps">
            {(['log', 'mark', 'see'] as const).map((step, index) => (
              <li key={step} className="card">
                <span className="landing__step-number numeric">{String(index + 1).padStart(2, '0')}</span>
                <h3>{t(`landing.how.${step}.title`)}</h3>
                <p className="secondary-text">{t(`landing.how.${step}.text`)}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="landing__section" id="landing-pricing">
          <p className="landing__eyebrow">{t('landing.pricing.eyebrow')}</p>
          <h2>{t('landing.pricing.title')}</h2>
          <div className="landing__grid landing__grid--2">
            <div className="card landing__plan">
              <h3>{t('proPage.freeTitle')}</h3>
              <p className="landing__price numeric">{formatMoney(new Big(0), 'USD', locale, false).replace(/[.,]00(?=\D*$)/, '')}</p>
              <p className="caption">{t('landing.pricing.freeNote')}</p>
              <ul className="landing__list">
                {(['journal', 'today', 'limits', 'tools', 'analytics', 'screenshots', 'sync'] as const).map((item) => (
                  <li key={item}>
                    <Check size={16} aria-hidden="true" />
                    {t(`proPage.free.${item}`)}
                  </li>
                ))}
              </ul>
            </div>
            <div className="card landing__plan landing__plan--pro">
              <h3>{t('proPage.proTitle')}</h3>
              <p className="landing__price numeric">
                {money(prices.monthly, false)} <span className="caption">{t('landing.pricing.perMonth')}</span>
              </p>
              <p className="caption">{t('landing.pricing.orYear', { price: money(prices.annual, false) })}</p>
              <ul className="landing__list">
                {(['analytics', 'periods', 'screenshots', 'import', 'accounts', 'review'] as const).map((item) => (
                  <li key={item}>
                    <Check size={16} aria-hidden="true" />
                    {t(`landing.pricing.pro.${item}`)}
                  </li>
                ))}
              </ul>
              <p className="landing__trial">{offer ? t('landing.pricing.trialOffer', { days, date: offerDate }) : t('landing.pricing.trial', { days })}</p>
              <p className="caption">{t('landing.pricing.crypto')}</p>
            </div>
          </div>
          <div className="landing__center">{start}</div>
        </section>

        <section className="landing__section">
          <div className="card landing__maker">
            <h2>{t('landing.maker.title')}</h2>
            <p className="secondary-text">{t('landing.maker.text')}</p>
            <a href="mailto:tiltless.xyz@gmail.com">tiltless.xyz@gmail.com</a>
          </div>
        </section>

        <section className="landing__section" id="landing-faq">
          <p className="landing__eyebrow">{t('landing.faq.eyebrow')}</p>
          <h2>{t('landing.faq.title')}</h2>
          <div className="landing__faq">
            {FAQ.map((item) => (
              <details key={item} className="card">
                <summary>{t(`landing.faq.${item}.q`)}</summary>
                <p className="secondary-text">{t(`landing.faq.${item}.a`, { month: money(prices.monthly, false), year: money(prices.annual, false) })}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="landing__section landing__final">
          <h2>{t('landing.final.title')}</h2>
          <p className="secondary-text">{t('landing.final.text')}</p>
          {start}
        </section>
      </main>

      <footer className="landing__footer">
        <span className="caption">© 2026 Tiltless · tiltless.xyz</span>
        <LegalLinks refund />
      </footer>
    </div>
  )
}

function Fact({ value, text }: { value: string; text: string }) {
  return (
    <div className="card landing__fact">
      <p className="landing__fact-value numeric">{value}</p>
      <p className="secondary-text">{text}</p>
    </div>
  )
}

function Feature({ icon, title, text, wide = false, children }: { icon: ReactNode; title: string; text: string; wide?: boolean; children?: ReactNode }) {
  return (
    <div className={`card landing__feature${wide ? ' landing__feature--wide' : ''}`}>
      <span className="landing__feature-icon" aria-hidden="true">
        {icon}
      </span>
      <h3>{title}</h3>
      <p className="secondary-text">{text}</p>
      {children}
    </div>
  )
}
