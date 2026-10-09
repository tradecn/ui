import { cn } from "cn"
import { createContext, useCallback, useContext, useInsertionEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ChangeEvent, type FocusEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { ContextMenuGroup, ContextMenuItem, ContextMenuLabel } from "@/components/ui/context-menu"
import { useRowIds, useStoreMeta } from "@/registry/tradecn/hooks/use-row-store"
import { NULL_TOKEN, NUMERIC_CLASS, formatQuantity, formatQuote, quoteInvertedOf, formatTicks, numericFontClass, parseQuote, stepQuote, stripGrouping, type InstrumentConvention } from "@/registry/tradecn/lib/format"
import { blocks, checkLimits, confirms, type Limits, type LimitsDraft, type LimitsLabels } from "@/registry/tradecn/lib/limits"
import type { RowId } from "@/registry/tradecn/lib/row-store"
import { DataGrid, editProblem, type CellEdit, type ColumnDef, type DataGridLabels, type DataGridProps, type EditChange, type EditCommit, type EditProblem } from "@/registry/tradecn/ui/data-grid"

// An undefined word keeps its default, as DataGrid's labels do.
const defined = <W extends object>(words: W | undefined): Partial<W> => Object.fromEntries(Object.entries(words ?? {}).filter(([, word]) => word !== undefined)) as Partial<W>

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
  /** The same, asked of a value a cell control committed: the control answers by committing it again. */
  askAgainControl: string
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
  askAgainControl: "{message} Do it again to send it.",
  noActions: "No actions for this row right now.",
}

const fill = (template: string, values: Record<string, string>) => template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "")

/** True when the server's list for the row names the action. */
export function allowsQuoteAction(row: QuoteRow, action: string): boolean {
  return row.allowedActions?.includes(action) === true
}

function isNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v)
}

// A size prints whole and grouped, "5,000", so one group reads as thousands; skew and width print decimals, so one
// comma with no point after it reads either way and is refused, and their editor opens on text without separators.
// Any other comma is refused: "2,5" is never 25.
function readNumber(text: string, decimals: boolean): number | null | "bad" {
  if (text.trim() === "") return null
  const clean = stripGrouping(text, { decimals })
  if (clean === null) return "bad"
  // Plain decimals only: Number would also read 0x10 and 1e3, which no cell prints, and a run of digits too
  // long to hold reads as Infinity.
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(clean)) return "bad"
  const n = Number(clean)
  if (!Number.isFinite(n)) return "bad"
  return n === 0 ? 0 : n
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
  /** The limit sentences' words, over `DEFAULT_LIMITS_LABELS`. */
  limitsLabels?: Partial<LimitsLabels>
  /** The family the price columns set in. Default: the mono stack for a fraction convention, the numeric one otherwise. */
  font?: "numeric" | "mono"
  /**
   * The question standing, one per set to match the one line that shows it: the first commit of a value a limit
   * asks about is refused with the question, and a fresh Enter on that value in the same opening of the editor
   * sends it. Asking anything else replaces it; any other outcome of a check against the set withdraws it. The
   * panel owns one and hands it to a `columns` function; outside the panel, pass your own, one per line you show.
   */
  asked?: Set<string>
  /**
   * Told the question a confirm limit asks, and null when a later check answers it, blocks or crosses the value,
   * finds nothing to ask (a blank value included), or comes from leaving the editor; text that does not parse
   * never reaches a check. It is not told when an editor closes without a commit, or when its text changes by
   * typing or a step: the panel withdraws on those itself. Outside the panel, clear what you show, and `asked`,
   * when the asking editor's text changes or focus leaves it.
   */
  onQuestion?: (question: string | null) => void
}

function conventionOf<T extends QuoteRow>(c: InstrumentConvention | ((row: T) => InstrumentConvention), row: T): InstrumentConvention {
  return typeof c === "function" ? c(row) : c
}

function limitsOf<T extends QuoteRow>(l: Limits | ((row: T) => Limits | undefined) | undefined, row: T): Limits | undefined {
  return typeof l === "function" ? l(row) : l
}

// The question a commit would answer: its cell, the opening of the cell's editor, and the value. Calls without
// the grid's commit share an opening of their own, and never answer.
const questionToken = (row: QuoteRow, key: string, value: unknown, commit?: EditCommit) => `${row.id}\u0000${key}\u0000${commit?.session ?? "none"}\u0000${String(value)}`

// Withdraws the question standing, from the memory and from the line.
function withdraw<T extends QuoteRow>(options: QuoteColumnOptions<T>): null {
  options.asked?.clear()
  options.onQuestion?.(null)
  return null
}

/**
 * The limits, as the value is committed: a block refuses it in the editor with the limit's sentence; a confirm
 * refuses it with the question, and only a fresh Enter on that value in the same opening of the editor answers
 * it. One question stands at a time, as one line shows it: asking replaces it, and any other outcome withdraws
 * it. Tab and a held key ask again rather than send; leaving the editor refuses without asking, since the draft
 * goes with it; a control committing a value answers by committing it again. A call without `commit` never
 * answers: a wrapper that drops it fails closed.
 */
function limitProblem<T extends QuoteRow>(draft: LimitsDraft, row: T, key: string, value: unknown, options: QuoteColumnOptions<T>, labels: QuotePanelLabels, commit?: EditCommit): EditProblem | null {
  const limits = limitsOf(options.limits, row)
  if (!limits) return withdraw(options)
  const problems = checkLimits(draft, limits, { market: { bid: row.marketBid, ask: row.marketAsk }, convention: conventionOf(options.convention, row), labels: options.limitsLabels })
  const stop = blocks(problems)[0]
  if (stop) {
    withdraw(options)
    return editProblem(stop.message)
  }
  const ask = confirms(problems)[0]
  if (!ask) return withdraw(options)
  const token = questionToken(row, key, value, commit)
  const fresh = commit !== undefined && !commit.repeat && (commit.via === "enter" || commit.via === "value")
  if (fresh && options.asked?.has(token)) return withdraw(options)
  const question = fill(commit?.via === "value" ? labels.askAgainControl : labels.askAgain, { message: ask.message })
  if (commit?.via === "blur") {
    withdraw(options)
    return editProblem(question)
  }
  options.asked?.clear()
  options.asked?.add(token)
  options.onQuestion?.(question)
  return editProblem(question)
}

/** The grid's `edit` for one field: its notation, its step, the crossed check, and the limits. */
export function quoteEdit<T extends QuoteRow>(field: QuoteField, options: QuoteColumnOptions<T>): CellEdit<T> {
  const labels = { ...DEFAULT_QUOTE_PANEL_LABELS, ...defined(options.labels) }
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
        if (!isNumber(value)) return withdraw(options)
        // Crossing reads the instrument's quote direction, as the RFQ ticket does: where a
        // higher quote means a lower price, the bid sits above the offer in a normal market.
        // The other side is the one in view: a level sent and not yet back counts over the row's.
        const inverted = quoteInvertedOf(conventionOf(options.convention, row))
        const otherKey = field === "bid" ? "ask" : "bid"
        const sent = commit?.pending?.(otherKey)
        const other = sent !== undefined ? sent : row[otherKey]
        const crossed = isNumber(other) && (field === "bid" ? (inverted ? value <= other : value >= other) : inverted ? value >= other : value <= other)
        if (crossed) {
          withdraw(options)
          return editProblem(field === "bid" ? labels.bidCrosses : labels.askCrosses)
        }
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
        const n = readNumber(text, false)
        if (n === "bad") return editProblem(labels.notANumber)
        // A fraction is refused from the text, before Number can round it away near the safe-integer limit.
        if (n !== null && (!Number.isSafeInteger(n) || n < 0 || /\.\d*[1-9]/.test(text))) return editProblem(labels.notASize)
        return n
      },
      format: (value) => (isNumber(value) ? formatQuantity(value) : ""),
      validate: (value, row, commit) => (isNumber(value) ? limitProblem({ quantity: value }, row, field, value, options, labels, commit) : withdraw(options)),
      step: (value, dir, big) => Math.max(0, (isNumber(value) ? value : 0) + dir * (big ? 10 : 1)),
      canEdit,
    }
  }
  return {
    parse: (text) => {
      const n = readNumber(text, true)
      if (n === "bad") return editProblem(labels.notANumber)
      if (field === "width" && n !== null && n < 0) return editProblem(labels.notAWidth)
      return n
    },
    format: (value) => (isNumber(value) ? formatTicks(value, { signed: field === "skew", grouping: false }) : ""),
    // Skew and width count in quote steps; half steps are common, so the arrows move by one and ten with Shift. A
    // width stops at zero, as a size does, so a step never lands on a value the parse refuses.
    step: (value, dir, big) => {
      const next = Number(((isNumber(value) ? value : 0) + dir * (big ? 10 : 1)).toFixed(10))
      return field === "width" ? Math.max(0, next) : next
    },
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

// A row's name is its instrument: named by its cells, a focused row would be read again at every market tick.
const instrumentOf = (row: QuoteRow) => row.instrument

// A popout's elements come from another window, where instanceof against this one's classes fails.
const isElement = (node: unknown): node is Element => typeof node === "object" && node !== null && (node as Node).nodeType === 1
const isEditor = (node: unknown): node is HTMLInputElement => isElement(node) && node.hasAttribute("data-cell-editor")
const subscribeNothing = () => () => {}

// A press counts once: the second click of a double-click, and the clicks a held Enter repeats on a focused
// button, run nothing and answer no question the first press asked. The hold belongs to the button it repeats
// on, and ends when the key is let go or focus leaves that button.
function useFreshPress() {
  const held = useRef<EventTarget | null>(null)
  const release = () => {
    held.current = null
  }
  return {
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      held.current = event.key === "Enter" && event.repeat ? event.currentTarget : null
    },
    onKeyUp: release,
    onBlur: release,
    fresh: (event: MouseEvent<HTMLElement>) => event.detail <= 1 && !(event.detail === 0 && held.current === event.currentTarget),
  }
}

// Focus leaving a control on purpose. A window switch also blurs with no destination, but the document loses
// focus with it, so the record stays and a control withdrawn while the trader is away still hands focus to the
// grid on return.
function deliberateBlur(e: FocusEvent<Element>): boolean {
  return e.relatedTarget !== null || e.target.ownerDocument.hasFocus()
}

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
  rowId: RowId
  actions: readonly QuoteAction<T>[]
}

// The row's buttons: the actions the server allows on it, checked again against the row as the click lands,
// held while a run's promise is out. The status word never moves on a click; only the row's next batch moves it.
function RowActions<T extends QuoteRow>({ row, rowId, actions }: RowActionsProps<T>) {
  const [pending, hold] = useRowRun(rowId)
  const press = useFreshPress()
  const box = useRef<HTMLSpanElement>(null)
  // When the button under focus leaves — the server's reply swaps Pause for Resume, or holds the row — focus
  // falls to body and the grid's keys go dead. The grid takes it instead. Leaving on purpose clears the record.
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
  // A row that leaves takes its buttons with it — removed, filtered out, or scrolled out of the virtual window —
  // and focus on one would fall to body. The grid takes it as they go, while they are still in the page.
  useLayoutEffect(() => {
    const el = box.current
    return () => {
      const doc = el?.ownerDocument
      if (el && doc && el.contains(doc.activeElement)) el.closest<HTMLElement>("[role='grid']")?.focus({ preventScroll: true })
    }
  }, [])
  const allowed = actions.filter((action) => allowsQuoteAction(row, action.id))
  return (
    <span
      ref={box}
      className="flex items-center gap-1"
      data-quote-actions={allowed.length}
      // Only the buttons are controls: the null token stays plain row content, so it selects and opens the menu.
      data-grid-interaction={allowed.length > 0 ? "control" : undefined}
      onFocus={(e) => {
        focused.current = e.target as HTMLElement
      }}
      onBlur={(e) => {
        if (deliberateBlur(e)) focused.current = null
      }}
    >
      {/* A destructive action says so in the destructive color on the ghost button, which holds 4.5 to 1 at rest and
          turns to the foreground under the pointer: the destructive variant puts that color on its own tint, below it. */}
      {allowed.length === 0 ? <span className="text-muted-foreground">{NULL_TOKEN}</span> : allowed.map((action) => (
        <Button key={action.id} type="button" size="sm" variant="ghost" className={cn("h-5 px-1.5 text-xs", action.destructive && "text-destructive")} tabIndex={-1} data-destructive={action.destructive || undefined} disabled={pending !== null} data-action={action.id} data-pending={pending === action.id || undefined} onKeyDown={press.onKeyDown} onKeyUp={press.onKeyUp} onBlur={press.onBlur} onClick={(event) => {
            if (press.fresh(event)) runQuoteAction(row, action, pending !== null, hold)
          }}>
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
// They act on the row the menu opened on, named at the top, whatever else is selected.
function RowMenu<T extends QuoteRow>({ id, store, actions, noActions }: RowMenuProps<T>) {
  const [pending, hold] = useRowRun(id)
  // The store's row, not the menu's: the grid hands the menu its rows as it opens, and the panel renders the
  // menu again with every batch while it stays open.
  const row = store.getRow(id)
  const allowed = row ? actions.filter((action) => allowsQuoteAction(row, action.id)) : []
  return (
    <ContextMenuGroup aria-label={row?.instrument}>
      {row && <ContextMenuLabel>{row.instrument}</ContextMenuLabel>}
      {allowed.length === 0 && <ContextMenuItem disabled>{noActions}</ContextMenuItem>}
      {row &&
        allowed.map((action) => (
          <ContextMenuItem
            key={action.id}
            data-action={action.id}
            // The destructive color at rest; highlighted, the item takes the menu's accent, as the destructive
            // variant's tint behind the same color reads below 4.5 to 1.
            data-destructive={action.destructive || undefined}
            className={action.destructive ? "text-destructive" : undefined}
            disabled={pending !== null}
            onClick={(event) => {
              if (!event.defaultPrevented) runQuoteAction(row, action, pending !== null, hold)
            }}
          >
            {action.label}
          </ContextMenuItem>
        ))}
    </ContextMenuGroup>
  )
}

/** Instrument, status, the market's two-way, the desk's, skew, width, the sizes, and the actions. Spread them into your own list to add, drop, or reorder. */
export function quotePanelColumns<T extends QuoteRow>(options: QuoteColumnOptions<T>): ColumnDef<T>[] {
  const labels = { ...DEFAULT_QUOTE_PANEL_LABELS, ...defined(options.labels) }
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
    { key: "actions", header: labels.actions, width: 40 + actions.length * 64, flash: false, accessor: (r) => (r.allowedActions ?? []).join(" "), cell: ({ row, rowId }) => <RowActions row={row} rowId={rowId} actions={actions} /> },
  ]
}

/** What the panel hands a `columns` function: its memory of the question standing, and its question line. */
export interface QuotePanelQuestion {
  asked: Set<string>
  onQuestion: (question: string | null) => void
}

export interface QuotePanelProps<T extends QuoteRow = QuoteRow> extends Omit<DataGridProps<T>, "columns" | "preset" | "label" | "onEdit" | "labels">, Omit<QuoteColumnOptions<T>, "asked" | "onQuestion"> {
  /** The panel's words beside its own: `QuotePanelLabels` and DataGrid's `DataGridLabels`. */
  labels?: Partial<QuotePanelLabels & DataGridLabels>
  /**
   * `quotePanelColumns(options)` by default. A list replaces the columns; a function receives the panel's
   * question wiring to spread into `quotePanelColumns` or `quoteEdit`, and keeps the panel's question line.
   */
  columns?: ColumnDef<T>[] | ((question: QuotePanelQuestion) => ColumnDef<T>[])
  label?: string
  /** A level, a size, the skew, or the width was typed: send it to the server. The cell stays pending until the row comes back with the value, or the promise resolves. */
  onEdit: (change: EditChange<T>) => void | Promise<unknown>
  /** Pull all asks again, then hands you every row the server allows the pull action on. Without it there is no button. */
  onPullAll?: (rows: T[]) => void | Promise<unknown>
  /** The id the server allows for pulling a quote. Default `pull`. */
  pullAction?: string
}

export function QuotePanel<T extends QuoteRow = QuoteRow>({ store, convention, labels: labelsProp, actions, editAction = "edit", limits, limitsLabels, font, columns, label = "Quotes", onEdit, onPullAll, pullAction = "pull", className, renderContextMenu, getRowLabel = instrumentOf, ...grid }: QuotePanelProps<T>) {
  const labels = useMemo(() => ({ ...DEFAULT_QUOTE_PANEL_LABELS, ...defined(labelsProp) }), [labelsProp])
  const [asked] = useState(() => new Set<string>())
  const [question, setQuestion] = useState<string | null>(null)
  const [runs] = useState(createPendingRuns)
  const root = useRef<HTMLDivElement>(null)
  // Where focus was as the question was asked: the editor whose commit asked, or the control that committed.
  // Focus landing anywhere else in the panel, its text changing, or its blur withdraws the question and the
  // memory with it; a control's blur counts when focus leaves it on purpose, not for a window switch.
  const asking = useRef<Element | null>(null)
  useLayoutEffect(() => {
    asking.current = question !== null ? (root.current?.ownerDocument.activeElement ?? null) : null
  }, [question])
  const withdrawQuestion = () => {
    asked.clear()
    asking.current = null
    setQuestion(null)
  }
  // The grid's rows are memoized, so what it is handed keeps its identity from one render to the next; your
  // callbacks are read through a ref, updated before any layout effect, so a commit from one reads this render's.
  const latest = useRef({ onEdit, onPullAll })
  useInsertionEffect(() => {
    latest.current = { onEdit, onPullAll }
  })
  // A columns function rebuilds only when it changes; the generated columns, when one of their options does.
  const columnsFrom = typeof columns === "function" ? columns : undefined
  const generate = columns === undefined
  const fromFunction = useMemo(() => columnsFrom?.({ asked, onQuestion: setQuestion }), [columnsFrom, asked])
  const generated = useMemo(
    () => (generate ? quotePanelColumns<T>({ convention, labels, actions, editAction, limits, limitsLabels, font, asked, onQuestion: setQuestion }) : undefined),
    [generate, convention, labels, actions, editAction, limits, limitsLabels, font, asked],
  )
  const all = fromFunction ?? (Array.isArray(columns) ? columns : generated) ?? []
  const edit = useCallback((change: EditChange<T>) => latest.current.onEdit(change), [])
  // The row menu carries the actions of the row it opened on, for the keyboard, then any items of your own. Its
  // presence follows whether actions are passed at all, so emptying the list never remounts the grid's body.
  const hasMenu = actions !== undefined || renderContextMenu !== undefined
  const menu = useCallback(
    (rows: T[], ids: RowId[], target?: RowId | null): ReactNode => {
      const id = target ?? ids[0]
      return (
        <>
          {actions !== undefined && id !== undefined && <RowMenu<T> id={id} store={store} actions={actions} noActions={labels.noActions} />}
          {renderContextMenu?.(rows, ids, target)}
        </>
      )
    },
    [actions, store, labels.noActions, renderContextMenu],
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
  // A question about nothing pullable no longer stands: when a row becomes pullable again, the button asks again.
  if (confirming && pullable.length === 0) setConfirming(false)
  const pullPress = useFreshPress()
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
    if (isElement(e.target) && e.target.closest("[data-quote-pull-all]")) return
    setConfirming(false)
  }
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape" && confirming) setConfirming(false)
    // A step rewrites the asking editor's text without an input event; it withdraws the question as typing does.
    if ((e.key === "ArrowUp" || e.key === "ArrowDown") && asking.current && e.target === asking.current) withdrawQuestion()
  }
  // When Pull all disables under focus — its promise out, or no row left to pull — focus falls to body and the
  // grid's keys go dead. The grid takes it instead. A row's buttons see to their own.
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
    const target = e.target
    focusedControl.current = isElement(target) && target.closest("[data-quote-pull-all]") ? (target as HTMLElement) : null
    // Tab into the next editor, or the grid taking focus from an editor its row took away.
    if (asking.current && target !== asking.current) withdrawQuestion()
  }
  const onChange = (e: ChangeEvent<HTMLDivElement>) => {
    if (asking.current && e.target === asking.current) withdrawQuestion()
  }
  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    // An editor closing withdraws the question, whether or not leaving committed anything; so does focus leaving
    // the control that asked, straight out of the panel included.
    if (isEditor(e.target) || (asking.current && e.target === asking.current && deliberateBlur(e))) withdrawQuestion()
    if (focusedControl.current === e.target && deliberateBlur(e)) focusedControl.current = null
    const next = e.relatedTarget
    if (confirming && !(isElement(next) && e.currentTarget.contains(next))) setConfirming(false)
  }
  // A line for the question only where one can stand — the generated columns with limits, or a columns function
  // given the panel's wiring — beside Pull all when there is one.
  const header = onPullAll !== undefined || (columns === undefined ? limits !== undefined : typeof columns === "function")

  return (
    <PendingRunsContext.Provider value={runs}>
      <div ref={root} data-slot="tradecn-quote-panel" className={cn("flex h-full min-h-0 flex-col gap-1 text-xs lining-nums tabular-nums", className)} onClickCapture={withdraw} onKeyDownCapture={onKeyDown} onFocus={onFocus} onBlur={onBlur} onChange={onChange}>
        {header && (
          <div className="flex min-h-7 shrink-0 items-center justify-end gap-2">
            <p role="status" data-quote-question={question === null ? undefined : ""} title={question ?? undefined} className="mr-auto min-w-0 truncate text-destructive">
              {question}
            </p>
            {onPullAll && (
              <Button type="button" size="sm" variant="outline" className={cn("h-7", confirming && "text-destructive")} disabled={pulling || pullable.length === 0} data-quote-pull-all={pullable.length} data-confirming={confirming || undefined} onKeyDown={pullPress.onKeyDown} onKeyUp={pullPress.onKeyUp} onBlur={pullPress.onBlur} onClick={(event) => {
                if (pullPress.fresh(event)) pullAll()
              }}>
                {confirming ? labels.pullAllAnyway : labels.pullAll}
              </Button>
            )}
          </div>
        )}
        <div className="min-h-0 flex-1">
          <DataGrid<T> {...grid} store={store} preset="parameters" label={label} labels={labelsProp} getRowLabel={getRowLabel} columns={all} onEdit={edit} renderContextMenu={hasMenu ? menu : undefined} />
        </div>
      </div>
    </PendingRunsContext.Provider>
  )
}
