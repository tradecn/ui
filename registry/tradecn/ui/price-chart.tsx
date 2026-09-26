import "uplot/dist/uPlot.min.css"
import { cn } from "cn"
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentProps, type KeyboardEvent, type ReactNode } from "react"
import uPlot from "uplot"
import { directionClass, type Direction } from "@/registry/tradecn/hooks/use-flash"
import { useStoreMeta } from "@/registry/tradecn/hooks/use-row-store"
import { formatPercent, formatPrice, formatQuantity, NUMERIC_CLASS, numericFontClass, type InstrumentConvention, type PriceConvention } from "@/registry/tradecn/lib/format"
import { columnsOf, dayFormatter, EMPTY_COLUMNS, formatChange, priceIncrements, priceOf, summarize, timeFormatter, type Bar, type BarColumns, type SeriesSummary } from "@/registry/tradecn/lib/price-series"
import type { RowStore } from "@/registry/tradecn/lib/row-store"

// The root reads the store once per batch. Public readings share that snapshot; the plot owns its
// canvas, observers and keyboard crosshair. Moving surrounding content never remakes the plot.
// Canvas colors are read from the page tokens at mount and whenever the page theme changes.
// Direction has channels beyond hue (contract rule 15): Last and Change carry data-direction,
// Change prints a sign, and the plot's accessible name says the direction in a word. Compose
// Change or your own sign beside Last so its visible direction does not depend on color.

export type PriceChartKind = "line" | "candles"

export interface PriceChartOverlay {
  id: string
  /** The word beside the swatch in the legend: what the line is, since its color alone says nothing. */
  label: string
  /** One value per bar, in the bars' order; null leaves a gap. Called once per applied batch. */
  values: (bars: readonly Bar[]) => readonly (number | null)[]
  /** Which chart token draws it, 1 to 8. Default: its place in the list. */
  color?: number
  /** Line width in CSS px. Default 1. */
  width?: number
}

export interface PriceChartLabels {
  noData: string
  open: string
  high: string
  low: string
  close: string
  volume: string
  overlays: string
  up: string
  down: string
  flat: string
  bars: string
}

export const DEFAULT_PRICE_CHART_LABELS: PriceChartLabels = { noData: "No data", open: "O", high: "H", low: "L", close: "C", volume: "V", overlays: "Overlays", up: "up", down: "down", flat: "flat", bars: "bars" }

export interface PriceChartProps extends Omit<ComponentProps<"div">, "children"> {
  /** Compose the plot and any readings, legend or application content explicitly. */
  children: ReactNode
  /** Bars keyed by `barId(time)`, fed with `foldTicks` or with whole bars. */
  store: RowStore<Bar>
  /** Prints the prices on the axis, in the readout, and on the last-price tag, and sets the axis grid. */
  convention: PriceConvention | InstrumentConvention
  /** What this is, for a screen reader: "ZN, today". The direction, last, change, and range are added. */
  label: string
  /** A line through the closes, or a candle per bar. Default `line`. */
  kind?: PriceChartKind
  /** A previous close: the change is measured from it and it is drawn as a dashed line. Without one, from the first bar's open. */
  baseline?: number | null
  /** IANA zone for the time axis and the readout: the venue's. Default: the runtime's. */
  zone?: string
  locale?: string
  /** Lines over the bars. Compose their legend with PriceChartLegend and PriceChartOverlaySwatch. */
  overlays?: readonly PriceChartOverlay[]
  /** The crosshair, moved by the pointer and by the arrow keys. Default true. */
  crosshair?: boolean
  /** The dashed line and the tag at the last close. Default true. */
  lastLine?: boolean
  /** Height in px. Without it the chart fills its box, `h-64` unless your className says otherwise. */
  height?: number
  labels?: Partial<PriceChartLabels>
  /** The bar under the crosshair, or null when it leaves. */
  onCursor?: (bar: Bar | null) => void
}

/** The eight chart tokens as utilities, in Okabe and Ito's order, for a legend swatch or a consumer's own key. */
export const CHART_TOKEN_CLASS = ["bg-chart-1", "bg-chart-2", "bg-chart-3", "bg-chart-4", "bg-chart-5", "bg-chart-6", "bg-chart-7", "bg-chart-8"] as const

const CHART_TOKENS = ["--chart-1", "--chart-2", "--chart-3", "--chart-4", "--chart-5", "--chart-6", "--chart-7", "--chart-8"]
const FALLBACK_MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"

interface Palette {
  up: string
  down: string
  flat: string
  upSoft: string
  downSoft: string
  flatSoft: string
  foreground: string
  mutedForeground: string
  border: string
  background: string
  chart: string[]
  /** The mono stack, for the axis and the tag: tabular by construction, since a canvas has no numeric variant. */
  font: string
}

/** The tokens the canvas draws with, resolved through a probe element so a var() chain and a mode both come out as one color. */
function readPalette(host: HTMLElement): Palette {
  const probe = document.createElement("i")
  probe.hidden = true
  host.append(probe)
  const read = (token: string) => {
    probe.style.color = `var(${token})`
    return getComputedStyle(probe).color
  }
  const palette: Palette = {
    up: read("--up"),
    down: read("--down"),
    flat: read("--flat"),
    upSoft: read("--up-soft"),
    downSoft: read("--down-soft"),
    flatSoft: read("--flat-soft"),
    foreground: read("--foreground"),
    mutedForeground: read("--muted-foreground"),
    border: read("--border"),
    background: read("--background"),
    chart: CHART_TOKENS.map(read),
    font: getComputedStyle(host).getPropertyValue("--tradecn-font-mono").trim() || FALLBACK_MONO,
  }
  probe.remove()
  return palette
}

/** Before the page has been read: grays that never reach the canvas, since the plot is made only after readPalette ran. */
const UNREAD_PALETTE: Palette = { up: "gray", down: "gray", flat: "gray", upSoft: "gray", downSoft: "gray", flatSoft: "gray", foreground: "gray", mutedForeground: "gray", border: "gray", background: "white", chart: CHART_TOKENS.map(() => "gray"), font: FALLBACK_MONO }

const tone = (p: Palette, dir: Direction) => (dir === "up" ? p.up : dir === "down" ? p.down : p.flat)
const soft = (p: Palette, dir: Direction) => (dir === "up" ? p.upSoft : dir === "down" ? p.downSoft : p.flatSoft)

let drawable: boolean | null = null
/** Whether this document can draw on a canvas at all. A test environment without a 2D context gets the readout and the keys and no plot. */
function canDraw(): boolean {
  if (drawable === null) drawable = typeof document !== "undefined" && document.createElement("canvas").getContext("2d") !== null
  return drawable
}

/** uPlot's columns for the kind: time and closes for a line, time and all four for candles, then one column per overlay. */
function alignedData(columns: BarColumns, kind: PriceChartKind, overlays: readonly PriceChartOverlay[]): uPlot.AlignedData {
  const extra = overlays.map((overlay) => {
    const values = overlay.values(columns.bars)
    // The column must be exactly as long as the time column, whatever the overlay returned.
    return columns.time.map((_, i) => {
      const v = values[i]
      return typeof v === "number" && Number.isFinite(v) ? v : null
    })
  })
  return kind === "candles" ? [columns.time, columns.open, columns.high, columns.low, columns.close, ...extra] : [columns.time, columns.close, ...extra]
}

interface Live {
  palette: Palette
  columns: BarColumns
  summary: SeriesSummary
  baseline: number | null
}

interface PlotArgs {
  width: number
  height: number
  kind: PriceChartKind
  crosshair: boolean
  lastLine: boolean
  zone: string | undefined
  convention: PriceConvention | InstrumentConvention
  overlays: readonly PriceChartOverlay[]
  live: () => Live
  onCursor: (plot: uPlot) => void
}

const noPaths = () => null

function plotOptions(a: PlotArgs): uPlot.Options {
  const price = priceOf(a.convention)
  const format = (v: number) => formatPrice(v, price)
  const font = (px: number) => `${12 * px}px ${a.live().palette.font}`
  const axisStroke = () => a.live().palette.mutedForeground
  const gridStroke = () => a.live().palette.border
  // The time axis in the zone, 24-hour, with the day in front once the range runs past one.
  const clock = timeFormatter(a.zone, undefined, false)
  const day = dayFormatter(a.zone)
  const timeValues: uPlot.Axis.Values = (u, splits) => {
    const longer = (u.scales.x?.max ?? 0) - (u.scales.x?.min ?? 0) > DAY_MS
    return splits.map((ts) => (longer ? `${day(ts)} ${clock(ts)}` : clock(ts)))
  }
  const priceAxisSize: uPlot.Axis.Size = (u, values, _axis, cycle) => {
    if (cycle > 1 || !values) return 64
    u.ctx.font = font(uPlot.pxRatio)
    let widest = 0
    for (const v of values) widest = Math.max(widest, u.ctx.measureText(v).width)
    return Math.ceil(widest / uPlot.pxRatio) + 18
  }
  const overlaySeries: uPlot.Series[] = a.overlays.map((overlay, i) => ({
    label: overlay.label,
    stroke: () => a.live().palette.chart[Math.min(8, Math.max(1, overlay.color ?? i + 1)) - 1]!,
    width: overlay.width ?? 1,
    points: { show: false },
    spanGaps: false,
  }))
  const series: uPlot.Series[] =
    a.kind === "candles"
      ? [{}, { paths: noPaths, points: { show: false } }, { paths: noPaths, points: { show: false } }, { paths: noPaths, points: { show: false } }, { paths: noPaths, points: { show: false } }, ...overlaySeries]
      : [{}, { stroke: () => tone(a.live().palette, a.live().summary.direction), fill: () => soft(a.live().palette, a.live().summary.direction), width: 1.5, points: { show: false }, spanGaps: false }, ...overlaySeries]
  return {
    width: a.width,
    height: a.height,
    ms: 1,
    // The option wants a timestamp-to-Date function, and uPlot.tzDate(date, zone) returns the Date read in that zone; with ms: 1 the timestamp is milliseconds.
    ...(a.zone ? { tzDate: (ts: number) => uPlot.tzDate(new Date(ts), a.zone!) } : {}),
    legend: { show: false },
    select: { show: false, left: 0, top: 0, width: 0, height: 0 },
    cursor: a.crosshair
      ? {
          x: true,
          y: true,
          lock: false,
          drag: { x: false, y: false, setScale: false },
          focus: { prox: -1 },
          points: {
            // A dot on the line's close under the crosshair; nothing on an overlay or a candle.
            size: (_u, si) => (a.kind === "line" && si === 1 ? 7 : 0),
            width: 1,
            stroke: () => a.live().palette.background,
            fill: () => tone(a.live().palette, a.live().summary.direction),
          },
        }
      : { show: false },
    scales: {
      x: { time: true },
      y: {
        range: (_u, min, max) => {
          const b = a.live().baseline
          let lo = min
          let hi = max
          if (b !== null) {
            lo = Math.min(lo, b)
            hi = Math.max(hi, b)
          }
          if (!(hi > lo)) {
            const step = priceIncrements(a.convention)[0] ?? 1
            lo -= step
            hi += step
          }
          const pad = (hi - lo) * 0.08
          return [lo - pad, hi + pad]
        },
      },
    },
    axes: [
      { stroke: axisStroke, font: font(1), grid: { stroke: gridStroke, width: 1 }, ticks: { stroke: gridStroke, width: 1, size: 4 }, space: 80, gap: 6, size: 26, values: timeValues },
      { side: 1, stroke: axisStroke, font: font(1), grid: { stroke: gridStroke, width: 1 }, ticks: { stroke: gridStroke, width: 1, size: 4 }, space: 28, gap: 6, incrs: priceIncrements(a.convention), values: (_u, splits) => splits.map(format), size: priceAxisSize },
    ],
    series,
    hooks: {
      init: [
        (u) => {
          // The canvas and its overlays are one picture; the words are on the element around them.
          u.root.setAttribute("aria-hidden", "true")
          styleCursor(u, a.live().palette)
        },
      ],
      setCursor: [a.onCursor],
      draw: [(u) => drawMarks(u, a)],
    },
  }
}

/** uPlot's stylesheet colors the crosshair lines itself; the page's border token goes on inline, where it wins. */
function styleCursor(u: uPlot, palette: Palette) {
  for (const line of u.over.querySelectorAll<HTMLElement>(".u-cursor-x, .u-cursor-y")) line.style.borderColor = palette.mutedForeground
}

/** Candles for that kind, the baseline, and the last close's line and tag, drawn after the series. */
function drawMarks(u: uPlot, a: PlotArgs) {
  const { palette, summary, baseline } = a.live()
  const ctx = u.ctx
  const px = uPlot.pxRatio
  const { left, top, width, height } = u.bbox
  const yOf = (v: number) => u.valToPos(v, "y", true)
  const dashed = (y: number, color: string) => {
    if (y < top || y > top + height) return
    ctx.save()
    ctx.beginPath()
    ctx.setLineDash([4 * px, 4 * px])
    ctx.lineWidth = px
    ctx.strokeStyle = color
    ctx.moveTo(left, Math.round(y) + 0.5 * px)
    ctx.lineTo(left + width, Math.round(y) + 0.5 * px)
    ctx.stroke()
    ctx.restore()
  }
  ctx.save()
  ctx.beginPath()
  ctx.rect(left, top, width, height)
  ctx.clip()
  if (a.kind === "candles") drawCandles(u, palette, px)
  if (baseline !== null) dashed(yOf(baseline), palette.border)
  const last = summary.last
  if (a.lastLine && last) dashed(yOf(last.close), tone(palette, summary.direction))
  ctx.restore()
  if (a.lastLine && last) drawTag(u, formatPrice(last.close, priceOf(a.convention)), yOf(last.close), tone(palette, summary.direction), palette, px)
}

function drawCandles(u: uPlot, palette: Palette, px: number) {
  const ctx = u.ctx
  const [xs, opens, highs, lows, closes] = u.data
  if (!opens || !highs || !lows || !closes) return
  const [i0, i1] = u.series[0]?.idxs ?? [0, xs.length - 1]
  const xOf = (i: number) => u.valToPos(xs[i]!, "x", true)
  // Bars sit on one interval, so the room a candle has is the distance to its neighbour.
  const slot = i1 > i0 ? Math.abs(xOf(i0 + 1) - xOf(i0)) : u.bbox.width / 4
  const body = Math.max(px, Math.floor(slot * 0.66))
  const wick = Math.max(1, Math.round(px))
  for (let i = i0; i <= i1; i++) {
    const o = opens[i]
    const h = highs[i]
    const l = lows[i]
    const c = closes[i]
    if (o == null || h == null || l == null || c == null) continue
    const x = Math.round(xOf(i))
    const yo = u.valToPos(o, "y", true)
    const yc = u.valToPos(c, "y", true)
    ctx.fillStyle = c > o ? palette.up : c < o ? palette.down : palette.flat
    const yh = u.valToPos(h, "y", true)
    ctx.fillRect(x - wick / 2, yh, wick, Math.max(px, u.valToPos(l, "y", true) - yh))
    ctx.fillRect(x - body / 2, Math.min(yo, yc), body, Math.max(px, Math.abs(yo - yc)))
  }
}

/** The last price on the price axis, in a box of its direction's color, over the tick it would have had. */
function drawTag(u: uPlot, text: string, y: number, fill: string, palette: Palette, px: number) {
  const { left, top, width, height } = u.bbox
  if (y < top || y > top + height) return
  const ctx = u.ctx
  ctx.save()
  ctx.font = `${12 * px}px ${palette.font}`
  const h = 16 * px
  const w = ctx.measureText(text).width + 8 * px
  const x = left + width + 1 * px
  ctx.fillStyle = fill
  ctx.fillRect(x, Math.round(y - h / 2), w, h)
  ctx.fillStyle = palette.background
  ctx.textAlign = "left"
  ctx.textBaseline = "middle"
  ctx.fillText(text, x + 4 * px, y)
  ctx.restore()
}

const clamp = (n: number, max: number) => Math.max(0, Math.min(max, n))
const DAY_MS = 86_400_000

/** Silent writes update uPlot's crosshair without echoing a programmatic move to the caller. */
function syncPlotCursor(plot: uPlot, bar: Bar | null) {
  plot.setCursor(bar ? { left: plot.valToPos(bar.time, "x"), top: plot.valToPos(bar.close, "y") } : { left: -10, top: -10 }, false)
}

export interface PriceChartState {
  readonly bars: readonly Bar[]
  readonly summary: SeriesSummary
  readonly cursor: number | null
  readonly bar: Bar | null
  readonly readout: string
  readonly overlays: readonly PriceChartOverlay[]
  readonly convention: PriceConvention | InstrumentConvention
  readonly labels: PriceChartLabels
}

interface ChartContext extends PriceChartState {
  columns: BarColumns
  label: string
  sentence: string
  kind: PriceChartKind
  baseline: number | null
  zone: string | undefined
  crosshair: boolean
  lastLine: boolean
  select: (index: number | null) => void
}

const PriceChartContext = createContext<ChartContext | null>(null)

function useChartContext() {
  const context = useContext(PriceChartContext)
  if (!context) throw new Error("PriceChart parts require PriceChart")
  return context
}

/** Shared readings for custom content; does not add a store subscription. */
export function usePriceChart(): PriceChartState {
  return useChartContext()
}

export function PriceChart({ store, convention, label, kind = "line", baseline = null, zone, locale, overlays, crosshair = true, lastLine = true, height, labels: labelsProp, onCursor, className, style, children, ...props }: PriceChartProps) {
  const labels = { ...DEFAULT_PRICE_CHART_LABELS, ...labelsProp }
  const ref = typeof baseline === "number" && Number.isFinite(baseline) ? baseline : null
  const overlayList = useMemo(() => overlays ?? [], [overlays])
  const [selection, setSelection] = useState<number | null>(null)
  const selectionRef = useRef<number | null>(null)
  // The store's columns, once per applied batch: the meta's version is the one dependency, so the memo reruns on
  // a batch and on nothing else, and a batch with no bar change gives the same columns back.
  const meta = useStoreMeta(store)
  const columns = useMemo(() => {
    void meta.version
    return columnsOf(store)
  }, [store, meta.version])
  const summary = useMemo(() => summarize(columns, ref), [columns, ref])

  // Notify in the event, never inside a state updater (which StrictMode may run twice).
  const select = useCallback((index: number | null) => {
    if (selectionRef.current === index) return
    selectionRef.current = index
    setSelection(index)
    onCursor?.(index === null ? null : (columns.bars[index] ?? null))
  }, [columns, onCursor])

  const count = columns.bars.length
  const cursor = selection === null || count === 0 ? null : clamp(selection, count - 1)
  const at = cursor === null ? null : columns.bars[cursor]!
  const price = priceOf(convention)
  const time = timeFormatter(zone, locale)
  const direction = summary.direction
  const word = labels[direction]
  const last = summary.last
  const readout = at ? `${time(at.time)} ${kind === "candles" ? `${labels.open} ${formatPrice(at.open, price)} ${labels.high} ${formatPrice(at.high, price)} ${labels.low} ${formatPrice(at.low, price)} ${labels.close} ${formatPrice(at.close, price)}` : formatPrice(at.close, price)}${typeof at.volume === "number" ? ` ${labels.volume} ${formatQuantity(at.volume)}` : ""}` : ""
  const sentence = last ? `${label}: ${word}, last ${formatPrice(last.close, price)}, ${formatChange(summary.change, convention)} (${formatPercent(summary.changePct, { signed: true })}), low ${formatPrice(summary.low, price)}, high ${formatPrice(summary.high, price)}, ${count} ${labels.bars}` : `${label}: ${labels.noData}`

  const context: ChartContext = { bars: columns.bars, columns, summary, cursor, bar: at, readout, overlays: overlayList, convention, labels, label, sentence, kind, baseline: ref, zone, crosshair, lastLine, select }

  return (
    <PriceChartContext.Provider value={context}>
      <div
        {...props}
        data-slot="tradecn-price-chart"
        data-kind={kind}
        data-direction={direction}
        data-empty={count === 0 ? "" : undefined}
        role="group"
        aria-label={label}
        className={cn("flex h-64 w-full min-h-0 flex-col gap-1 text-xs text-foreground lining-nums tabular-nums", className)}
        style={height === undefined ? style : { ...style, height }}
      >
        {children}
      </div>
    </PriceChartContext.Provider>
  )
}

export function PriceChartHeader({ className, ...props }: ComponentProps<"div">) {
  return <div {...props} data-chart-header="" className={cn("flex min-h-5 shrink-0 flex-wrap items-baseline gap-x-3 gap-y-0.5 px-1", NUMERIC_CLASS, className)} />
}

export function PriceChartLast({ className, children, ...props }: ComponentProps<"span">) {
  const { summary, convention, labels } = usePriceChart()
  return <span {...props} data-chart-last="" data-direction={summary.direction} className={cn("text-sm font-semibold", numericFontClass(convention), directionClass(summary.direction), className)}>{children === undefined ? summary.last ? formatPrice(summary.last.close, priceOf(convention)) : labels.noData : children}</span>
}

export function PriceChartChange({ className, children, ...props }: ComponentProps<"span">) {
  const { summary, convention } = usePriceChart()
  if (!summary.last) return null
  return <span {...props} data-chart-change="" data-direction={summary.direction} className={cn(numericFontClass(convention), directionClass(summary.direction), className)}>{children === undefined ? <>{formatChange(summary.change, convention)} <span className={NUMERIC_CLASS}>({formatPercent(summary.changePct, { signed: true })})</span></> : children}</span>
}

export function PriceChartReadout({ className, children, ...props }: ComponentProps<"span">) {
  const { readout, convention } = usePriceChart()
  return <span {...props} data-chart-readout="" className={cn("ml-auto text-muted-foreground", numericFontClass(convention), className)}>{children === undefined ? readout : children}</span>
}

export function PriceChartEmpty({ className, children, ...props }: ComponentProps<"div">) {
  const { bars, labels } = usePriceChart()
  if (bars.length > 0) return null
  return <div {...props} data-chart-empty="" className={cn("absolute inset-0 flex items-center justify-center text-muted-foreground", className)}>{children === undefined ? labels.noData : children}</div>
}

export interface PriceChartLegendProps extends Omit<ComponentProps<"ul">, "children"> {
  children: ReactNode
}

export function PriceChartLegend({ className, ...props }: PriceChartLegendProps) {
  const { labels } = usePriceChart()
  return <ul aria-label={labels.overlays} {...props} data-chart-legend="" className={cn("flex shrink-0 flex-wrap gap-x-3 gap-y-0.5 px-1 text-muted-foreground", className)} />
}

export interface PriceChartOverlaySwatchProps extends ComponentProps<"span"> {
  overlayId: string
}

/** Resolves the plot's token by id, independent of the caller's legend order. */
export function PriceChartOverlaySwatch({ overlayId, className, ...props }: PriceChartOverlaySwatchProps) {
  const { overlays } = usePriceChart()
  const index = overlays.findIndex((overlay) => overlay.id === overlayId)
  const overlay = overlays[index]
  if (!overlay) return null
  return <span {...props} aria-hidden="true" data-chart-swatch="" className={cn("inline-block size-2 shrink-0 rounded-full", CHART_TOKEN_CLASS[Math.min(8, Math.max(1, overlay.color ?? index + 1)) - 1], className)} />
}

export function PriceChartPlot({ className, children, ref: forwardedRef, onKeyDown: onKeyDownProp, onFocus, onBlur, ...props }: ComponentProps<"div">) {
  const { columns, summary, cursor, bar, convention, overlays: overlayList, sentence, readout, kind, baseline, zone, crosshair, lastLine, select } = useChartContext()
  const [plotEl, setPlotEl] = useState<HTMLDivElement | null>(null)
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  const [fontEpoch, setFontEpoch] = useState(0)
  const plotKey = JSON.stringify([kind, crosshair, lastLine, zone, convention, overlayList.map((o) => [o.id, o.color, o.width]), fontEpoch])
  const plot = useRef<uPlot | null>(null)
  const plotKeyRef = useRef<string | null>(null)
  const live = useRef<Live>({ palette: UNREAD_PALETTE, columns: EMPTY_COLUMNS, summary, baseline })
  const overlaysRef = useRef(overlayList)
  const conventionRef = useRef(convention)
  const selectRef = useRef(select)
  const pointerOwnsCursor = useRef(false)
  const lastCursorEvent = useRef<uPlot.Cursor["event"]>(undefined)
  const cursorBar = useRef(bar)
  const moveCursor = (index: number | null) => {
    pointerOwnsCursor.current = false
    lastCursorEvent.current = plot.current?.cursor.event
    selectRef.current(index)
    if (index === cursor && plot.current) syncPlotCursor(plot.current, cursorBar.current)
  }

  useLayoutEffect(() => {
    overlaysRef.current = overlayList
    conventionRef.current = convention
    selectRef.current = select
    cursorBar.current = bar
  })
  useLayoutEffect(() => {
    live.current.summary = summary
    live.current.baseline = baseline
    plot.current?.redraw(false, false)
  }, [summary, baseline])
  // The plot takes the columns before the browser paints, so the picture and the header move in one frame.
  useLayoutEffect(() => {
    live.current.columns = columns
    // Retire the old plot before its queued hooks can select against new data or incompatible columns.
    if (plotKeyRef.current !== plotKey) {
      plotKeyRef.current = null
      return
    }
    plot.current?.setData(alignedData(columns, kind, overlaysRef.current), true)
  }, [columns, kind, plotKey])

  // The box's size, from a ResizeObserver; nothing is drawn before the first measurement.
  useLayoutEffect(() => {
    if (!plotEl) return
    const observer = new ResizeObserver(([entry]) => {
      const rect = entry?.contentRect
      if (rect && rect.width > 0 && rect.height > 0) setSize((s) => (s && s.width === rect.width && s.height === rect.height ? s : { width: rect.width, height: rect.height }))
    })
    observer.observe(plotEl)
    return () => observer.disconnect()
  }, [plotEl])

  // The plot: made once the box has a size and the store a bar, remade for a new kind, zone, or convention, never per update.
  const ready = size !== null && columns.bars.length > 0
  useEffect(() => {
    if (!plotEl || !ready || !canDraw()) return
    live.current.palette = readPalette(plotEl)
    const box = plotEl.getBoundingClientRect()
    pointerOwnsCursor.current = false
    lastCursorEvent.current = undefined
    const u = new uPlot(
      plotOptions({
        width: box.width,
        height: box.height,
        kind,
        crosshair,
        lastLine,
        zone,
        convention: conventionRef.current,
        overlays: overlaysRef.current,
        live: () => live.current,
        onCursor: (u) => {
          if (plot.current !== u || plotKeyRef.current !== plotKey) return
          // uPlot also fires this hook after setData recalculates its scales. Only a new native
          // event transfers ownership to the pointer; keyboard selection follows the retained bar.
          if (u.cursor.event && u.cursor.event !== lastCursorEvent.current) {
            pointerOwnsCursor.current = true
            lastCursorEvent.current = u.cursor.event
          }
          if (pointerOwnsCursor.current) selectRef.current(u.cursor.idx ?? null)
          else syncPlotCursor(u, cursorBar.current)
        },
      }),
      alignedData(live.current.columns, kind, overlaysRef.current),
      plotEl,
    )
    plot.current = u
    plotKeyRef.current = plotKey
    syncPlotCursor(u, cursorBar.current)
    // A mode or a theme is a class on <html> and the accessibility remap a data attribute; the tokens are read again
    // and the picture redrawn, or, when the font stack itself changed, the plot remade with the new axis font.
    const observer = new MutationObserver(() => {
      const next = readPalette(plotEl)
      const fontChanged = next.font !== live.current.palette.font
      live.current.palette = next
      if (fontChanged) {
        setFontEpoch((n) => n + 1)
        return
      }
      styleCursor(u, next)
      u.redraw(false, false)
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style", "data-theme", "data-accessibility"] })
    return () => {
      observer.disconnect()
      u.destroy()
      plot.current = null
      plotKeyRef.current = null
    }
    // plotKey includes convention, overlay structure and font epoch; equal inline options do not remake the plot.
  }, [plotEl, ready, kind, crosshair, lastLine, zone, plotKey])

  useEffect(() => {
    if (size && plot.current) plot.current.setSize(size)
  }, [size])

  // Keys move the plot immediately. Its cursor hook repeats this after new scales are committed;
  // pointer-owned coordinates stay where the hand put them. Silent writes cannot echo onCursor.
  useEffect(() => {
    const u = plot.current
    if (u && !pointerOwnsCursor.current) syncPlotCursor(u, cursorBar.current)
  }, [cursor])

  const attachPlot = useCallback((node: HTMLDivElement | null) => {
    setPlotEl(node)
    if (typeof forwardedRef === "function") return forwardedRef(node)
    if (forwardedRef) forwardedRef.current = node
  }, [forwardedRef])
  const count = columns.bars.length
  const interactive = crosshair && count > 0

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    onKeyDownProp?.(event)
    if (event.defaultPrevented || !interactive || event.metaKey || event.ctrlKey || event.altKey) return
    const from = cursor ?? count - 1
    // The slider pattern's two pairs: Right and Up go forward a bar, Left and Down back one.
    const to = { ArrowLeft: from - 1, ArrowDown: from - 1, ArrowRight: from + 1, ArrowUp: from + 1, PageDown: from - 10, PageUp: from + 10, Home: 0, End: count - 1 }[event.key]
    if (to === undefined && event.key !== "Escape") return
    // Claimed, so a hotkey registry or a panel further out leaves the key alone.
    event.preventDefault()
    moveCursor(to === undefined ? null : clamp(to, count - 1))
  }

  return (
    <div
      {...props}
      ref={attachPlot}
      role={interactive ? "slider" : "img"}
      aria-label={sentence}
      tabIndex={interactive ? 0 : undefined}
      aria-orientation={interactive ? "horizontal" : undefined}
      aria-valuemin={interactive ? 0 : undefined}
      aria-valuemax={interactive ? count - 1 : undefined}
      aria-valuenow={interactive ? cursor ?? count - 1 : undefined}
      aria-valuetext={interactive ? readout || sentence : undefined}
      onKeyDown={onKeyDown}
      onFocus={(event) => {
        onFocus?.(event)
        if (!event.defaultPrevented && interactive && cursor === null) moveCursor(count - 1)
      }}
      onBlur={(event) => {
        onBlur?.(event)
        if (!event.defaultPrevented) moveCursor(null)
      }}
      data-chart-plot=""
      className={cn("relative min-h-0 flex-1 overflow-hidden rounded-sm outline-none", interactive && "cursor-crosshair focus-visible:ring-2 focus-visible:ring-ring/50", className)}
    >
      {children}
    </div>
  )
}
