// The analytics dashboard's layout: which blocks show, in what order and how wide, on a
// 12-column grid. Heights follow the content. Pure, so the editing rules are tested.

export const WIDGET_IDS = [
  'performance',
  'tradeCount',
  'streaks',
  'equity',
  'tradeStats',
  'mistakeCost',
  'byEmotion',
  'calendar',
  'econCalendar',
  'liquidations',
  'sessions',
  'checkins',
  'byWeekday',
  'byHour',
  'bySetup',
  'bySymbol',
  'byHold',
  'byRating',
  'metrics',
] as const
export type WidgetId = (typeof WIDGET_IDS)[number]

/** Widths in grid columns: a quarter, a third, a half, two thirds, the full row. */
export const WIDTHS = [3, 4, 6, 8, 12] as const
export type WidgetWidth = (typeof WIDTHS)[number]

export interface LayoutItem {
  id: WidgetId
  width: WidgetWidth
}

export interface DashboardLayout {
  items: LayoutItem[]
  hidden: WidgetId[]
}

/** Narrowest width a block still reads well at. */
export const MIN_WIDTH: Record<WidgetId, WidgetWidth> = {
  performance: 3,
  tradeCount: 3,
  streaks: 3,
  equity: 6,
  tradeStats: 3,
  mistakeCost: 4,
  byEmotion: 4,
  calendar: 6,
  econCalendar: 4,
  liquidations: 6,
  sessions: 4,
  checkins: 4,
  byWeekday: 4,
  byHour: 6,
  bySetup: 6,
  bySymbol: 6,
  byHold: 4,
  byRating: 4,
  metrics: 6,
}

const DEFAULT_ITEMS: LayoutItem[] = [
  { id: 'performance', width: 4 },
  { id: 'tradeCount', width: 4 },
  { id: 'streaks', width: 4 },
  { id: 'equity', width: 8 },
  { id: 'tradeStats', width: 4 },
  { id: 'mistakeCost', width: 6 },
  { id: 'byEmotion', width: 6 },
  { id: 'calendar', width: 6 },
  { id: 'sessions', width: 6 },
  { id: 'econCalendar', width: 6 },
  { id: 'liquidations', width: 12 },
  { id: 'checkins', width: 4 },
  { id: 'byWeekday', width: 6 },
  { id: 'bySetup', width: 6 },
  { id: 'byHour', width: 12 },
  { id: 'bySymbol', width: 6 },
  { id: 'byHold', width: 6 },
  { id: 'byRating', width: 6 },
]

/** The key-metric tiles repeat the performance and trade stats blocks, so they start hidden. */
const DEFAULT_HIDDEN: WidgetId[] = ['metrics']

const DEFAULT_WIDTH = Object.fromEntries([...DEFAULT_ITEMS, { id: 'metrics', width: 12 }].map((item) => [item.id, item.width])) as Record<WidgetId, WidgetWidth>

export function defaultLayout(): DashboardLayout {
  return { items: DEFAULT_ITEMS.map((item) => ({ ...item })), hidden: [...DEFAULT_HIDDEN] }
}

const isWidget = (value: unknown): value is WidgetId => typeof value === 'string' && (WIDGET_IDS as readonly string[]).includes(value)

/** The allowed width closest to `columns`, never under the block's minimum. */
export function snapWidth(id: WidgetId, columns: number): WidgetWidth {
  const allowed = WIDTHS.filter((width) => width >= MIN_WIDTH[id])
  return allowed.reduce((best, width) => (Math.abs(width - columns) < Math.abs(best - columns) ? width : best), allowed[0]!)
}

/**
 * A saved layout made safe: unknown or repeated blocks dropped, widths snapped, and blocks
 * added in a later version appended with their default width, so users see new blocks.
 */
export function normalizeLayout(saved: unknown): DashboardLayout {
  if (!saved || typeof saved !== 'object') return defaultLayout()
  const raw = saved as { items?: unknown; hidden?: unknown }
  const seen = new Set<WidgetId>()
  const items: LayoutItem[] = []
  for (const item of Array.isArray(raw.items) ? raw.items : []) {
    const id = (item as { id?: unknown })?.id
    if (!isWidget(id) || seen.has(id)) continue
    seen.add(id)
    const width = Number((item as { width?: unknown }).width)
    items.push({ id, width: snapWidth(id, Number.isFinite(width) ? width : DEFAULT_WIDTH[id]) })
  }
  const hidden = (Array.isArray(raw.hidden) ? raw.hidden : []).filter((id): id is WidgetId => isWidget(id) && !seen.has(id) && (seen.add(id), true))
  for (const id of WIDGET_IDS) {
    if (!seen.has(id)) items.push({ id, width: DEFAULT_WIDTH[id] })
  }
  return { items, hidden }
}

export function moveWidget(layout: DashboardLayout, id: WidgetId, toIndex: number): DashboardLayout {
  const from = layout.items.findIndex((item) => item.id === id)
  if (from < 0) return layout
  const target = Math.max(0, Math.min(layout.items.length - 1, toIndex))
  if (target === from) return layout
  const items = [...layout.items]
  const [moved] = items.splice(from, 1)
  items.splice(target, 0, moved!)
  return { ...layout, items }
}

export function resizeWidget(layout: DashboardLayout, id: WidgetId, columns: number): DashboardLayout {
  const width = snapWidth(id, columns)
  if (layout.items.find((item) => item.id === id)?.width === width) return layout
  return { ...layout, items: layout.items.map((item) => (item.id === id ? { ...item, width } : item)) }
}

/** One allowed width wider (1) or narrower (-1). */
export function stepWidth(layout: DashboardLayout, id: WidgetId, direction: 1 | -1): DashboardLayout {
  const current = layout.items.find((item) => item.id === id)
  if (!current) return layout
  const allowed = WIDTHS.filter((width) => width >= MIN_WIDTH[id])
  const index = allowed.indexOf(current.width) + direction
  const next = allowed[Math.max(0, Math.min(allowed.length - 1, index))]!
  return resizeWidget(layout, id, next)
}

export function hideWidget(layout: DashboardLayout, id: WidgetId): DashboardLayout {
  if (!layout.items.some((item) => item.id === id)) return layout
  return { items: layout.items.filter((item) => item.id !== id), hidden: [...layout.hidden, id] }
}

/** Puts a hidden block back at the end, at its default width. */
export function showWidget(layout: DashboardLayout, id: WidgetId): DashboardLayout {
  if (!layout.hidden.includes(id)) return layout
  return { items: [...layout.items, { id, width: DEFAULT_WIDTH[id] }], hidden: layout.hidden.filter((hidden) => hidden !== id) }
}
