import { useVirtualizer } from "@tanstack/react-virtual"
import { cn } from "cn"
import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useId,
  useInsertionEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
  type SyntheticEvent,
  type UIEvent,
} from "react"
import { Checkbox } from "@/components/ui/checkbox"
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "@/components/ui/context-menu"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { createFlashMemory, playFlash, useFlash, type FlashMemory } from "@/registry/tradecn/hooks/use-flash"
import { useRow, useRowIds, useStoreMeta, useView } from "@/registry/tradecn/hooks/use-row-store"
import { MONO_NUMERIC_CLASS, NULL_TOKEN, NUMERIC_CLASS } from "@/registry/tradecn/lib/format"
import { applyRules, compareDirected, compareValues, compileComparator, compileFilter, type AppliedRules, type GridRules, type RuleDecoration } from "@/registry/tradecn/lib/grid-rules"
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
  /** Custom cell content. The cell still flashes by `accessor` value. `edit` is there when the column is editable and the grid has `onEdit`. */
  cell?: (ctx: { row: T; value: unknown; rowId: RowId; edit?: CellEditHandle }) => ReactNode
  /** Flash on change. Defaults to the preset's variant for numeric columns and off otherwise. */
  flash?: false | "fill" | "ring"
  /** Right-aligned, lining tabular figures in the numeric family, flashes by default. */
  numeric?: boolean
  /** The family a numeric cell sets in: `numeric` (the sans, digits at one width) by default, or `mono` for fraction quotes, so digits and the dash take one width; a tailed quote still runs longer than an untailed one. */
  font?: "numeric" | "mono"
  /** Reads a value typed into a rule in this column's own format (`99-16+` on a 32nds column). Default: a number for a numeric column, the text itself otherwise. */
  parse?: (text: string) => unknown
  /** Lets the cell be edited in place, when the grid has `onEdit`. An edit is a command the server answers, never a local truth. */
  edit?: CellEdit<T>
}

export interface ColumnState {
  order: string[]
  widths: Record<string, number>
  hidden: string[]
}

/** What stops an edit, in a sentence: what `parse` or `validate` return instead of a value. */
export interface EditProblem {
  problem: string
}

export function editProblem(problem: string): EditProblem {
  return { problem }
}

export function isEditProblem(value: unknown): value is EditProblem {
  return typeof value === "object" && value !== null && Object.keys(value).length === 1 && typeof (value as EditProblem).problem === "string"
}

/** How a commit came: the editor's Enter or Tab, leaving the editor, or a toggle or cell control committing a value; whether the key was held; and which opening of the editor it came from. */
export interface EditCommit {
  via: "enter" | "tab" | "blur" | "value"
  /** True for a held key's repeats: Enter or Tab in an editor, Space or Enter on a toggle, or a cell control's commit that passes `{ repeat: true }`. False for a blur. */
  repeat: boolean
  /** One number per opening of an editor, unique across every grid on the page, so a check that asks a question can keep its answer to that opening. Value commits share session 0. */
  session: number
}

// Numbered across every grid, so answers kept per opening never cross from one grid to another, or from a
// grid's openings before its store changed to those after.
let editorOpenings = 0

/** How a column's cells are edited. Every function gets the row, because a step or a check can depend on it. */
export interface CellEdit<T> {
  /** Reads the typed text as a value, or says what is wrong with it. */
  parse: (text: string, row: T) => unknown
  /** The text the editor opens with. Default: the column's `format`, else the value as text, blank for null. */
  format?: (value: unknown, row: T) => string
  /** A check on the parsed value before it is committed. The grid also says how the commit came, so a check that asks a question can insist on a fresh Enter for the answer; a direct call may leave it out. */
  validate?: (value: unknown, row: T, commit?: EditCommit) => EditProblem | null | undefined
  /** Up and Down in the editor: the value one step away, ten with Shift. Left out, the arrows do nothing. */
  step?: (value: unknown, dir: 1 | -1, big: boolean, row: T) => unknown
  /** Enter or Space on the focused cell commits this in place of opening an editor: a checkbox column. */
  toggle?: (value: unknown, row: T) => unknown
  /** False keeps this row's cell read-only. Default: editable. */
  canEdit?: (row: T) => boolean
}

/** What `onEdit` is handed: one cell's committed value, with what it replaces. */
export interface EditChange<T> {
  rowId: RowId
  key: string
  value: unknown
  previous: unknown
  row: T
}

/**
 * Where an edit stands. `editing` while the editor is open; `pending` from the commit until a later batch
 * brings the row's value to the committed one or `onEdit`'s promise resolves; `rejected` when that promise
 * rejects, with the server's message and the value that stands.
 */
export type EditStatus =
  | { kind: "editing"; text: string; problem: string | null; selectAll: boolean; initial?: string | null; focused?: boolean; prior?: EditStatus; session?: number }
  | { kind: "pending"; value: unknown; text: string; tracked?: boolean }
  | { kind: "rejected"; value: unknown; message: string }

/** What a `cell` renderer gets for an editable column: the edit's status, and a way to commit a value of its own (a checkbox's). */
export interface CellEditHandle {
  status: EditStatus | undefined
  /** Validates and sends a value. Pass `{ repeat: true }` for a commit a held key repeats, so a check that asks a question never takes it for an answer. */
  commit: (value: unknown, how?: { repeat?: boolean }) => void
  open: () => void
}

export type SortState = { key: string; dir: "asc" | "desc" } | null
export type SelectionMode = "none" | "single" | "multi"
export type DataGridPreset = "blotter" | "watchlist" | "rfq" | "option-chain" | "tape" | "parameters"

export interface RowEnterBehavior {
  /** Highlight rows as they arrive. */
  highlight: boolean
  /** Keep the first visible row where it is when rows arrive above it. */
  pinViewport: boolean
  /**
   * Follow the tail: the viewport goes to the end as rows arrive there, until a key, a pointer, or a
   * scroll away from the end stops it. A "N new" pill then counts the arrivals and returns to the end.
   * What the `tape` preset does; off elsewhere.
   */
  followTail?: boolean
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
  tape: { rowHeight: 22, fontClass: "text-xs", reorderHoldMs: 0, flash: "fill", selectionMode: "single", rowEnter: { highlight: true, pinViewport: false, followTail: true }, announceRowCount: "debounced" },
  parameters: { rowHeight: 24, fontClass: "text-xs", reorderHoldMs: 0, flash: "ring", selectionMode: "single", rowEnter: { highlight: false, pinViewport: true }, announceRowCount: "off" },
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
  /** Initial uncontrolled columns and the latest Reset columns target. Changes do not overwrite current settings. */
  baseState?: ColumnState
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
  /** Items for the right-click menu, given the rows it applies to (the selection, or the row under the pointer) and the row it opened on. */
  renderContextMenu?: (rows: T[], ids: RowId[], target?: RowId | null) => ReactNode
  rowEnter?: Partial<RowEnterBehavior>
  announceRowCount?: "off" | "debounced"
  /** Accessible name for the grid. */
  label: string
  emptyState?: ReactNode
  getRowProps?: (row: T, id: RowId) => RowDecoration | undefined
  /**
   * Rules as data: cells and rows to color, rows to show, and the order, from `grid-rules`. The grid
   * wires them itself; `cell`, `getRowProps`, `filter`, and `sort` stay yours for what code has to do.
   * With a `view` of your own the grid ignores `rules.filter` and `rules.sort`, as it ignores `filter`.
   * Keep the object's identity stable between renders, as with `filter`.
   */
  rules?: GridRules
  /**
   * Totals: a sticky row under the body with one value per column named here, given the view's rows
   * (filtered and ordered, what is on screen). Recomputed once per applied batch, never per frame, and
   * never flashed. Keep the object's identity stable between renders, as with `filter`.
   */
  footer?: Record<string, (rows: T[]) => string>
  /**
   * A cell was edited: send the change on. Editing is on only when this is given, for the columns with
   * `edit`. The cell shows the committed value as pending until a later batch brings the row's value to it
   * or the promise you return resolves; a rejected promise keeps the previous value and prints the
   * message in the cell. Multi-cell paste is not part of this.
   */
  onEdit?: (change: EditChange<T>) => void | Promise<unknown>
  flashWindowMs?: number
  className?: string
  /** Viewport size before layout is measured (tests, server rendering). */
  initialRect?: { width: number; height: number }
}

/** What `getRowProps` may put on a row. A rule's decoration from `grid-rules` is one. */
export interface RowDecoration {
  className?: string
  "data-state"?: string
  "data-rule"?: string
  "data-tone"?: string
  "aria-description"?: string
}

type Resolved<T> = ColumnDef<T> & { width: number; minWidth: number }

const EMPTY_SET: ReadonlySet<RowId> = new Set()
const SELECT_WIDTH = 32
const ENTER_WINDOW_MS = 1500

// When a mark's flash window begins: at arrival, or, for a mark a reorder hold
// parked, when that hold lapses — frozen at `now` while the hold is still running.
interface EnterMark {
  at: number
  until: number | null
}
const enterStart = (mark: EnterMark, now: number) => (mark.until !== null ? Math.max(mark.at, Math.min(mark.until, now)) : mark.at)

// Native controls and focus targets own interaction regardless of an authored role.
const ROW_CONTROLS = 'a[href], button, input, select, textarea, label, summary, audio[controls], video[controls], iframe, object, embed, [contenteditable]:not([contenteditable="false"]), [tabindex], [data-grid-interaction="control"]'
const CONTROL_ROLES = new Set("button link checkbox radio switch combobox listbox option textbox searchbox slider spinbutton scrollbar tab tablist toolbar menu menubar menuitem menuitemcheckbox menuitemradio tree treeitem radiogroup doc-backlink doc-biblioref doc-glossref doc-noteref".split(" "))
// Include noninteractive roles: in "status button", status wins. Abstract roles cannot win a fallback list.
const ARIA_ROLES = new Set([
  ..."alert alertdialog application article banner blockquote button caption cell checkbox code columnheader combobox comment complementary contentinfo definition deletion dialog directory document emphasis feed figure form generic grid gridcell group heading image img insertion link list listbox listitem log main mark marquee math menu menubar menuitem menuitemcheckbox menuitemradio meter navigation none note option paragraph presentation progressbar radio radiogroup region row rowgroup rowheader scrollbar search searchbox sectionfooter sectionheader separator slider spinbutton status strong subscript suggestion superscript switch tab table tablist tabpanel term textbox time timer toolbar tooltip tree treegrid treeitem".split(" "),
  ..."document object symbol".split(" ").map(role => `graphics-${role}`),
  ..."abstract acknowledgments afterword appendix backlink biblioentry bibliography biblioref chapter colophon conclusion cover credit credits dedication endnote endnotes epigraph epilogue errata example footnote foreword glossary glossref index introduction noteref notice pagebreak pagefooter pageheader pagelist part preface prologue pullquote qna subtitle tip toc".split(" ").map(role => `doc-${role}`),
])

function roleOf(element: Element): string | undefined {
  const value = element.getAttribute("role")
  if (!value) return
  for (const token of value.split(/[\t\n\f\r ]+/)) {
    if (!/^[A-Za-z-]+$/.test(token)) continue
    const role = token.toLowerCase()
    if (ARIA_ROLES.has(role)) return role
  }
}

function independentGrid(element: Element): boolean {
  const role = roleOf(element)
  return role === "grid" || role === "treegrid" || element.getAttribute("data-grid-interaction") === "independent"
}

function gridTarget(root: HTMLElement | null, target: EventTarget, path?: EventTarget[]): Element | undefined {
  const element = target as Element
  // Portals can dispatch both an inner-target pass and a host-retargeted pass.
  if (!root?.contains(element)) return undefined
  if (path) {
    for (const entry of path) {
      if (entry === root) return element
      if ((entry as Node).nodeType === 1 && independentGrid(entry as Element)) return undefined
    }
  } else {
    for (let node: Element | null = element; node; node = node.parentElement) {
      if (node === root) return element
      if (independentGrid(node)) return undefined
    }
  }
  return undefined
}

function pathMatches(root: HTMLElement | null, path: EventTarget[], matches: (element: Element) => boolean): boolean {
  for (const entry of path) {
    if (entry === root) return false
    if ((entry as Node).nodeType === 1 && matches(entry as Element)) return true
  }
  return false
}

function rejectMenuStart(root: HTMLElement | null, event: SyntheticEvent) {
  const native = event.nativeEvent
  if (event.type === "contextmenu" && root && native.composedPath().includes(root)) {
    // Base's document listener also claims contained context menus, including at a hydrated document root.
    event.stopPropagation()
    if (native.currentTarget === root.ownerDocument) native.stopImmediatePropagation()
    return
  }
  // React's dispatcher checks this query before visiting an ancestor. This compatibility shim
  // skips the menu trigger without blocking native listeners used by dialog dismissal and touch tracking.
  event.isPropagationStopped = () => true
}

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

/** Nulls last, numbers numerically, everything else as text. `compareValues` in `grid-rules`, kept here by name. */
export function compareForSort(a: unknown, b: unknown): number {
  return compareValues(a, b)
}

/** The header's sort as a comparator, a null last whichever way it runs. */
export function comparatorFor<T>(columns: ColumnDef<T>[], sort: SortState): ((a: T, b: T) => number) | undefined {
  if (!sort) return undefined
  const col = columns.find((c) => c.key === sort.key)
  if (!col) return undefined
  return (x, y) => compareDirected(col.accessor(x), col.accessor(y), sort.dir)
}

/** One comparator after another: the first that tells two rows apart decides. Undefined when there is none. */
function chainComparators<T>(...comparators: (((a: T, b: T) => number) | undefined)[]): ((a: T, b: T) => number) | undefined {
  const list = comparators.filter((c): c is (a: T, b: T) => number => c !== undefined)
  if (!list.length) return undefined
  if (list.length === 1) return list[0]
  return (a, b) => {
    for (const compare of list) {
      const c = compare(a, b)
      if (c !== 0) return c
    }
    return 0
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
  // Spreadsheets execute cells led by = + - @ or a tab or carriage return: free-text
  // fields — a message, an author — must not run as formulas when the file is opened.
  // The apostrophe prefix is the spreadsheet convention for "this is text".
  // A sign-led field is data only when the WHOLE field is a number: a leading digit
  // does not stop a spreadsheet from evaluating what follows it.
  const wholeNumber = /^[+-]?(\d+(\.\d*)?|\.\d+)(e[+-]?\d+)?$/i
  const neutral = (s: string) => (/^[=@\t\r]/.test(s) || (/^[+-]/.test(s) && !wholeNumber.test(s)) ? `'${s}` : s)
  // A finite numeric accessor usually formats to a number — +1,234.50 from a signed
  // formatter included — and number-shaped text is data. The sign rule still applies
  // to numeric text that does not read as one number, and the hard leads always
  // neutralize: a formatter may emit arbitrary text.
  const numberShaped = /^[+-]?(\d{1,3}(,\d{3})+|\d+)(\.\d*)?$|^[+-]?\.\d+$|^[+-]?\d+(\.\d*)?e[+-]?\d+$/i
  const esc = (s: string, numeric = false) => {
    const t = numeric ? (/^[=@\t\r]/.test(s) || (/^[+-]/.test(s) && !numberShaped.test(s)) ? `'${s}` : s) : neutral(s)
    return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
  }
  const header = cols.map((c) => esc(typeof c.header === "string" ? c.header : c.key)).join(",")
  const lines: string[] = []
  for (const id of ids) {
    const row = store.getRow(id)
    if (row === undefined) continue
    lines.push(
      cols
        .map((c) => {
          const v = c.accessor(row)
          const numeric = typeof v === "number" && Number.isFinite(v)
          return esc(c.format ? c.format(v, row) : v === null || v === undefined ? "" : String(v), numeric)
        })
        .join(","),
    )
  }
  return [header, ...lines].join("\r\n") + "\r\n"
}

// Editing. One editor at a time, its status kept in a tracker the cells subscribe to one key at a time,
// so opening, typing in, or settling one cell re-renders that cell and nothing else. The controller is
// one object for the grid's life; its callbacks read the latest props through a ref.

const cellKey = (rowId: RowId, key: string) => `${rowId}\u0000${key}`

interface EditTracker {
  get(key: string): EditStatus | undefined
  set(key: string, status: EditStatus | undefined): void
  subscribe(key: string, cb: () => void): () => void
  /** The cell whose editor is open. */
  editing(): string | null
}

function createEditTracker(): EditTracker {
  const statuses = new Map<string, EditStatus>()
  const listeners = new Map<string, Set<() => void>>()
  let open: string | null = null
  return {
    get: (key) => statuses.get(key),
    set(key, status) {
      if (status) statuses.set(key, status)
      else statuses.delete(key)
      if (status?.kind === "editing") open = key
      else if (open === key) open = null
      const set = listeners.get(key)
      if (set) for (const cb of set) cb()
    },
    subscribe(key, cb) {
      let set = listeners.get(key)
      if (!set) listeners.set(key, (set = new Set()))
      set.add(cb)
      return () => {
        set!.delete(cb)
        if (!set!.size) listeners.delete(key)
      }
    },
    editing: () => open,
  }
}

interface EditController {
  tracker: EditTracker
  reconcileColumns(keys: ReadonlySet<string>): void
  unmountEditor(key: string, input: HTMLInputElement): void
  editorFocusFell: { current: boolean }
  markFocused(rowId: RowId, key: string): void
  rowOf(k: string): RowId | undefined
  forget(k: string): void
  open(rowId: RowId, key: string, typed?: string): void
  type(rowId: RowId, key: string, text: string): void
  /** Parse, check, and send. `move` opens the next (1) or previous (-1) editable cell of the row after. */
  commit(rowId: RowId, key: string, how: EditCommit, move?: 1 | -1): void
  /** A value a cell renderer settled itself (a checkbox): sent as it is. */
  commitValue(rowId: RowId, key: string, value: unknown, repeat?: boolean): void
  cancel(rowId: RowId, key: string): void
  step(rowId: RowId, key: string, dir: 1 | -1, big: boolean): void
  /** Focus left the editor: commit what parses, drop what does not. */
  blur(rowId: RowId, key: string): void
  /** A later batch brought the row's value to the committed one. */
  settle(rowId: RowId, key: string): void
  settlePrior(rowId: RowId, key: string): void
}

function editText<T>(col: ColumnDef<T>, value: unknown, row: T): string {
  if (col.edit?.format) return col.edit.format(value, row)
  if (value === null || value === undefined) return ""
  return col.format ? col.format(value, row) : String(value)
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  return "Rejected"
}

function canEditCell<T>(col: ColumnDef<T> | undefined, row: T | undefined): col is ColumnDef<T> & { edit: CellEdit<T> } {
  return Boolean(col?.edit) && row !== undefined && (col!.edit!.canEdit?.(row) ?? true)
}

const noopSubscribe = () => () => {}
const undefinedStatus = () => undefined

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
  rules: AppliedRules<T> | null
  /** The row's own rule, for a frozen cell to paint: its opaque background would otherwise cut a gap in the row's tint. */
  rowRule: RuleDecoration | undefined
  /** The grid's editing, or null when it has no `onEdit`. */
  edits: EditController | null
}

interface CellEditorProps {
  rowId: RowId
  colKey: string
  label: string
  status: Extract<EditStatus, { kind: "editing" }>
  numeric: boolean
  className: string
  edits: EditController
}

// The editor: a bare input the size of the cell. Enter commits, Escape reverts, Tab and Shift+Tab commit
// and move along the row, bare Up and Down step. With a modifier held the arrows are not its business:
// they belong to whoever listens above it, the way a ticket's mod+up reaches its registry from a field.
function CellEditor({ rowId, colKey, label, status, numeric, className, edits }: CellEditorProps) {
  const ref = useRef<HTMLInputElement>(null)
  const selectAll = status.selectAll
  useLayoutEffect(() => {
    const input = ref.current
    return () => { if (input) edits.unmountEditor(colKey, input) }
  }, [edits, colKey])
  const focused = status.focused ?? false
  useEffect(() => {
    const el = ref.current
    if (!el) return
    // Once per OPEN, not per mount: a row scrolled away and back remounts its editor,
    // and that remount must not steal focus — while a fresh open() of a mounted cell
    // resets the flag and focuses again.
    if (focused) return
    edits.markFocused(rowId, colKey)
    el.focus({ preventScroll: true })
    if (selectAll) el.select()
    else el.setSelectionRange(el.value.length, el.value.length)
    // A keystroke must not reselect the text under the hand.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused])
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const mod = e.metaKey || e.ctrlKey || e.altKey
    switch (e.key) {
      case "Enter":
        e.preventDefault()
        edits.commit(rowId, colKey, { via: "enter", repeat: e.repeat, session: status.session ?? 0 })
        return
      case "Escape":
        e.preventDefault()
        edits.cancel(rowId, colKey)
        return
      case "Tab":
        e.preventDefault()
        edits.commit(rowId, colKey, { via: "tab", repeat: e.repeat, session: status.session ?? 0 }, e.shiftKey ? -1 : 1)
        return
      case "ArrowUp":
      case "ArrowDown":
        if (mod) return
        e.preventDefault()
        edits.step(rowId, colKey, e.key === "ArrowUp" ? 1 : -1, e.shiftKey)
        return
    }
  }
  return (
    <input
      ref={ref}
      data-cell-editor=""
      data-numeric={numeric ? "" : undefined}
      aria-label={label}
      aria-invalid={status.problem ? true : undefined}
      aria-description={status.problem ?? undefined}
      title={status.problem ?? undefined}
      value={status.text}
      autoComplete="off"
      spellCheck={false}
      inputMode={numeric ? "decimal" : undefined}
      className={cn("h-full w-full min-w-0 bg-background px-2 text-inherit outline-none ring-1 ring-inset ring-ring aria-invalid:ring-destructive", numeric && "text-right", className)}
      onChange={(e) => edits.type(rowId, colKey, e.target.value)}
      onKeyDown={onKeyDown}
      onBlur={() => edits.blur(rowId, colKey)}
    />
  )
}

function Cell<T>({ col, row, rowId, colIndex, left, memory, flashVariant, flashWindowMs, focusedCol, rules, rowRule, edits }: CellProps<T>) {
  const value = col.accessor(row)
  const ref = useRef<HTMLDivElement>(null)
  const flash = col.flash ?? (col.numeric ? flashVariant : false)
  const key = cellKey(rowId, col.key)
  useFlash(ref, value, { memory, cellKey: key, variant: flash || "fill", windowMs: flashWindowMs, disabled: !flash })
  // Editable cells follow their own entry in the tracker; the rest subscribe to nothing.
  const editable = edits !== null && Boolean(col.edit)
  const tracker = editable ? edits.tracker : null
  const subscribe = useCallback((cb: () => void) => (tracker ? tracker.subscribe(key, cb) : noopSubscribe()), [tracker, key])
  const get = useCallback(() => (tracker ? tracker.get(key) : undefined), [tracker, key])
  const status = useSyncExternalStore(subscribe, get, undefinedStatus)
  // A later batch brought the row's value to the committed one: the edit is settled, and the cell reads the store again.
  // A covered pending settles the same way, or a close after the store moved on would restore a pending nothing can clear.
  const settled = status?.kind === "pending" && Object.is(status.value, value)
  const coveredSettled = status?.kind === "editing" && status.prior?.kind === "pending" && Object.is(status.prior.value, value)
  useEffect(() => {
    if (settled) edits?.settle(rowId, col.key)
    else if (coveredSettled) edits?.settlePrior(rowId, col.key)
  }, [settled, coveredSettled, edits, rowId, col.key])
  const handle = useMemo<CellEditHandle | undefined>(
    () => (editable ? { status, commit: (next, how) => edits!.commitValue(rowId, col.key, next, how?.repeat), open: () => edits!.open(rowId, col.key) } : undefined),
    [editable, status, edits, rowId, col.key],
  )
  const numericClass = col.numeric ? (col.font === "mono" ? MONO_NUMERIC_CLASS : NUMERIC_CLASS) : ""
  const header = typeof col.header === "string" ? col.header : col.key
  const editing = status?.kind === "editing"
  const pendingText = status?.kind === "pending" && !col.cell ? status.text : null
  const content = editing
    ? null
    : pendingText !== null
      ? pendingText
      : col.cell
        ? col.cell({ row, value, rowId, edit: handle })
        : col.format
          ? col.format(value, row)
          : value === null || value === undefined
            ? NULL_TOKEN
            : String(value)
  // A matched rule names itself on the cell and says its words to a screen reader; the color is the hint.
  const rule = rules?.cell(col.key, row)
  const rejected = status?.kind === "rejected" ? status.message : null
  return (
    <div
      ref={ref}
      role="gridcell"
      aria-colindex={colIndex + 1}
      aria-description={rejected ?? rule?.["aria-description"]}
      aria-readonly={editable ? !canEditCell(col, row) : undefined}
      data-col={col.key}
      data-numeric={col.numeric ? "" : undefined}
      data-focused-col={focusedCol || undefined}
      data-rule={rule?.["data-rule"]}
      data-tone={rule?.["data-tone"]}
      data-editable={editable && canEditCell(col, row) ? "" : undefined}
      data-editing={editing || undefined}
      data-pending={status?.kind === "pending" || undefined}
      data-rejected={rejected ?? undefined}
      title={rejected ?? (typeof content === "string" ? content : undefined)}
      className={cn(
        "flex h-full min-w-0 items-center truncate",
        !editing && "px-2",
        alignClass(col),
        col.numeric && cn("justify-end", numericClass),
        col.align === "center" && "justify-center",
        flash === "ring" ? RING_CLASSES : flash === "fill" ? FILL_CLASSES : undefined,
        left !== undefined && "sticky z-10 bg-background",
        focusedCol && "bg-muted/50",
        status?.kind === "pending" && "text-muted-foreground italic",
        rejected !== null && "text-destructive",
        rule?.className || (left !== undefined ? rowRule?.className : undefined),
      )}
      style={left !== undefined ? { left } : undefined}
    >
      {editing ? (
        <CellEditor rowId={rowId} colKey={col.key} label={header} status={status} numeric={Boolean(col.numeric)} className={numericClass} edits={edits!} />
      ) : (
        // Beside a refusal the value keeps its digits and the message is what gives way.
        <span className={cn("truncate", rejected !== null && "shrink-0")}>{content}</span>
      )}
      {rejected !== null && <span data-edit-message="" className="ml-1 truncate">{rejected}</span>}
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
  entered: Map<RowId, EnterMark>
  highlightEnter: boolean
  getRowProps?: (row: T, id: RowId) => RowDecoration | undefined
  rules: AppliedRules<T> | null
  edits: EditController | null
}

function RowInner<T>(p: RowProps<T>) {
  const row = useRow(p.store, p.id)
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const mark = p.entered.get(p.id)
    if (p.highlightEnter && mark !== undefined && ref.current) {
      const now = Date.now()
      // A mark still parked by a running hold keeps waiting: its window opens at
      // the release, and the grid's release sweep plays it — overscan rows mount
      // while parked and must not burn their flash off screen.
      if (mark.until !== null && now < mark.until) return
      p.entered.delete(p.id)
      // A row that arrived off-view and scrolls in later flashes only the remainder
      // of its window — measured from the hold release when one parked it — and an
      // arrival from minutes ago is not news.
      const elapsed = now - enterStart(mark, now)
      if (elapsed < ENTER_WINDOW_MS) playFlash(ref.current, "flat", { windowMs: ENTER_WINDOW_MS, variant: "fill", elapsed })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  if (row === undefined) return null
  const extra = p.getRowProps?.(row, p.id)
  // A row rule paints under whatever your own props say: yours are read last, so they win a class.
  const rule = p.rules?.getRowProps(row)
  return (
    <div
      ref={ref}
      role="row"
      id={p.domId}
      data-row-id={p.id}
      data-state={extra?.["data-state"]}
      data-rule={extra?.["data-rule"] ?? rule?.["data-rule"]}
      data-tone={extra?.["data-tone"] ?? rule?.["data-tone"]}
      aria-description={extra?.["aria-description"] ?? rule?.["aria-description"]}
      data-focused={p.focused || undefined}
      aria-rowindex={p.index + 2}
      aria-selected={p.selected || undefined}
      className={cn(
        "absolute top-0 left-0 grid items-stretch border-b border-border/60",
        FILL_CLASSES,
        p.selected && "bg-accent",
        p.focused && "outline-1 -outline-offset-1 outline-ring",
        rule?.className,
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
          rules={p.rules}
          rowRule={rule}
          edits={p.edits}
        />
      ))}
    </div>
  )
}
const Row = memo(RowInner) as typeof RowInner

interface FooterProps<T> {
  store: RowStore<T>
  ids: readonly RowId[]
  columns: Resolved<T>[]
  template: string
  lefts: (number | undefined)[]
  width: number
  height: number
  footer: Record<string, (rows: T[]) => string>
  selectionColumn: boolean
  rowIndex: number
}

// The totals row. Its own component on the store's meta, which changes once per applied batch: the
// view's rows are read once and each column's function runs once, at the feed's pace and never per
// frame or per row. Nothing here flashes.
function FooterInner<T>(p: FooterProps<T>) {
  const meta = useStoreMeta(p.store)
  const values = useMemo(() => {
    void meta.version
    const rows: T[] = []
    for (const id of p.ids) {
      const row = p.store.getRow(id)
      if (row !== undefined) rows.push(row)
    }
    const out = new Map<string, string>()
    for (const col of p.columns) {
      const total = p.footer[col.key]
      if (total) out.set(col.key, total(rows))
    }
    return out
  }, [meta.version, p.ids, p.columns, p.footer, p.store])
  return (
    <div role="row" aria-rowindex={p.rowIndex} data-grid-footer="" className="sticky bottom-0 z-20 mt-auto grid border-t border-border bg-background font-medium" style={{ gridTemplateColumns: p.template, width: p.width, height: p.height }}>
      {p.selectionColumn && <div role="gridcell" aria-colindex={1} className="sticky left-0 z-10 bg-background" />}
      {p.columns.map((col, i) => {
        const left = p.lefts[i]
        const text = values.get(col.key)
        return (
          <div
            key={col.key}
            role="gridcell"
            aria-colindex={i + (p.selectionColumn ? 1 : 0) + 1}
            data-col={col.key}
            data-numeric={col.numeric ? "" : undefined}
            title={text}
            className={cn("flex h-full min-w-0 items-center truncate px-2", alignClass(col), col.numeric && cn("justify-end", col.font === "mono" ? MONO_NUMERIC_CLASS : NUMERIC_CLASS), col.align === "center" && "justify-center", left !== undefined && "sticky z-10 bg-background")}
            style={left !== undefined ? { left } : undefined}
          >
            <span className="truncate">{text}</span>
          </div>
        )
      })}
    </div>
  )
}
const FooterRow = memo(FooterInner) as typeof FooterInner

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
    footer,
    onEdit,
    initialRect,
    overscan = 8,
    baseState = EMPTY_COLUMN_STATE,
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
  const [columnState, setColumnState] = useControllable(props.columnState, props.onColumnStateChange, baseState)
  const [selection, setSelection] = useControllable(props.selection, props.onSelectionChange, EMPTY_SET)
  const [focusedRowId, setFocusedRowId] = useControllable<RowId | null>(props.focusedRowId, props.onFocusedRowChange, null)
  const [focusedColKey, setFocusedColKey] = useState<string | null>(null)
  const anchorRef = useRef<RowId | null>(null)

  // The view: yours, or one made from sort, filter, and the rules. A header sort comes first and the
  // rules' order breaks its ties; every filter rule has to hold, along with your own filter.
  const ruleSort = props.rules?.sort
  const ruleFilter = props.rules?.filter
  const ruleColumns = props.rules?.columns
  const comparator = useMemo(() => chainComparators(comparatorFor(columns, sort), ruleSort?.length ? compileComparator(ruleSort, columns) : undefined), [columns, sort, ruleSort])
  const ownFilter = props.filter
  const filter = useMemo(() => {
    const byRules = ruleFilter?.length ? compileFilter(ruleFilter, columns) : undefined
    if (!byRules) return ownFilter
    if (!ownFilter) return byRules
    return (row: T) => ownFilter(row) && byRules(row)
  }, [ownFilter, ruleFilter, columns])
  const rules = useMemo(() => (ruleColumns?.length ? applyRules(ruleColumns, columns) : null), [ruleColumns, columns])
  const ownOptions = useMemo(() => (props.view ? null : { comparator, filter, reorderHoldMs }), [props.view, comparator, filter, reorderHoldMs])
  const ownView = useView(store, ownOptions)
  const view = props.view ?? ownView!
  const ids = useRowIds(view)
  const indexOf = useMemo(() => new Map(ids.map((id, i) => [id, i] as const)), [ids])

  const resolved = useMemo(() => resolveColumns(columns, columnState), [columns, columnState])
  if (focusedColKey !== null && !resolved.some(column => column.key === focusedColKey)) setFocusedColKey(null)
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
  const rootRef = useRef<HTMLDivElement>(null)
  const visibleEditColumns = useRef<ReadonlySet<string>>(EMPTY_SET)
  const editorFocusChecks = useRef(new Set<{ key: string; unavailable: boolean }>())

  // Editing: one controller for the grid's life, reading the latest columns and onEdit through a ref, so the
  // memoized rows are handed one object and never re-render for it. Null without `onEdit`: nothing opens.
  const editLatest = useRef({ columns, resolved, onEdit, inView: (rowId: RowId) => indexOf.has(rowId) })
  useInsertionEffect(() => {
    editLatest.current = { columns, resolved, onEdit, inView: (rowId: RowId) => indexOf.has(rowId) }
  })
  const editable = Boolean(onEdit)
  const edits = useMemo<EditController | null>(() => {
    if (!editable) return null
    const tracker = createEditTracker()
    let activeColumn: string | null = null
    const cellsByKey = new Map<string, RowId>()
    const column = (key: string) => editLatest.current.columns.find((c) => c.key === key)
    const focusGrid = () => rootRef.current?.focus({ preventScroll: true })
    const send = (rowId: RowId, col: ColumnDef<T> & { edit: CellEdit<T> }, row: T, value: unknown) => {
      const previous = col.accessor(row)
      const k = cellKey(rowId, col.key)
      if (Object.is(value, previous)) {
        tracker.set(k, undefined)
        return
      }
      tracker.set(k, { kind: "pending", value, text: editText(col, value, row), tracked: false })
      let result: void | Promise<unknown>
      try {
        result = editLatest.current.onEdit?.({ rowId, key: col.key, value, previous, row })
      } catch (error) {
        tracker.set(k, { kind: "rejected", value: previous, message: messageOf(error) })
        return
      }
      if (result && typeof (result as Promise<unknown>).then === "function") {
        const started = tracker.get(k)
        if (started?.kind === "pending") tracker.set(k, { ...started, tracked: true })
        ;(result as Promise<unknown>).then(
          () => {
            const now = tracker.get(k)
            if (now?.kind === "pending" && Object.is(now.value, value)) tracker.set(k, undefined)
            // A reopened untouched editor covers the pending status as prior: the
            // settle rewrites it there, or the close would restore a pending with
            // no live promise behind it.
            else if (now?.kind === "editing" && now.prior?.kind === "pending" && Object.is(now.prior.value, value)) tracker.set(k, { ...now, prior: undefined })
          },
          (error: unknown) => {
            const now = tracker.get(k)
            if (now?.kind === "pending" && Object.is(now.value, value)) tracker.set(k, { kind: "rejected", value: previous, message: messageOf(error) })
            else if (now?.kind === "editing" && now.prior?.kind === "pending" && Object.is(now.prior.value, value)) tracker.set(k, { ...now, prior: { kind: "rejected", value: previous, message: messageOf(error) } })
          },
        )
      }
    }
    const moveOn = (rowId: RowId, key: string, move: 1 | -1 | undefined) => {
      if (!move) return focusGrid()
      const row = store.getRow(rowId)
      const list = editLatest.current.resolved
      let i = list.findIndex((c) => c.key === key) + move
      for (; i >= 0 && i < list.length; i += move) {
        const next = list[i]!
        if (canEditCell(next, row) && !next.edit.toggle) {
          setFocusedColKey(next.key)
          return open(rowId, next.key)
        }
      }
      focusGrid()
    }
    function open(rowId: RowId, key: string, typed?: string) {
      if (!visibleEditColumns.current.has(key)) return
      // A retained handle must not open an editor on a row the view no longer holds:
      // it would mount and take focus whenever the row next returned.
      if (!editLatest.current.inView(rowId)) return
      const col = column(key)
      const row = store.getRow(rowId)
      if (!canEditCell(col, row) || col.edit.toggle) return
      cellsByKey.set(cellKey(rowId, key), rowId)
      const k = cellKey(rowId, key)
      const before = tracker.editing()
      if (before && before !== k) {
        const covered = tracker.get(before)
        cellsByKey.delete(before)
        tracker.set(before, covered?.kind === "editing" ? covered.prior : undefined)
      }
      // A pending cell reopens on what it shows, the committed value, not on the value the store still holds.
      const now = tracker.get(k)
      // Reopening the cell already being edited is a request for focus, not a reset:
      // the draft, its problem, and what the editor covers all stay.
      if (now?.kind === "editing" && typed === undefined) {
        activeColumn = key
        tracker.set(k, { ...now, selectAll: true, focused: false })
        return
      }
      const text = now?.kind === "pending" ? now.text : editText(col, col.accessor(row!), row!)
      activeColumn = key
      // The status this editor replaced comes back if it closes untouched: reopening a
      // pending cell and leaving must not erase a promise-backed pending or a later
      // rejection. A pending with no live promise can never settle, so reopening
      // dismisses it the way v1 did — any close then clears the cell.
      const covered = now?.kind === "editing" ? now.prior : now
      const prior = covered?.kind === "pending" && !covered.tracked ? undefined : covered
      tracker.set(k, { kind: "editing", text: typed ?? text, problem: null, selectAll: typed === undefined, initial: typed === undefined ? text : null, focused: false, prior, session: ++editorOpenings })
    }
    const controller: EditController = {
      tracker,
      editorFocusFell: { current: false },
      reconcileColumns(keys) {
        const active = tracker.editing()
        if (active !== null && activeColumn !== null && !keys.has(activeColumn)) {
          const covered = tracker.get(active)
          cellsByKey.delete(active)
          tracker.set(active, covered?.kind === "editing" ? covered.prior : undefined)
        }
      },
      unmountEditor(key, input) {
        const doc = input.ownerDocument
        if (doc.activeElement !== input) return
        controller.editorFocusFell.current = true
        const check = { key, unavailable: !visibleEditColumns.current.has(key) }
        editorFocusChecks.current.add(check)
        // Remember the removal commit even if the column returns before this focus check runs.
        queueMicrotask(() => {
          editorFocusChecks.current.delete(check)
          const grid = rootRef.current
          if (input.isConnected || !check.unavailable || !grid?.isConnected || grid.ownerDocument !== doc) return
          if (doc.activeElement !== doc.body && doc.activeElement !== input) return
          focusGrid()
        })
      },
      open,
      rowOf: (k: string) => cellsByKey.get(k),
      forget: (k: string) => void cellsByKey.delete(k),
      markFocused(rowId, key) {
        const k = cellKey(rowId, key)
        const now = tracker.get(k)
        if (now?.kind === "editing" && !now.focused) tracker.set(k, { ...now, focused: true })
      },
      type(rowId, key, text) {
        const k = cellKey(rowId, key)
        const now = tracker.get(k)
        if (now?.kind === "editing") tracker.set(k, { ...now, text, problem: null })
      },
      commit(rowId, key, how, move) {
        const k = cellKey(rowId, key)
        const now = tracker.get(k)
        if (now?.kind !== "editing") return
        // Opened and left unchanged: a format that rounds must not turn looking into
        // an edit, so the untouched text sends nothing and the covered state comes
        // back — ahead of the permission check, so a revocation mid-look cannot
        // erase a pending or rejected state the way it refuses a real change.
        if (now.initial != null && now.text === now.initial) {
          cellsByKey.delete(k)
          tracker.set(k, now.prior)
          moveOn(rowId, key, move)
          return
        }
        const col = column(key)
        const row = store.getRow(rowId)
        if (!canEditCell(col, row)) {
          cellsByKey.delete(k)
          tracker.set(k, now.prior)
          return focusGrid()
        }
        const parsed = col.edit.parse(now.text, row!)
        const problem = isEditProblem(parsed) ? parsed : col.edit.validate?.(parsed, row!, how)
        if (problem) {
          tracker.set(k, { ...now, problem: problem.problem })
          return
        }
        cellsByKey.delete(k)
        send(rowId, col, row!, parsed)
        moveOn(rowId, key, move)
      },
      commitValue(rowId, key, value, repeat = false) {
        const col = column(key)
        const row = store.getRow(rowId)
        if (!canEditCell(col, row)) return
        const problem = col.edit.validate?.(value, row!, { via: "value", repeat, session: 0 })
        if (problem) {
          tracker.set(cellKey(rowId, key), { kind: "rejected", value: col.accessor(row!), message: problem.problem })
          return
        }
        send(rowId, col, row!, value)
      },
      cancel(rowId, key) {
        const k = cellKey(rowId, key)
        cellsByKey.delete(k)
        const now = tracker.get(k)
        if (now?.kind === "editing") tracker.set(k, now.prior)
        focusGrid()
      },
      step(rowId, key, dir, big) {
        const k = cellKey(rowId, key)
        const now = tracker.get(k)
        const col = column(key)
        const row = store.getRow(rowId)
        if (now?.kind !== "editing" || !canEditCell(col, row) || !col.edit.step) return
        const typed = col.edit.parse(now.text, row!)
        const from = isEditProblem(typed) ? col.accessor(row!) : typed
        const next = col.edit.step(from, dir, big, row!)
        tracker.set(k, { ...now, text: editText(col, next, row!), problem: null })
      },
      blur(rowId, key) {
        const k = cellKey(rowId, key)
        cellsByKey.delete(k)
        const now = tracker.get(k)
        if (now?.kind !== "editing") return
        if (now.initial != null && now.text === now.initial) return tracker.set(k, now.prior)
        const col = column(key)
        const row = store.getRow(rowId)
        if (!canEditCell(col, row)) return tracker.set(k, now.prior)
        const parsed = col.edit.parse(now.text, row!)
        if (isEditProblem(parsed) || col.edit.validate?.(parsed, row!, { via: "blur", repeat: false, session: now.session ?? 0 })) return tracker.set(k, now.prior)
        send(rowId, col, row!, parsed)
      },
      settle(rowId, key) {
        const k = cellKey(rowId, key)
        if (tracker.get(k)?.kind === "pending") tracker.set(k, undefined)
      },
      settlePrior(rowId, key) {
        const k = cellKey(rowId, key)
        const now = tracker.get(k)
        if (now?.kind === "editing" && now.prior?.kind === "pending") tracker.set(k, { ...now, prior: undefined })
      },
    }
    return controller
  }, [editable, store])
  // Publish committed visibility before custom cells run layout effects; notify trackers in layout.
  useInsertionEffect(() => {
    visibleEditColumns.current = edits ? new Set(resolved.filter(col => col.edit && !col.edit.toggle).map(col => col.key)) : EMPTY_SET
    for (const check of editorFocusChecks.current) {
      if (!visibleEditColumns.current.has(check.key)) check.unavailable = true
    }
  }, [edits, resolved])
  useLayoutEffect(() => {
    edits?.reconcileColumns(visibleEditColumns.current)
  }, [edits, resolved])
  // A row that a filter or removal takes out of the view takes its open editor
  // with it; the editor cannot then grab focus back when the row returns, and focus
  // its unmount dropped on body comes home to the grid — only then: a feed commit
  // that closes a never-focused editor moves nothing.
  useLayoutEffect(() => {
    if (!edits) return
    // Read-and-clear up front: the flag answers for this commit's unmount only,
    // never for a Tab chain or scroll-out from some earlier one.
    const fell = edits.editorFocusFell.current
    edits.editorFocusFell.current = false
    const k = edits.tracker.editing()
    if (k === null) return
    const rowId = edits.rowOf(k)
    if (rowId !== undefined && !indexOf.has(rowId)) {
      const covered = edits.tracker.get(k)
      edits.forget(k)
      edits.tracker.set(k, covered?.kind === "editing" ? covered.prior : undefined)
      const doc = rootRef.current?.ownerDocument
      if (fell && doc && doc.activeElement === doc.body) rootRef.current?.focus({ preventScroll: true })
    }
  }, [edits, indexOf])
  const virtualizer = useVirtualizer({
    count: ids.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan,
    getItemKey: (i) => ids[i]!,
    initialRect,
    // The sticky header sits in normal flow above the rows, so row i really starts at
    // (i+1) x rowHeight inside the scroller: scrollMargin tells the virtualizer so, and
    // the paddings keep an aligned row clear of the sticky header above and the sticky
    // footer below. Rows keep rendering at v.start - scrollMargin inside the rowgroup,
    // which itself sits after the header, so nothing moves visually.
    scrollMargin: rowHeight,
    scrollPaddingStart: rowHeight,
    scrollPaddingEnd: footer ? rowHeight : 0,
  })
  const items = virtualizer.getVirtualItems()
  const uid = useId()
  const domId = (id: RowId) => `${uid}-${id}`

  // A tape follows its tail: new rows land at the end and the viewport goes there after every commit,
  // until a key, a pointer, or a scroll away from the end stops it. Then the arrivals count up on a
  // pill, and pressing it, or scrolling back to the end, follows again. Both are state set from
  // handlers, so the effect below only reads them.
  const followTail = Boolean(rowEnter.followTail)
  const [following, setFollowing] = useState(true)
  const [anchor, setAnchor] = useState(0)
  const behind = followTail && !following ? Math.max(0, ids.length - anchor) : 0
  useLayoutEffect(() => {
    if (followTail && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [followTail])

  // Arrival marks, in the insertion phase: all insertion effects for a commit run
  // before any layout effect, so a row mounting in the commit of its arrival finds
  // its mark — a mount-only layout effect in the row checks after this has written.
  // A mark parked by a reorder hold carries that hold's deadline, captured at
  // arrival: its window starts when the hold lapses, however late the release is
  // observed, and no later hold can touch it. The grid's own touches extend the
  // deadlines of marks still parked, synchronously, where an extension cannot be
  // mistaken for a new hold; extending a supplied view directly leaves them, so
  // that extension shortens the remainder rather than restarting it.
  const entered = useRef(new Map<RowId, EnterMark>()).current
  // After a touch extends the hold, move still-parked marks to the new deadline.
  // Only unexpired marks move: one whose hold already lapsed belongs to a finished
  // hold, and the touch that follows starts a new one that must not revive it.
  const refreshParkedMarks = () => {
    const deadline = view.isHeld() ? (view.holdExpiresAt?.() ?? null) : null
    if (deadline === null) return
    const now = Date.now()
    for (const [id, mark] of entered) if (mark.until !== null && mark.until > now && mark.until < deadline) entered.set(id, { at: mark.at, until: deadline })
    scheduleReleaseSweep()
  }
  // A release that reorders nothing publishes nothing, so no commit observes it:
  // the deadline timer plays those flashes. Rendered commits sweep synchronously
  // and the timer re-arms for whatever is still parked.
  const sweepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const highlightRef = useRef(rowEnter.highlight)
  useInsertionEffect(() => { highlightRef.current = rowEnter.highlight }, [rowEnter.highlight])
  const sweepDueMarks = useCallback(() => {
    // The ref, not the closure: a timer armed before highlighting turned off must
    // not flash on a stale true while the stand-down effect is still queued.
    if (!highlightRef.current || !scrollRef.current) return
    const now = Date.now()
    let due: Map<RowId, number> | null = null
    for (const [id, mark] of entered) {
      if (mark.until !== null && now >= mark.until) {
        const elapsed = now - enterStart(mark, now)
        if (elapsed < ENTER_WINDOW_MS) (due ??= new Map()).set(id, elapsed)
        else entered.delete(id)
      }
    }
    if (due) {
      for (const el of scrollRef.current.querySelectorAll<HTMLElement>("[data-row-id]")) {
        const id = el.dataset.rowId
        const elapsed = id !== undefined ? due.get(id) : undefined
        // A nested grid's rows can share ids with this one: the DOM id says whose row this is.
        if (id !== undefined && elapsed !== undefined && el.id === `${uid}-${id}`) {
          entered.delete(id)
          playFlash(el, "flat", { windowMs: ENTER_WINDOW_MS, variant: "fill", elapsed })
        }
      }
    }
  }, [entered, uid])
  const scheduleReleaseSweep = useCallback(() => {
    if (sweepTimerRef.current !== null) clearTimeout(sweepTimerRef.current)
    sweepTimerRef.current = null
    const now = Date.now()
    let next = Infinity
    for (const [, mark] of entered) if (mark.until !== null && mark.until > now) next = Math.min(next, mark.until)
    if (next === Infinity) return
    sweepTimerRef.current = setTimeout(() => {
      sweepTimerRef.current = null
      sweepDueMarks()
      scheduleReleaseSweep()
    }, Math.min(next - now, 2 ** 31 - 1))
  }, [entered, sweepDueMarks])
  useEffect(() => () => { if (sweepTimerRef.current !== null) clearTimeout(sweepTimerRef.current) }, [])
  useEffect(() => {
    if (rowEnter.highlight) return
    // Highlighting turned off: an armed timer would fire its old closure and
    // flash anyway, and unobserved marks would linger. Stand both down.
    if (sweepTimerRef.current !== null) clearTimeout(sweepTimerRef.current)
    sweepTimerRef.current = null
    entered.clear()
  }, [rowEnter.highlight, entered])
  const prevIdsRef = useRef<readonly RowId[]>(ids)
  const markIdsRef = useRef<readonly RowId[]>(ids)
  const newSinceAnnounce = useRef(0)
  // One diff per commit: the insertion effect computes it and the layout effect
  // consumes it, so an order change builds two id sets, not four.
  const diffRef = useRef<{ prev: readonly RowId[]; arrived: RowId[]; departed: RowId[] } | null>(null)
  useInsertionEffect(() => {
    const prev = markIdsRef.current
    if (prev === ids) return
    markIdsRef.current = ids
    const prevSet = new Set(prev)
    const nowSet = new Set(ids)
    const arrived: RowId[] = []
    for (const id of ids) if (!prevSet.has(id)) arrived.push(id)
    const departed: RowId[] = []
    for (const id of prev) if (!nowSet.has(id)) departed.push(id)
    diffRef.current = { prev, arrived, departed }
    if (!rowEnter.highlight) return
    const at = Date.now()
    const until = view.isHeld() ? (view.holdExpiresAt?.() ?? null) : null
    for (const id of arrived) entered.set(id, { at, until })
    for (const [id, mark] of entered) {
      if (!nowSet.has(id)) entered.delete(id)
      else if (at - enterStart(mark, at) >= ENTER_WINDOW_MS) entered.delete(id)
    }
    if (until !== null) scheduleReleaseSweep()
  }, [ids, rowEnter.highlight, entered, view])

  // The scroll work stays in the layout phase, where refs belong to this commit:
  // pin the viewport, follow the tail, count arrivals, forget departed flashes.
  useLayoutEffect(() => {
    const prev = prevIdsRef.current
    if (prev === ids) return
    // The insertion effect stashed this commit's diff; a StrictMode replay reaches
    // the early return above, so a stale stash is never consumed twice.
    const stash = diffRef.current
    const fresh = stash !== null && stash.prev === prev
    const arrived = fresh ? stash.arrived : []
    const departed = fresh ? stash.departed : []
    if (!fresh) {
      const prevSet = new Set(prev)
      const nowSet = new Set(ids)
      for (const id of ids) if (!prevSet.has(id)) (arrived as RowId[]).push(id)
      for (const id of prev) if (!nowSet.has(id)) (departed as RowId[]).push(id)
    }
    diffRef.current = null
    for (const id of departed) memory.forget(`${id}\u0000`)
    if ((arrived.length || departed.length) && rowEnter.pinViewport && scrollRef.current) {
      const el = scrollRef.current
      const firstIndex = Math.floor(el.scrollTop / rowHeight)
      const firstId = prev[firstIndex]
      const nextIndex = firstId !== undefined ? indexOf.get(firstId) : undefined
      if (nextIndex !== undefined && nextIndex !== firstIndex) el.scrollTop += (nextIndex - firstIndex) * rowHeight
    }
    if (arrived.length && followTail && following && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    newSinceAnnounce.current += arrived.length
    prevIdsRef.current = ids
  }, [ids, indexOf, rowHeight, rowEnter.pinViewport, followTail, following, memory])

  const stopFollowing = () => {
    if (!followTail || !following) return
    setFollowing(false)
    setAnchor(ids.length)
  }
  const toTail = () => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
    setFollowing(true)
  }
  const onScroll = followTail
    ? (e: UIEvent<HTMLDivElement>) => {
        const el = e.currentTarget
        const atTail = el.scrollTop + el.clientHeight >= el.scrollHeight - 1
        if (atTail === following) return
        if (atTail) setFollowing(true)
        else stopFollowing()
      }
    : undefined

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
        // Capture and focus callbacks can publish a new order before this render commits.
        const currentIds = view.getIds()
        const a = currentIds === ids ? indexOf.get(from) ?? 0 : Math.max(0, currentIds.indexOf(from))
        const b = currentIds === ids ? indexOf.get(to) ?? -1 : currentIds.indexOf(to)
        if (b < 0) return
        for (let i = Math.min(a, b); i <= Math.max(a, b); i++) next.add(currentIds[i]!)
      }
      setSelection(next)
    },
    [ids, indexOf, selection, selectionMode, setSelection, view],
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
  const resetColumns = useCallback(() => setColumnState(baseState), [baseState, setColumnState])

  // The sticky header and footer each cover one row of the viewport.
  const visibleCount = Math.max(1, Math.floor((scrollRef.current?.clientHeight ?? initialRect?.height ?? rowHeight * 10) / rowHeight) - 1 - (footer ? 1 : 0))

  // The focused cell's column when it can be edited now, else undefined.
  const editableFocus = () => {
    if (!edits || focusedRowId === null || focusedColKey === null) return undefined
    const col = resolved.find((c) => c.key === focusedColKey)
    return canEditCell(col, store.getRow(focusedRowId)) ? col : undefined
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // Nested grids and portals own their keys, including reorder holds and following.
    const path = e.nativeEvent.composedPath()
    if (!gridTarget(e.currentTarget, e.target, path)) return
    // The editor owns its keys; what it lets through (a modifier-held arrow) is for the listeners above the grid.
    if (pathMatches(e.currentTarget, path, element => element.hasAttribute("data-cell-editor"))) return
    view.touch()
    refreshParkedMarks()
    stopFollowing()
    // Focused controls own their keys; application handlers can also claim a grid key in capture.
    if (e.defaultPrevented || e.target !== e.currentTarget) return
    const fi = focusedRowId !== null ? (indexOf.get(focusedRowId) ?? -1) : -1
    const ci = focusedColKey !== null ? resolved.findIndex((c) => c.key === focusedColKey) : -1
    const mod = e.metaKey || e.ctrlKey
    // Commands that act on the focused row require it to be in the current view, the
    // same bar aria-activedescendant holds: a row a filter or removal took out is not
    // silently activated, edited, selected, or menued.
    const focusedInView = fi >= 0
    // Typing on an editable cell opens its editor with the character typed.
    if (focusedInView && e.key.length === 1 && e.key !== " " && !mod && !e.altKey) {
      const col = editableFocus()
      if (col && !col.edit.toggle) {
        e.preventDefault()
        edits!.open(focusedRowId!, col.key, e.key)
        return
      }
    }
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
      case " ": {
        e.preventDefault()
        if (!focusedInView) return
        const col = editableFocus()
        if (col?.edit.toggle) {
          const row = store.getRow(focusedRowId!)!
          edits!.commitValue(focusedRowId!, col.key, col.edit.toggle(col.accessor(row), row), e.repeat)
          return
        }
        if (focusedRowId !== null) select([focusedRowId], selectionMode === "multi" ? "toggle" : "replace")
        return
      }
      case "Enter":
      case "F2": {
        if (!focusedInView) return
        const col = editableFocus()
        if (col) {
          e.preventDefault()
          const row = store.getRow(focusedRowId!)!
          if (col.edit.toggle) edits!.commitValue(focusedRowId!, col.key, col.edit.toggle(col.accessor(row), row), e.repeat)
          else edits!.open(focusedRowId!, col.key)
          return
        }
        if (e.key === "F2") return
        if (focusedRowId !== null) {
          const row = store.getRow(focusedRowId)
          if (row !== undefined) onRowActivate?.(row, focusedRowId)
        }
        return
      }
      case "Escape":
        if (selectionMode !== "none" && selection.size) setSelection(EMPTY_SET)
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
    const root = rootRef.current
    const id = domId(focusedRowId)
    const el = Array.from(root?.querySelectorAll<HTMLElement>('[role="row"][data-row-id]') ?? []).find(row => row.id === id)
    const ownerWindow = el?.ownerDocument.defaultView
    if (!el || !ownerWindow || !gridTarget(root, el)) return
    const r = el.getBoundingClientRect()
    el.dispatchEvent(new ownerWindow.MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: r.left + 8, clientY: r.top + r.height / 2, button: 2 }))
  }

  const rowTarget = (event: { target: EventTarget; nativeEvent: Event }, includeShadowTarget = false) => {
    const path = event.nativeEvent.composedPath()
    const root = rootRef.current
    // Menu starts can reach the primitive before a shadow portal's host-targeted pass.
    const target = includeShadowTarget && !root?.contains(event.target as Node)
      ? path.find(entry => (entry as Node).nodeType === 1 && root?.contains(entry as Node)) ?? event.target
      : event.target
    const element = gridTarget(root, target, path)
    if (!element || pathMatches(root, path, element => element.matches(ROW_CONTROLS) || CONTROL_ROLES.has(roleOf(element) ?? ""))) return undefined
    const row = element.closest<HTMLElement>('[role="row"][data-row-id]')
    const id = row?.dataset.rowId
    if (id === undefined || row?.id !== domId(id) || !indexOf.has(id) || store.getRow(id) === undefined) return undefined
    // A capture handler may change membership before React commits the new rows.
    const currentIds = view.getIds()
    if (currentIds !== ids && !currentIds.includes(id)) return undefined
    return { element, id }
  }

  // The row the menu opens on, taken from the event that opens it, since a parent that controls focus may not
  // have moved focus there yet: a pointer down starts a touch's long press, and a contextmenu event — the
  // pointer's, or the one the keyboard sends to the focused row — opens it at once.
  const [menuRow, setMenuRow] = useState<RowId | null>(null)

  // Right-click targets the row under the pointer: focus it, and make it the selection unless it is already selected.
  const onContextMenu = (e: MouseEvent<HTMLDivElement>) => {
    const target = rowTarget(e, true)
    if (e.defaultPrevented || !target) {
      rejectMenuStart(rootRef.current, e)
      return
    }
    const { id } = target
    setMenuRow(id)
    setFocusedRowId(id)
    if (!selection.has(id)) select([id], "replace")
  }

  const onPointerDownCapture = (e: PointerEvent<HTMLDivElement>) => {
    if (!gridTarget(rootRef.current, e.target, e.nativeEvent.composedPath())) return
    view.touch()
    refreshParkedMarks()
    stopFollowing()
  }

  const onRowPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const target = rowTarget(e)
    if (e.defaultPrevented || !target) {
      // Radix starts long-press menus from pointerdown; Base UI uses touchstart below.
      if (renderContextMenu && e.pointerType !== "mouse" && (e.defaultPrevented || !rowTarget(e, true))) rejectMenuStart(rootRef.current, e)
      return
    }
    const { id } = target
    setMenuRow(id)
    setFocusedRowId(id)
    if (e.button !== 0) return
    if (e.shiftKey) select([id], "range")
    else if (e.metaKey || e.ctrlKey) select([id], "toggle")
    else select([id], "replace")
  }

  // A double click on an editable cell opens it; anywhere else on the row it activates the row.
  const onRowDoubleClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.defaultPrevented) return
    const target = rowTarget(e)
    if (!target) return
    const { element, id } = target
    const row = store.getRow(id)
    if (row === undefined) return
    const key = element.closest<HTMLElement>("[data-col]")?.dataset.col
    const col = key !== undefined ? resolved.find((c) => c.key === key) : undefined
    if (edits && canEditCell(col, row) && !col.edit.toggle) {
      setFocusedRowId(id)
      setFocusedColKey(col.key)
      edits.open(id, col.key)
      return
    }
    onRowActivate?.(row, id)
  }

  const toggle = useCallback((id: RowId) => select([id], "toggle"), [select])

  // A rapid reopen must get fresh content even while the previous popup is still exiting.
  const [menuOpening, setMenuOpening] = useState(0)
  const contextRows = useMemo(() => {
    const targets = selection.size ? [...selection] : focusedRowId !== null ? [focusedRowId] : []
    return { opening: menuOpening, ids: targets, target: menuRow ?? focusedRowId, rows: targets.map((id) => store.getRow(id)).filter((r): r is T => r !== undefined) }
  }, [selection, focusedRowId, store, menuOpening, menuRow])

  const body = (
    <div
      ref={scrollRef}
      className="relative h-full min-h-0 flex-1 overflow-auto"
      onPointerDownCapture={onPointerDownCapture}
      onPointerDown={onRowPointerDown}
      onDoubleClick={onRowDoubleClick}
      onContextMenu={renderContextMenu ? onContextMenu : undefined}
      onTouchStart={renderContextMenu ? event => {
        // Multiple touches must reach the primitive so it can cancel a pending long press.
        if (event.touches.length === 1 && (event.defaultPrevented || !rowTarget(event, true))) rejectMenuStart(rootRef.current, event)
      } : undefined}
      onScroll={onScroll}
    >
      {/* At least the viewport tall, so a footer sits at the bottom edge when the rows do not reach it. */}
      <div className="flex min-h-full flex-col">
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
            gridRef={rootRef}
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
        <div role="rowgroup" className="relative shrink-0" style={{ height: virtualizer.getTotalSize(), width: totalWidth }}>
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
                start={v.start - rowHeight}
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
                rules={rules}
                edits={edits}
              />
            )
          })}
        </div>
      )}
      {footer && <FooterRow store={store} ids={ids} columns={resolved} template={template} lefts={lefts} width={totalWidth} height={rowHeight} footer={footer} selectionColumn={selectionColumn} rowIndex={ids.length + 2} />}
      </div>
    </div>
  )

  return (
    <div
      ref={rootRef}
      role="grid"
      data-slot="tradecn-data-grid"
      data-preset={props.preset ?? "blotter"}
      data-editable={edits ? "" : undefined}
      tabIndex={0}
      aria-label={label}
      aria-rowcount={ids.length + (footer ? 2 : 1)}
      aria-colcount={resolved.length + (selectionColumn ? 1 : 0)}
      aria-multiselectable={selectionMode === "multi" || undefined}
      aria-activedescendant={focusedRowId !== null && indexOf.has(focusedRowId) ? domId(focusedRowId) : undefined}
      onKeyDown={onKeyDown}
      className={cn("relative flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-border bg-background text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40 lining-nums tabular-nums", preset.fontClass, className)}
      style={{ lineHeight: `${rowHeight}px` } as CSSProperties}
    >
      {renderContextMenu ? (
        <ContextMenu onOpenChange={open => { if (open) setMenuOpening(value => value + 1) }}>
          <ContextMenuTrigger className="contents">{body}</ContextMenuTrigger>
          <ContextMenuContent><Fragment key={contextRows.opening}>{renderContextMenu(contextRows.rows, contextRows.ids, contextRows.target)}</Fragment></ContextMenuContent>
        </ContextMenu>
      ) : (
        body
      )}
      {behind > 0 && (
        <button
          type="button"
          data-grid-behind={behind}
          onClick={toTail}
          className="absolute left-1/2 z-30 -translate-x-1/2 rounded-full bg-primary px-2.5 py-0.5 text-primary-foreground shadow-sm hover:bg-primary/90"
          style={{ bottom: (footer ? rowHeight : 0) + 8 }}
        >
          {behind.toLocaleString()} new
        </button>
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
  gridRef: RefObject<HTMLDivElement | null>
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
  const { col, gridRef } = p
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const resizeRef = useRef(p.onResize)
  const resizeGesture = useRef<{ pointerId: number; owner: Window; end: () => void } | null>(null)
  useInsertionEffect(() => { resizeRef.current = p.onResize })
  useLayoutEffect(() => () => resizeGesture.current?.end(), [])
  useLayoutEffect(() => () => {
    const trigger = triggerRef.current
    const menu = menuRef.current
    const grid = gridRef.current
    const doc = trigger?.ownerDocument
    const active = doc?.activeElement
    if (!trigger || !grid || !doc || !active || (active !== trigger && !menu?.contains(active))) return
    // Wait for removal and the menu's cleanup. A surviving trigger (including effect replay) owns its focus.
    queueMicrotask(() => {
      if (trigger.isConnected || !grid.isConnected) return
      const current = doc.activeElement
      if (!current || current === doc.body || current === active || menu?.contains(current)) grid.focus({ preventScroll: true })
    })
  }, [gridRef])
  const startResize = (e: PointerEvent<HTMLDivElement>) => {
    if (e.defaultPrevented || e.button !== 0 || !e.isPrimary) return
    const handle = e.currentTarget
    const owner = handle.ownerDocument.defaultView
    if (!owner) return
    if (resizeGesture.current?.owner !== owner) resizeGesture.current?.end()
    if (resizeGesture.current && resizeGesture.current.pointerId !== e.pointerId) return
    e.preventDefault()
    e.stopPropagation()
    resizeGesture.current?.end()
    const pointerId = e.pointerId
    const startX = e.clientX
    const startW = col.width
    const move = (ev: globalThis.PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      if (!(ev.buttons & 1) || !handle.isConnected || handle.ownerDocument.defaultView !== owner) {
        end()
        return
      }
      resizeRef.current(startW + ev.clientX - startX)
    }
    const finish = (ev: globalThis.PointerEvent) => {
      if (ev.pointerId === pointerId) end()
    }
    const end = () => {
      if (resizeGesture.current?.end !== end) return
      observer.disconnect()
      owner.removeEventListener("pointermove", move, true)
      owner.removeEventListener("pointerup", finish, true)
      owner.removeEventListener("pointercancel", finish, true)
      owner.removeEventListener("lostpointercapture", finish, true)
      owner.removeEventListener("blur", end)
      handle.removeEventListener("lostpointercapture", finish)
      resizeGesture.current = null
      if (handle.hasPointerCapture?.(pointerId)) handle.releasePointerCapture(pointerId)
    }
    // Watch ancestor removal only while dragging; row updates need no subtree observation.
    const observer = new owner.MutationObserver(() => {
      if (!handle.isConnected || handle.ownerDocument.defaultView !== owner) end()
      else observeAncestors()
    })
    const observeAncestors = () => {
      observer.disconnect()
      for (let node: Node | null = handle.parentNode; node; node = node.parentNode ?? (node.nodeType === 11 ? (node as ShadowRoot).host : null)) {
        observer.observe(node, { childList: true })
      }
    }
    observeAncestors()
    resizeGesture.current = { pointerId, owner, end }
    owner.addEventListener("pointermove", move, true)
    owner.addEventListener("pointerup", finish, true)
    owner.addEventListener("pointercancel", finish, true)
    owner.addEventListener("lostpointercapture", finish, true)
    owner.addEventListener("blur", end)
    // Adoption can deliver capture loss through the handle's new document.
    handle.addEventListener("lostpointercapture", finish)
    // Synthetic events may not have an active browser pointer to capture.
    try { handle.setPointerCapture?.(pointerId) } catch { /* Window listeners still end the gesture. */ }
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
          ref={triggerRef}
          aria-label={`${title ?? col.key} column menu`}
          className="rounded px-1 text-muted-foreground opacity-0 hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 data-[popup-open]:opacity-100 data-[state=open]:opacity-100"
        >
          <svg aria-hidden width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
            <circle cx="5" cy="1.5" r="1.2" />
            <circle cx="5" cy="5" r="1.2" />
            <circle cx="5" cy="8.5" r="1.2" />
          </svg>
        </DropdownMenuTrigger>
        <DropdownMenuContent ref={menuRef} align="end">
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
        className="absolute top-0 right-0 h-full w-1.5 touch-none cursor-col-resize hover:bg-ring/40"
      />
    </div>
  )
}
