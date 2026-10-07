import { cn } from "cn"
import { createContext, useCallback, useContext, useInsertionEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type FocusEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { ContextMenuItem } from "@/components/ui/context-menu"
import { useRowIds, useStoreMeta } from "@/registry/tradecn/hooks/use-row-store"
import { NULL_TOKEN, NUMERIC_CLASS, formatQuantity, formatQuote, quoteInvertedOf, formatTicks, numericFontClass, parseQuote, stepQuote, type InstrumentConvention } from "@/registry/tradecn/lib/format"
import { blocks, checkLimits, confirms, type Limits, type LimitsDraft } from "@/registry/tradecn/lib/limits"
import type { RowId } from "@/registry/tradecn/lib/row-store"
import { DataGrid, editProblem, type CellEdit, type ColumnDef, type DataGridProps, type EditChange, type EditCommit, type EditProblem } from "@/registry/tradecn/ui/data-grid"

// A market maker's two-way panel: one row per instrument with the market's bid and ask, the desk's bid and
// ask, the skew and the width, a size per side, the server's status word, and the actions the server allows
// on the row. The levels and sizes are typed in place through the grid's editing contract, so every edit is
// a command the server answers and the cell shows it as pending until the row comes back with it. The
// limits table runs on every edit: a block refuses the value in the editor, a confirm asks in words over the
// grid and only a fresh Enter on the same value sends it. Pull all asks again. Everything the panel shows is the server's; nothing here decides a quote.

export interface QuoteRow {
  id: string
  /** The instrument's name, the frozen first column. */
  instrument: string
  /** The server's word on the quote: Quoting, Paused, Pulled, whatever it says. Printed as is. */
  status: string
  /** The market's two-way. */
  marketBid?: number | null
  marketAsk?: number | null
  /** The desk's two-way. Null on a side is no level there. */
  bid?: number | null
  ask?: number | null
  /** How far the desk's mid sits off the market's, in quote steps (ticks for a price basis). Signed. */
  skew?: number | null
  /** From the desk's bid to its ask, in quote steps. */
  width?: number | null
  bidSize?: number | null
  askSize?: number | null
  /** What the server allows on this row, by id. The edit action lets a value be typed; the rest are the row's buttons. Nothing without a list. */
  allowedActions?: readonly string[]
  updatedAt?: number | null
}

/** A button on a row: pause, resume, pull, or whatever the desk calls them. Shown when the row's `allowedActions` names the id. */
export interface QuoteAction<T extends QuoteRow = QuoteRow> {
  id: string
  label: string
  run: (row: T) => void | Promise<unknown>
  destructive?: boolean
}

/** The fields typed in place. */
export type QuoteField = "bid" | "ask" | "skew" | "width" | "bidSize" | "askSize"

export interface QuotePanelLabels {
  /** Column headers. */
  instrument: string
  status: string
  marketBid: string
  marketAsk: string
  bid: string
  ask: string
  skew: string
  width: string
  bidSize: string
  askSize: string
  actions: string
  /** The button over the grid, and what it says while it asks again. */
  pullAll: string
  pullAllAnyway: string
  /** Editor problems. */
  notAQuote: string
  notANumber: string
  notASize: string
  notAWidth: string
  bidCrosses: string
  askCrosses: string
  /** A limit that asks: `{message}` is the limit's own sentence. */
  askAgain: string
  /** The row menu when the server allows nothing on the row. */
  noActions: string
}

export const DEFAULT_QUOTE_PANEL_LABELS: QuotePanelLabels = {
  instrument: "Instrument",
  status: "Status",
  marketBid: "Mkt bid",
  marketAsk: "Mkt ask",
  bid: "Bid",
  ask: "Ask",
  skew: "Skew",
  width: "Width",
  bidSize: "Bid size",
  askSize: "Ask size",
  actions: "Actions",
  pullAll: "Pull all",
  pullAllAnyway: "Pull all anyway?",
  notAQuote: "Not a quote in this instrument's notation.",
  notANumber: "Not a number.",
  notASize: "A size is a whole number, zero or more.",
  notAWidth: "A width is zero or more.",
  bidCrosses: "The bid would cross the ask.",
  askCrosses: "The ask would cross the bid.",
  askAgain: "{message} Press Enter again to send it, or Escape to discard it.",
  noActions: "Nothing can be done with this row right now.",
}

const fill = (template: string, values: Record<string, string>) => template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "")

/** True when the server's list for the row names the action. */
export function allowsQuoteAction(row: QuoteRow, action: string): boolean {
  return row.allowedActions?.includes(action) === true
}

function isNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v)
}

function readNumber(text: string): number | null | "bad" {
  const clean = text.trim().replace(/−/g, "-").replace(/,/g, "")
  if (clean === "") return null
  // Plain decimals only: Number would also read 0x10 and 1e3, which no cell prints.
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(clean)) return "bad"
  return Number(clean)
}

export interface QuoteColumnOptions<T extends QuoteRow> {
  /** One convention for every row, or one per row. Prices print, parse, and step through it. */
  convention: InstrumentConvention | ((row: T) => InstrumentConvention)
  labels?: Partial<QuotePanelLabels>
  /** The row's buttons, shown where `allowedActions` names them. */
  actions?: readonly QuoteAction<T>[]
  /** The id the server allows for typing a value. Default `edit`. */
  editAction?: string
  /** The fat-finger lines every edit is checked against, for every row or per row. */
  limits?: Limits | ((row: T) => Limits | undefined)
  /** The family the price columns set in. Default: the mono stack for a fraction convention, the numeric one otherwise. */
  font?: "numeric" | "mono"
  /**
   * The confirms already asked, keyed by row, field, and value: the first commit of a value a limit asks about is
   * refused with the question, the second sends it. The panel owns one; pass it to share the memory with columns of your own.
   */
  asked?: Set<string>
  /** Told the question a confirm limit asks, and null once it is answered or no longer stands. The panel shows it over the grid; pass your own to show it with columns of your own. */
  onQuestion?: (question: string | null) => void
}

function conventionOf<T extends QuoteRow>(c: InstrumentConvention | ((row: T) => InstrumentConvention), row: T): InstrumentConvention {
  return typeof c === "function" ? c(row) : c
}

function limitsOf<T extends QuoteRow>(l: Limits | ((row: T) => Limits | undefined) | undefined, row: T): Limits | undefined {
  return typeof l === "function" ? l(row) : l
}

/**
 * The limits, as the value is committed: a block refuses it in the editor with the limit's sentence; a confirm
 * refuses it with the question, and only a fresh Enter on the same value answers it. Leaving the editor, Tab,
 * and a held Enter ask again rather than send. A direct call without `commit` keeps the old two-step answer.
 */
function limitProblem<T extends QuoteRow>(draft: LimitsDraft, row: T, key: string, value: unknown, options: QuoteColumnOptions<T>, labels: QuotePanelLabels, commit?: EditCommit): EditProblem | null {
  const limits = limitsOf(options.limits, row)
  if (!limits) {
    options.onQuestion?.(null)
    return null
  }
  const problems = checkLimits(draft, limits, { market: { bid: row.marketBid, ask: row.marketAsk }, convention: conventionOf(options.convention, row) })
  const stop = blocks(problems)[0]
  if (stop) {
    options.onQuestion?.(null)
    return editProblem(stop.message)
  }
  const ask = confirms(problems)[0]
  if (!ask) {
    options.onQuestion?.(null)
    return null
  }
  const memory = options.asked
  const token = `${row.id}\u0000${key}\u0000${String(value)}`
  const answer = commit === undefined || (commit.via === "enter" && !commit.repeat)
  if (answer && memory?.has(token)) {
    memory.delete(token)
    options.onQuestion?.(null)
    return null
  }
  memory?.add(token)
  const question = fill(labels.askAgain, { message: ask.message })
  options.onQuestion?.(question)
  return editProblem(question)
}

/** The grid's `edit` for one field: its notation, its step, the crossed check, and the limits. */
export function quoteEdit<T extends QuoteRow>(field: QuoteField, options: QuoteColumnOptions<T>): CellEdit<T> {
  const labels = { ...DEFAULT_QUOTE_PANEL_LABELS, ...options.labels }
  const editAction = options.editAction ?? "edit"
  const canEdit = (row: T) => allowsQuoteAction(row, editAction)
  if (field === "bid" || field === "ask") {
    return {
      parse: (text, row) => {
        if (text.trim() === "") return null
        const v = parseQuote(text, conventionOf(options.convention, row))
        return v === null ? editProblem(labels.notAQuote) : v
      },
      format: (value, row) => (isNumber(value) ? formatQuote(value, conventionOf(options.convention, row)) : ""),
      validate: (value, row, commit) => {
        if (!isNumber(value)) return null
        // Crossing reads the instrument's quote direction, as the RFQ ticket does: where a
        // higher quote means a lower price, the bid sits above the offer in a normal market.
        const inverted = quoteInvertedOf(conventionOf(options.convention, row))
        if (field === "bid" && isNumber(row.ask) && (inverted ? value <= row.ask : value >= row.ask)) return editProblem(labels.bidCrosses)
        if (field === "ask" && isNumber(row.bid) && (inverted ? value >= row.bid : value <= row.bid)) return editProblem(labels.askCrosses)
        return limitProblem(field === "bid" ? { bid: value } : { ask: value }, row, field, value, options, labels, commit)
      },
      // A step from an empty side starts at the market's same side.
      step: (value, dir, big, row) => {
        const from = isNumber(value) ? value : field === "bid" ? row.marketBid : row.marketAsk
        return isNumber(from) ? stepQuote(from, conventionOf(options.convention, row), dir * (big ? 10 : 1)) : value
      },
      canEdit,
    }
  }
  if (field === "bidSize" || field === "askSize") {
    return {
      parse: (text) => {
        const n = readNumber(text)
        if (n === "bad") return editProblem(labels.notANumber)
        if (n !== null && (!Number.isInteger(n) || n < 0)) return editProblem(labels.notASize)
        return n
      },
      format: (value) => (isNumber(value) ? formatQuantity(value) : ""),
      validate: (value, row, commit) => (isNumber(value) ? limitProblem({ quantity: value }, row, field, value, options, labels, commit) : null),
      step: (value, dir, big) => Math.max(0, (isNumber(value) ? value : 0) + dir * (big ? 10 : 1)),
      canEdit,
    }
  }
  return {
    parse: (text) => {
      const n = readNumber(text)
      if (n === "bad") return editProblem(labels.notANumber)
      if (field === "width" && n !== null && n < 0) return editProblem(labels.notAWidth)
      return n
    },
    format: (value) => (isNumber(value) ? formatTicks(value, { signed: field === "skew" }) : ""),
    // Skew and width count in quote steps; half steps are common, so the arrows move by one and ten with Shift.
    step: (value, dir, big) => Number(((isNumber(value) ? value : 0) + dir * (big ? 10 : 1)).toFixed(10)),
    canEdit,
  }
}

// Which row has a run out, kept by the panel rather than the row's cell: a virtualized row that scrolls away
// and back remounts its cell, and the buttons must stay held while the promise is out.
interface PendingRuns {
  get(id: RowId): string | null
  set(id: RowId, action: string | null): void
  subscribe(listener: () => void): () => void
}

function createPendingRuns(): PendingRuns {
  const runs = new Map<RowId, string>()
  const listeners = new Set<() => void>()
  return {
    get: (id) => runs.get(id) ?? null,
    set(id, action) {
      if (action === null) runs.delete(id)
      else runs.set(id, action)
      for (const listener of listeners) listener()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

const PendingRunsContext = createContext<PendingRuns | null>(null)
const subscribeNothing = () => () => {}

/** Runs a row action as a click or the row menu lands: checked against the row as it is now, held while a promise is out. */
function runQuoteAction<T extends QuoteRow>(row: T, action: QuoteAction<T>, busy: boolean, hold: (action: string | null) => void) {
  if (busy || !allowsQuoteAction(row, action.id)) return
  const out = action.run(row)
  if (out && typeof out === "object" && "then" in out) {
    hold(action.id)
    Promise.resolve(out).then(
      () => hold(null),
      () => hold(null),
    )
  }
}

/** The row's run, from the panel when there is one, else kept by the cell itself. */
function useRowRun(id: RowId): [string | null, (action: string | null) => void] {
  const shared = useContext(PendingRunsContext)
  const fromPanel = useSyncExternalStore(shared ? shared.subscribe : subscribeNothing, () => shared?.get(id) ?? null, () => null)
  const [own, setOwn] = useState<string | null>(null)
  return shared ? [fromPanel, (action) => shared.set(id, action)] : [own, setOwn]
}

interface RowActionsProps<T extends QuoteRow> {
  row: T
  actions: readonly QuoteAction<T>[]
}

// The row's buttons: the actions the server allows on it, checked again against the row as the click lands,
// held while a run's promise is out. The status word never moves on a click; only the row's next batch moves it.
function RowActions<T extends QuoteRow>({ row, actions }: RowActionsProps<T>) {
  const [pending, hold] = useRowRun(row.id)
  const box = useRef<HTMLSpanElement>(null)
  // When the button under focus leaves — the server's reply swaps Pause for Resume, or holds the row — focus
  // falls to body and the grid's keys go dead. The grid takes it instead. A deliberate blur clears the record.
  const focused = useRef<HTMLElement | null>(null)
  useLayoutEffect(() => {
    const previous = focused.current
    if (!previous) return
    const doc = previous.ownerDocument
    const gone = !previous.isConnected || previous.matches(":disabled")
    if (gone && (doc.activeElement === previous || doc.activeElement === doc.body)) {
      focused.current = null
      box.current?.closest<HTMLElement>("[role='grid']")?.focus({ preventScroll: true })
    }
  })
  const allowed = actions.filter((action) => allowsQuoteAction(row, action.id))
  return (
    <span
      ref={box}
      className="flex items-center gap-1"
      data-quote-actions={allowed.length}
      data-grid-interaction="control"
      onFocus={(e) => {
        focused.current = e.target as HTMLElement
      }}
      onBlur={(e) => {
        if (e.relatedTarget) focused.current = null
      }}
    >
      {allowed.length === 0 ? <span className="text-muted-foreground">{NULL_TOKEN}</span> : allowed.map((action) => (
        <Button key={action.id} type="button" size="sm" variant={action.destructive ? "destructive" : "ghost"} className="h-5 px-1.5 text-xs" tabIndex={-1} disabled={pending !== null} data-action={action.id} data-pending={pending === action.id || undefined} onClick={() => runQuoteAction(row, action, pending !== null, hold)}>
          {action.label}
        </Button>
      ))}
    </span>
  )
}

interface RowMenuProps<T extends QuoteRow> {
  id: RowId
  store: QuotePanelProps<T>["store"]
  actions: readonly QuoteAction<T>[]
  noActions: string
}

// The same actions on the row menu, so the keyboard reaches them: Shift+F10 or the Menu key on the focused row.
function RowMenu<T extends QuoteRow>({ id, store, actions, noActions }: RowMenuProps<T>) {
  const [pending, hold] = useRowRun(id)
  const row = store.getRow(id)
  const allowed = row ? actions.filter((action) => allowsQuoteAction(row, action.id)) : []
  if (!row || allowed.length === 0) return <ContextMenuItem disabled>{noActions}</ContextMenuItem>
  return (
    <>
      {allowed.map((action) => (
        <ContextMenuItem
          key={action.id}
          data-action={action.id}
          variant={action.destructive ? "destructive" : undefined}
          disabled={pending !== null}
          onClick={(event) => {
            if (event.defaultPrevented) return
            // Read again as the item lands: the row in the menu's snapshot can be stale.
            const live = store.getRow(id)
            if (live) runQuoteAction(live, action, pending !== null, hold)
          }}
        >
          {action.label}
        </ContextMenuItem>
      ))}
    </>
  )
}

/** Instrument, status, the market's two-way, the desk's, skew, width, the sizes, and the actions. Spread them into your own list to add, drop, or reorder. */
export function quotePanelColumns<T extends QuoteRow>(options: QuoteColumnOptions<T>): ColumnDef<T>[] {
  const labels = { ...DEFAULT_QUOTE_PANEL_LABELS, ...options.labels }
  const font = options.font ?? (typeof options.convention === "function" ? "numeric" : numericFontClass(options.convention) === NUMERIC_CLASS ? "numeric" : "mono")
  const quote = (value: unknown, row: T) => (isNumber(value) ? formatQuote(value, conventionOf(options.convention, row)) : NULL_TOKEN)
  const price = (key: "marketBid" | "marketAsk", header: string): ColumnDef<T> => ({ key, header, width: 88, numeric: true, font, sortable: true, flash: "fill", accessor: (r) => r[key] ?? null, format: quote })
  const own = (key: "bid" | "ask", header: string): ColumnDef<T> => ({ key, header, width: 88, numeric: true, font, sortable: true, accessor: (r) => r[key] ?? null, format: quote, edit: quoteEdit(key, options) })
  const steps = (key: "skew" | "width", header: string): ColumnDef<T> => ({ key, header, width: 72, numeric: true, sortable: true, accessor: (r) => r[key] ?? null, format: (v) => (isNumber(v) ? formatTicks(v, { signed: key === "skew" }) : NULL_TOKEN), edit: quoteEdit(key, options) })
  const size = (key: "bidSize" | "askSize", header: string): ColumnDef<T> => ({ key, header, width: 80, numeric: true, sortable: true, accessor: (r) => r[key] ?? null, format: (v) => (isNumber(v) ? formatQuantity(v) : NULL_TOKEN), edit: quoteEdit(key, options) })
  const actions = options.actions ?? []
  return [
    { key: "instrument", header: labels.instrument, width: 128, frozen: "left", sortable: true, flash: false, accessor: (r) => r.instrument, cell: ({ row }) => <span className="truncate font-medium">{row.instrument}</span> },
    { key: "status", header: labels.status, width: 88, sortable: true, flash: false, accessor: (r) => r.status, cell: ({ row }) => <span data-quote-status={row.status} className="truncate">{row.status}</span> },
    price("marketBid", labels.marketBid),
    price("marketAsk", labels.marketAsk),
    own("bid", labels.bid),
    own("ask", labels.ask),
    steps("skew", labels.skew),
    steps("width", labels.width),
    size("bidSize", labels.bidSize),
    size("askSize", labels.askSize),
    { key: "actions", header: labels.actions, width: 40 + actions.length * 64, flash: false, accessor: (r) => (r.allowedActions ?? []).join(" "), cell: ({ row }) => <RowActions row={row} actions={actions} /> },
  ]
}

export interface QuotePanelProps<T extends QuoteRow = QuoteRow> extends Omit<DataGridProps<T>, "columns" | "preset" | "label" | "onEdit">, Omit<QuoteColumnOptions<T>, "asked" | "onQuestion"> {
  /** `quotePanelColumns(options)` by default. */
  columns?: ColumnDef<T>[]
  label?: string
  /** A level, a size, the skew, or the width was typed: send it to the server. The cell stays pending until the row comes back with the value, or the promise resolves. */
  onEdit: (change: EditChange<T>) => void | Promise<unknown>
  /** Pull all asks again, then hands you every row the server allows the pull action on. Without it there is no button. */
  onPullAll?: (rows: T[]) => void | Promise<unknown>
  /** The id the server allows for pulling a quote. Default `pull`. */
  pullAction?: string
}

export function QuotePanel<T extends QuoteRow = QuoteRow>({ store, convention, labels: labelsProp, actions, editAction = "edit", limits, font, columns, label = "Quotes", onEdit, onPullAll, pullAction = "pull", className, renderContextMenu, ...grid }: QuotePanelProps<T>) {
  const labels = useMemo(() => ({ ...DEFAULT_QUOTE_PANEL_LABELS, ...labelsProp }), [labelsProp])
  const [asked] = useState(() => new Set<string>())
  const [question, setQuestion] = useState<string | null>(null)
  const [runs] = useState(createPendingRuns)
  // The grid's rows are memoized, so what it is handed keeps its identity from one render to the next; your
  // callbacks are read through a ref, updated before any layout effect, so a commit from one reads this render's.
  const latest = useRef({ onEdit, onPullAll, renderContextMenu })
  useInsertionEffect(() => {
    latest.current = { onEdit, onPullAll, renderContextMenu }
  })
  const all = useMemo(() => columns ?? quotePanelColumns<T>({ convention, labels, actions, editAction, limits, font, asked, onQuestion: setQuestion }), [columns, convention, labels, actions, editAction, limits, font, asked])
  const edit = useCallback((change: EditChange<T>) => latest.current.onEdit(change), [])
  // The row menu carries the row's actions for the keyboard, then any items of your own.
  const hasMenu = (actions?.length ?? 0) > 0 || renderContextMenu !== undefined
  const menu = useCallback(
    (rows: T[], ids: RowId[]): ReactNode => (
      <>
        {(actions?.length ?? 0) > 0 && ids[0] !== undefined && <RowMenu<T> id={ids[0]} store={store} actions={actions ?? []} noActions={labels.noActions} />}
        {latest.current.renderContextMenu?.(rows, ids)}
      </>
    ),
    [actions, store, labels.noActions],
  )

  // Pull all: the rows the server allows it on, counted once per applied batch; the first press asks, the second sends.
  const ids = useRowIds(store)
  const meta = useStoreMeta(store)
  const pullable = useMemo(() => {
    void meta.version
    const rows: T[] = []
    for (const id of ids) {
      const row = store.getRow(id)
      if (row && allowsQuoteAction(row, pullAction)) rows.push(row)
    }
    return rows
  }, [store, ids, meta.version, pullAction])
  const [confirming, setConfirming] = useState(false)
  const [pulling, setPulling] = useState(false)
  const pullAll = () => {
    if (pulling) return
    if (!confirming) {
      setConfirming(true)
      return
    }
    setConfirming(false)
    const rows: T[] = []
    for (const id of ids) {
      const row = store.getRow(id)
      if (row && allowsQuoteAction(row, pullAction)) rows.push(row)
    }
    if (rows.length === 0) return
    const out = latest.current.onPullAll?.(rows)
    if (out && typeof out === "object" && "then" in out) {
      setPulling(true)
      Promise.resolve(out).then(
        () => setPulling(false),
        () => setPulling(false),
      )
    }
  }
  // Any other press in the panel, Escape, or focus leaving the panel withdraws the question.
  const withdraw = (e: MouseEvent<HTMLDivElement>) => {
    if (!confirming) return
    if (e.target instanceof Element && e.target.closest("[data-quote-pull-all]")) return
    setConfirming(false)
  }
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape" && confirming) setConfirming(false)
  }
  const root = useRef<HTMLDivElement>(null)
  // When a panel control under focus leaves — Pull all disabling while its promise is out, or its row going
  // away — focus falls to body and the grid's keys go dead. The grid takes it instead.
  const focusedControl = useRef<HTMLElement | null>(null)
  useLayoutEffect(() => {
    const previous = focusedControl.current
    if (!previous) return
    const doc = previous.ownerDocument
    const gone = !previous.isConnected || previous.matches(":disabled")
    if (gone && (doc.activeElement === previous || doc.activeElement === doc.body)) {
      focusedControl.current = null
      root.current?.querySelector<HTMLElement>("[role='grid']")?.focus({ preventScroll: true })
    }
  })
  const onFocus = (e: FocusEvent<HTMLDivElement>) => {
    focusedControl.current = e.target instanceof HTMLElement && e.target.closest("button") ? e.target : null
  }
  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    // A limit question belongs to the editor that asked it. Every way out of the editor — Escape, a commit, a
    // click away — ends in its blur, which runs after the grid's own blur handling, so a question that leaving
    // re-asked is discarded too, and a value typed again later is asked about again.
    if (e.target instanceof Element && e.target.hasAttribute("data-cell-editor")) {
      asked.clear()
      setQuestion(null)
    }
    const next = e.relatedTarget
    if (next) focusedControl.current = null
    if (confirming && !(next instanceof Node && e.currentTarget.contains(next))) setConfirming(false)
  }

  return (
    <PendingRunsContext.Provider value={runs}>
      <div ref={root} data-slot="tradecn-quote-panel" className={cn("flex h-full min-h-0 flex-col gap-1 text-xs lining-nums tabular-nums", className)} onClickCapture={withdraw} onKeyDownCapture={onKeyDown} onFocus={onFocus} onBlur={onBlur}>
        <div className="flex min-h-7 shrink-0 items-center justify-end gap-2">
          <p role="status" data-quote-question={question === null ? undefined : ""} className="mr-auto min-w-0 truncate text-destructive">
            {question}
          </p>
          {onPullAll && (
            <Button type="button" size="sm" variant={confirming ? "destructive" : "outline"} className="h-7" disabled={pulling || pullable.length === 0} data-quote-pull-all={pullable.length} data-confirming={confirming || undefined} onClick={pullAll}>
              {confirming ? labels.pullAllAnyway : labels.pullAll}
            </Button>
          )}
        </div>
        <div className="min-h-0 flex-1">
          <DataGrid<T> {...grid} store={store} preset="parameters" label={label} columns={all} onEdit={edit} renderContextMenu={hasMenu ? menu : undefined} />
        </div>
      </div>
    </PendingRunsContext.Provider>
  )
}
