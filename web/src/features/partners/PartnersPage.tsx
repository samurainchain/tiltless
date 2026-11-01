import { Check, ChevronLeft, Copy } from 'lucide-react'
import Big from 'big.js'
import { useCallback, useEffect, useId, useState } from 'react'
import { DEFAULT_CRYPTO_PRICES, fetchCryptoPrices } from '../../app/billing'
import { useCloud } from '../../app/cloud'
import { becomePartner, fetchPartnerStats, partnerLink, savePayoutWallet, type PartnerStats } from '../../app/referral'
import { routeHref } from '../../app/router'
import { commissionFor, isTronAddress, PARTNER_TERMS } from '../../core/referral'
import { Button, Card, Field, SectionHeader } from '../../design/components'
import { formatMoney } from '../../i18n/format'
import { useI18n } from '../../i18n/i18n'
import { PageHeader } from '../shell/PageHeader'

const AUDIENCES = ['creators', 'mentors', 'communities', 'publishers'] as const
const STEPS = ['join', 'share', 'earn'] as const

/**
 * The partner program (SPEC section 8): what it pays and how, and for a partner their link,
 * payout wallet and totals. Payouts are sent by hand; the numbers come from the database.
 */
export function PartnersPage() {
  const { t, locale } = useI18n()
  const { cloud, state } = useCloud()
  const client = cloud.supabase
  const signedIn = Boolean(state.email)
  const [stats, setStats] = useState<PartnerStats>()
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string>()
  // The example uses the prices actually charged, falling back to the defaults while they load.
  const [prices, setPrices] = useState<{ monthly: string; annual: string }>(DEFAULT_CRYPTO_PRICES)

  useEffect(() => {
    fetchCryptoPrices().then(setPrices, () => {})
  }, [])

  const usd = (amount: Big | string) => formatMoney(new Big(amount), 'USD', locale, false)
  const percent = `${Number(PARTNER_TERMS.rate) * 100}%`

  const load = useCallback(async () => {
    if (!client || !signedIn) return
    try {
      setStats(await fetchPartnerStats(client))
    } catch {
      setMessage(t('partners.loadFailed'))
    } finally {
      setLoaded(true)
    }
  }, [client, signedIn, t])

  useEffect(() => {
    void load()
  }, [load])

  const join = async () => {
    if (!client) return
    setBusy(true)
    setMessage(undefined)
    try {
      await becomePartner(client)
      await load()
    } catch {
      setMessage(t('partners.joinFailed'))
    } finally {
      setBusy(false)
    }
  }

  const back = (
    <a className="back-link" href={routeHref({ name: 'profile' })}>
      <ChevronLeft size={20} aria-hidden="true" />
      {t('tab.profile')}
    </a>
  )

  const cta = !signedIn ? (
    <a className="button button--primary" href={routeHref({ name: 'profile' })}>
      {t('partners.signInFirst')}
    </a>
  ) : !stats && loaded ? (
    <Button variant="primary" disabled={busy} onClick={() => void join()}>
      {t('partners.join')}
    </Button>
  ) : null

  if (state.status === 'unavailable') {
    return (
      <>
        <PageHeader title={t('partners.title')} leading={back} />
        <p className="secondary-text">{t('partners.unavailable')}</p>
      </>
    )
  }

  return (
    <>
      <PageHeader title={t('partners.title')} leading={back} />

      <section className="card partners-hero" aria-labelledby="partners-pitch">
        <p className="label partners-hero__tag">{t('partners.tag')}</p>
        <h2 id="partners-pitch" className="partners-hero__title">
          {t('partners.headline')}
        </h2>
        <p className="secondary-text">{t('partners.pitch', { percent, months: String(PARTNER_TERMS.months) })}</p>
        <p className="caption">{t('partners.proSoon')}</p>
        {cta}
        {message && (
          <p className="caption" role="status">
            {message}
          </p>
        )}
      </section>

      <ul className="partners-facts">
        <li className="card">
          <strong className="partners-facts__value numeric">{percent}</strong>
          <span className="secondary-text">{t('partners.fact.rate')}</span>
        </li>
        <li className="card">
          <strong className="partners-facts__value numeric">{t('partners.fact.windowValue', { days: String(PARTNER_TERMS.windowDays) })}</strong>
          <span className="secondary-text">{t('partners.fact.window')}</span>
        </li>
        <li className="card">
          <strong className="partners-facts__value numeric">{t('partners.fact.monthsValue', { months: String(PARTNER_TERMS.months) })}</strong>
          <span className="secondary-text">{t('partners.fact.months')}</span>
        </li>
      </ul>

      {stats && client && <PartnerDashboard stats={stats} usd={usd} onSaved={load} save={(wallet) => savePayoutWallet(client, wallet)} />}

      <SectionHeader title={t('partners.forWhom')} />
      <ul className="partners-grid">
        {AUDIENCES.map((key) => (
          <li key={key} className="card partners-grid__item">
            <strong>{t(`partners.audience.${key}`)}</strong>
            <span className="secondary-text">{t(`partners.audience.${key}Text`)}</span>
          </li>
        ))}
      </ul>

      <SectionHeader title={t('partners.how')} />
      <Card>
        <ol className="partners-steps">
          {STEPS.map((key, index) => (
            <li key={key}>
              <span className="partners-steps__number numeric" aria-hidden="true">
                {index + 1}
              </span>
              <span>
                <strong>{t(`partners.step.${key}`)}</strong>
                <span className="secondary-text">
                  {t(`partners.step.${key}Text`, {
                    days: String(PARTNER_TERMS.windowDays),
                    percent,
                    months: String(PARTNER_TERMS.months),
                    hold: String(PARTNER_TERMS.holdDays),
                    min: usd(String(PARTNER_TERMS.minPayout)),
                  })}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </Card>

      <SectionHeader title={t('partners.example')} />
      <Card className="form-stack">
        <p>
          {t('partners.exampleText', {
            monthly: usd(prices.monthly),
            monthlyCut: usd(commissionFor(prices.monthly)),
            annual: usd(prices.annual),
            annualCut: usd(commissionFor(prices.annual)),
          })}
        </p>
        <p className="caption">{t('partners.exampleNote')}</p>
        <p className="caption">
          <a href="/terms/#partners">{t('partners.rules')}</a>
        </p>
      </Card>
    </>
  )
}

function PartnerDashboard({ stats, usd, save, onSaved }: { stats: PartnerStats; usd: (amount: string) => string; save: (wallet: string) => Promise<void>; onSaved: () => Promise<void> }) {
  const { t } = useI18n()
  const linkId = useId()
  const walletId = useId()
  const link = partnerLink(stats.code)
  const [copied, setCopied] = useState(false)
  const [wallet, setWallet] = useState(stats.payoutWallet ?? '')
  const [walletError, setWalletError] = useState<string>()
  const [walletStatus, setWalletStatus] = useState<string>()

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      document.getElementById(linkId)?.focus()
    }
  }

  const saveWallet = async () => {
    setWalletStatus(undefined)
    if (wallet.trim() && !isTronAddress(wallet)) {
      setWalletError(t('partners.walletInvalid'))
      return
    }
    setWalletError(undefined)
    try {
      await save(wallet)
      await onSaved()
      setWalletStatus(t('partners.walletSaved'))
    } catch {
      setWalletStatus(t('partners.walletFailed'))
    }
  }

  const totals: [string, string][] = [
    [t('partners.stat.referred'), String(stats.referred)],
    [t('partners.stat.paying'), String(stats.paying)],
    [t('partners.stat.pending'), usd(stats.pending)],
    [t('partners.stat.available'), usd(stats.available)],
    [t('partners.stat.paid'), usd(stats.paid)],
  ]

  return (
    <>
      <SectionHeader title={t('partners.yours')} />
      <Card className="form-stack">
        <Field label={t('partners.link')} htmlFor={linkId}>
          <div className="input-with-addon">
            <input id={linkId} className="input" readOnly value={link} onFocus={(event) => event.target.select()} />
            <Button icon={copied ? <Check size={18} aria-hidden="true" /> : <Copy size={18} aria-hidden="true" />} onClick={() => void copy()}>
              {copied ? t('partners.copied') : t('partners.copy')}
            </Button>
          </div>
        </Field>
        <dl className="trade-strip__list partners-totals">
          {totals.map(([label, value]) => (
            <div key={label} className="trade-strip__item">
              <dt className="label">{label}</dt>
              <dd className="numeric">{value}</dd>
            </div>
          ))}
        </dl>
        <Field label={t('partners.wallet')} htmlFor={walletId} error={walletError} hint={t('partners.walletHint', { min: usd(String(PARTNER_TERMS.minPayout)) })}>
          <div className="input-with-addon">
            <input id={walletId} className="input" value={wallet} autoComplete="off" spellCheck={false} placeholder="T…" onChange={(event) => setWallet(event.target.value)} />
            <Button onClick={() => void saveWallet()}>{t('partners.walletSave')}</Button>
          </div>
        </Field>
        {walletStatus && (
          <p className="caption" role="status">
            {walletStatus}
          </p>
        )}
      </Card>
    </>
  )
}
