import Big from 'big.js'
import type { Account, Trade } from '../../core/models'
import { priceMovePercent, rMultiple, tradeDuration, tradePnl } from '../../core/pnl'
import { validRating } from '../../core/tradeTable'
import { formatDate, formatDecimal, formatDuration, formatMoney, formatPercent, formatR } from '../../i18n/format'
import type { Locale, Translator } from '../../i18n/i18n'

// The picture of a trade the trader can post (SPEC section 4.6): what it says is built here as
// plain text, so it's tested; drawing it on a canvas is in drawShareCard.

export type Tone = 'profit' | 'loss' | 'neutral'

export interface ShareCard {
  symbol: string
  side: Trade['side']
  sideLabel: string
  /** The big number: money, or R / price move when the amount is hidden. */
  hero: { text: string; tone: Tone; caption?: string }
  stats: { label: string; value: string }[]
  entry: string
  exit?: string
  date: string
  rating?: number
  labels: { recap: string; entry: string; exit: string; open: string; tagline: string }
}

const tone = (value: Big | undefined): Tone => (!value || value.eq(0) ? 'neutral' : value.gt(0) ? 'profit' : 'loss')

export function buildShareCard(trade: Trade, account: Account | undefined, hideAmount: boolean, t: Translator['t'], locale: Locale): ShareCard {
  const pnl = tradePnl(trade)
  const r = rMultiple(trade)
  const move = priceMovePercent(trade)
  const duration = tradeDuration(trade)

  let hero: ShareCard['hero']
  if (!pnl) hero = { text: t('trade.open'), tone: 'neutral' }
  else if (!hideAmount) hero = { text: formatMoney(pnl, account?.currency ?? 'USD', locale), tone: tone(pnl) }
  else if (r) hero = { text: formatR(r, locale), tone: tone(r), caption: t('trade.r') }
  else if (move) hero = { text: formatPercent(move, locale), tone: tone(move), caption: t('trade.priceMove') }
  else hero = { text: '—', tone: tone(pnl) }

  const stats: ShareCard['stats'] = []
  if (r && hero.caption !== t('trade.r')) stats.push({ label: t('trade.r'), value: formatR(r, locale) })
  if (move && hero.caption !== t('trade.priceMove')) stats.push({ label: t('trade.priceMove'), value: formatPercent(move, locale) })
  if (duration !== undefined) stats.push({ label: t('trade.duration'), value: formatDuration(duration, locale) })

  return {
    symbol: trade.symbol,
    side: trade.side,
    sideLabel: t(`side.${trade.side}`),
    hero,
    stats: stats.slice(0, 3),
    entry: formatDecimal(trade.entryPrice, locale),
    exit: trade.exitPrice ? formatDecimal(trade.exitPrice, locale) : undefined,
    date: formatDate(new Date(trade.closedAt ?? trade.openedAt), locale),
    rating: validRating(trade.rating),
    labels: { recap: t('share.recap'), entry: t('trades.column.entryPrice'), exit: t('trades.column.exitPrice'), open: t('trade.open'), tagline: t('share.tagline') },
  }
}

export const CARD_SIZE = 1080

/** Colors of the card, from the dark theme's tokens: the card looks the same wherever it's posted. */
export const COLORS = {
  background: '#121212',
  surface: '#171717',
  border: '#2e2e2e',
  text: '#ededed',
  secondary: '#a0a0a0',
  accent: '#3ecf8e',
  profit: '#3ecf8e',
  loss: '#f87171',
  star: '#f5a623',
  /** The "biggest leak" box: a dark tint of the loss color. */
  leakSurface: '#1f1414',
  leakBorder: '#4a2626',
}
export const SANS = "Geist, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
export const MONO = "'Geist Mono', ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, Consolas, monospace"

/** Sets a font, shrinking it until the text fits the width. */
export function fit(ctx: CanvasRenderingContext2D, text: string, weight: number, size: number, family: string, maxWidth: number): number {
  let current = size
  ctx.font = `${weight} ${current}px ${family}`
  while (ctx.measureText(text).width > maxWidth && current > 12) {
    current -= 2
    ctx.font = `${weight} ${current}px ${family}`
  }
  return current
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, width, height, radius)
}

function star(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number) {
  ctx.beginPath()
  for (let point = 0; point < 10; point++) {
    const angle = -Math.PI / 2 + (point * Math.PI) / 5
    const length = point % 2 === 0 ? radius : radius * 0.45
    ctx.lineTo(cx + Math.cos(angle) * length, cy + Math.sin(angle) * length)
  }
  ctx.closePath()
}

/** Draws the card on a 1080×1080 canvas. `logo` is the app icon, already loaded. */
export function drawShareCard(ctx: CanvasRenderingContext2D, card: ShareCard, logo: CanvasImageSource | undefined): void {
  const size = CARD_SIZE
  const pad = 80
  const inner = size - pad * 2
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = COLORS.background
  ctx.fillRect(0, 0, size, size)
  roundRect(ctx, 32, 32, size - 64, size - 64, 28)
  ctx.fillStyle = COLORS.surface
  ctx.fill()
  ctx.lineWidth = 2
  ctx.strokeStyle = COLORS.border
  ctx.stroke()

  // Brand and label
  if (logo) ctx.drawImage(logo, pad, pad - 4, 56, 56)
  ctx.fillStyle = COLORS.text
  ctx.font = `600 36px ${SANS}`
  ctx.fillText('Tiltless', pad + (logo ? 72 : 0), pad + 38)
  ctx.fillStyle = COLORS.secondary
  ctx.font = `500 22px ${MONO}`
  ctx.textAlign = 'right'
  ctx.fillText(card.labels.recap.toUpperCase(), size - pad, pad + 34)
  ctx.textAlign = 'left'

  // Symbol and side
  ctx.fillStyle = COLORS.text
  fit(ctx, card.symbol, 700, 92, SANS, inner - 220)
  ctx.fillText(card.symbol, pad, 270)
  const symbolWidth = ctx.measureText(card.symbol).width
  const sideColor = card.side === 'long' ? COLORS.profit : COLORS.loss
  ctx.font = `600 26px ${MONO}`
  const badge = card.sideLabel.toUpperCase()
  const badgeWidth = ctx.measureText(badge).width + 32
  roundRect(ctx, pad + symbolWidth + 28, 222, badgeWidth, 48, 8)
  ctx.strokeStyle = sideColor
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.fillStyle = sideColor
  ctx.fillText(badge, pad + symbolWidth + 44, 256)

  // Result
  ctx.fillStyle = card.hero.tone === 'profit' ? COLORS.profit : card.hero.tone === 'loss' ? COLORS.loss : COLORS.text
  fit(ctx, card.hero.text, 600, 168, SANS, inner)
  ctx.fillText(card.hero.text, pad - 6, 470)
  if (card.hero.caption) {
    ctx.fillStyle = COLORS.secondary
    ctx.font = `500 24px ${MONO}`
    ctx.fillText(card.hero.caption.toUpperCase(), pad, 550)
  }

  // Stats in columns
  const column = inner / 3
  card.stats.forEach((stat, index) => {
    const x = pad + index * column
    ctx.fillStyle = COLORS.secondary
    fit(ctx, stat.label.toUpperCase(), 500, 22, MONO, column - 24)
    ctx.fillText(stat.label.toUpperCase(), x, 620)
    ctx.fillStyle = COLORS.text
    fit(ctx, stat.value, 600, 46, SANS, column - 24)
    ctx.fillText(stat.value, x, 676)
  })

  // Prices, date and rating
  ctx.fillStyle = COLORS.border
  ctx.fillRect(pad, 730, inner, 2)
  const prices = card.exit ? `${card.labels.entry} ${card.entry}  →  ${card.labels.exit} ${card.exit}` : `${card.labels.entry} ${card.entry}`
  ctx.fillStyle = COLORS.text
  fit(ctx, prices, 500, 34, SANS, inner)
  ctx.fillText(prices, pad, 800)
  ctx.fillStyle = COLORS.secondary
  ctx.font = `400 28px ${SANS}`
  ctx.fillText(card.date, pad, 852)
  if (card.rating) {
    for (let index = 0; index < 5; index++) {
      star(ctx, size - pad - 18 - (4 - index) * 44, 842, 18)
      if (index < card.rating) {
        ctx.fillStyle = COLORS.star
        ctx.fill()
      } else {
        ctx.strokeStyle = COLORS.secondary
        ctx.lineWidth = 2
        ctx.stroke()
      }
    }
  }

  // Footer
  ctx.fillStyle = COLORS.border
  ctx.fillRect(pad, 912, inner, 2)
  ctx.fillStyle = COLORS.accent
  ctx.font = `600 32px ${SANS}`
  ctx.fillText('tiltless.xyz', pad, 972)
  ctx.fillStyle = COLORS.secondary
  ctx.textAlign = 'right'
  fit(ctx, card.labels.tagline, 400, 26, SANS, inner - 260)
  ctx.fillText(card.labels.tagline, size - pad, 970)
  ctx.textAlign = 'left'
}
