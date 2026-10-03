import { defaultRangeExtractor, useVirtualizer, type Range, type VirtualItem } from "@tanstack/react-virtual"
import { cn } from "cn"
import { createContext, memo, useCallback, useContext, useId, useInsertionEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentProps, type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactNode, type Ref, type RefObject, type UIEvent } from "react"
import { Button } from "@/components/ui/button"
import { useFlash } from "@/registry/tradecn/hooks/use-flash"
import { useRow } from "@/registry/tradecn/hooks/use-row-store"
import { NUMERIC_CLASS, createInstrumentFormatter, formatQuantity, numericFontClass, roundToTick, type InstrumentConvention } from "@/registry/tradecn/lib/format"
import type { RowStore } from "@/registry/tradecn/lib/row-store"

/** One price level of the book, keyed by its tick index so a change at one price wakes one rung. */
export interface DepthLevel {
  /** The price as a count of ticks from zero, `tickIndexOf(price, tickSize)`. The row's id is `levelId(tick)`. */
  tick: number
  /** Size resting on the bid at this price. Absent, null, or zero prints nothing. */
  bidSize?: number | null
  /** Size resting on the offer at this price. */
  askSize?: number | null
  /** The desk's own size resting on the bid here. Marks the rung `data-mine`. */
  myBid?: number | null
  /** The desk's own size resting on the offer here. */
  myAsk?: number | null
}

/** A column of the ladder: the bid sizes, the prices, the ask sizes. */
export type LadderColumn = "bid" | "price" | "ask"

/** What a click or Enter on a size cell hands the consumer. The ladder sends nothing itself. */
export interface LadderStage {
  price: number
  /** The bid column stages a buy, the ask column a sell. */
  side: "buy" | "sell"
  tick: number
  /** The level at that price, if the store has one. */
  level: DepthLevel | undefined
}

export interface DepthLadderLabels {
  /** Column headers. */
  bid: string
  price: string
  ask: string
  /** The button that puts the mid back in the middle. */
  recenter: string
  /** Said to a screen reader after the desk's own size. */
  mine: string
  /** Said to a screen reader for the rung at the market's mid. */
  mid: string
  /** Shown while there is no mid to build the ladder around. */
  noMarket: string
}

export const DEFAULT_DEPTH_LADDER_LABELS: DepthLadderLabels = {
  bid: "Bid",
  price: "Price",
  ask: "Ask",
  recenter: "Recenter",
  mine: "yours",
  mid: "Mid",
  noMarket: "No market",
}

export interface DepthLadderProps extends Omit<ComponentProps<"div">, "role" | "tabIndex" | "aria-label" | "aria-rowcount" | "aria-colcount" | "aria-activedescendant"> {
  children: ReactNode
  /** Visual column order. Render cells and headers in this order. */
  columns?: readonly LadderColumn[]
  /** Price order from top to bottom. Default descending. */
  order?: "ascending" | "descending"
  /** Header rows included in the grid indices. Use 0 when omitting the header. Default 1. */
  headerRows?: number
  /** Levels keyed by tick index: `createRowStore<DepthLevel>({ getRowId: (l) => levelId(l.tick) })`. */
  store: RowStore<DepthLevel>
  /** Prints the prices and sets the tick. */
  convention: InstrumentConvention
  /** The market's mid. The ladder centers on it until touched. Null or undefined while there is no market. */
  mid: number | null | undefined
  /** Accessible name of the ladder. */
  label: string
  /** Ticks shown above and below the center. Default 200. */
  depth?: number
  /** Rung height in px. Default 22. */
  rowHeight?: number
  /** Extra rungs rendered beyond the viewport. Default 8. */
  overscan?: number
  /** A click or Enter on a size cell. */
  onStage?: (stage: LadderStage) => void
  /** Prints a size. `formatQuantity` by default. Keep it stable between renders. */
  formatSize?: (size: number) => string
  /** Cell flash duration in ms. Default 900. */
  flashWindowMs?: number
  labels?: Partial<DepthLadderLabels>
  /** Viewport size in px before measurement, for tests or server rendering. */
  initialRect?: { width: number; height: number }
}

/** The row id of a level: its tick index as a string. */
export function levelId(tick: number): string {
  return String(tick)
}

/** A price as a count of ticks from zero, rounded to the grid: `99.515625` on a `1 / 64` tick is `6369`. */
export function tickIndexOf(price: number, tickSize: number): number {
  return Math.round(price / tickSize)
}

/** The price at a tick index, cleaned of float noise: `6369` on a `1 / 64` tick is `99.515625`. */
export function priceAtTick(tick: number, tickSize: number): number {
  return roundToTick(tick * tickSize, tickSize)
}

const FILL_CLASSES = "data-[direction=up]:bg-up-soft data-[direction=down]:bg-down-soft data-[direction=flat]:bg-flat-soft"
const DEFAULT_COLUMNS: readonly LadderColumn[] = ["bid", "price", "ask"]
const defaultSize = (size: number) => formatQuantity(size)

function sizeOf(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value !== 0 ? value : null
}

interface Focus {
  tick: number
  col: LadderColumn
}

interface Configuration {
  store: RowStore<DepthLevel>
  columns: readonly LadderColumn[]
  rowHeight: number
  headerRows: number
  labels: DepthLadderLabels
  formatSize: (size: number) => string
  flashWindowMs: number
  convention: InstrumentConvention
  format: ReturnType<typeof createInstrumentFormatter>
  onCell: (tick: number, col: LadderColumn) => void
}

export interface DepthLadderState {
  following: boolean
  hasMarket: boolean
  hasRows: boolean
  labels: DepthLadderLabels
  hold: () => void
  recenter: () => void
  focus: () => void
}

interface LadderContextValue extends DepthLadderState {
  config: Configuration
  scrollRef: RefObject<HTMLDivElement | null>
  items: VirtualItem[]
  totalSize: number
  tickAt: (index: number) => number
  domId: (tick: number) => string
  midTick: number | null
  selected: Focus | null
  onScroll: (event: UIEvent<HTMLDivElement>) => void
}

const LadderContext = createContext<LadderContextValue | null>(null)
const ConfigurationContext = createContext<Configuration | null>(null)

function useLadderContext() {
  const state = useContext(LadderContext)
  if (!state) throw new Error("DepthLadder parts must be inside DepthLadder")
  return state
}

function useConfiguration() {
  const config = useContext(ConfigurationContext)
  if (!config) throw new Error("DepthLadder headers must be inside DepthLadder")
  return config
}

/** Shared following and recenter behavior for caller-owned controls. */
export function useDepthLadder(): DepthLadderState {
  return useLadderContext()
}

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === "function") return ref(value)
  if (ref) ref.current = value
}

function useLadderRef<T>(localRef: RefObject<T | null>, forwarded: Ref<T> | undefined) {
  return useCallback((node: T | null) => {
    localRef.current = node
    const cleanup = assignRef(forwarded, node)
    return () => {
      localRef.current = null
      if (typeof cleanup === "function") cleanup()
      else assignRef(forwarded, null)
    }
  }, [localRef, forwarded])
}

/** Where the scroll box sits when the rung at `index` is in its middle, within its scrollable bounds. */
function centeredTop(el: HTMLElement, index: number, rowHeight: number): number {
  const max = Math.max(0, el.scrollHeight - el.clientHeight)
  return Math.min(max, Math.max(0, index * rowHeight - (el.clientHeight - rowHeight) / 2))
}

/** Coordinates a caller-owned grid. Store updates are subscribed to by mounted rows only. */
export function DepthLadder({ store, convention, mid, label, depth = 200, rowHeight = 22, overscan = 8, onStage, formatSize = defaultSize, flashWindowMs = 900, labels: labelsProp, initialRect, columns = DEFAULT_COLUMNS, order = "descending", headerRows = 1, children, className, style, ref, onKeyDown, ...props }: DepthLadderProps) {
  const labels = useMemo<DepthLadderLabels>(() => ({ ...DEFAULT_DEPTH_LADDER_LABELS, ...labelsProp }), [labelsProp])
  const format = useMemo(() => createInstrumentFormatter(convention), [convention])
  const tickSize = convention.tick
  const midTick = mid == null || !Number.isFinite(mid) ? null : tickIndexOf(mid, tickSize)
  const [anchor, setAnchor] = useState<number | null>(null)
  const [following, setFollowing] = useState(true)
  const [focused, setFocused] = useState<Focus | null>(null)
  // Keep the range under the pointer fixed until following resumes.
  if (midTick !== null && (anchor === null || (following && Math.abs(midTick - anchor) > depth / 2))) setAnchor(midTick)
  const count = anchor === null ? 0 : depth * 2 + 1
  const direction = order === "descending" ? -1 : 1
  const indexOf = (tick: number) => depth + (tick - (anchor ?? 0)) * direction
  const tickAt = (index: number) => (anchor ?? 0) + (index - depth) * direction
  const selected = focused && columns.includes(focused.col) ? focused : null
  const selectedIndex = selected ? indexOf(selected.tick) : -1
  const rangeExtractor = useCallback((range: Range) => {
    const indexes = defaultRangeExtractor(range)
    // Keep the IDREF valid in the selection commit, before the scroll event updates the visible range.
    if (selectedIndex >= 0 && selectedIndex < range.count && !indexes.includes(selectedIndex)) {
      indexes.push(selectedIndex)
      indexes.sort((a, b) => a - b)
    }
    return indexes
  }, [selectedIndex])
  const root = useRef<HTMLDivElement>(null)
  const rootRef = useLadderRef(root, ref)
  const scrollRef = useRef<HTMLDivElement>(null)
  const focus = useCallback(() => root.current?.focus({ preventScroll: true }), [])
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan,
    rangeExtractor,
    getItemKey: tickAt,
    initialRect,
    // The mid starts at index `depth`, so the first frame is already centered.
    initialOffset: () => initialRect ? Math.max(0, depth * rowHeight - (initialRect.height - rowHeight) / 2) : 0,
  })
  const items = virtualizer.getVirtualItems()
  const uid = useId()
  const domId = (tick: number) => `${uid}-${tick}`

  // Following centers the mid after each move and when following resumes. Handlers change the state.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el || !following || midTick === null || anchor === null) return
    el.scrollTop = centeredTop(el, depth + (midTick - anchor) * direction, rowHeight)
  }, [following, midTick, anchor, depth, rowHeight, direction])

  const latest = useRef({ onStage, store, tickSize, anchor, depth })
  // Insertion-phase publish: descendants' layout effects already see the committed range, so a
  // select retained by composed row content validates against the ladder as rendered.
  useInsertionEffect(() => { latest.current = { onStage, store, tickSize, anchor, depth } })
  const hold = useCallback(() => setFollowing(false), [])
  const recenter = () => {
    if (midTick === null) return
    setAnchor(midTick)
    setFollowing(true)
  }
  const stage = useCallback((tick: number, col: LadderColumn) => {
    if (col === "price") return
    const { onStage, store, tickSize, anchor, depth } = latest.current
    // Only a price on the ladder stages, whichever path asked: a selection scrolled out of range
    // stays a selection.
    if (anchor === null || Math.abs(tick - anchor) > depth) return
    onStage?.({ price: priceAtTick(tick, tickSize), tick, side: col === "bid" ? "buy" : "sell", level: store.getRow(levelId(tick)) })
  }, [])
  const onCell = useCallback((tick: number, col: LadderColumn) => {
    hold()
    setFocused({ tick, col })
    focus()
    stage(tick, col)
  }, [hold, focus, stage])
  const config = useMemo<Configuration>(() => ({ store, columns, rowHeight, headerRows, labels, formatSize, flashWindowMs, convention, format, onCell }), [store, columns, rowHeight, headerRows, labels, formatSize, flashWindowMs, convention, format, onCell])
  const onScroll = (event: UIEvent<HTMLDivElement>) => {
    if (!following || midTick === null || anchor === null) return
    const el = event.currentTarget
    // A scroll away from the centered offset is a hand on the ladder; allow subpixel rounding.
    if (Math.abs(el.scrollTop - centeredTop(el, indexOf(midTick), rowHeight)) > 1) hold()
  }
  const handleKey = (event: KeyboardEvent<HTMLDivElement>) => {
    // Nested controls keep their own keyboard behavior, including native Enter activation.
    if (event.target !== event.currentTarget || event.nativeEvent.isComposing || event.defaultPrevented || anchor === null || event.altKey || event.ctrlKey || event.metaKey) return
    if (event.key === "Home") {
      event.preventDefault()
      recenter()
      return
    }
    if (event.key === "Enter") {
      if (selected && selected.col !== "price") {
        event.preventDefault()
        stage(selected.tick, selected.col)
      }
      return
    }
    const clampTick = (tick: number) => Math.min(anchor + depth, Math.max(anchor - depth, tick))
    const current: Focus = { tick: clampTick(focused?.tick ?? midTick ?? anchor), col: selected?.col ?? (columns.includes("price") ? "price" : columns[0] ?? "price") }
    const pageRows = Math.max(1, Math.floor((scrollRef.current?.clientHeight || initialRect?.height || rowHeight * 10) / rowHeight))
    let next: Focus
    switch (event.key) {
      case "ArrowUp": next = { ...current, tick: clampTick(current.tick - direction) }; break
      case "ArrowDown": next = { ...current, tick: clampTick(current.tick + direction) }; break
      case "PageUp": next = { ...current, tick: clampTick(current.tick - direction * pageRows) }; break
      case "PageDown": next = { ...current, tick: clampTick(current.tick + direction * pageRows) }; break
      case "ArrowLeft": next = { ...current, col: columns[Math.max(0, columns.indexOf(current.col) - 1)] ?? current.col }; break
      case "ArrowRight": next = { ...current, col: columns[Math.min(columns.length - 1, columns.indexOf(current.col) + 1)] ?? current.col }; break
      default: return
    }
    event.preventDefault()
    hold()
    setFocused(next)
    virtualizer.scrollToIndex(indexOf(next.tick), { align: "auto" })
  }
  const selectedMounted = selected !== null && items.some((item) => item.index === selectedIndex)
  const state: LadderContextValue = { following, hasMarket: midTick !== null, hasRows: count > 0, labels, hold, recenter, focus, config, scrollRef, items, totalSize: virtualizer.getTotalSize(), tickAt, domId, midTick, selected, onScroll }
  return <LadderContext value={state}><ConfigurationContext value={config}>
    <div {...props} role="grid" tabIndex={0} aria-label={label} data-slot="tradecn-depth-ladder" data-following={following ? "true" : "false"} aria-rowcount={count + headerRows} aria-colcount={columns.length} aria-activedescendant={selectedMounted ? `${domId(selected.tick)}-${selected.col}` : undefined} className={cn("relative flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-border bg-background text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40 lining-nums tabular-nums", className)} style={{ lineHeight: `${rowHeight}px`, "--depth-ladder-columns": columns.map((col) => `minmax(0, ${col === "price" ? 1.2 : 1}fr)`).join(" "), ...style } as CSSProperties} ref={rootRef} onKeyDown={(event) => { onKeyDown?.(event); handleKey(event) }}>{children}</div>
  </ConfigurationContext></LadderContext>
}

export function DepthLadderHeader({ className, style, ...props }: ComponentProps<"div">) {
  const { rowHeight } = useConfiguration()
  return <div role="row" aria-rowindex={1} data-slot="tradecn-depth-ladder-header" className={cn("grid shrink-0 border-b border-border text-muted-foreground", className)} style={{ gridTemplateColumns: "var(--depth-ladder-columns)", height: rowHeight, ...style }} {...props} />
}

export function DepthLadderColumnHeader({ column, className, children, ...props }: ComponentProps<"div"> & { column: LadderColumn }) {
  const { columns, labels } = useConfiguration()
  return <div role="columnheader" aria-colindex={columns.indexOf(column) + 1 || undefined} className={cn("flex min-w-0 items-center truncate px-2", column === "bid" ? "justify-end" : column === "ask" ? "justify-start" : "justify-center", className)} {...props}>{children === undefined ? labels[column] : children}</div>
}

export function DepthLadderViewport({ ref, className, onPointerDownCapture, onWheel, onScroll, ...props }: ComponentProps<"div">) {
  const state = useLadderContext()
  const viewportRef = useLadderRef(state.scrollRef, ref)
  return <div data-slot="tradecn-depth-ladder-viewport" className={cn("relative min-h-0 flex-1 overflow-auto", className)} {...props} ref={viewportRef} onPointerDownCapture={(event) => { onPointerDownCapture?.(event); if (!event.defaultPrevented) state.hold() }} onWheel={(event) => { onWheel?.(event); if (!event.defaultPrevented) state.hold() }} onScroll={(event) => { onScroll?.(event); if (!event.defaultPrevented) state.onScroll(event) }} />
}

export function DepthLadderEmpty({ children, className, ...props }: ComponentProps<"div">) {
  const { hasRows, labels } = useDepthLadder()
  if (hasRows) return null
  return <div className={cn("flex h-full items-center justify-center p-4 text-muted-foreground", className)} {...props}>{children === undefined ? labels.noMarket : children}</div>
}

export interface DepthLadderRowState {
  tick: number
  index: number
  price: number
  priceText: string
  level: DepthLevel | undefined
  bidSize: number | null
  askSize: number | null
  myBid: number | null
  myAsk: number | null
  isMid: boolean
  focusedColumn: LadderColumn | null
  select: (column: LadderColumn) => void
}

interface RowContextValue extends DepthLadderRowState {
  config: Configuration
  start: number
  height: number
  domId: string
}
const RowContext = createContext<RowContextValue | null>(null)
function useRowContext() {
  const row = useContext(RowContext)
  if (!row) throw new Error("DepthLadder row parts must be inside DepthLadderRows")
  return row
}

/** Read the current virtual row without adding a store subscription. */
export function useDepthLadderRow(): DepthLadderRowState {
  return useRowContext()
}

interface RowScopeProps {
  config: Configuration
  tick: number
  index: number
  start: number
  height: number
  domId: string
  isMid: boolean
  focusedColumn: LadderColumn | null
  children: (row: DepthLadderRowState) => ReactNode
}
const RowScope = memo(function RowScope({ children, ...props }: RowScopeProps) {
  const { config, tick } = props
  const level = useRow(config.store, levelId(tick))
  const price = priceAtTick(tick, config.convention.tick)
  const row: RowContextValue = { ...props, level, price, priceText: config.format.price(price), bidSize: sizeOf(level?.bidSize), askSize: sizeOf(level?.askSize), myBid: sizeOf(level?.myBid), myAsk: sizeOf(level?.myAsk), select: (col) => config.onCell(tick, col) }
  return <RowContext value={row}>{children(row)}</RowContext>
})

export function DepthLadderRows({ children, className, style, ...props }: Omit<ComponentProps<"div">, "children"> & { children: (row: DepthLadderRowState) => ReactNode }) {
  const state = useLadderContext()
  return <div role="rowgroup" className={cn("relative", className)} style={{ ...style, height: state.totalSize }} {...props}>
    {state.items.map((item) => {
      const tick = state.tickAt(item.index)
      return <RowScope key={item.key} config={state.config} tick={tick} index={item.index} start={item.start} height={item.size} domId={state.domId(tick)} isMid={tick === state.midTick} focusedColumn={state.selected?.tick === tick ? state.selected.col : null}>{children}</RowScope>
    })}
  </div>
}

export function DepthLadderRow({ className, style, ...props }: Omit<ComponentProps<"div">, "id"> & { children: ReactNode }) {
  const row = useRowContext()
  const mine = row.myBid !== null ? row.myAsk !== null ? "both" : "bid" : row.myAsk !== null ? "ask" : undefined
  return <div role="row" data-tick={row.tick} data-mid={row.isMid ? "" : undefined} data-mine={mine} data-focused={row.focusedColumn !== null || undefined} aria-rowindex={row.index + row.config.headerRows + 1} aria-description={row.isMid ? row.config.labels.mid : undefined} className={cn("absolute top-0 left-0 grid w-full items-stretch border-b border-border/60", row.isMid && "border-y border-primary/60 bg-muted/60", row.focusedColumn !== null && "outline-1 -outline-offset-1 outline-ring", className)} style={{ gridTemplateColumns: "var(--depth-ladder-columns)", ...style, height: row.height, transform: `translateY(${row.start}px)` }} {...props} id={row.domId} />
}

type SideProps = { side: "bid" | "ask" }

export function DepthLadderSize({ side, className, ...props }: Omit<ComponentProps<"span">, "children"> & SideProps) {
  const row = useRowContext()
  const value = side === "bid" ? row.bidSize : row.askSize
  if (value === null) return null
  return <span data-numeric="" className={cn(NUMERIC_CLASS, className)} {...props}>{row.config.formatSize(value)}</span>
}

export function DepthLadderOwnSize({ side, className, ...props }: Omit<ComponentProps<"span">, "children"> & SideProps) {
  const row = useRowContext()
  const value = side === "bid" ? row.myBid : row.myAsk
  if (value === null) return null
  return <span data-numeric="" data-mine-size="" className={cn("rounded-sm bg-primary/15 px-1 text-primary", NUMERIC_CLASS, className)} {...props}>{row.config.formatSize(value)}<span className="sr-only"> {row.config.labels.mine}</span></span>
}

function ownsCellClick(event: MouseEvent<HTMLDivElement>) {
  const target = event.target as Element
  const control = target.closest("button, a, input, select, textarea, label, summary, [contenteditable]:not([contenteditable='false']), [tabindex], [role='button'], [role='checkbox'], [role='switch'], [role='combobox'], [role='slider'], [role='spinbutton'], [role='textbox'], [role='link']")
  return !control || control === event.currentTarget || !event.currentTarget.contains(control)
}

type CellOwnedProps = "id" | "aria-selected"

// The rendered role, explicit undefined included; aria-selected is inherited into the header
// roles from gridcell, and no other rendered role takes it.
function cellRoleTakesSelected(props: { role?: ComponentProps<"div">["role"] }): boolean {
  const role = "role" in props ? props.role : "gridcell"
  return role === "gridcell" || role === "rowheader" || role === "columnheader"
}

export function DepthLadderSizeCell({ side, ref, className, children, onClick, ...props }: Omit<ComponentProps<"div">, CellOwnedProps> & Partial<Record<CellOwnedProps, never>> & SideProps) {
  const row = useRowContext()
  const local = useRef<HTMLDivElement>(null)
  const cellRef = useLadderRef(local, ref)
  const size = side === "bid" ? row.bidSize : row.askSize
  const mine = side === "bid" ? row.myBid : row.myAsk
  const selectable = cellRoleTakesSelected(props)
  useFlash(local, size, { windowMs: row.config.flashWindowMs, variant: "fill" })
  // Only the reserved pair lands after the spread: the generated id is what aria-activedescendant
  // points at, and the selected state is what the keyboard contract rests on. Everything else
  // stays overridable — and the selected state follows the rendered role, emitted only where
  // ARIA takes it: gridcell, rowheader, or columnheader.
  return <div role="gridcell" aria-colindex={row.config.columns.indexOf(side) + 1 || undefined} data-col={side} data-side={side} data-numeric="" data-mine={mine !== null ? "" : undefined} data-focused-col={row.focusedColumn === side || undefined} className={cn("flex h-full min-w-0 cursor-pointer items-center gap-1 truncate px-2", NUMERIC_CLASS, FILL_CLASSES, side === "bid" ? "justify-end text-up" : "justify-start text-down", row.focusedColumn === side && "bg-muted/50", className)} {...props} ref={cellRef} onClick={(event) => { onClick?.(event); if (!event.defaultPrevented && ownsCellClick(event)) row.select(side) }} id={`${row.domId}-${side}`} aria-selected={(selectable && row.focusedColumn === side) || undefined}>{children === undefined ? <><DepthLadderOwnSize side={side} /><DepthLadderSize side={side} /></> : children}</div>
}

export function DepthLadderPriceCell({ className, children, onClick, ...props }: Omit<ComponentProps<"div">, CellOwnedProps> & Partial<Record<CellOwnedProps, never>>) {
  const row = useRowContext()
  const selectable = cellRoleTakesSelected(props)
  return <div role="gridcell" aria-colindex={row.config.columns.indexOf("price") + 1 || undefined} data-col="price" data-numeric="" data-focused-col={row.focusedColumn === "price" || undefined} className={cn("flex h-full min-w-0 items-center justify-center truncate px-2 text-foreground", numericFontClass(row.config.convention), row.focusedColumn === "price" && "bg-muted/50", className)} {...props} onClick={(event) => { onClick?.(event); if (!event.defaultPrevented && ownsCellClick(event)) row.select("price") }} id={`${row.domId}-price`} aria-selected={(selectable && row.focusedColumn === "price") || undefined}>{children === undefined ? row.priceText : children}</div>
}

/** Hides while following or without a market; keep it mounted to retain focus recovery. */
export function DepthLadderRecenter({ ref, children, className, onClick, onFocus, onBlur, disabled, ...props }: ComponentProps<typeof Button>) {
  const { following, hasMarket, recenter, focus, labels } = useDepthLadder()
  const visible = !following && hasMarket
  const button = useRef<HTMLButtonElement>(null)
  const buttonRef = useLadderRef(button, ref)
  const wasFocused = useRef(false)
  useLayoutEffect(() => {
    if ((!visible || disabled) && wasFocused.current) {
      wasFocused.current = false
      focus()
    }
  }, [visible, disabled, focus])
  if (!visible) return null
  return <Button type="button" size="sm" data-ladder-recenter="" className={cn("h-auto rounded-full px-2.5 py-0.5 text-xs", className)} {...props} ref={buttonRef} disabled={disabled} onFocus={(event) => { wasFocused.current = true; onFocus?.(event) }} onBlur={(event) => { wasFocused.current = false; onBlur?.(event) }} onClick={(event) => { onClick?.(event); if (!event.defaultPrevented) recenter() }}>{children === undefined ? labels.recenter : children}</Button>
}
