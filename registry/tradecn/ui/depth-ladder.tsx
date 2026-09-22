import { useVirtualizer } from "@tanstack/react-virtual"
import { cn } from "cn"
import { memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode, type UIEvent } from "react"
import { useFlash } from "@/registry/tradecn/hooks/use-flash"
import { useRow } from "@/registry/tradecn/hooks/use-row-store"
import { NUMERIC_CLASS, createInstrumentFormatter, formatQuantity, numericFontClass, roundToTick, type InstrumentConvention } from "@/registry/tradecn/lib/format"
import type { RowStore } from "@/registry/tradecn/lib/row-store"

// A price ladder: one rung per tick over a range of prices, the bid size on the left of the price and the
// ask size on its right, the desk's own resting size marked on its rung, and one flash per level change.
// The levels come from a row store keyed by tick index, so a change at one price wakes one rung and
// nothing else. The ladder keeps the market's mid at its center until a key, a pointer, or a scroll
// touches it; then the prices stay where they are and a button or Home puts the mid back in the middle.
//
// A click in the bid column hands { price, side: "buy" } to the consumer through onStage, a click in the
// ask column a sell; the ladder sends nothing anywhere.

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

export interface DepthLadderProps {
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
  /** Shown while there is no mid. `labels.noMarket` by default. */
  emptyState?: ReactNode
  className?: string
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
const TEMPLATE = "minmax(0, 1fr) minmax(0, 1.2fr) minmax(0, 1fr)"

const defaultSize = (size: number) => formatQuantity(size)

function sizeOf(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value !== 0 ? value : null
}

interface SizeCellProps {
  side: "bid" | "ask"
  size: number | null
  mine: number | null
  focused: boolean
  format: (size: number) => string
  windowMs: number
  mineLabel: string
  onClick: () => void
}

function SizeCell(p: SizeCellProps) {
  const ref = useRef<HTMLDivElement>(null)
  // One flash per level change: the market's size at this price moved.
  useFlash(ref, p.size, { windowMs: p.windowMs, variant: "fill" })
  return (
    <div
      ref={ref}
      role="gridcell"
      aria-colindex={p.side === "bid" ? 1 : 3}
      data-col={p.side}
      data-side={p.side}
      data-numeric=""
      data-mine={p.mine !== null ? "" : undefined}
      data-focused-col={p.focused || undefined}
      className={cn(
        "flex h-full min-w-0 cursor-pointer items-center gap-1 truncate px-2",
        NUMERIC_CLASS,
        FILL_CLASSES,
        p.side === "bid" ? "justify-end text-up" : "justify-start text-down",
        p.focused && "bg-muted/50",
      )}
      onClick={p.onClick}
    >
      {p.mine !== null && (
        <span data-mine-size="" className="rounded-sm bg-primary/15 px-1 text-primary">
          {p.format(p.mine)}
          <span className="sr-only"> {p.mineLabel}</span>
        </span>
      )}
      {p.size !== null && <span>{p.format(p.size)}</span>}
    </div>
  )
}

interface RungProps {
  store: RowStore<DepthLevel>
  tick: number
  index: number
  start: number
  height: number
  domId: string
  priceText: string
  priceClass: string
  mid: boolean
  /** The focused column when this rung holds the focus; null otherwise. */
  focusedCol: LadderColumn | null
  formatSize: (size: number) => string
  flashWindowMs: number
  labels: DepthLadderLabels
  onCell: (tick: number, col: LadderColumn) => void
}

function RungInner(p: RungProps) {
  const level = useRow(p.store, levelId(p.tick))
  const bid = sizeOf(level?.bidSize)
  const ask = sizeOf(level?.askSize)
  const myBid = sizeOf(level?.myBid)
  const myAsk = sizeOf(level?.myAsk)
  const mine = myBid !== null ? (myAsk !== null ? "both" : "bid") : myAsk !== null ? "ask" : undefined
  const focused = p.focusedCol !== null
  return (
    <div
      role="row"
      id={p.domId}
      data-tick={p.tick}
      data-mid={p.mid ? "" : undefined}
      data-mine={mine}
      data-focused={focused || undefined}
      aria-rowindex={p.index + 2}
      aria-description={p.mid ? p.labels.mid : undefined}
      className={cn(
        "absolute top-0 left-0 grid w-full items-stretch border-b border-border/60",
        p.mid && "border-y border-primary/60 bg-muted/60",
        focused && "outline-1 -outline-offset-1 outline-ring",
      )}
      style={{ gridTemplateColumns: TEMPLATE, height: p.height, transform: `translateY(${p.start}px)` }}
    >
      <SizeCell side="bid" size={bid} mine={myBid} focused={p.focusedCol === "bid"} format={p.formatSize} windowMs={p.flashWindowMs} mineLabel={p.labels.mine} onClick={() => p.onCell(p.tick, "bid")} />
      <div
        role="gridcell"
        aria-colindex={2}
        data-col="price"
        data-numeric=""
        data-focused-col={p.focusedCol === "price" || undefined}
        className={cn("flex h-full min-w-0 items-center justify-center truncate px-2 text-foreground", p.priceClass, p.focusedCol === "price" && "bg-muted/50")}
        onClick={() => p.onCell(p.tick, "price")}
      >
        {p.priceText}
      </div>
      <SizeCell side="ask" size={ask} mine={myAsk} focused={p.focusedCol === "ask"} format={p.formatSize} windowMs={p.flashWindowMs} mineLabel={p.labels.mine} onClick={() => p.onCell(p.tick, "ask")} />
    </div>
  )
}
const Rung = memo(RungInner)

interface Focus {
  tick: number
  col: LadderColumn
}

/** Where the scroll box sits when the rung at `index` is in its middle, within what the box can scroll to. */
function centeredTop(el: HTMLElement, index: number, rowHeight: number): number {
  const max = Math.max(0, el.scrollHeight - el.clientHeight)
  const want = index * rowHeight - (el.clientHeight - rowHeight) / 2
  return Math.min(max, Math.max(0, want))
}

export function DepthLadder({ store, convention, mid, label, depth = 200, rowHeight = 22, overscan = 8, onStage, formatSize = defaultSize, flashWindowMs = 900, labels: labelsProp, emptyState, className, initialRect }: DepthLadderProps) {
  const labels = useMemo<DepthLadderLabels>(() => ({ ...DEFAULT_DEPTH_LADDER_LABELS, ...labelsProp }), [labelsProp])
  const tickSize = convention.tick
  const format = useMemo(() => createInstrumentFormatter(convention), [convention])
  const priceClass = numericFontClass(convention)
  const midTick = mid === null || mid === undefined || !Number.isFinite(mid) ? null : tickIndexOf(mid, tickSize)

  // The anchor is the tick in the middle of the range of rungs. It is taken from the first mid seen, and
  // while the ladder follows the market it moves with a mid that has drifted more than half the depth
  // away, so the range is always built around the market. Under a hand it stays put: the prices on
  // screen are the prices under the pointer.
  const [anchor, setAnchor] = useState<number | null>(null)
  const [following, setFollowing] = useState(true)
  const [focused, setFocused] = useState<Focus | null>(null)
  if (midTick !== null && (anchor === null || (following && Math.abs(midTick - anchor) > depth / 2))) setAnchor(midTick)

  const count = anchor === null ? 0 : depth * 2 + 1
  const indexOf = (tick: number) => (anchor ?? 0) + depth - tick
  const tickAt = (index: number) => (anchor ?? 0) + depth - index

  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan,
    getItemKey: tickAt,
    initialRect,
    // The mid sits at index `depth` when the range is first built, so the first frame is already centered.
    initialOffset: () => (initialRect ? Math.max(0, depth * rowHeight - (initialRect.height - rowHeight) / 2) : 0),
  })
  const items = virtualizer.getVirtualItems()
  const uid = useId()
  const domId = (tick: number) => `${uid}-${tick}`

  // Following: the box is scrolled so the mid rung is in the middle, after every mid and whenever
  // following resumes. The effect only reads the state; the handlers below are what change it.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el || !following || midTick === null || anchor === null) return
    el.scrollTop = centeredTop(el, anchor + depth - midTick, rowHeight)
  }, [following, midTick, anchor, depth, rowHeight])

  const latest = useRef({ onStage, store, tickSize })
  useEffect(() => {
    latest.current = { onStage, store, tickSize }
  })

  const hold = useCallback(() => setFollowing(false), [])
  const recenter = () => {
    if (midTick === null) return
    setAnchor(midTick)
    setFollowing(true)
  }
  const stage = useCallback((tick: number, col: LadderColumn) => {
    if (col === "price") return
    const { onStage, store, tickSize } = latest.current
    onStage?.({ price: priceAtTick(tick, tickSize), tick, side: col === "bid" ? "buy" : "sell", level: store.getRow(levelId(tick)) })
  }, [])
  const onCell = useCallback(
    (tick: number, col: LadderColumn) => {
      setFocused({ tick, col })
      stage(tick, col)
    },
    [stage],
  )

  // A scroll the effect above did not ask for is a hand on the ladder. The effect puts the box exactly at
  // the centered offset, so a scroll event that reads anything else came from a wheel, a bar, or a touch.
  const onScroll = (e: UIEvent<HTMLDivElement>) => {
    if (!following || midTick === null || anchor === null) return
    const el = e.currentTarget
    if (Math.abs(el.scrollTop - centeredTop(el, anchor + depth - midTick, rowHeight)) > 1) hold()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (anchor === null) return
    // A modifier-held arrow belongs to a hotkey registry above the ladder.
    if (e.altKey || e.ctrlKey || e.metaKey) return
    if (e.key === "Home") {
      e.preventDefault()
      recenter()
      return
    }
    if (e.key === "Enter") {
      if (focused && focused.col !== "price") {
        e.preventDefault()
        stage(focused.tick, focused.col)
      }
      return
    }
    const lo = anchor - depth
    const hi = anchor + depth
    const clampTick = (tick: number) => Math.min(hi, Math.max(lo, tick))
    const current: Focus = focused ?? { tick: clampTick(midTick ?? anchor), col: "price" }
    const pageRows = Math.max(1, Math.floor((scrollRef.current?.clientHeight || initialRect?.height || rowHeight * 10) / rowHeight))
    let next: Focus
    switch (e.key) {
      case "ArrowUp":
        next = { ...current, tick: clampTick(current.tick + 1) }
        break
      case "ArrowDown":
        next = { ...current, tick: clampTick(current.tick - 1) }
        break
      case "PageUp":
        next = { ...current, tick: clampTick(current.tick + pageRows) }
        break
      case "PageDown":
        next = { ...current, tick: clampTick(current.tick - pageRows) }
        break
      case "ArrowLeft":
        next = { ...current, col: current.col === "ask" ? "price" : "bid" }
        break
      case "ArrowRight":
        next = { ...current, col: current.col === "bid" ? "price" : "ask" }
        break
      default:
        return
    }
    e.preventDefault()
    hold()
    setFocused(next)
    virtualizer.scrollToIndex(indexOf(next.tick), { align: "auto" })
  }

  const focusedInRange = focused !== null && anchor !== null && Math.abs(focused.tick - anchor) <= depth

  return (
    <div
      role="grid"
      data-slot="tradecn-depth-ladder"
      data-following={following ? "true" : "false"}
      tabIndex={0}
      aria-label={label}
      aria-rowcount={count + 1}
      aria-colcount={3}
      aria-activedescendant={focusedInRange ? domId(focused.tick) : undefined}
      onKeyDown={onKeyDown}
      className={cn("relative flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-border bg-background text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40 lining-nums tabular-nums", className)}
      style={{ lineHeight: `${rowHeight}px` } as CSSProperties}
    >
      <div role="row" aria-rowindex={1} className="grid shrink-0 border-b border-border text-muted-foreground" style={{ gridTemplateColumns: TEMPLATE, height: rowHeight }}>
        <div role="columnheader" aria-colindex={1} className="flex items-center justify-end truncate px-2">
          {labels.bid}
        </div>
        <div role="columnheader" aria-colindex={2} className="flex items-center justify-center truncate px-2">
          {labels.price}
        </div>
        <div role="columnheader" aria-colindex={3} className="flex items-center justify-start truncate px-2">
          {labels.ask}
        </div>
      </div>
      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-auto" onPointerDownCapture={hold} onWheel={hold} onScroll={onScroll}>
        {count === 0 ? (
          <div className="flex h-full items-center justify-center p-4 text-muted-foreground">{emptyState ?? labels.noMarket}</div>
        ) : (
          <div role="rowgroup" className="relative" style={{ height: virtualizer.getTotalSize() }}>
            {items.map((item) => {
              const tick = tickAt(item.index)
              return (
                <Rung
                  key={item.key}
                  store={store}
                  tick={tick}
                  index={item.index}
                  start={item.start}
                  height={item.size}
                  domId={domId(tick)}
                  priceText={format.price(priceAtTick(tick, tickSize))}
                  priceClass={priceClass}
                  mid={tick === midTick}
                  focusedCol={focused?.tick === tick ? focused.col : null}
                  formatSize={formatSize}
                  flashWindowMs={flashWindowMs}
                  labels={labels}
                  onCell={onCell}
                />
              )
            })}
          </div>
        )}
      </div>
      {!following && midTick !== null && (
        <button type="button" data-ladder-recenter="" onClick={recenter} className="absolute bottom-2 left-1/2 z-30 -translate-x-1/2 rounded-full bg-primary px-2.5 py-0.5 text-primary-foreground shadow-sm hover:bg-primary/90">
          {labels.recenter}
        </button>
      )}
    </div>
  )
}
