import { cn } from "cn"
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Input } from "@/components/ui/input"
import { useView } from "@/registry/tradecn/hooks/use-row-store"
import { NULL_TOKEN, formatNotional, formatPrice, formatQuantity } from "@/registry/tradecn/lib/format"
import { compileComparator, compileFilter, type GridRules, type RuleColumn } from "@/registry/tradecn/lib/grid-rules"
import type { RowId, RowStore, RowView } from "@/registry/tradecn/lib/row-store"
import { Countdown, type CountdownThresholds } from "@/registry/tradecn/ui/countdown"
import { DataGrid, type ColumnDef, type DataGridProps } from "@/registry/tradecn/ui/data-grid"
import type { Clock } from "@/registry/tradecn/lib/clock"

// The stack of open inquiries: the data grid in its rfq preset, with an inquiry's columns, a
// countdown in each row, a threshold that hides the small auto-quoted ones, and a mark on the one
// that is in the ticket.
//
// The order is yours. A desk sorts its stack by size, by client, by time left, by a rule of its own,
// and the grid takes that as a `sort` or a `view` and holds it still while a hand is on it. What the
// stack promises is what the rfq preset promises: an inquiry arriving above the first visible row
// moves the viewport by exactly one row height, focus and the active mark stay on their ids, and a
// thousand open inquiries cost one screenful of rows.

export type RfqStackSide = "buy" | "sell" | "two-way"

export interface RfqStackRow {
  id: string
  /** When it arrived, ms since the epoch. */
  receivedAt: number
  /** When the venue ends it. */
  expiresAt: number
  client?: string
  tier?: string
  /** "T 4 1/8 05/15/34". */
  instrument: string
  /** The client's side. */
  side: RfqStackSide
  /** Notional, or contracts when `quantityUnit` says so. */
  quantity: number
  quantityUnit?: "notional" | "contracts"
  /** The market beside it. Printed through `price`. */
  bid?: number | null
  ask?: number | null
  /** The venue's word. Printed as is. */
  status: string
  /** An auto-quoter answered it; the threshold applies to these. */
  auto?: boolean
}

export interface RfqStackColumnOptions<T extends RfqStackRow> {
  /** How to print a level for this row. Instruments differ, so it gets the row. Two decimals by default. */
  price?: (value: number, row: T) => string
  /** How to print the arrival time. Local HH:MM:SS by default. */
  time?: (ms: number) => string
  /** For the countdown cells. */
  thresholds?: CountdownThresholds
  clock?: Clock
}

const twoDecimals = (value: number) => formatPrice(value, { kind: "decimal", decimals: 2 })
let clockFormat: Intl.DateTimeFormat | null = null
const localTime = (ms: number) => (clockFormat ??= new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })).format(ms)

const SIDE_WORD: Record<RfqStackSide, string> = { buy: "BUY", sell: "SELL", "two-way": "2-WAY" }

/** The size the way the desk says it: millions of notional, or a count of contracts. */
export function formatStackSize(row: RfqStackRow): string {
  return row.quantityUnit === "contracts" ? formatQuantity(row.quantity) : formatNotional(row.quantity, { unit: "mm" })
}

/** Time, client, instrument, side, size, bid, ask, status, time left, auto. Spread them into your own list to add, drop, or reorder. */
export function rfqStackColumns<T extends RfqStackRow>(options: RfqStackColumnOptions<T> = {}): ColumnDef<T>[] {
  const price = options.price ?? twoDecimals
  const time = options.time ?? localTime
  const px = (value: unknown, row: T) => (typeof value === "number" ? price(value, row) : NULL_TOKEN)
  return [
    { key: "time", header: "Time", width: 76, sortable: true, flash: false, accessor: (r) => r.receivedAt, format: (v) => time(v as number) },
    {
      key: "client",
      header: "Client",
      width: 132,
      frozen: "left",
      sortable: true,
      accessor: (r) => r.client ?? null,
      cell: ({ row }) => (
        <span className="flex min-w-0 items-baseline gap-1">
          <span className="truncate font-semibold">{row.client ?? NULL_TOKEN}</span>
          {row.tier && <span className="shrink-0 text-xs text-muted-foreground">{row.tier}</span>}
        </span>
      ),
    },
    { key: "instrument", header: "Instrument", width: 140, sortable: true, accessor: (r) => r.instrument },
    // The word is always there, so nothing reads a side from a color.
    { key: "side", header: "Side", width: 56, sortable: true, accessor: (r) => r.side, cell: ({ row }) => <span className="text-muted-foreground">{SIDE_WORD[row.side]}</span> },
    { key: "size", header: "Size", width: 72, numeric: true, sortable: true, flash: false, accessor: (r) => r.quantity, format: (_, row) => formatStackSize(row) },
    { key: "bid", header: "Bid", width: 80, numeric: true, accessor: (r) => r.bid ?? null, format: px },
    { key: "ask", header: "Ask", width: 80, numeric: true, accessor: (r) => r.ask ?? null, format: px },
    // Not numeric, so a change of status flashes flat: something happened, and it has no direction.
    { key: "status", header: "Status", width: 96, sortable: true, flash: "fill", accessor: (r) => r.status },
    // Sorted by the moment it ends, which never moves, so a sort by time left never needs a clock.
    { key: "timeLeft", header: "Left", width: 64, numeric: true, sortable: true, flash: false, accessor: (r) => r.expiresAt, cell: ({ row }) => <Countdown expiresAt={row.expiresAt} startsAt={row.receivedAt} compact announce={false} thresholds={options.thresholds} clock={options.clock} label={`Time left ${row.id}`} /> },
    { key: "auto", header: <span className="sr-only">Auto</span>, width: 44, align: "center", flash: false, accessor: (r) => Boolean(r.auto), cell: ({ row }) => (row.auto ? <span className="rounded-sm bg-muted px-1 text-xs text-muted-foreground">auto</span> : null) },
  ]
}

/** Hides an auto-quoted inquiry under `minQuantity`; one a person has to answer always shows. Null shows everything. */
export function rfqThresholdFilter<T extends RfqStackRow>(minQuantity: number | null | undefined): (row: T) => boolean {
  if (minQuantity === null || minQuantity === undefined || !(minQuantity > 0)) return () => true
  return (row) => !row.auto || row.quantity >= minQuantity
}

/** Soonest to end first. */
export const byTimeLeft = <T extends RfqStackRow>(a: T, b: T): number => a.expiresAt - b.expiresAt
/** Largest first. */
export const bySize = <T extends RfqStackRow>(a: T, b: T): number => b.quantity - a.quantity
/** Newest first. */
export const byArrival = <T extends RfqStackRow>(a: T, b: T): number => b.receivedAt - a.receivedAt
/** One comparator from several: the first that tells them apart decides. */
export function stackOrder<T>(...comparators: ((a: T, b: T) => number)[]): (a: T, b: T) => number {
  return (a, b) => {
    for (const compare of comparators) {
      const c = compare(a, b)
      if (c !== 0) return c
    }
    return 0
  }
}

export interface RfqStackViewOptions<T extends RfqStackRow> {
  /** The desk's order. Arrival order when left out. Keep its identity stable: a module constant or a `useMemo`. */
  comparator?: (a: T, b: T) => number
  /** Hide auto-quoted inquiries under this size. */
  threshold?: number | null
  /** Your own filter, applied with the threshold. Keep its identity stable too. */
  filter?: (row: T) => boolean
  /** Default 1000, the rfq preset's. */
  reorderHoldMs?: number
  /**
   * Rules as data, the same object the stack is given: `rules.filter` is folded in with the threshold
   * and `rules.sort` breaks the comparator's ties, or is the order when there is no comparator. The
   * grid ignores both on a view of yours, which is why they are read here.
   */
  rules?: GridRules
  /** The columns the rules name, when they are not `rfqStackColumns()`. */
  columns?: readonly RuleColumn<T>[]
}

let defaultRuleColumns: ColumnDef<RfqStackRow>[] | null = null

/**
 * A view of the store in the desk's order with the threshold, your filter, and the rules applied,
 * for the stack and `useActiveInquiry` to share, so the ticket's next inquiry is one that is on the
 * screen. Remade when an option changes, and the one before is disposed.
 */
export function useRfqStackView<T extends RfqStackRow>(store: RowStore<T>, options: RfqStackViewOptions<T> = {}): RowView<T> {
  const { comparator, threshold = null, filter, reorderHoldMs = 1000, rules, columns } = options
  const ruleFilter = rules?.filter
  const ruleSort = rules?.sort
  const viewOptions = useMemo(() => {
    const ruleColumns = (columns ?? (defaultRuleColumns ??= rfqStackColumns())) as readonly RuleColumn<T>[]
    const byThreshold = rfqThresholdFilter<T>(threshold)
    const byRules = ruleFilter?.length ? compileFilter(ruleFilter, ruleColumns) : null
    const bySort = ruleSort?.length ? compileComparator(ruleSort, ruleColumns) : undefined
    const passes = (row: T) => byThreshold(row) && (byRules ? byRules(row) : true) && (filter ? filter(row) : true)
    const order = comparator && bySort ? stackOrder(comparator, bySort) : (comparator ?? bySort)
    return { comparator: order, filter: passes, reorderHoldMs }
  }, [comparator, threshold, filter, reorderHoldMs, ruleFilter, ruleSort, columns])
  // Owned through useView, which survives StrictMode's mount rehearsal; a memo's view did not.
  return useView(store, viewOptions)!
}

export interface RfqStackProps<T extends RfqStackRow = RfqStackRow> extends Omit<DataGridProps<T>, "columns" | "preset" | "label" | "renderContextMenu">, RfqStackColumnOptions<T> {
  /** `rfqStackColumns()` by default. */
  columns?: ColumnDef<T>[]
  label?: string
  /** The inquiry in the ticket. Its row is marked. */
  activeId?: RowId | null
  /** Inquiries set aside, from `useActiveInquiry`'s `parked`. Their rows are muted and wear `data-state="parked"`. */
  parkedIds?: ReadonlySet<RowId>
  /** Enter or a double click on a row: the trader wants this one in the ticket. */
  onActivate?: (id: RowId, row: T) => void
  /** Hide auto-quoted inquiries under this size. Controlled with `onThresholdChange`. Applied by the grid's own view; with a `view` of yours, build it with `useRfqStackView` and the threshold is in it. */
  threshold?: number | null
  defaultThreshold?: number | null
  onThresholdChange?: (threshold: number | null) => void
  /** Show the threshold field. Default: when any threshold prop is given. */
  thresholdField?: boolean
  /** Millions of notional in the field by default; `contracts` reads a count. */
  thresholdUnit?: "mm" | "contracts"
  thresholdLabel?: string
  /** Your items for the right-click menu. */
  renderContextMenu?: (rows: T[], ids: RowId[]) => ReactNode
}

interface ThresholdFieldProps {
  value: number | null
  unit: "mm" | "contracts"
  label: string
  onChange: (value: number | null) => void
}

// Its own component with its own state: a keystroke here re-renders this field and not one row of the grid.
function ThresholdField({ value, unit, label, onChange }: ThresholdFieldProps) {
  const scale = unit === "mm" ? 1e6 : 1
  const [text, setText] = useState(() => (value === null ? "" : String(value / scale)))
  const [known, setKnown] = useState(value)
  if (value !== known) {
    setKnown(value)
    const shown = text.trim() === "" ? null : Number(text) * scale
    if (shown !== value) setText(value === null ? "" : String(value / scale))
  }
  return (
    <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
      <span>{label}</span>
      <Input
        value={text}
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        aria-label={label}
        placeholder={unit === "mm" ? "mm" : "contracts"}
        className="h-6 w-20 rounded-sm px-1.5 py-0 font-(family-name:--tradecn-font-mono) text-xs md:text-xs"
        onChange={(event) => {
          const next = event.target.value
          setText(next)
          const n = Number(next)
          onChange(next.trim() === "" || !Number.isFinite(n) || n <= 0 ? null : n * scale)
        }}
      />
    </label>
  )
}

export function RfqStack<T extends RfqStackRow = RfqStackRow>({
  columns,
  price,
  time,
  thresholds,
  clock,
  label = "Inquiries",
  activeId = null,
  parkedIds,
  onActivate,
  threshold: thresholdProp,
  defaultThreshold = null,
  onThresholdChange,
  thresholdField,
  thresholdUnit = "mm",
  thresholdLabel = "Hide auto under",
  renderContextMenu,
  filter,
  className,
  store,
  onRowActivate,
  getRowProps,
  ...grid
}: RfqStackProps<T>) {
  const [ownThreshold, setOwnThreshold] = useState<number | null>(defaultThreshold)
  const threshold = thresholdProp !== undefined ? thresholdProp : ownThreshold
  const showField = thresholdField ?? (thresholdProp !== undefined || defaultThreshold !== null || onThresholdChange !== undefined)

  // The grid's rows are memoized, so what it is handed has to keep its identity from one render of
  // this component to the next. Your callbacks are read through a ref, and may be inline.
  const latest = useRef({ onActivate, onRowActivate, getRowProps, renderContextMenu, onThresholdChange, filter })
  useEffect(() => {
    latest.current = { onActivate, onRowActivate, getRowProps, renderContextMenu, onThresholdChange, filter }
  })
  const controlled = thresholdProp !== undefined
  const setThreshold = useCallback(
    (next: number | null) => {
      if (!controlled) setOwnThreshold(next)
      latest.current.onThresholdChange?.(next)
    },
    [controlled],
  )

  const all = useMemo(() => columns ?? rfqStackColumns<T>({ price, time, thresholds, clock }), [columns, price, time, thresholds, clock])
  const hasOwnFilter = Boolean(filter)
  const combined = useMemo(() => {
    const byThreshold = rfqThresholdFilter<T>(threshold)
    return (row: T) => byThreshold(row) && (latest.current.filter?.(row) ?? true)
    // The consumer's filter is read through the ref; its presence is what changes the function.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threshold, hasOwnFilter])
  const activate = useCallback((row: T, id: RowId) => {
    latest.current.onActivate?.(id, row)
    latest.current.onRowActivate?.(row, id)
  }, [])
  const rowProps = useCallback(
    (row: T, id: RowId) => {
      const own = latest.current.getRowProps?.(row, id)
      const active = id === activeId
      // Set aside: muted, named to a screen reader, still in its place in the order. The active mark wins.
      const parked = !active && parkedIds?.has(id) === true
      return {
        ...own,
        "data-state": active ? "active" : parked ? "parked" : own?.["data-state"],
        "aria-description": parked ? (own?.["aria-description"] ?? "Parked") : own?.["aria-description"],
        className: cn(active && "bg-primary/10 shadow-[inset_2px_0_0_var(--primary)]", parked && "text-muted-foreground", own?.className),
      }
    },
    [activeId, parkedIds],
  )
  const hasOwnMenu = Boolean(renderContextMenu)
  const menu = useCallback((rows: T[], ids: RowId[]) => latest.current.renderContextMenu?.(rows, ids), [])

  return (
    <div data-slot="tradecn-rfq-stack" data-active={activeId ?? undefined} className={cn("flex h-full min-h-0 flex-col gap-1 lining-nums tabular-nums", className)}>
      {showField && <ThresholdField value={threshold} unit={thresholdUnit} label={thresholdLabel} onChange={setThreshold} />}
      <div className="min-h-0 flex-1">
        <DataGrid<T> {...grid} store={store} preset="rfq" label={label} columns={all} filter={combined} onRowActivate={activate} getRowProps={rowProps} renderContextMenu={hasOwnMenu ? menu : undefined} />
      </div>
    </div>
  )
}
