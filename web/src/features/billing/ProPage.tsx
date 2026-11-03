import { Check, ChevronLeft, Minus } from 'lucide-react'
import { PAYMENT_PROVIDER, PRO_ON_SALE, proPreview } from '../../app/billing'
import { useAccess } from '../../app/entitlement'
import { routeHref } from '../../app/router'
import { launchOfferOn, PRO_FEATURES, trialDays } from '../../core/entitlements'
import { Card, LegalLinks, SectionHeader } from '../../design/components'
import { formatDate } from '../../i18n/format'
import { useI18n } from '../../i18n/i18n'
import { PageHeader } from '../shell/PageHeader'
import { CryptoProSection } from './CryptoProSection'
import { ProSection } from './ProSection'

const FREE_ITEMS = ['journal', 'today', 'limits', 'tools', 'analytics', 'screenshots', 'sync'] as const

/**
 * Tiltless Pro (SPEC section 8): what stays free, what Pro adds, the trial, the prices and
 * the payment. Where the locks lead.
 */
export function ProPage() {
  const { t, locale } = useI18n()
  const access = useAccess()
  const onSale = PRO_ON_SALE || proPreview()
  const now = new Date()

  const back = (
    <a className="back-link" href={routeHref({ name: 'profile' })}>
      <ChevronLeft size={20} aria-hidden="true" />
      {t('tab.profile')}
    </a>
  )

  const status = !onSale
    ? t('pro.freeNow')
    : access.pro && access.until
      ? t(access.source === 'trial' ? 'pro.trialUntil' : access.source === 'gift' ? 'proPage.giftUntil' : 'proPage.activeUntil', { date: formatDate(access.until, locale) })
      : access.signedIn
        ? t('proPage.freePlan')
        : t('proPage.signInForTrial', { days: String(trialDays(now)) })

  return (
    <>
      <PageHeader title="Tiltless Pro" leading={back} />

      <section className="card partners-hero pro-hero" aria-labelledby="pro-pitch">
        <p className="label partners-hero__tag">Pro</p>
        <h2 id="pro-pitch" className="partners-hero__title">
          {t('proPage.headline')}
        </h2>
        <p className="secondary-text">{t('proPage.pitch')}</p>
        {onSale && launchOfferOn(now) && !access.signedIn && <p className="pro-offer">{t('proPage.launchOffer')}</p>}
        <p className={access.pro ? 'pro-hero__status pro-hero__status--active' : 'pro-hero__status'}>{status}</p>
        {onSale && !access.signedIn && (
          <a className="button button--primary" href={routeHref({ name: 'profile' })}>
            {t('proPage.signIn')}
          </a>
        )}
      </section>

      <SectionHeader title={t('proPage.compare')} />
      <div className="pro-compare">
        <Card>
          <p className="label">{t('proPage.freeTitle')}</p>
          <ul className="pro-list">
            {FREE_ITEMS.map((key) => (
              <li key={key}>
                <Check size={16} aria-hidden="true" className="pro-list__yes" />
                {t(`proPage.free.${key}`)}
              </li>
            ))}
          </ul>
        </Card>
        <Card className="pro-compare__pro">
          <p className="label">{t('proPage.proTitle')}</p>
          <ul className="pro-list">
            <li>
              <Check size={16} aria-hidden="true" className="pro-list__yes" />
              {t('proPage.everythingFree')}
            </li>
            {PRO_FEATURES.map((feature) => (
              <li key={feature}>
                <Check size={16} aria-hidden="true" className="pro-list__yes" />
                <span>
                  <strong>{t(`proLock.${feature}`)}</strong>
                  <span className="caption"> — {t(`proLock.${feature}Text`)}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <p className="caption pro-note">
        <Minus size={14} aria-hidden="true" /> {t('proPage.keepData')}
      </p>

      {onSale && (PAYMENT_PROVIDER === 'crypto' ? <CryptoProSection /> : <ProSection />)}

      <p className="caption pro-note">{t('proPage.trialNote', { days: String(trialDays(now)) })}</p>
      <LegalLinks refund />
    </>
  )
}
