import Big from 'big.js'
import { ExternalLink, Maximize2, Minimize2, Minus, Plus, RotateCcw } from 'lucide-react'
import { useDeferredValue, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { SUPABASE_URL } from '../../app/cloudConfig'
import { updateSettings, useSettings } from '../../app/settings'
import { cellScale, isFullView, liquidationMap, outerView, panView, sameView, zoomView, type LiquidationMap as Map_, type MapView, type MarketSeries } from '../../core/liquidationMap'
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
/** Room the expanded view keeps for the controls, the readout and the legend around the map. */
const EXPANDED_CHROME = 230
const AXIS_RIGHT = 64
const AXIS_BOTTOM = 22

type Load = { state: 'loading' } | { state: 'ready'; map: Map_; series: MarketSeries; at: Date } | { state: 'error' }

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
  const [expanded, setExpanded] = useState(false)
  const [viewport, setViewport] = useState(() => window.innerHeight)
  const choose = (next: { coin?: Coin; period?: Period }) => updateSettings({ liquidationMap: { coin: next.coin ?? coin, period: next.period ?? period } })

  useEffect(() => {
    let current = true
    setLoad({ state: 'loading' })
    fetchSeries(coin, period)
      .then(({ series, at }) => {
        const map = liquidationMap(series)
        if (current) setLoad(map ? { state: 'ready', map, series, at } : { state: 'error' })
      })
      .catch(() => current && setLoad({ state: 'error' }))
    return () => {
      current = false
    }
  }, [coin, period])

  // The expanded map fills the window: Escape or the button brings it back.
  useEffect(() => {
    if (!expanded) return
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setExpanded(false)
    const onResize = () => setViewport(window.innerHeight)
    onResize()
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onResize)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
      document.body.style.overflow = ''
    }
  }, [expanded])
  const height = expanded ? Math.max(HEIGHT, viewport - EXPANDED_CHROME) : HEIGHT

  const money = (usd: number) => formatMoneyCompact(new Big(Math.round(usd)), 'USD', locale).replace(/^\+/, '')
  const price = (value: number) => formatDecimal(String(Number(value.toPrecision(value >= 100 ? 6 : 4))), locale)
  const percent = (value: number) => `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(1)}%`

  const content = (
    <div className={expanded ? 'liq liq--expanded' : 'liq'} role={expanded ? 'dialog' : undefined} aria-modal={expanded || undefined} aria-label={expanded ? t('liq.title') : undefined}>
      <div className="liq__top">
        <p className="caption">{expanded ? `${t('liq.title')} · ${t('liq.subtitle')}` : t('liq.subtitle')}</p>
        <button type="button" className="icon-button" aria-label={t(expanded ? 'liq.collapse' : 'liq.expand')} aria-pressed={expanded} onClick={() => setExpanded(!expanded)}>
          {expanded ? <Minimize2 size={18} aria-hidden="true" /> : <Maximize2 size={18} aria-hidden="true" />}
        </button>
      </div>
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
          <Plot key={`${coin}-${period}`} map={load.map} series={load.series} coin={coin} money={money} price={price} height={height} expanded={expanded} />
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
  // Expanded, the block moves to the page's end so no card or grid around it limits its size.
  return expanded ? (
    <>
      <p className="caption liq__status">{t('liq.expandedNote')}</p>
      {createPortal(content, document.body)}
    </>
  ) : (
    content
  )
}

function Plot({
  map: full,
  series,
  coin,
  money,
  price,
  height: HEIGHT,
  expanded,
}: {
  map: Map_
  series: MarketSeries
  coin: Coin
  money: (usd: number) => string
  price: (value: number) => string
  height: number
  expanded: boolean
}) {
  const { t, locale } = useI18n()
  const canvas = useRef<HTMLCanvasElement>(null)
  const [width, setWidth] = useState(0)
  const [hover, setHover] = useState<{ x: number; y: number }>()
  // Every bar fetched, the warm-up before the period included, so the map can zoom out past it.
  const all = useMemo(() => ({ ...series, count: series.candles.length }), [series])
  const total = useMemo(() => liquidationMap(all)?.times.length ?? full.times.length, [all, full])
  // Home is the period at its default prices; zooming out may go to every bar and 4× the prices.
  const home = useMemo<MapView>(() => ({ from: total - full.times.length, to: total, min: full.min, max: full.max }), [total, full])
  const whole = useMemo(() => outerView(home, total), [home, total])
  const [view, setView] = useState<MapView>(home)
  const zoomed = !sameView(view, home)
  const farthest = isFullView(view, whole)
  // A zoomed price range gets its own fine rows; the deferred range keeps wheel zooming smooth.
  const priceRange = useDeferredValue(useMemo(() => ({ min: view.min, max: view.max }), [view.min, view.max]))
  const map = useMemo(
    () => liquidationMap(all, full.rows, priceRange) ?? full,
    [all, full, priceRange],
  )
  const first = Math.max(0, Math.floor(view.from))
  const last = Math.min(map.times.length, Math.ceil(view.to))
  const scale = useMemo(() => cellScale(map.cells.slice(first * map.rows, last * map.rows)), [map, first, last])

  useEffect(() => {
    const element = canvas.current?.parentElement
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry!.contentRect.width)))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const plotWidth = Math.max(0, width - AXIS_RIGHT)
  const plotHeight = HEIGHT - AXIS_BOTTOM
  const bars = view.to - view.from
  const columnWidth = plotWidth / bars
  const x = (column: number) => ((column - view.from) / bars) * plotWidth
  const y = (value: number) => plotHeight * (1 - (value - view.min) / (view.max - view.min))

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
    context.save()
    context.beginPath()
    context.rect(0, 0, plotWidth, plotHeight)
    context.clip()

    // The map: one rectangle per cell, its color by the money waiting there.
    const rowHeight = (map.max - map.min) / map.rows
    for (let column = first; column < last; column += 1) {
      for (let row = 0; row < map.rows; row += 1) {
        const cellTop = y(map.min + (row + 1) * rowHeight)
        const cellBottom = y(map.min + row * rowHeight)
        if (cellBottom < 0 || cellTop > plotHeight) continue
        const value = Math.min(1, map.cells[column * map.rows + row]! / scale)
        const color = value < 0.5 ? mix(colors.low, colors.mid, value * 2) : mix(colors.mid, colors.high, (value - 0.5) * 2)
        context.fillStyle = `rgb(${color.join(',')})`
        context.fillRect(x(column), cellTop, columnWidth + 0.5, cellBottom - cellTop + 0.5)
      }
    }

    // Candles over it: hollow when rising, filled when falling, outlined with the surface for contrast.
    const body = Math.max(1, columnWidth * 0.6)
    for (let column = first; column < last; column += 1) {
      const [, open, high, low, close] = map.candles[column]!
      const center = x(column) + columnWidth / 2
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
    }

    // Zoomed out past the period: where it starts. Bars before it only warm the model up, so the
    // map there is thinner than the market was.
    if (view.from < home.from) {
      context.setLineDash([2, 4])
      context.strokeStyle = colors.muted
      context.beginPath()
      context.moveTo(x(home.from), 0)
      context.lineTo(x(home.from), plotHeight)
      context.stroke()
      context.setLineDash([])
    }

    // The price now.
    context.setLineDash([4, 4])
    context.strokeStyle = colors.text
    context.beginPath()
    context.moveTo(0, y(full.price))
    context.lineTo(plotWidth, y(full.price))
    context.stroke()
    context.setLineDash([])

    if (hover) {
      context.strokeStyle = colors.text
      context.globalAlpha = 0.5
      context.beginPath()
      context.moveTo(hover.x, 0)
      context.lineTo(hover.x, plotHeight)
      context.moveTo(0, hover.y)
      context.lineTo(plotWidth, hover.y)
      context.stroke()
      context.globalAlpha = 1
    }
    context.restore()

    // Axes.
    context.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace'
    context.fillStyle = colors.muted
    context.textBaseline = 'middle'
    const priceShown = full.price >= view.min && full.price <= view.max
    for (let tick = 1; tick <= 4; tick += 1) {
      const value = view.min + ((view.max - view.min) * tick) / 5
      // A tick next to the price now would print over its label.
      if (priceShown && Math.abs(y(value) - y(full.price)) < 16) continue
      context.fillText(price(value), plotWidth + 6, y(value))
    }
    if (full.price >= view.min && full.price <= view.max) {
      context.fillStyle = colors.text
      context.fillText(price(full.price), plotWidth + 6, y(full.price))
    }
    context.fillStyle = colors.muted
    context.textBaseline = 'alphabetic'
    const span = map.times[Math.max(first, last - 1)]! - map.times[first]!
    const format = new Intl.DateTimeFormat(intlLocale(locale), span > 2 * 86_400_000 ? { day: 'numeric', month: 'short' } : { day: 'numeric', hour: '2-digit', minute: '2-digit' })
    for (const share of [0, 0.5, 1]) {
      const column = Math.min(map.times.length - 1, Math.max(0, Math.floor(view.from + share * (bars - 1))))
      context.textAlign = share === 0 ? 'left' : share === 1 ? 'right' : 'center'
      context.fillText(format.format(map.times[column]!), share * plotWidth, HEIGHT - 6)
    }
    context.textAlign = 'left'
  }, [map, full, home, view, first, last, width, hover, scale, plotWidth, plotHeight, columnWidth, price, locale, HEIGHT, bars])

  // Wheel: zoom around the pointer; over the price axis, prices only. Not passive, so the page
  // doesn't scroll while the map zooms.
  useEffect(() => {
    const element = canvas.current
    if (!element) return
    const onWheel = (event: WheelEvent) => {
      const box = element.getBoundingClientRect()
      const px = event.clientX - box.left
      const py = event.clientY - box.top
      if (py > plotHeight) return
      event.preventDefault()
      const factor = Math.exp(Math.max(-1, Math.min(1, event.deltaY / 300)))
      const onAxis = px > plotWidth
      setView((current) =>
        zoomView(current, whole, factor, { x: Math.min(1, px / plotWidth), y: 1 - py / plotHeight }, { time: !onAxis && !event.shiftKey, price: onAxis || !event.altKey }),
      )
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [whole, plotWidth, plotHeight])

  // Drag to move; two fingers to zoom.
  // Like TradingView: dragging the price scale stretches prices (up) or squeezes them (down);
  // dragging the time scale stretches bars (right) or squeezes them (left). Elsewhere, drag moves.
  type Zone = 'plot' | 'price' | 'time'
  const zoneAt = (px: number, py: number): Zone => (py > plotHeight ? 'time' : px > plotWidth ? 'price' : 'plot')
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const dragZone = useRef<Zone>('plot')
  const [zone, setZone] = useState<Zone>('plot')
  const onDown = (event: PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    const box = event.currentTarget.getBoundingClientRect()
    if (pointers.current.size === 0) dragZone.current = zoneAt(event.clientX - box.left, event.clientY - box.top)
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
  }
  const onUp = (event: PointerEvent<HTMLCanvasElement>) => {
    pointers.current.delete(event.pointerId)
  }
  const onMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    const px = event.clientX - box.left
    const py = event.clientY - box.top
    const previous = pointers.current.get(event.pointerId)
    if (previous) {
      const others = [...pointers.current.entries()].filter(([id]) => id !== event.pointerId)
      if (others.length === 1) {
        const other = others[0]![1]
        const before = Math.hypot(previous.x - other.x, previous.y - other.y)
        const after = Math.hypot(event.clientX - other.x, event.clientY - other.y)
        if (before > 0 && after > 0) {
          const middle = { x: ((event.clientX + other.x) / 2 - box.left) / plotWidth, y: 1 - ((event.clientY + other.y) / 2 - box.top) / plotHeight }
          setView((current) => zoomView(current, whole, before / after, { x: Math.min(1, Math.max(0, middle.x)), y: Math.min(1, Math.max(0, middle.y)) }))
        }
      } else if (others.length === 0) {
        const dx = event.clientX - previous.x
        const dy = event.clientY - previous.y
        if (dragZone.current === 'price') {
          setView((current) => zoomView(current, whole, Math.exp(dy / 200), { x: 0.5, y: 0.5 }, { time: false, price: true }))
        } else if (dragZone.current === 'time') {
          // The latest bar stays put, as on TradingView's time scale.
          setView((current) => zoomView(current, whole, Math.exp(-dx / 200), { x: 1, y: 0.5 }, { time: true, price: false }))
        } else {
          setView((current) => panView(current, whole, -dx / plotWidth, dy / plotHeight))
        }
      }
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
      setHover(undefined)
      return
    }
    setZone(zoneAt(px, py))
    if (px < 0 || px >= plotWidth || py < 0 || py >= plotHeight) return setHover(undefined)
    setHover({ x: px, y: py })
  }

  const zoomBy = (factor: number) => setView((current) => zoomView(current, whole, factor, { x: 0.5, y: 0.5 }))

  let readout = t('liq.hint')
  if (hover) {
    const column = Math.min(map.times.length - 1, Math.max(0, Math.floor(view.from + (hover.x / plotWidth) * bars)))
    const level = view.min + (1 - hover.y / plotHeight) * (view.max - view.min)
    const row = Math.floor(((level - map.min) / (map.max - map.min)) * map.rows)
    const usd = row >= 0 && row < map.rows ? (map.cells[column * map.rows + row] ?? 0) : 0
    const close = map.candles[column]![4]
    readout = t(level < close ? 'liq.hoverLongs' : 'liq.hoverShorts', {
      price: price(level),
      time: new Intl.DateTimeFormat(intlLocale(locale), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(map.times[column]!),
      usd: money(usd),
    })
  }

  return (
    <>
      <div className="liq__toolbar">
        <p className="caption numeric liq__readout" aria-live="polite">
          {readout}
        </p>
        <div className="liq__zoom">
          <button type="button" className="icon-button" aria-label={t('liq.zoomIn')} onClick={() => zoomBy(0.6)}>
            <Plus size={16} aria-hidden="true" />
          </button>
          <button type="button" className="icon-button" aria-label={t('liq.zoomOut')} disabled={farthest} onClick={() => zoomBy(1 / 0.6)}>
            <Minus size={16} aria-hidden="true" />
          </button>
          <button type="button" className="icon-button" aria-label={t('liq.zoomReset')} disabled={!zoomed} onClick={() => setView(home)}>
            <RotateCcw size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="liq__canvas">
        <canvas
          ref={canvas}
          className={['liq__plot', zoomed || expanded ? 'liq__plot--grab' : '', zone === 'price' ? 'liq__plot--price' : zone === 'time' ? 'liq__plot--time' : ''].filter(Boolean).join(' ')}
          style={{ width: '100%', height: HEIGHT }}
          role="img"
          aria-label={t('liq.alt', { coin, above: full.above ? price(full.above.price) : '—', below: full.below ? price(full.below.price) : '—' })}
          onPointerDown={onDown}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(undefined)}
          onDoubleClick={() =>
            // On a scale, double-click resets that scale only; on the map, the whole view.
            setView((current) =>
              zone === 'price' ? { ...current, min: home.min, max: home.max } : zone === 'time' ? { ...current, from: home.from, to: home.to } : home,
            )
          }
        />
      </div>
      <p className="caption liq__zoomhint">{t('liq.zoomHint')}</p>
    </>
  )
}
