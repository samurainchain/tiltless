import Big from 'big.js'
import { ChevronLeft, Copy, Pencil, SearchX, Share2, Trash2, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useAutoFlags, useJournal, useMistakeName, useStore } from '../../app/journal'
import { navigate, routeHref } from '../../app/router'
import { useSheets } from '../../app/sheets'
import { activeFlags, type AutoFlag } from '../../core/mistakeDetector'
import type { Trade } from '../../core/models'
import { exitParts, grossPnl, percentOfDeposit, priceMovePercent, rMultiple, tradeDuration, tradePnl } from '../../core/pnl'
import { systemMistakeId } from '../../core/storage/journalStore'
import { Button, Card, Chip, EmptyState, PnLText, SectionHeader } from '../../design/components'
import { formatDateTime, formatDecimal, formatDuration, formatMoney, formatPercent, formatR, formatTime } from '../../i18n/format'
import { useI18n, type Translator } from '../../i18n/i18n'
import { PageHeader } from '../shell/PageHeader'
import { TradeGallery } from '../images/TradeImages'
import { EMOTION_ICONS } from './TradeRow'
import { StarRating } from './StarRating'
import { ShareTradeSheet } from '../share/ShareTradeSheet'

/** Why the detector raised a flag, in the trader's words. */
function flagReason(flag: AutoFlag, t: Translator['t'], locale: Translator['locale']): string {
  switch (flag.key) {
    case 'noStop':
      return t('flags.reason.noStop')
    case 'heldPastStop':
      return 'r' in flag
        ? t('flags.reason.heldPastStopR', { r: formatDecimal(flag.r, locale) })
        : t('flags.reason.heldPastStopMoved', { from: formatDecimal(flag.movedFrom, locale), to: formatDecimal(flag.movedTo, locale) })
    case 'revengeTrading':
      return t('flags.reason.revengeTrading', { minutes: String(flag.minutes) })
    case 'overtrading':
      return t('flags.reason.overtrading', { position: String(flag.position), limit: String(flag.limit) })
    case 'highLeverage':
      return t('flags.reason.highLeverage', { leverage: formatDecimal(flag.leverage, locale), median: formatDecimal(flag.median, locale) })
    case 'earlyExit':
      return t('flags.reason.earlyExit', { percent: String(flag.percent) })
    case 'badHour':
      return t('flags.reason.badHour', { hour: String(flag.hour).padStart(2, '0') })
  }
}

/** Every field of a trade with its computed values (SPEC section 4.6), as a page. */
export function TradeDetailPage({ id }: { id: string }) {
  const { t } = useI18n()
  const { trades, accounts } = useJournal()
  const trade = trades.find((item) => item.id === id)

  const back = (
    <a className="back-link" href={routeHref({ name: 'trades' })}>
      <ChevronLeft size={20} aria-hidden="true" />
      {t('tab.trades')}
    </a>
  )

  if (!trade) {
    return (
      <>
        <PageHeader title={t('trade.notFoundTitle')} leading={back} />
        <EmptyState icon={<SearchX size={28} />} title={t('trade.notFoundTitle')} message={t('trade.notFoundMessage')} />
      </>
    )
  }

  return (
    <>
      <PageHeader
        title={trade.symbol}
        subtitle={accounts.find((item) => item.id === trade.accountId)?.name}
        leading={back}
        trailing={<span className={`side-badge side-badge--${trade.side}`}>{t(`side.${trade.side}`)}</span>}
      />
      <TradeDetail trade={trade} onDeleted={() => navigate({ name: 'trades' })} onDuplicated={(copy) => navigate({ name: 'trade', id: copy })} />
    </>
  )
}

/**
 * The body of a trade's details, shared by the page and the side panel next to the trade
 * table: result and rating, screenshots, grouped fields, tags, rules, note and actions.
 */
export function TradeDetail({ trade, onDeleted, onDuplicated }: { trade: Trade; onDeleted: () => void; onDuplicated: (id: string) => void }) {
  const { t, locale } = useI18n()
  const { accounts, mistakes, setups, rules } = useJournal()
  const store = useStore()
  const { editTrade } = useSheets()
  const mistakeName = useMistakeName()
  const autoFlags = useAutoFlags()
  const [sharing, setSharing] = useState(false)

  const account = accounts.find((item) => item.id === trade.accountId)
  const currency = account?.currency ?? 'USD'
  const pnl = tradePnl(trade)
  const gross = grossPnl(trade)
  const r = rMultiple(trade)
  const duration = tradeDuration(trade)
  const move = priceMovePercent(trade)
  const parts = exitParts(trade)
  const percent = pnl ? percentOfDeposit(pnl, account?.depositAmount) : undefined
  const tradeMistakes = mistakes.filter((tag) => trade.mistakeIds.includes(tag.id))
  // Flags the trader hasn't tagged by hand or dismissed, with the tag they count toward.
  const flagged = activeFlags(trade, autoFlags.get(trade.id)).flatMap((flag) => {
    const tag = mistakes.find((item) => item.id === systemMistakeId(flag.key))
    return tag && !trade.mistakeIds.includes(tag.id) ? [{ flag, tag }] : []
  })
  const tradeSetups = setups.filter((tag) => trade.setupIds.includes(tag.id))
  const brokenRules = rules.filter((rule) => trade.brokenRuleIds.includes(rule.id))
  const images = store.imagesOf(trade.id)
  const EmotionIcon = trade.emotion ? EMOTION_ICONS[trade.emotion] : undefined
  const price = (value: string | undefined) => (value === undefined ? undefined : formatDecimal(value, locale))

  const remove = async () => {
    if (!window.confirm(t('trade.deleteConfirm'))) return
    await store.deleteTrade(trade.id)
    onDeleted()
  }

  const duplicate = async () => {
    const copy = await store.duplicateTrade(trade.id)
    if (copy) onDuplicated(copy.id)
  }

  return (
    <>
      <Card className="trade-summary">
        <div className="trade-summary__top">
          {pnl ? <PnLText amount={pnl} currency={currency} size="hero" /> : <p className="pnl--hero secondary-text">{t('trade.open')}</p>}
          <StarRating trade={trade} size={20} />
        </div>
        <dl className="stat-row">
          <Stat label={t('trade.r')} value={r ? formatR(r, locale) : '—'} />
          <Stat label={t('trade.duration')} value={duration !== undefined ? formatDuration(duration, locale) : '—'} />
          {move && <Stat label={t('trade.priceMove')} value={formatPercent(move, locale)} />}
          {percent && <Stat label={t('trade.percentOfDeposit')} value={formatPercent(percent, locale)} />}
        </dl>
      </Card>

      {images.length > 0 && <TradeGallery images={images} />}

      <SectionHeader title={t('trade.detailsSection')} />
      <Card className="fact-groups">
        <FactGroup title={t('trade.group.position')}>
          <Detail label={t('entry.account')} value={account?.name} />
          <Detail label={t('entry.market')} value={t(`market.${trade.market}`)} />
          <Detail label={t(trade.market === 'futures' ? 'entry.contracts' : trade.market === 'stock' ? 'entry.shares' : 'entry.quantity')} value={price(trade.quantity)} />
          {trade.market === 'futures' && <Detail label={t('entry.multiplier')} value={price(trade.contractMultiplier)} />}
          {trade.leverage && <Detail label={t('entry.leverage')} value={`${formatDecimal(trade.leverage, locale)}×`} />}
          <Detail
            label={t('entry.emotion')}
            value={
              EmotionIcon ? (
                <span className="inline-icon">
                  <EmotionIcon size={16} aria-hidden="true" />
                  {t(`emotion.${trade.emotion!}`)}
                </span>
              ) : undefined
            }
          />
        </FactGroup>
        <FactGroup title={t('trade.group.prices')}>
          <Detail label={t('entry.entryPrice')} value={price(trade.entryPrice)} />
          <Detail label={t(trade.exits?.length ? 'trade.averageExit' : 'entry.exitPrice')} value={price(trade.exitPrice)} />
          <Detail label={t('entry.stopLoss')} value={price(trade.stopLoss)} />
          {trade.initialStopLoss && trade.initialStopLoss !== trade.stopLoss && <Detail label={t('trade.initialStop')} value={price(trade.initialStopLoss)} />}
          {trade.takeProfit && <Detail label={t('trade.takeProfit')} value={price(trade.takeProfit)} />}
        </FactGroup>
        {parts.length > 0 && (
          <FactGroup title={t('entry.exits')}>
            {parts.map((part, index) => (
              <Detail
                key={index}
                label={t('trade.exitPart', { time: formatTime(part.exit.closedAt, locale), percent: formatDecimal(part.exit.percent, locale) })}
                value={
                  <span className="exit-part">
                    <span className="numeric">{price(part.exit.price)}</span>
                    <PnLText amount={part.pnl} currency={currency} />
                  </span>
                }
              />
            ))}
          </FactGroup>
        )}
        <FactGroup title={t('trade.group.time')}>
          <Detail label={t('entry.openedAt')} value={formatDateTime(trade.openedAt, locale)} />
          <Detail label={t('entry.closedAt')} value={trade.closedAt ? formatDateTime(trade.closedAt, locale) : undefined} />
        </FactGroup>
        <FactGroup title={t('trade.group.result')}>
          <Detail label={t('trade.grossPnl')} value={gross ? <PnLText amount={gross} currency={currency} /> : undefined} />
          <Detail label={t('trade.fees')} value={formatMoney(new Big(trade.fees), currency, locale, false)} />
          <Detail label={t('trade.netPnl')} value={pnl ? <PnLText amount={pnl} currency={currency} /> : undefined} />
        </FactGroup>
      </Card>

      {(tradeMistakes.length > 0 || tradeSetups.length > 0 || flagged.length > 0) && (
        <>
          <SectionHeader title={t('trade.tagsSection')} />
          <Card className="form-stack">
            {tradeMistakes.length > 0 && (
              <div className="chip-row" aria-label={t('entry.mistakes')}>
                {tradeMistakes.map((tag) => (
                  <Chip key={tag.id} label={mistakeName(tag)} colorHex={tag.colorHex} selected={false} />
                ))}
              </div>
            )}
            {flagged.length > 0 && (
              <div className="auto-flags">
                <ul className="auto-flags__list" aria-label={t('flags.auto')}>
                  {flagged.map(({ flag, tag }) => (
                    <li key={flag.key} className="auto-flag">
                      <div className="auto-flag__text">
                        <span className="inline-icon">
                          <Chip label={mistakeName(tag)} colorHex={tag.colorHex} selected={false} />
                          <span className="label">{t('flags.auto')}</span>
                        </span>
                        <span className="caption">{flagReason(flag, t, locale)}</span>
                      </div>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={t('flags.dismiss', { name: mistakeName(tag) })}
                        title={t('flags.dismiss', { name: mistakeName(tag) })}
                        onClick={() => void store.dismissFlag(trade.id, flag.key)}
                      >
                        <X size={18} aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="caption">{t('flags.autoNote')}</p>
              </div>
            )}
            {tradeSetups.length > 0 && (
              <div className="chip-row" aria-label={t('entry.setups')}>
                {tradeSetups.map((tag) => (
                  <Chip key={tag.id} label={tag.name} colorHex={tag.colorHex} selected={false} />
                ))}
              </div>
            )}
          </Card>
        </>
      )}

      {brokenRules.length > 0 && (
        <>
          <SectionHeader title={t('entry.brokenRules')} />
          <Card>
            <ul className="broken-rules">
              {brokenRules.map((rule) => (
                <li key={rule.id}>{rule.text}</li>
              ))}
            </ul>
          </Card>
        </>
      )}

      {trade.note && (
        <>
          <SectionHeader title={t('entry.note')} />
          <Card>
            <p className="note-text">{trade.note}</p>
          </Card>
        </>
      )}

      <div className="action-row">
        <Button variant="primary" icon={<Pencil size={18} aria-hidden="true" />} onClick={() => editTrade(trade.id)}>
          {t('action.edit')}
        </Button>
        <Button icon={<Share2 size={18} aria-hidden="true" />} onClick={() => setSharing(true)}>
          {t('share.button')}
        </Button>
        <Button icon={<Copy size={18} aria-hidden="true" />} onClick={duplicate}>
          {t('action.duplicate')}
        </Button>
        <Button variant="danger" icon={<Trash2 size={18} aria-hidden="true" />} onClick={remove}>
          {t('action.delete')}
        </Button>
      </div>
      <ShareTradeSheet trade={trade} open={sharing} onClose={() => setSharing(false)} />
    </>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <dt className="caption">{label}</dt>
      <dd className="numeric">{value}</dd>
    </div>
  )
}

function FactGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="fact-group">
      <h3 className="label">{title}</h3>
      <dl className="detail-list">{children}</dl>
    </section>
  )
}

function Detail({ label, value }: { label: string; value: ReactNode | undefined }) {
  return (
    <div className="detail-list__row">
      <dt className="secondary-text">{label}</dt>
      <dd className="numeric">{value ?? '—'}</dd>
    </div>
  )
}
