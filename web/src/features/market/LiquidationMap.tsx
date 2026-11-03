import Big from 'big.js'
import { ExternalLink } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { SUPABASE_URL } from '../../app/cloudConfig'
import { updateSettings, useSettings } from '../../app/settings'
import { cellScale, liquidationMap, type LiquidationMap as Map_, type MarketSeries } from '../../core/liquidationMap'
import { Segmented } from '../../design/components'
import { formatDecimal, formatMoneyCompact, intlLocale } from '../../i18n/format'
import { useI18n } from '../../i18n/i18n'
import './market.css'

// The liquidation map block (SPEC section 4.7): OKX candles and open interest through our
// market-data function, the estimate from core/liquidationMap, drawn on a canvas.

const COINS = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE'] as const
const PERIODS = ['24h', '3d', '7d', '14d', '30d', '90d'] as const
type Coin = (typeof COINS)[number]
type Period = (typeof PERIODS)[number]

const HEIGHT = 340
const AXIS_RIGHT = 64
const AXIS_BOTTOM = 22

type Load = { state: 'loading' } | { state: 'ready'; map: Map_; at: Date } | { state: 'error' }

/** Answers already fetched in this tab, kept two minutes like the function's cache. */
const cache = new Map<string, { series: MarketSeries; at: Date }>()

async function fetchSeries(coin: Coin, period: Period): Promise<{ series: MarketSeries; at: Date }> {
  const key = `${coin}-${period}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at.getTime() < 120_000) return hit
  const response = await fetch(`${SUPABASE_URL}/functions/v1/market-data?coin=${coin}&period=${period}`)
  if (!response.ok) throw new Error(`market-data ${response.status}`)
  const body = (await response.json()) as MarketSeries
  const value = { series: body, at: new Date() }
  cache.set(key, value)
  return value
}

/** The map's colors from the design tokens: from the card's surface through the accent to its light end. */
function palette(element: HTMLElement): { low: number[]; mid: number[]; high: number[]; text: string; muted: string; line: string; surface: string } {
  const style = getComputedStyle(element)
  const read = (name: string) => style.getPropertyValue(name).trim()
  const rgb = (color: string) => {
    const probe = document.createElement('canvas').getContext('2d')!
    probe.fillStyle = color
    const hex = probe.fillStyle as string
    return hex.startsWith('#') ? [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16)) : (hex.match(/\d+/g) ?? ['0', '0', '0']).slice(0, 3).map(Number)
  }
  const surface = rgb(read('--color-surface'))
  const accent = rgb(read('--color-accent'))
  const dark = surface.reduce((sum, value) => sum + value, 0) < 384
  // The busiest cells go lighter on a dark surface and darker on a light one.
  const end = dark ? [255, 255, 255] : [0, 0, 0]
  return {
    low: surface,
    mid: accent,
    high: accent.map((value, index) => Math.round(value + (end[index]! - value) * 0.6)),
    text: read('--color-text-primary'),
    muted: read('--color-text-secondary'),
    line: read('--color-separator'),
    surface: read('--color-surface'),
  }
}

function mix(a: number[], b: number[], t: number): number[] {
  return a.map((value, index) => Math.round(value + (b[index]! - value) * t))
}

export function LiquidationMap() {
  const { t, locale } = useI18n()
  const saved = useSettings().liquidationMap
  const coin = (COINS as readonly string[]).includes(saved?.coin ?? '') ? (saved!.coin as Coin) : 'BTC'
  const period = (PERIODS as readonly string[]).includes(saved?.period ?? '') ? (saved!.period as Period) : '7d'
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  const choose = (next: { coin?: Coin; period?: Period }) => updateSettings({ liquidationMap: { coin: next.coin ?? coin, period: next.period ?? period } })

  useEffect(() => {
    let current = true
    setLoad({ state: 'loading' })
    fetchSeries(coin, period)
      .then(({ series, at }) => {
        const map = liquidationMap(series)
        if (current) setLoad(map ? { state: 'ready', map, at } : { state: 'error' })
      })
      .catch(() => current && setLoad({ state: 'error' }))
    return () => {
      current = false
    }
  }, [coin, period])

  const money = (usd: number) => formatMoneyCompact(new Big(Math.round(usd)), 'USD', locale).replace(/^\+/, '')
  const price = (value: number) => formatDecimal(String(Number(value.toPrecision(value >= 100 ? 6 : 4))), locale)
  const percent = (value: number) => `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(1)}%`

  return (
    <div className="liq">
      <p className="caption">{t('liq.subtitle')}</p>
      <div className="liq__controls">
        <Segmented label={t('liq.coin')} value={coin} onChange={(value) => choose({ coin: value })} options={COINS.map((value) => ({ value, label: value }))} />
        <Segmented label={t('liq.period')} value={period} onChange={(value) => choose({ period: value })} options={PERIODS.map((value) => ({ value, label: t(`liq.period.${value}`) }))} />
      </div>
      {load.state === 'loading' && (
        <p className="caption liq__status" role="status">
          {t('liq.loading')}
        </p>
      )}
      {load.state === 'error' && <p className="secondary-text liq__status">{t('liq.error')}</p>}
      {load.state === 'ready' && (
        <>
          <Plot map={load.map} coin={coin} money={money} price={price} />
          <div className="liq__legend caption">
            <span>{t('liq.less')}</span>
            <span className="liq__ramp" aria-hidden="true" />
            <span>{t('liq.more')}</span>
            <span className="liq__time">{t('liq.asOf', { time: new Intl.DateTimeFormat(intlLocale(locale), { hour: '2-digit', minute: '2-digit' }).format(load.at) })}</span>
          </div>
          <p className="caption">{t('liq.now')}</p>
          <ul className="liq__summary">
            {load.map.above && (
              <li>
                <span className="liq__arrow" aria-hidden="true">▲</span>
                {t('liq.above', { price: price(load.map.above.price), change: percent((load.map.above.price / load.map.price - 1) * 100), usd: money(load.map.above.usd) })}
              </li>
            )}
            {load.map.below && (
              <li>
                <span className="liq__arrow" aria-hidden="true">▼</span>
                {t('liq.below', { price: price(load.map.below.price), change: percent((load.map.below.price / load.map.price - 1) * 100), usd: money(load.map.below.usd) })}
              </li>
            )}
          </ul>
          <p className="caption">{t('liq.near', { longs: money(load.map.nearLongs), shorts: money(load.map.nearShorts) })}</p>
          <details className="liq__help">
            <summary>{t('liq.howTo')}</summary>
            <p className="secondary-text">{t('liq.howToText')}</p>
          </details>
          <p className="caption liq__footer">
            <span>{t('liq.source')}</span>
            <a href="https://www.coinglass.com/pro/futures/LiquidationHeatMap" target="_blank" rel="noopener noreferrer nofollow">
              {t('liq.compare')} <ExternalLink size={12} aria-hidden="true" />
            </a>
          </p>
        </>
      )}
    </div>
  )
}

function Plot({ map, coin, money, price }: { map: Map_; coin: Coin; money: (usd: number) => string; price: (value: number) => string }) {
  const { t, locale } = useI18n()
  const canvas = useRef<HTMLCanvasElement>(null)
  const [width, setWidth] = useState(0)
  const [hover, setHover] = useState<{ column: number; row: number }>()
  const scale = useMemo(() => cellScale(map.cells), [map])

  useEffect(() => {
    const element = canvas.current?.parentElement
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry!.contentRect.width)))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const plotWidth = Math.max(0, width - AXIS_RIGHT)
  const plotHeight = HEIGHT - AXIS_BOTTOM
  const columnWidth = plotWidth / map.times.length
  const y = (value: number) => plotHeight * (1 - (value - map.min) / (map.max - map.min))

  useEffect(() => {
    const element = canvas.current
    if (!element || width === 0) return
    const ratio = window.devicePixelRatio || 1
    element.width = width * ratio
    element.height = HEIGHT * ratio
    const context = element.getContext('2d')!
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    const colors = palette(element)
    context.clearRect(0, 0, width, HEIGHT)

    // The map: one rectangle per cell, its color by the money waiting there.
    const rowHeight = plotHeight / map.rows
    for (let column = 0; column < map.times.length; column += 1) {
      for (let row = 0; row < map.rows; row += 1) {
        const value = Math.min(1, map.cells[column * map.rows + row]! / scale)
        const color = value < 0.5 ? mix(colors.low, colors.mid, value * 2) : mix(colors.mid, colors.high, (value - 0.5) * 2)
        context.fillStyle = `rgb(${color.join(',')})`
        context.fillRect(column * columnWidth, plotHeight - (row + 1) * rowHeight, columnWidth + 0.5, rowHeight + 0.5)
      }
    }

    // Candles over it: hollow when rising, filled when falling, outlined with the surface for contrast.
    const body = Math.max(1, columnWidth * 0.6)
    map.candles.forEach(([, open, high, low, close], column) => {
      const center = column * columnWidth + columnWidth / 2
      context.strokeStyle = colors.surface
      context.lineWidth = 3
      context.beginPath()
      context.moveTo(center, y(high))
      context.lineTo(center, y(low))
      context.stroke()
      context.strokeStyle = colors.text
      context.lineWidth = 1
      context.beginPath()
      context.moveTo(center, y(high))
      context.lineTo(center, y(low))
      context.stroke()
      const top = y(Math.max(open, close))
      const height = Math.max(1, Math.abs(y(open) - y(close)))
      context.fillStyle = close >= open ? colors.surface : colors.text
      context.fillRect(center - body / 2, top, body, height)
      context.strokeRect(center - body / 2, top, body, height)
    })

    // The price now.
    context.setLineDash([4, 4])
    context.strokeStyle = colors.text
    context.beginPath()
    context.moveTo(0, y(map.price))
    context.lineTo(plotWidth, y(map.price))
    context.stroke()
    context.setLineDash([])

    // Axes.
    context.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace'
    context.fillStyle = colors.muted
    context.textBaseline = 'middle'
    for (let tick = 1; tick <= 4; tick += 1) {
      const value = map.min + ((map.max - map.min) * tick) / 5
      context.fillText(price(value), plotWidth + 6, y(value))
    }
    context.fillStyle = colors.text
    context.fillText(price(map.price), plotWidth + 6, y(map.price))
    context.fillStyle = colors.muted
    context.textBaseline = 'alphabetic'
    const span = map.times.at(-1)! - map.times[0]!
    const format = new Intl.DateTimeFormat(intlLocale(locale), span > 2 * 86_400_000 ? { day: 'numeric', month: 'short' } : { hour: '2-digit', minute: '2-digit' })
    for (const share of [0, 0.5, 1]) {
      const column = Math.min(map.times.length - 1, Math.round(share * (map.times.length - 1)))
      const text = format.format(map.times[column]!)
      const x = column * columnWidth + columnWidth / 2
      context.textAlign = share === 0 ? 'left' : share === 1 ? 'right' : 'center'
      context.fillText(text, share === 0 ? 0 : share === 1 ? plotWidth : x, HEIGHT - 6)
    }
    context.textAlign = 'left'

    if (hover) {
      context.strokeStyle = colors.text
      context.globalAlpha = 0.5
      context.beginPath()
      context.moveTo(hover.column * columnWidth + columnWidth / 2, 0)
      context.lineTo(hover.column * columnWidth + columnWidth / 2, plotHeight)
      context.moveTo(0, plotHeight - (hover.row + 0.5) * rowHeight)
      context.lineTo(plotWidth, plotHeight - (hover.row + 0.5) * rowHeight)
      context.stroke()
      context.globalAlpha = 1
    }
  }, [map, width, hover, scale, plotWidth, plotHeight, columnWidth, price, locale])

  const onMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - box.left
    const yPos = event.clientY - box.top
    if (x < 0 || x >= plotWidth || yPos < 0 || yPos >= plotHeight) return setHover(undefined)
    setHover({ column: Math.floor(x / columnWidth), row: Math.floor(((plotHeight - yPos) / plotHeight) * map.rows) })
  }

  let readout = t('liq.hint')
  if (hover) {
    const level = map.min + ((hover.row + 0.5) / map.rows) * (map.max - map.min)
    const usd = map.cells[hover.column * map.rows + hover.row] ?? 0
    const close = map.candles[hover.column]![4]
    readout = t(level < close ? 'liq.hoverLongs' : 'liq.hoverShorts', {
      price: price(level),
      time: new Intl.DateTimeFormat(intlLocale(locale), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(map.times[hover.column]!),
      usd: money(usd),
    })
  }

  return (
    <>
      <p className="caption numeric liq__readout" aria-live="polite">
        {readout}
      </p>
      <div className="liq__canvas">
        <canvas
          ref={canvas}
          style={{ width: '100%', height: HEIGHT }}
          role="img"
          aria-label={t('liq.alt', { coin, above: map.above ? price(map.above.price) : '—', below: map.below ? price(map.below.price) : '—' })}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(undefined)}
        />
      </div>
    </>
  )
}
