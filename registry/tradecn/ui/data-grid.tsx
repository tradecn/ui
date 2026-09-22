import { useVirtualizer } from "@tanstack/react-virtual"
import { cn } from "cn"
import {
  memo,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react"
import { Checkbox } from "@/components/ui/checkbox"
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "@/components/ui/context-menu"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { createFlashMemory, playFlash, useFlash, type FlashMemory } from "@/registry/tradecn/hooks/use-flash"
import { useRow, useRowIds } from "@/registry/tradecn/hooks/use-row-store"
import { MONO_NUMERIC_CLASS, NULL_TOKEN, NUMERIC_CLASS } from "@/registry/tradecn/lib/format"
import type { RowId, RowStore, RowView } from "@/registry/tradecn/lib/row-store"

// A virtualized grid fed by a RowStore one row at a time.
//
// Rows subscribe to their own store entry, so a delta to one row re-renders one row; header, body,
// and every other row stay put. Numeric cells flash by direction through a shared flash memory keyed
// by row and column, so a row that scrolls out and back resumes its flash. Rows are positioned by
// TanStack Virtual with a fixed height, which makes "keep the viewport pinned while rows arrive
// above" exact arithmetic instead of measurement.
//
// Markup is a div grid with ARIA grid roles rather than a <table>: transform-positioned rows and
// per-cell sticky frozen columns do not survive <tbody>.

export interface ColumnDef<T> {
  key: string
  header: ReactNode
  width: number
  minWidth?: number
  align?: "left" | "right" | "center"
  frozen?: "left"
  sortable?: boolean
  hidden?: boolean
  /** The value the column shows; also what sorting and flash direction compare. */
  accessor: (row: T) => unknown
  /** Text for the value. Defaults to String(value), NULL_TOKEN for null. */
  format?: (value: unknown, row: T) => string
  /** Custom cell content. The cell still flashes by `accessor` value. */
  cell?: (ctx: { row: T; value: unknown; rowId: RowId }) => ReactNode
  /** Flash on change. Defaults to the preset's variant for numeric columns and off otherwise. */
  flash?: false | "fill" | "ring"
  /** Right-aligned, lining tabular figures in the numeric family, flashes by default. */
  numeric?: boolean
  /** The family a numeric cell sets in: `numeric` (the sans, digits at one width) by default, or `mono` for a column of fraction quotes whose ticks must line up. */
  font?: "numeric" | "mono"
}

export interface ColumnState {
  order: string[]
  widths: Record<string, number>
  hidden: string[]
}

export type SortState = { key: string; dir: "asc" | "desc" } | null
export type SelectionMode = "none" | "single" | "multi"
export type DataGridPreset = "blotter" | "watchlist" | "rfq" | "option-chain"

export interface RowEnterBehavior {
  /** Highlight rows as they arrive. */
  highlight: boolean
  /** Keep the first visible row where it is when rows arrive above it. */
  pinViewport: boolean
}

export interface DataGridPresetConfig {
  rowHeight: number
  fontClass: string
  reorderHoldMs: number
  flash: "fill" | "ring"
  selectionMode: SelectionMode
  rowEnter: RowEnterBehavior
  announceRowCount: "off" | "debounced"
}

export const DATA_GRID_PRESETS: Record<DataGridPreset, DataGridPresetConfig> = {
  blotter: { rowHeight: 24, fontClass: "text-xs", reorderHoldMs: 750, flash: "fill", selectionMode: "multi", rowEnter: { highlight: true, pinViewport: true }, announceRowCount: "debounced" },
  watchlist: { rowHeight: 22, fontClass: "text-xs", reorderHoldMs: 0, flash: "fill", selectionMode: "single", rowEnter: { highlight: false, pinViewport: false }, announceRowCount: "off" },
  rfq: { rowHeight: 26, fontClass: "text-xs", reorderHoldMs: 1000, flash: "ring", selectionMode: "single", rowEnter: { highlight: true, pinViewport: true }, announceRowCount: "debounced" },
  "option-chain": { rowHeight: 20, fontClass: "text-xs", reorderHoldMs: 0, flash: "ring", selectionMode: "none", rowEnter: { highlight: false, pinViewport: false }, announceRowCount: "off" },
}

export const EMPTY_COLUMN_STATE: ColumnState = { order: [], widths: {}, hidden: [] }

export interface DataGridProps<T> {
  store: RowStore<T>
  /** A view you own (your comparator, your filter). Without it the grid makes one from `sort` and `filter`. */
  view?: RowView<T>
  columns: ColumnDef<T>[]
  preset?: DataGridPreset
  rowHeight?: number
  overscan?: number
  /** Only used by the grid's own view. */
  filter?: (row: T) => boolean
  reorderHoldMs?: number
  columnState?: ColumnState
  onColumnStateChange?: (state: ColumnState) => void
  sort?: SortState
  onSortChange?: (sort: SortState) => void
  selection?: ReadonlySet<RowId>
  onSelectionChange?: (selection: ReadonlySet<RowId>) => void
  selectionMode?: SelectionMode
  /** Show a checkbox column (multi only). */
  selectionColumn?: boolean
  focusedRowId?: RowId | null
  onFocusedRowChange?: (id: RowId | null) => void
  onRowActivate?: (row: T, id: RowId) => void
  /** Items for the right-click menu, given the rows it applies to (the selection, or the row under the pointer). */
  renderContextMenu?: (rows: T[], ids: RowId[]) => ReactNode
  rowEnter?: Partial<RowEnterBehavior>
  announceRowCount?: "off" | "debounced"
  /** Accessible name for the grid. */
  label: string
  emptyState?: ReactNode
  getRowProps?: (row: T, id: RowId) => { className?: string; "data-state"?: string }
  flashWindowMs?: number
  className?: string
  /** Viewport size before layout is measured (tests, server rendering). */
  initialRect?: { width: number; height: number }
}

type Resolved<T> = ColumnDef<T> & { width: number; minWidth: number }

const EMPTY_SET: ReadonlySet<RowId> = new Set()
const SELECT_WIDTH = 32
const ENTER_WINDOW_MS = 1500

function useControllable<V>(value: V | undefined, onChange: ((v: V) => void) | undefined, initial: V): [V, (v: V) => void] {
  const [internal, setInternal] = useState(initial)
  const controlled = value !== undefined
  const current = controlled ? value : internal
  const set = useCallback(
    (v: V) => {
      if (!controlled) setInternal(v)
      onChange?.(v)
    },
    [controlled, onChange],
  )
  return [current, set]
}

/** Nulls last, numbers numerically, everything else as text. */
export function compareForSort(a: unknown, b: unknown): number {
  const an = a === null || a === undefined || (typeof a === "number" && !Number.isFinite(a))
  const bn = b === null || b === undefined || (typeof b === "number" && !Number.isFinite(b))
  if (an && bn) return 0
  if (an) return 1
  if (bn) return -1
  if (typeof a === "number" && typeof b === "number") return a - b
  return String(a).localeCompare(String(b))
}

export function comparatorFor<T>(columns: ColumnDef<T>[], sort: SortState): ((a: T, b: T) => number) | undefined {
  if (!sort) return undefined
  const col = columns.find((c) => c.key === sort.key)
  if (!col) return undefined
  return (x, y) => {
    const c = compareForSort(col.accessor(x), col.accessor(y))
    return sort.dir === "asc" ? c : -c
  }
}

/** Order, hide, and size columns by state; frozen columns lead. */
export function resolveColumns<T>(columns: ColumnDef<T>[], state: ColumnState): Resolved<T>[] {
  const rank = new Map(state.order.map((k, i) => [k, i]))
  const hidden = new Set(state.hidden)
  const ordered = columns
    .map((c, i) => ({ c, r: rank.get(c.key) ?? 1e6 + i }))
    .sort((a, b) => a.r - b.r)
    .map(({ c }) => c)
    .filter((c) => !c.hidden && !hidden.has(c.key))
  const frozen = ordered.filter((c) => c.frozen === "left")
  const rest = ordered.filter((c) => c.frozen !== "left")
  return [...frozen, ...rest].map((c) => {
    const minWidth = c.minWidth ?? 48
    return { ...c, minWidth, width: Math.max(minWidth, state.widths[c.key] ?? c.width) }
  })
}

/** CSV of the given rows and visible columns, RFC 4180 quoting. */
export function exportCsv<T>(store: RowStore<T>, columns: ColumnDef<T>[], ids: readonly RowId[]): string {
  const cols = columns.filter((c) => !c.hidden)
  const esc = (s: string) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  const header = cols.map((c) => esc(typeof c.header === "string" ? c.header : c.key)).join(",")
  const lines: string[] = []
  for (const id of ids) {
    const row = store.getRow(id)
    if (row === undefined) continue
    lines.push(
      cols
        .map((c) => {
          const v = c.accessor(row)
          return esc(c.format ? c.format(v, row) : v === null || v === undefined ? "" : String(v))
        })
        .join(","),
    )
  }
  return [header, ...lines].join("\r\n") + "\r\n"
}

const FILL_CLASSES = "data-[direction=up]:bg-up-soft data-[direction=down]:bg-down-soft data-[direction=flat]:bg-flat-soft"
const RING_CLASSES = "data-[direction=up]:shadow-[inset_0_0_0_1px_var(--up)] data-[direction=down]:shadow-[inset_0_0_0_1px_var(--down)] data-[direction=flat]:shadow-[inset_0_0_0_1px_var(--flat)]"

function alignClass(col: { align?: "left" | "right" | "center"; numeric?: boolean }) {
  const a = col.align ?? (col.numeric ? "right" : "left")
  return a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left"
}

interface CellProps<T> {
  col: Resolved<T>
  row: T
  rowId: RowId
  colIndex: number
  left: number | undefined
  memory: FlashMemory
  flashVariant: "fill" | "ring"
  flashWindowMs: number
  focusedCol: boolean
}

function Cell<T>({ col, row, rowId, colIndex, left, memory, flashVariant, flashWindowMs, focusedCol }: CellProps<T>) {
  const value = col.accessor(row)
  const ref = useRef<HTMLDivElement>(null)
  const flash = col.flash ?? (col.numeric ? flashVariant : false)
  useFlash(ref, value, { memory, cellKey: `${rowId}\u0000${col.key}`, variant: flash || "fill", windowMs: flashWindowMs, disabled: !flash })
  const content = col.cell ? col.cell({ row, value, rowId }) : col.format ? col.format(value, row) : value === null || value === undefined ? NULL_TOKEN : String(value)
  return (
    <div
      ref={ref}
      role="gridcell"
      aria-colindex={colIndex + 1}
      data-col={col.key}
      data-numeric={col.numeric ? "" : undefined}
      data-focused-col={focusedCol || undefined}
      title={typeof content === "string" ? content : undefined}
      className={cn(
        "flex h-full min-w-0 items-center truncate px-2",
        alignClass(col),
        col.numeric && cn("justify-end", col.font === "mono" ? MONO_NUMERIC_CLASS : NUMERIC_CLASS),
        col.align === "center" && "justify-center",
        flash === "ring" ? RING_CLASSES : flash === "fill" ? FILL_CLASSES : undefined,
        left !== undefined && "sticky z-10 bg-background",
        focusedCol && "bg-muted/50",
      )}
      style={left !== undefined ? { left } : undefined}
    >
      <span className="truncate">{content}</span>
    </div>
  )
}

interface RowProps<T> {
  store: RowStore<T>
  id: RowId
  index: number
  domId: string
  columns: Resolved<T>[]
  template: string
  lefts: (number | undefined)[]
  width: number
  height: number
  start: number
  selected: boolean
  focused: boolean
  focusedColKey: string | null
  selectionColumn: boolean
  onToggle: (id: RowId) => void
  memory: FlashMemory
  flashVariant: "fill" | "ring"
  flashWindowMs: number
  entered: Set<RowId>
  highlightEnter: boolean
  getRowProps?: (row: T, id: RowId) => { className?: string; "data-state"?: string }
}

function RowInner<T>(p: RowProps<T>) {
  const row = useRow(p.store, p.id)
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (p.highlightEnter && p.entered.has(p.id) && ref.current) {
      p.entered.delete(p.id)
      playFlash(ref.current, "flat", { windowMs: ENTER_WINDOW_MS, variant: "fill" })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  if (row === undefined) return null
  const extra = p.getRowProps?.(row, p.id)
  return (
    <div
      ref={ref}
      role="row"
      id={p.domId}
      data-row-id={p.id}
      data-state={extra?.["data-state"]}
      data-focused={p.focused || undefined}
      aria-rowindex={p.index + 2}
      aria-selected={p.selected || undefined}
      className={cn(
        "absolute top-0 left-0 grid items-stretch border-b border-border/60",
        FILL_CLASSES,
        p.selected && "bg-accent",
        p.focused && "outline-1 -outline-offset-1 outline-ring",
        extra?.className,
      )}
      style={{ gridTemplateColumns: p.template, width: p.width, height: p.height, transform: `translateY(${p.start}px)` }}
    >
      {p.selectionColumn && (
        <div role="gridcell" aria-colindex={1} className="sticky left-0 z-10 flex items-center justify-center bg-background">
          <Checkbox checked={p.selected} onCheckedChange={() => p.onToggle(p.id)} aria-label="Select row" />
        </div>
      )}
      {p.columns.map((col, i) => (
        <Cell
          key={col.key}
          col={col}
          row={row}
          rowId={p.id}
          colIndex={i + (p.selectionColumn ? 1 : 0)}
          left={p.lefts[i]}
          memory={p.memory}
          flashVariant={p.flashVariant}
          flashWindowMs={p.flashWindowMs}
          focusedCol={p.focusedColKey === col.key}
        />
      ))}
    </div>
  )
}
const Row = memo(RowInner) as typeof RowInner

export function DataGrid<T>(props: DataGridProps<T>) {
  const {
    store,
    columns,
    label,
    className,
    emptyState,
    getRowProps,
    onRowActivate,
    renderContextMenu,
    initialRect,
    overscan = 8,
  } = props
  const preset = DATA_GRID_PRESETS[props.preset ?? "blotter"]
  const rowHeight = props.rowHeight ?? preset.rowHeight
  const selectionMode = props.selectionMode ?? preset.selectionMode
  const selectionColumn = Boolean(props.selectionColumn) && selectionMode === "multi"
  const rowEnter = { ...preset.rowEnter, ...props.rowEnter }
  const announceRowCount = props.announceRowCount ?? preset.announceRowCount
  const flashWindowMs = props.flashWindowMs ?? 900
  const reorderHoldMs = props.reorderHoldMs ?? preset.reorderHoldMs

  const [sort, setSort] = useControllable(props.sort, props.onSortChange, null as SortState)
  const [columnState, setColumnState] = useControllable(props.columnState, props.onColumnStateChange, EMPTY_COLUMN_STATE)
  const [selection, setSelection] = useControllable(props.selection, props.onSelectionChange, EMPTY_SET)
  const [focusedRowId, setFocusedRowId] = useControllable<RowId | null>(props.focusedRowId, props.onFocusedRowChange, null)
  const [focusedColKey, setFocusedColKey] = useState<string | null>(null)
  const anchorRef = useRef<RowId | null>(null)

  // The view: yours, or one made from sort and filter.
  const comparator = useMemo(() => comparatorFor(columns, sort), [columns, sort])
  const { filter } = props
  const ownView = useMemo(() => (props.view ? null : store.createView({ comparator, filter, reorderHoldMs })), [props.view, store, comparator, filter, reorderHoldMs])
  useEffect(() => () => ownView?.dispose(), [ownView])
  const view = props.view ?? ownView!
  const ids = useRowIds(view)
  const indexOf = useMemo(() => new Map(ids.map((id, i) => [id, i] as const)), [ids])

  const resolved = useMemo(() => resolveColumns(columns, columnState), [columns, columnState])
  const lefts = useMemo(() => {
    let x = selectionColumn ? SELECT_WIDTH : 0
    return resolved.map((c) => {
      if (c.frozen !== "left") return undefined
      const left = x
      x += c.width
      return left
    })
  }, [resolved, selectionColumn])
  const template = useMemo(() => (selectionColumn ? `${SELECT_WIDTH}px ` : "") + resolved.map((c) => `${c.width}px`).join(" "), [resolved, selectionColumn])
  const totalWidth = useMemo(() => resolved.reduce((s, c) => s + c.width, selectionColumn ? SELECT_WIDTH : 0), [resolved, selectionColumn])

  const memory = useMemo(() => createFlashMemory(), [])
  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: ids.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan,
    getItemKey: (i) => ids[i]!,
    initialRect,
  })
  const items = virtualizer.getVirtualItems()
  const uid = useId()
  const domId = (id: RowId) => `${uid}-${id}`

  // Rows arriving: highlight, pin the viewport, announce. Rows leaving: forget their flashes.
  const entered = useRef(new Set<RowId>()).current
  const prevIdsRef = useRef<readonly RowId[]>(ids)
  const newSinceAnnounce = useRef(0)
  useLayoutEffect(() => {
    const prev = prevIdsRef.current
    if (prev === ids) return
    const prevSet = new Set(prev)
    const nowSet = new Set(ids)
    const arrived: RowId[] = []
    for (const id of ids) if (!prevSet.has(id)) arrived.push(id)
    let departed = 0
    for (const id of prev) {
      if (!nowSet.has(id)) {
        departed++
        memory.forget(`${id}\u0000`)
      }
    }
    if ((arrived.length || departed) && rowEnter.pinViewport && scrollRef.current) {
      const el = scrollRef.current
      const firstIndex = Math.floor(el.scrollTop / rowHeight)
      const firstId = prev[firstIndex]
      const nextIndex = firstId !== undefined ? indexOf.get(firstId) : undefined
      if (nextIndex !== undefined && nextIndex !== firstIndex) el.scrollTop += (nextIndex - firstIndex) * rowHeight
    }
    if (arrived.length && rowEnter.highlight) for (const id of arrived) entered.add(id)
    newSinceAnnounce.current += arrived.length
    prevIdsRef.current = ids
  }, [ids, indexOf, rowHeight, rowEnter.pinViewport, rowEnter.highlight, entered, memory])

  const [announcement, setAnnouncement] = useState("")
  useEffect(() => {
    if (announceRowCount === "off") return
    const t = setTimeout(() => {
      const fresh = newSinceAnnounce.current
      newSinceAnnounce.current = 0
      setAnnouncement(`${ids.length.toLocaleString()} rows${fresh ? `, ${fresh.toLocaleString()} new` : ""}`)
    }, 1000)
    return () => clearTimeout(t)
  }, [ids.length, announceRowCount])

  // Selection and focus, by id.
  const select = useCallback(
    (targets: RowId[], mode: "replace" | "toggle" | "range") => {
      if (selectionMode === "none") return
      if (selectionMode === "single" || mode === "replace") {
        setSelection(new Set(targets.slice(-1)))
        anchorRef.current = targets[targets.length - 1] ?? null
        return
      }
      const next = new Set(selection)
      if (mode === "toggle") {
        for (const id of targets) if (next.has(id)) next.delete(id)
        else next.add(id)
        anchorRef.current = targets[targets.length - 1] ?? anchorRef.current
      } else {
        const to = targets[targets.length - 1]!
        const from = anchorRef.current ?? to
        const a = indexOf.get(from) ?? 0
        const b = indexOf.get(to) ?? 0
        for (let i = Math.min(a, b); i <= Math.max(a, b); i++) next.add(ids[i]!)
      }
      setSelection(next)
    },
    [ids, indexOf, selection, selectionMode, setSelection],
  )

  const focusIndex = useCallback(
    (index: number, extend = false) => {
      if (!ids.length) return
      const i = Math.max(0, Math.min(ids.length - 1, index))
      const id = ids[i]!
      setFocusedRowId(id)
      virtualizer.scrollToIndex(i, { align: "auto" })
      if (extend && selectionMode === "multi") select([id], "range")
      else if (selectionMode === "single") select([id], "replace")
    },
    [ids, select, selectionMode, setFocusedRowId, virtualizer],
  )

  const cycleSort = useCallback(
    (key: string) => {
      const col = columns.find((c) => c.key === key)
      if (!col?.sortable) return
      setSort(!sort || sort.key !== key ? { key, dir: "asc" } : sort.dir === "asc" ? { key, dir: "desc" } : null)
    },
    [columns, sort, setSort],
  )

  const updateColumns = useCallback(
    (fn: (s: ColumnState) => ColumnState) => setColumnState(fn(columnState)),
    [columnState, setColumnState],
  )
  const moveColumn = useCallback(
    (key: string, delta: -1 | 1) => {
      const order = resolved.map((c) => c.key)
      const i = order.indexOf(key)
      const j = i + delta
      if (i < 0 || j < 0 || j >= order.length) return
      ;[order[i], order[j]] = [order[j]!, order[i]!]
      updateColumns((s) => ({ ...s, order }))
    },
    [resolved, updateColumns],
  )
  const resizeColumn = useCallback(
    (key: string, width: number) => {
      const col = resolved.find((c) => c.key === key)
      if (!col) return
      updateColumns((s) => ({ ...s, widths: { ...s.widths, [key]: Math.max(col.minWidth, Math.round(width)) } }))
    },
    [resolved, updateColumns],
  )
  const hideColumn = useCallback((key: string) => updateColumns((s) => ({ ...s, hidden: [...new Set([...s.hidden, key])] })), [updateColumns])
  const resetColumns = useCallback(() => setColumnState(EMPTY_COLUMN_STATE), [setColumnState])

  const visibleCount = Math.max(1, Math.floor((scrollRef.current?.clientHeight ?? initialRect?.height ?? rowHeight * 10) / rowHeight))

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    view.touch()
    const fi = focusedRowId !== null ? (indexOf.get(focusedRowId) ?? -1) : -1
    const ci = focusedColKey !== null ? resolved.findIndex((c) => c.key === focusedColKey) : -1
    const mod = e.metaKey || e.ctrlKey
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault()
        focusIndex(fi + 1, e.shiftKey)
        return
      case "ArrowUp":
        e.preventDefault()
        focusIndex(fi <= 0 ? 0 : fi - 1, e.shiftKey)
        return
      case "PageDown":
        e.preventDefault()
        focusIndex(fi + visibleCount, e.shiftKey)
        return
      case "PageUp":
        e.preventDefault()
        focusIndex(fi - visibleCount, e.shiftKey)
        return
      case "Home":
        e.preventDefault()
        focusIndex(0, e.shiftKey)
        return
      case "End":
        e.preventDefault()
        focusIndex(ids.length - 1, e.shiftKey)
        return
      case "ArrowLeft":
      case "ArrowRight": {
        e.preventDefault()
        const delta = e.key === "ArrowLeft" ? -1 : 1
        if (e.altKey && focusedColKey) {
          if (e.shiftKey) resizeColumn(focusedColKey, (resolved[ci]?.width ?? 0) + delta * 8)
          else moveColumn(focusedColKey, delta)
          return
        }
        const next = resolved[Math.max(0, Math.min(resolved.length - 1, ci < 0 ? (delta > 0 ? 0 : resolved.length - 1) : ci + delta))]
        setFocusedColKey(next?.key ?? null)
        return
      }
      case " ":
        e.preventDefault()
        if (focusedRowId !== null) select([focusedRowId], selectionMode === "multi" ? "toggle" : "replace")
        return
      case "Enter":
        if (focusedRowId !== null) {
          const row = store.getRow(focusedRowId)
          if (row !== undefined) onRowActivate?.(row, focusedRowId)
        }
        return
      case "Escape":
        setSelection(EMPTY_SET)
        return
      case "a":
      case "A":
        if (mod && selectionMode === "multi") {
          e.preventDefault()
          setSelection(new Set(ids))
        }
        return
      case "s":
      case "S":
        if (e.altKey && focusedColKey) {
          e.preventDefault()
          cycleSort(focusedColKey)
        }
        return
      case "h":
      case "H":
        if (e.altKey && focusedColKey) {
          e.preventDefault()
          hideColumn(focusedColKey)
        }
        return
      case "ContextMenu":
      case "F10":
        if (e.key === "F10" && !e.shiftKey) return
        e.preventDefault()
        openContextMenuAtFocus()
        return
    }
  }

  const openContextMenuAtFocus = () => {
    if (focusedRowId === null) return
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-row-id="${cssEscape(focusedRowId)}"]`)
    if (!el) return
    const r = el.getBoundingClientRect()
    el.dispatchEvent(new window.MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: r.left + 8, clientY: r.top + r.height / 2, button: 2 }))
  }

  // Right-click targets the row under the pointer: focus it, and make it the selection unless it is already selected.
  const onContextMenuCapture = (e: MouseEvent<HTMLDivElement>) => {
    const rowEl = (e.target as HTMLElement).closest<HTMLElement>("[data-row-id]")
    const id = rowEl?.dataset.rowId
    if (!id) return
    setFocusedRowId(id)
    if (!selection.has(id)) select([id], "replace")
  }

  const onRowPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    view.touch()
    const rowEl = (e.target as HTMLElement).closest<HTMLElement>("[data-row-id]")
    const id = rowEl?.dataset.rowId
    if (!id) return
    if ((e.target as HTMLElement).closest('[data-slot="checkbox"]')) return
    setFocusedRowId(id)
    if (e.button !== 0) return
    if (e.shiftKey) select([id], "range")
    else if (e.metaKey || e.ctrlKey) select([id], "toggle")
    else select([id], "replace")
  }

  const onRowDoubleClick = (e: MouseEvent<HTMLDivElement>) => {
    const id = (e.target as HTMLElement).closest<HTMLElement>("[data-row-id]")?.dataset.rowId
    const row = id !== undefined ? store.getRow(id) : undefined
    if (id !== undefined && row !== undefined) onRowActivate?.(row, id)
  }

  const toggle = useCallback((id: RowId) => select([id], "toggle"), [select])

  const contextRows = useMemo(() => {
    const targets = selection.size ? [...selection] : focusedRowId !== null ? [focusedRowId] : []
    return { ids: targets, rows: targets.map((id) => store.getRow(id)).filter((r): r is T => r !== undefined) }
  }, [selection, focusedRowId, store])

  const body = (
    <div
      ref={scrollRef}
      className="relative h-full min-h-0 flex-1 overflow-auto"
      onPointerDownCapture={onRowPointerDown}
      onDoubleClick={onRowDoubleClick}
      onContextMenuCapture={renderContextMenu ? onContextMenuCapture : undefined}
    >
      <div
        role="row"
        aria-rowindex={1}
        className="sticky top-0 z-20 grid border-b border-border bg-background text-muted-foreground"
        style={{ gridTemplateColumns: template, width: totalWidth, height: rowHeight }}
      >
        {selectionColumn && <div role="columnheader" aria-colindex={1} className="sticky left-0 z-30 bg-background" />}
        {resolved.map((col, i) => (
          <HeaderCell
            key={col.key}
            col={col}
            colIndex={i + (selectionColumn ? 1 : 0)}
            left={lefts[i]}
            sort={sort?.key === col.key ? sort.dir : null}
            focused={focusedColKey === col.key}
            canMoveLeft={i > 0}
            canMoveRight={i < resolved.length - 1}
            onSort={() => cycleSort(col.key)}
            onFocus={() => setFocusedColKey(col.key)}
            onHide={() => hideColumn(col.key)}
            onMove={(d) => moveColumn(col.key, d)}
            onReset={resetColumns}
            onResize={(w) => resizeColumn(col.key, w)}
            hiddenCount={columnState.hidden.length}
          />
        ))}
      </div>
      {ids.length === 0 ? (
        <div className="p-4 text-muted-foreground">{emptyState ?? "No rows"}</div>
      ) : (
        <div role="rowgroup" className="relative" style={{ height: virtualizer.getTotalSize(), width: totalWidth }}>
          {items.map((v) => {
            const id = ids[v.index]!
            return (
              <Row
                key={v.key}
                store={store}
                id={id}
                index={v.index}
                domId={domId(id)}
                columns={resolved}
                template={template}
                lefts={lefts}
                width={totalWidth}
                height={rowHeight}
                start={v.start}
                selected={selection.has(id)}
                focused={focusedRowId === id}
                focusedColKey={focusedColKey}
                selectionColumn={selectionColumn}
                onToggle={toggle}
                memory={memory}
                flashVariant={preset.flash}
                flashWindowMs={flashWindowMs}
                entered={entered}
                highlightEnter={rowEnter.highlight}
                getRowProps={getRowProps}
              />
            )
          })}
        </div>
      )}
    </div>
  )

  return (
    <div
      role="grid"
      data-slot="tradecn-data-grid"
      data-preset={props.preset ?? "blotter"}
      tabIndex={0}
      aria-label={label}
      aria-rowcount={ids.length + 1}
      aria-colcount={resolved.length + (selectionColumn ? 1 : 0)}
      aria-multiselectable={selectionMode === "multi" || undefined}
      aria-activedescendant={focusedRowId !== null && indexOf.has(focusedRowId) ? domId(focusedRowId) : undefined}
      onKeyDown={onKeyDown}
      className={cn("flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-border bg-background text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40 lining-nums tabular-nums", preset.fontClass, className)}
      style={{ lineHeight: `${rowHeight}px` } as CSSProperties}
    >
      {renderContextMenu ? (
        <ContextMenu>
          <ContextMenuTrigger className="contents">{body}</ContextMenuTrigger>
          <ContextMenuContent>{renderContextMenu(contextRows.rows, contextRows.ids)}</ContextMenuContent>
        </ContextMenu>
      ) : (
        body
      )}
      {announceRowCount !== "off" && (
        <div aria-live="polite" className="sr-only">
          {announcement}
        </div>
      )}
    </div>
  )
}

interface HeaderCellProps<T> {
  col: Resolved<T>
  colIndex: number
  left: number | undefined
  sort: "asc" | "desc" | null
  focused: boolean
  canMoveLeft: boolean
  canMoveRight: boolean
  hiddenCount: number
  onSort: () => void
  onFocus: () => void
  onHide: () => void
  onMove: (delta: -1 | 1) => void
  onReset: () => void
  onResize: (width: number) => void
}

function HeaderCell<T>(p: HeaderCellProps<T>) {
  const { col } = p
  const startResize = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startW = col.width
    const move = (ev: globalThis.PointerEvent) => p.onResize(startW + ev.clientX - startX)
    const up = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
  }
  const title = typeof col.header === "string" ? col.header : undefined
  return (
    <div
      role="columnheader"
      aria-colindex={p.colIndex + 1}
      aria-sort={p.sort === "asc" ? "ascending" : p.sort === "desc" ? "descending" : col.sortable ? "none" : undefined}
      data-col={col.key}
      data-focused-col={p.focused || undefined}
      className={cn("group relative flex h-full min-w-0 items-center gap-1 px-2 font-medium select-none", alignClass(col), p.left !== undefined && "sticky z-30 bg-background", p.focused && "text-foreground")}
      style={p.left !== undefined ? { left: p.left } : undefined}
      onPointerDown={p.onFocus}
    >
      <span
        className={cn("min-w-0 flex-1 truncate", col.sortable && "cursor-pointer hover:text-foreground")}
        title={title}
        onClick={col.sortable ? p.onSort : undefined}
      >
        {col.header}
        {p.sort && <span aria-hidden className="ml-1">{p.sort === "asc" ? "\u25B2" : "\u25BC"}</span>}
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`${title ?? col.key} column menu`}
          className="rounded px-1 text-muted-foreground opacity-0 hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 data-[popup-open]:opacity-100 data-[state=open]:opacity-100"
        >
          <svg aria-hidden width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
            <circle cx="5" cy="1.5" r="1.2" />
            <circle cx="5" cy="5" r="1.2" />
            <circle cx="5" cy="8.5" r="1.2" />
          </svg>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {col.sortable && <DropdownMenuItem onClick={p.onSort}>{p.sort === "asc" ? "Sort descending" : p.sort === "desc" ? "Clear sort" : "Sort ascending"}</DropdownMenuItem>}
          <DropdownMenuItem disabled={!p.canMoveLeft} onClick={() => p.onMove(-1)}>
            Move left
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!p.canMoveRight} onClick={() => p.onMove(1)}>
            Move right
          </DropdownMenuItem>
          <DropdownMenuItem onClick={p.onHide}>Hide column</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={p.onReset}>Reset columns{p.hiddenCount ? ` (${p.hiddenCount} hidden)` : ""}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={`Resize ${title ?? col.key}`}
        onPointerDown={startResize}
        className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-ring/40"
      />
    </div>
  )
}

function cssEscape(s: string): string {
  return typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(s) : s.replace(/["\\]/g, "\\$&")
}
