import { cn } from "cn"
import { createContext, useCallback, useContext, useInsertionEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode, type Ref } from "react"
import { Button } from "@/components/ui/button"
import { useRowIds, useStoreMeta } from "@/registry/tradecn/hooks/use-row-store"
import { NULL_TOKEN } from "@/registry/tradecn/lib/format"
import type { RowId, RowStore, RowView } from "@/registry/tradecn/lib/row-store"
import { DataGrid, exportCsv, type ColumnDef, type DataGridProps } from "@/registry/tradecn/ui/data-grid"

// The caller owns the layout and change markup. The root coordinates selection and export;
// each changes scope shares one live reading. History order comes from the supplied view or store.

export interface AuditChange {
  field: string
  from?: unknown
  to?: unknown
}

export interface AuditEvent {
  id: string
  /** When, ms since the epoch. */
  at: number
  /** The server's word for what happened: New, Acknowledged, PartiallyFilled, Amended, Cancelled. Printed as is. */
  event: string
  /** Who did it: a user, the venue, the system. */
  by?: string | null
  message?: string | null
  /** The fields the event changed, each with the value before and after. */
  changes?: readonly AuditChange[]
}

export interface AuditTrailLabels {
  time: string
  event: string
  by: string
  message: string
  changes: string
  field: string
  from: string
  to: string
  export: string
  /** The pane with nothing selected. */
  select: string
  /** An event with no changes. */
  noChanges: string
  /** The pane's title over one event. `{event}` and `{time}`. */
  eventTitle: string
  /** The pane's title over a difference. `{a}` and `{b}` are the two events' words with their times. */
  diffTitle: string
  /** Two events that leave every field where it was. */
  same: string
  /** The changes column's text, with `{n}` as the count. Default: `Fields: {n}`. */
  fields: string
}

export const DEFAULT_AUDIT_TRAIL_LABELS: AuditTrailLabels = {
  time: "Time",
  event: "Event",
  by: "By",
  message: "Message",
  changes: "Changes",
  field: "Field",
  from: "From",
  to: "To",
  export: "Export CSV",
  select: "Select an event to see what it changed. Select two to see what changed between them.",
  noChanges: "This event changed no fields.",
  eventTitle: "{event} at {time}",
  diffTitle: "{a} to {b}",
  same: "Nothing differs between these two events.",
  fields: "Fields: {n}",
}

let clockFormat: Intl.DateTimeFormat | null = null
// Intl throws on a time that is not an instant (NaN, an infinity, or past the ±8.64e15 ms a Date holds), and a
// throw in a cell takes the whole grid down: such a time prints the null token, whatever formatter is in use.
const isInstant = (ms: unknown): ms is number => Number.isFinite(ms) && Math.abs(ms as number) <= 8.64e15
const localTime = (ms: number) => {
  clockFormat ??= new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
  // The instant Intl prints drops any fraction toward zero; the milliseconds are that instant's, before 1970 too.
  const at = Math.trunc(ms)
  return `${clockFormat.format(at)}.${String(((at % 1000) + 1000) % 1000).padStart(3, "0")}`
}

const fill = (template: string, values: Record<string, string>) => template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "")

/** A value as the pane prints it: the null token for nothing, text for the rest. Pass your own through `value`. */
export function formatAuditValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return NULL_TOKEN
  if (typeof value === "object") return JSON.stringify(value)
  return String(value)
}

export interface AuditTrailColumnOptions<T extends AuditEvent> {
  /** How to print the time. Local HH:MM:SS.mmm by default. */
  time?: (ms: number) => string
  labels?: Partial<AuditTrailLabels>
  /** Unused by the columns; here so one options object serves the columns and the pane. */
  value?: (field: string, value: unknown, event: T) => string
}

/** Time, event, by, message, and how many fields changed. Spread them into your own list to add, drop, or reorder. */
export function auditTrailColumns<T extends AuditEvent>(options: AuditTrailColumnOptions<T> = {}): ColumnDef<T>[] {
  const labels = { ...DEFAULT_AUDIT_TRAIL_LABELS, ...options.labels }
  const time = options.time ?? localTime
  return [
    { key: "at", header: labels.time, width: 104, frozen: "left", numeric: true, sortable: true, flash: false, accessor: (r) => r.at, format: (v) => (isInstant(v) ? time(v) : NULL_TOKEN) },
    { key: "event", header: labels.event, width: 128, sortable: true, flash: false, accessor: (r) => r.event, cell: ({ row }) => <span className="font-medium">{row.event}</span> },
    { key: "by", header: labels.by, width: 96, sortable: true, flash: false, accessor: (r) => r.by ?? null },
    { key: "message", header: labels.message, width: 220, flash: false, accessor: (r) => r.message ?? null },
    { key: "changes", header: labels.changes, width: 96, numeric: true, sortable: true, flash: false, accessor: (r) => r.changes?.length ?? 0, format: (v) => ((v as number) ? fill(labels.fields, { n: String(v) }) : NULL_TOKEN) },
  ]
}

/** Every field's value after the events up to and including `upTo`, in the order given: the state of the thing at that moment, as far as the trail says. */
export function foldChanges<T extends AuditEvent>(events: readonly T[], upTo: RowId): Map<string, unknown> {
  const state = new Map<string, unknown>()
  for (const event of events) {
    for (const change of event.changes ?? []) state.set(change.field, change.to)
    if (event.id === upTo) break
  }
  return state
}

/** The fields whose value at `b` differs from their value at `a`, with both values, `a` first in the trail's order. */
export function diffEvents<T extends AuditEvent>(events: readonly T[], a: RowId, b: RowId): AuditChange[] {
  const ia = events.findIndex((e) => e.id === a)
  const ib = events.findIndex((e) => e.id === b)
  if (ia < 0 || ib < 0) return []
  const [first, second] = ia <= ib ? [a, b] : [b, a]
  const before = foldChanges(events, first)
  const after = foldChanges(events, second)
  const out: AuditChange[] = []
  const fields = new Set([...before.keys(), ...after.keys()])
  for (const field of fields) {
    const from = before.get(field)
    const to = after.get(field)
    if (!Object.is(from, to)) out.push({ field, from, to })
  }
  return out
}

export interface AuditTrailProps<T extends AuditEvent = AuditEvent> extends Omit<ComponentProps<"div">, "children">, AuditTrailColumnOptions<T> {
  store: RowStore<T>
  /** Shared by the grid, changes and CSV. Keep selected ids within this view. */
  view?: RowView<T>
  /** Shared by the grid and CSV; defaults to auditTrailColumns. */
  columns?: ColumnDef<T>[]
  selection?: ReadonlySet<RowId>
  onSelectionChange?: (selection: ReadonlySet<RowId>) => void
  children: ReactNode
}

export interface AuditTrailState {
  selection: ReadonlySet<RowId>
  select: (selection: ReadonlySet<RowId>) => void
  labels: AuditTrailLabels
  /** Current view/store order and column definitions, independent of grid-local sort/filter/columnState. */
  exportCsv: () => string
}

interface Configuration {
  store: RowStore<AuditEvent>
  view?: RowView<AuditEvent>
  columns: ColumnDef<AuditEvent>[]
  time: (ms: number) => string
  value: (field: string, value: unknown, event: AuditEvent) => string
  labels: AuditTrailLabels
}

const ConfigurationContext = createContext<Configuration | null>(null)
const StateContext = createContext<AuditTrailState | null>(null)
const ChangesContext = createContext<AuditTrailChangesState | null>(null)
const defaultValue = (_field: string, value: unknown) => formatAuditValue(value)

function useConfiguration() {
  const state = useContext(ConfigurationContext)
  if (!state) throw new Error("AuditTrail parts must be inside AuditTrail.")
  return state
}

/** Selection and snapshot export, without subscribing to store updates. */
export function useAuditTrail(): AuditTrailState {
  const state = useContext(StateContext)
  if (!state) throw new Error("AuditTrail parts must be inside AuditTrail.")
  return state
}

export function AuditTrail<T extends AuditEvent = AuditEvent>({ store, view, columns, time = localTime, value = defaultValue, labels: labelsProp, selection: selectionProp, onSelectionChange, children, className, ...props }: AuditTrailProps<T>) {
  const labels = useMemo(() => ({ ...DEFAULT_AUDIT_TRAIL_LABELS, ...labelsProp }), [labelsProp])
  const all = useMemo(() => columns ?? auditTrailColumns<T>({ time, labels }), [columns, time, labels])
  const [ownSelection, setOwnSelection] = useState<ReadonlySet<RowId>>(() => new Set())
  const selection = selectionProp ?? ownSelection
  const controlled = selectionProp !== undefined
  const latest = useRef({ onSelectionChange, store, view, all })
  useInsertionEffect(() => { latest.current = { onSelectionChange, store, view, all } })
  const select = useCallback((next: ReadonlySet<RowId>) => {
    if (!controlled) setOwnSelection(next)
    latest.current.onSelectionChange?.(next)
  }, [controlled])
  const csv = useCallback(() => {
    const { store, view, all } = latest.current
    return exportCsv(store, all, (view ?? store).getIds())
  }, [])
  const state = useMemo(() => ({ selection, select, labels, exportCsv: csv }), [selection, select, labels, csv])
  const configuration = useMemo(() => ({ store, view, columns: all, time, value, labels }), [store, view, all, time, value, labels])
  // The grid restores the caller's row type; public hooks expose no unchecked row callbacks.
  return <ConfigurationContext.Provider value={configuration as Configuration}><StateContext.Provider value={state}>
    <div {...props} data-slot="tradecn-audit-trail" className={cn("flex h-full min-h-0 min-w-0 flex-col gap-1 lining-nums tabular-nums", className)}>{children}</div>
  </StateContext.Provider></ConfigurationContext.Provider>
}

export interface AuditTrailGridProps<T extends AuditEvent = AuditEvent> extends Omit<DataGridProps<T>, "store" | "view" | "columns" | "preset" | "selectionMode" | "selection" | "onSelectionChange" | "label"> {
  label?: string
  /** Ref on the grid's sizing wrapper. */
  ref?: Ref<HTMLDivElement>
}

export function AuditTrailGrid<T extends AuditEvent = AuditEvent>({ label = "Audit trail", className, ref, ...props }: AuditTrailGridProps<T>) {
  const { store, view, columns } = useConfiguration()
  const { selection, select } = useAuditTrail()
  return <div ref={ref} data-slot="tradecn-audit-trail-grid" className={cn("h-full min-h-0 min-w-0 flex-1", className)}>
    <DataGrid<T> {...props} store={store as RowStore<T>} view={view as RowView<T> | undefined} columns={columns as ColumnDef<T>[]} preset="tape" selectionMode="multi" selection={selection} onSelectionChange={select} label={label} />
  </div>
}

export interface AuditTrailChangesState {
  kind: "none" | "event" | "diff"
  /** Selected event, or the latter event in a comparison. */
  event: AuditEvent | null
  title: string
  changes: readonly AuditChange[]
  /** Selection prompt, no-changes message or unchanged-comparison message; empty when there are changes. */
  emptyMessage: string
  labels: AuditTrailLabels
  /** Uses the root formatter with the selected or latter event, or formatAuditValue without an event. */
  formatValue: (field: string, value: unknown) => string
}

export interface AuditTrailChangesProps extends Omit<ComponentProps<"section">, "children"> {
  children: ReactNode | ((state: AuditTrailChangesState) => ReactNode)
}

/** One subscription scope and reading shared by all of its children. Callers own the change markup. */
export function AuditTrailChanges({ children, className, ...props }: AuditTrailChangesProps) {
  const { store, view, time, value, labels } = useConfiguration()
  const { selection } = useAuditTrail()
  const ids = useRowIds(view ?? store)
  const meta = useStoreMeta(store)
  const reading = useMemo(() => {
    void meta.version
    const stamp = (ms: number) => (isInstant(ms) ? time(ms) : NULL_TOKEN)
    const chosen = [...selection].map(id => store.getRow(id)).filter((event): event is AuditEvent => event !== undefined)
    if (chosen.length > 1) {
      // The view's order from one pass over it: looking each event up inside the comparator would scan the trail
      // per comparison, at every batch, with the whole trail selected. An event out of the view sorts first.
      const order = new Map(ids.map((id, index) => [id, index]))
      chosen.sort((a, b) => (order.get(a.id) ?? -1) - (order.get(b.id) ?? -1))
    }
    if (!chosen.length) return { kind: "none" as const, event: null, title: "", changes: [], emptyMessage: labels.select }
    const first = chosen[0]!
    if (chosen.length === 1) return { kind: "event" as const, event: first, title: fill(labels.eventTitle, { event: first.event, time: stamp(first.at) }), changes: [...(first.changes ?? [])], emptyMessage: first.changes?.length ? "" : labels.noChanges }
    const last = chosen[chosen.length - 1]!
    const events = ids.map(id => store.getRow(id)).filter((event): event is AuditEvent => event !== undefined)
    const changes = diffEvents(events, first.id, last.id)
    return { kind: "diff" as const, event: last, title: fill(labels.diffTitle, { a: `${first.event} ${stamp(first.at)}`, b: `${last.event} ${stamp(last.at)}` }), changes, emptyMessage: changes.length ? "" : labels.same }
  }, [meta.version, store, ids, selection, time, labels])
  const formatValue = useCallback((field: string, raw: unknown) => reading.event ? value(field, raw, reading.event) : formatAuditValue(raw), [reading.event, value])
  const state = useMemo(() => ({ ...reading, labels, formatValue }), [reading, labels, formatValue])
  return <ChangesContext.Provider value={state}>
    <section aria-label={labels.changes} {...props} data-slot="tradecn-audit-trail-changes" data-audit-pane={reading.kind} className={cn("flex min-h-0 min-w-0 flex-col gap-1 overflow-auto rounded-md border border-border bg-background p-2 text-xs lining-nums tabular-nums", className)}>
      {typeof children === "function" ? children(state) : children}
    </section>
  </ChangesContext.Provider>
}

/** Reuses the nearest changes scope; adds no subscription or history scan. */
export function useAuditTrailChanges(): AuditTrailChangesState {
  const state = useContext(ChangesContext)
  if (!state) throw new Error("useAuditTrailChanges must be inside AuditTrailChanges.")
  return state
}

export interface AuditTrailExportButtonProps extends ComponentProps<typeof Button> {
  onExport: (csv: string) => void
}

export function AuditTrailExportButton({ onExport, children, onClick, disabled, type = "button", variant = "outline", size, className, ...props }: AuditTrailExportButtonProps) {
  const { exportCsv, labels } = useAuditTrail()
  return <Button type={type} variant={variant} size={size === undefined ? "sm" : size} data-audit-export="" {...props} disabled={disabled} className={cn(size === undefined && "h-6 px-2 text-xs", className)} onClick={event => {
    onClick?.(event)
    if (!event.defaultPrevented && !disabled) onExport(exportCsv())
  }}>{children === undefined ? labels.export : children}</Button>
}
