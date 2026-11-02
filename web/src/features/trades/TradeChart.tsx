import { CandlestickChart, EyeOff } from 'lucide-react'
import { useEffect, useMemo, useState, type PointerEvent } from 'react'
import { updateSettings, useSettings } from '../../app/settings'
import { binanceSymbol, chartWindow, klinesUrl, parseKlines, priceRange, type Candle, type ChartWindow } from '../../core/chart'
import { tradePnl } from '../../core/pnl'
import type { Trade } from '../../core/models'
import { Button, Card, SectionHeader } from '../../design/components'
import { formatDateTime, formatDecimal, intlLocale } from '../../i18n/format'
import { useI18n } from '../../i18n/i18n'

// Price chart of a crypto trade (SPEC section 4.6). Off until the trader turns it on, because
// the candles come from Binance: it learns the pair, the time span and the visitor's address.

const WIDTH = 640
const HEIGHT = 240
const PAD = { top: 12, right: 64, bottom: 24, left: 8 }

type Load = { state: 'loading' } | { state: 'ready'; candles: Candle[]; span: ChartWindow } | { state: 'empty' } | { state: 'error' }

/** Candles already fetched in this tab, by request URL. */
const cache = new Map<string, Candle[]>()

export function TradeChart({ trade }: { trade: Trade }) {
  const { t } = useI18n()
  const shown = useSettings().tradeCharts === true
  const symbol = trade.market === 'cryptoSpot' || trade.market === 'cryptoPerp' ? binanceSymbol(trade.symbol) : undefined
  if (!symbol) return null

  return (
    <>
      <SectionHeader title={t('chart.title')} />
      <Card className="trade-chart">
        {shown ? (
          <ChartBody trade={trade} symbol={symbol} />
        ) : (
          <>
            <p className="secondary-text">{t('chart.intro')}</p>
            <p className="caption">{t('chart.thirdParty')}</p>
            <Button icon={<CandlestickChart size={18} aria-hidden="true" />} onClick={() => updateSettings({ tradeCharts: true })}>
              {t('chart.show')}
            </Button>
          </>
        )}
      </Card>
    </>
  )
}

function ChartBody({ trade, symbol }: { trade: Trade; symbol: string }) {
  const { t } = useI18n()
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  const span = useMemo(() => chartWindow(trade, new Date()), [trade])
  const url = klinesUrl(symbol, span)

  useEffect(() => {
    let current = true
    const cached = cache.get(url)
    if (cached) {
      setLoad(cached.length ? { state: 'ready', candles: cached, span } : { state: 'empty' })
      return
    }
    setLoad({ state: 'loading' })
    fetch(url)
      .then(async (response) => {
        // An unknown pair is a 400 from Binance: there is simply no data to show.
        const candles = response.ok ? parseKlines(await response.json()) : response.status === 400 ? [] : undefined
        if (!candles) throw new Error(`Binance ${response.status}`)
        cache.set(url, candles)
        if (current) setLoad(candles.length ? { state: 'ready', candles, span } : { state: 'empty' })
      })
      .catch(() => current && setLoad({ state: 'error' }))
    return () => {
      current = false
    }
  }, [url, span])

  return (
    <div className="trade-chart__body">
      {load.state === 'loading' && <p className="caption" role="status">{t('chart.loading')}</p>}
      {load.state === 'empty' && <p className="secondary-text">{t('chart.empty', { symbol })}</p>}
      {load.state === 'error' && <p className="secondary-text">{t('chart.error')}</p>}
      {load.state === 'ready' && <Plot trade={trade} symbol={symbol} candles={load.candles} span={load.span} />}
      <div className="trade-chart__footer">
        <p className="caption">
          {t('chart.credit')}{' '}
          <a href={`https://www.binance.com/en/trade/${symbol}`} target="_blank" rel="noopener noreferrer nofollow">
            Binance
          </a>
        </p>
        <Button variant="plain" icon={<EyeOff size={16} aria-hidden="true" />} onClick={() => updateSettings({ tradeCharts: false })}>
          {t('chart.hide')}
        </Button>
      </div>
    </div>
  )
}

function Plot({ trade, symbol, candles, span }: { trade: Trade; symbol: string; candles: Candle[]; span: ChartWindow }) {
  const { t, locale } = useI18n()
  const [hover, setHover] = useState<number>()
  const pnl = tradePnl(trade)
  const exits = trade.exits?.length
    ? trade.exits.map((exit) => ({ time: Date.parse(exit.closedAt), price: Number(exit.price) }))
    : trade.exitPrice && trade.closedAt
      ? [{ time: Date.parse(trade.closedAt), price: Number(trade.exitPrice) }]
      : []
  const entry = { time: Date.parse(trade.openedAt), price: Number(trade.entryPrice) }
  const stop = trade.stopLoss ? Number(trade.stopLoss) : undefined
  const initialStop = trade.initialStopLoss && trade.initialStopLoss !== trade.stopLoss ? Number(trade.initialStopLoss) : undefined
  const takeProfit = trade.takeProfit ? Number(trade.takeProfit) : undefined

  const levels = [entry.price, ...exits.map((exit) => exit.price), stop, initialStop, takeProfit].filter((value): value is number => value !== undefined)
  const { min, max } = priceRange(candles, levels)
  const step = candles.length > 1 ? candles[1]!.time - candles[0]!.time : 60_000
  const from = candles[0]!.time
  const to = candles.at(-1)!.time + step
  const plotWidth = WIDTH - PAD.left - PAD.right
  const plotHeight = HEIGHT - PAD.top - PAD.bottom
  const x = (time: number) => PAD.left + ((time - from) / (to - from)) * plotWidth
  const y = (price: number) => PAD.top + (1 - (price - min) / (max - min)) * plotHeight
  const candleWidth = Math.max(1, (plotWidth / candles.length) * 0.6)
  const price = (value: number) => formatDecimal(String(Number(value.toPrecision(8))), locale)
  const time = (ms: number) => new Intl.DateTimeFormat(intlLocale(locale), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(ms)
  // Hours on a chart within a day, dates on a longer one.
  const axisTime = (ms: number) =>
    new Intl.DateTimeFormat(intlLocale(locale), to - from > 86_400_000 ? { month: 'short', day: 'numeric' } : { hour: '2-digit', minute: '2-digit' }).format(ms)
  const result = pnl ? (pnl.gt(0) ? 'profit' : pnl.lt(0) ? 'loss' : 'neutral') : 'neutral'
  const ticks = [0, 0.5, 1].map((share) => min + (max - min) * (1 - share) * 0.9 + (max - min) * 0.05)

  const onMove = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    const at = from + (((event.clientX - box.left) / box.width) * WIDTH - PAD.left) / plotWidth * (to - from)
    const index = Math.floor((at - from) / step)
    setHover(index >= 0 && index < candles.length ? index : undefined)
  }
  const hovered = hover !== undefined ? candles[hover] : undefined

  const label = t('chart.alt', {
    symbol,
    interval: span.interval,
    entry: price(entry.price),
    exit: exits.length ? exits.map((item) => price(item.price)).join(', ') : '—',
  })

  return (
    <>
      <p className="caption numeric trade-chart__readout" aria-live="polite">
        {hovered
          ? t('chart.ohlc', { time: time(hovered.time), open: price(hovered.open), high: price(hovered.high), low: price(hovered.low), close: price(hovered.close) })
          : `${symbol} · ${span.interval}`}
      </p>
      <svg
        className="trade-chart__svg"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={label}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(undefined)}
      >
        {ticks.map((value) => (
          <g key={value} className="trade-chart__grid">
            <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(value)} y2={y(value)} />
            <text x={WIDTH - PAD.right + 6} y={y(value) + 4}>
              {price(value)}
            </text>
          </g>
        ))}
        {/* The trade's span. */}
        <rect className="trade-chart__span" x={x(entry.time)} y={PAD.top} width={Math.max(1, x(exits.at(-1)?.time ?? to) - x(entry.time))} height={plotHeight} />
        {candles.map((candle, index) => {
          const up = candle.close >= candle.open
          const center = x(candle.time + step / 2)
          return (
            <g key={candle.time} className={`trade-chart__candle${up ? ' trade-chart__candle--up' : ''}${index === hover ? ' trade-chart__candle--hover' : ''}`}>
              <line x1={center} x2={center} y1={y(candle.high)} y2={y(candle.low)} />
              <rect x={center - candleWidth / 2} width={candleWidth} y={y(Math.max(candle.open, candle.close))} height={Math.max(1, Math.abs(y(candle.open) - y(candle.close)))} />
            </g>
          )
        })}
        {[from, (from + to) / 2, to].map((value, index) => (
          <text key={value} className="trade-chart__time" x={PAD.left + (plotWidth * index) / 2} y={HEIGHT - 6} textAnchor={index === 0 ? 'start' : index === 1 ? 'middle' : 'end'}>
            {axisTime(value)}
          </text>
        ))}
        {takeProfit !== undefined && <Level className="trade-chart__level--target" y={y(takeProfit)} label={t('chart.takeProfit')} />}
        {initialStop !== undefined && <Level className="trade-chart__level--stop trade-chart__level--faint" y={y(initialStop)} label={t('chart.initialStop')} />}
        {stop !== undefined && <Level className="trade-chart__level--stop" y={y(stop)} label={t('chart.stop')} />}
        <Level className="trade-chart__level--entry" y={y(entry.price)} label={t('chart.entry')} />
        <circle className="trade-chart__marker trade-chart__marker--entry" cx={x(entry.time)} cy={y(entry.price)} r={5} />
        {exits.map((exit) => (
          <circle key={exit.time} className={`trade-chart__marker trade-chart__marker--${result}`} cx={x(exit.time)} cy={y(exit.price)} r={5} />
        ))}
      </svg>
      <ul className="trade-chart__legend caption">
        <li>
          <span className="trade-chart__key trade-chart__key--entry" aria-hidden="true" />
          {t('chart.entry')} {price(entry.price)}
        </li>
        {exits.length > 0 && (
          <li>
            <span className={`trade-chart__key trade-chart__key--${result}`} aria-hidden="true" />
            {t('chart.exit')} {exits.map((item) => price(item.price)).join(' · ')}
          </li>
        )}
        {stop !== undefined && (
          <li>
            <span className="trade-chart__key trade-chart__key--stop" aria-hidden="true" />
            {t('chart.stop')} {price(stop)}
          </li>
        )}
      </ul>
      <p className="caption">{t('chart.span', { from: formatDateTime(trade.openedAt, locale), to: trade.closedAt ? formatDateTime(trade.closedAt, locale) : '—' })}</p>
    </>
  )
}

function Level({ className, y, label }: { className: string; y: number; label: string }) {
  return (
    <g className={`trade-chart__level ${className}`}>
      <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y} y2={y} />
      <text x={PAD.left + 4} y={y - 4}>
        {label}
      </text>
    </g>
  )
}
