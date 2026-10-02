import { cn } from "cn"
import { createContext, useCallback, useContext, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ComponentProps, type DragEvent, type ReactNode, type Ref } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { NUMERIC_CLASS } from "@/registry/tradecn/lib/format"
import { RULE_TONE_CLASS, columnName, describeRule, type ColumnRule } from "@/registry/tradecn/lib/grid-rules"
import { EMPTY_COLUMN_STATE, type ColumnDef, type ColumnState } from "@/registry/tradecn/ui/data-grid"

// The root coordinates controlled grid edits, search, drag ownership and focus.
// Callers own the collection, row contents and any surrounding dialog.

export interface ColumnChooserLabels {
  title: string
  description: string
  search: string
  /** Prefix of a checkbox's name: "Show Price". */
  show: string
  frozen: string
  /** After a count: "2 hidden". */
  hidden: string
  width: string
  resetWidth: string
  moveUp: string
  moveDown: string
  resetAll: string
  empty: string
  dragHint: string
  /** Announcement templates accept {name}, and moves also accept {n} and {m}. */
  announceMove?: string
  announceReorder?: string
  announceShow?: string
  announceHide?: string
  announceResetWidth?: string
  announceReset?: string
}

export const DEFAULT_COLUMN_CHOOSER_LABELS: Required<ColumnChooserLabels> = {
  title: "Columns",
  description: "Show, hide, reorder, and size the columns of this grid.",
  search: "Find a column",
  show: "Show",
  frozen: "frozen",
  hidden: "hidden",
  width: "Width",
  resetWidth: "Reset width",
  moveUp: "Move up",
  moveDown: "Move down",
  resetAll: "Reset all",
  empty: "No column matches.",
  dragHint: "Drag a column, or hold Alt with an arrow key, to reorder; Alt+Home and Alt+End move to the edge. Space shows or hides a focused column, and Delete resets its width. Frozen columns stay first.",
  announceMove: "{name} moved to {n} of {m}.",
  announceReorder: "{name} reordered.",
  announceShow: "{name} shown.",
  announceHide: "{name} hidden.",
  announceResetWidth: "{name} width reset.",
  announceReset: "Column settings reset.",
}

export interface ColumnChooserProps<T> extends ComponentProps<"div"> {
  columns: ColumnDef<T>[]
  columnState: ColumnState
  onColumnStateChange: (state: ColumnState) => void
  /** The shared defaults restored by reset. Column state remains a complete snapshot. */
  baseState?: ColumnState
  /** Column keys in the collection's render order. Defaults to the search results. */
  presented?: readonly string[]
  /** Rules that name columns, said in words beside the columns they touch. */
  rules?: ColumnRule[]
  labels?: Partial<ColumnChooserLabels>
  children: ReactNode
}

/** One column as the chooser lists it. */
export interface ChooserRow<T> {
  column: ColumnDef<T>
  key: string
  name: string
  visible: boolean
  frozen: boolean
  /** The width in force: the state's, else the column's own. */
  width: number
  /** The state holds a width for it. */
  resized: boolean
  rules: ColumnRule[]
}

/**
 * The columns in the order the grid shows them, frozen ones first, hidden ones in their place, with
 * the width in force and the rules that name each. A column hidden in its definition is not listed:
 * that is a decision in code, not one for this surface.
 */
export function chooserRows<T>(columns: ColumnDef<T>[], state: ColumnState, rules: readonly ColumnRule[] = []): ChooserRow<T>[] {
  const rank = new Map(state.order.map((key, index) => [key, index]))
  const hidden = new Set(state.hidden)
  const ordered = columns
    .filter((column) => !column.hidden)
    .map((column, index) => ({ column, rank: rank.get(column.key) ?? 1e6 + index }))
    .sort((a, b) => a.rank - b.rank)
    .map(({ column }) => column)
  const frozen = ordered.filter((column) => column.frozen === "left")
  const rest = ordered.filter((column) => column.frozen !== "left")
  return [...frozen, ...rest].map((column) => ({
    column,
    key: column.key,
    name: columnName(column),
    visible: !hidden.has(column.key),
    frozen: column.frozen === "left",
    width: state.widths[column.key] ?? column.width,
    resized: column.key in state.widths,
    rules: rules.filter((rule) => rule.column === column.key),
  }))
}

/** True when the state changes nothing: no order, no widths, nothing hidden. */
export function isDefaultColumnState(state: ColumnState): boolean {
  return state.order.length === 0 && Object.keys(state.widths).length === 0 && state.hidden.length === 0
}

/** The state with one column shown or hidden. */
export function setColumnVisible(state: ColumnState, key: string, visible: boolean): ColumnState {
  const hidden = state.hidden.filter((k) => k !== key)
  return { ...state, hidden: visible ? hidden : [...hidden, key] }
}

/** The state with one column's width forgotten, so the column's own width is in force again. */
export function resetColumnWidth(state: ColumnState, key: string): ColumnState {
  if (!(key in state.widths)) return state
  const widths = { ...state.widths }
  delete widths[key]
  return { ...state, widths }
}

/**
 * The state with one column moved to another's place, the rest shifting to make room. A column stays
 * on its own side of the frozen line: the grid leads with frozen columns whatever the order says, so a
 * move across the line would change nothing and is refused. The full order is written, hidden columns
 * in their places, so a column shown again comes back where it was.
 */
export function moveColumnTo<T>(rows: readonly ChooserRow<T>[], state: ColumnState, key: string, targetKey: string): ColumnState {
  if (key === targetKey) return state
  const from = rows.findIndex((row) => row.key === key)
  const to = rows.findIndex((row) => row.key === targetKey)
  if (from < 0 || to < 0 || rows[from]!.frozen !== rows[to]!.frozen) return state
  const keys = rows.map((row) => row.key)
  keys.splice(from, 1)
  keys.splice(to, 0, key)
  return { ...state, order: keys }
}

/** The state with one column moved one place up (-1) or down (1), on its own side of the frozen line. */
export function moveColumnBy<T>(rows: readonly ChooserRow<T>[], state: ColumnState, key: string, delta: -1 | 1): ColumnState {
  const index = rows.findIndex((row) => row.key === key)
  const target = rows[index + delta]
  if (index < 0 || !target) return state
  return moveColumnTo(rows, state, key, target.key)
}

/** Readings for a column, without accessors tied to the grid's row type. */
export interface ColumnChooserEntry extends Omit<ChooserRow<unknown>, "column" | "rules"> {
  /** The effective width differs from the root's reset baseline. */
  resized: boolean
  rules: { rule: ColumnRule; description: string }[]
}

export interface ColumnChooserState {
  rows: readonly ColumnChooserEntry[]
  shown: readonly ColumnChooserEntry[]
  presented: readonly ColumnChooserEntry[]
  query: string
  setQuery: (query: string) => void
  labels: ColumnChooserLabels
  hiddenCount: number
  isDefault: boolean
  reset: () => void
}

interface ChooserContextValue extends ColumnChooserState {
  announcements: ReturnType<typeof createAnnouncements>
  byKey: ReadonlyMap<string, ColumnChooserItemState>
  startDrag: (key: string, event: DragEvent<HTMLDivElement>) => void
  dragOver: (key: string, event: DragEvent<HTMLDivElement>) => void
  drop: (key: string, event: DragEvent<HTMLDivElement>) => void
  endDrag: (key?: string) => void
  focusFallback: () => void
  /** The one presented item currently in the tab order. */
  activeKey: string | null
  setActive: (key: string) => void
  registerItem: (key: string, node: HTMLElement | null) => void
  focusStep: (from: string, step: -1 | 1 | "first" | "last") => void
}

const ChooserContext = createContext<ChooserContextValue | null>(null)
const ItemContext = createContext<ColumnChooserItemState | null>(null)

function useChooserContext() {
  const value = useContext(ChooserContext)
  if (!value) throw new Error("ColumnChooser parts must be inside ColumnChooser")
  return value
}

export function useColumnChooser(): ColumnChooserState {
  return useChooserContext()
}

export interface ColumnChooserItemState {
  row: ColumnChooserEntry
  canMoveUp: boolean
  canMoveDown: boolean
  dragging: boolean
  setVisible: (visible: boolean) => void
  move: (delta: -1 | 1) => void
  /** Move to the first or last presented place on the column's side of the frozen line. */
  moveToEdge: (edge: "start" | "end") => void
  resetWidth: () => void
}

export function useColumnChooserItem(): ColumnChooserItemState {
  const value = useContext(ItemContext)
  if (!value) throw new Error("Column readings and controls must be inside ColumnChooserItem")
  return value
}

function assignRef<T>(ref: Ref<T> | undefined, node: T | null) {
  if (typeof ref === "function") return ref(node)
  if (ref) ref.current = node
}

function useChooserRef<T>(localRef: { current: T | null }, forwarded: Ref<T> | undefined) {
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

function unavailable(node: HTMLElement) {
  if (!node.isConnected || node.matches(":disabled") || (node.matches("[aria-disabled=true]") && node.tabIndex < 0) || node.closest("[hidden], [aria-hidden=true], [inert]")) return true
  const view = node.ownerDocument.defaultView
  const visibility = view?.getComputedStyle(node).visibility
  if (visibility === "hidden" || visibility === "collapse") return true
  for (let ancestor: HTMLElement | null = node; ancestor; ancestor = ancestor.parentElement) {
    const style = view?.getComputedStyle(ancestor)
    if (style?.display === "none" || style?.contentVisibility === "hidden") return true
  }
  return false
}

function sameSettings<T>(left: readonly ChooserRow<T>[], right: readonly ChooserRow<T>[]) {
  return left.length === right.length && left.every((row, index) => {
    const other = right[index]!
    return row.key === other.key && row.visible === other.visible && Object.is(row.width, other.width)
  })
}

function normalizeSettings<T>(rows: readonly ChooserRow<T>[], state: ColumnState, baseRows: readonly ChooserRow<T>[], baseState: ColumnState): ColumnState {
  const keys = new Set(rows.map((row) => row.key))
  const baseByKey = new Map(baseRows.map((row) => [row.key, row]))
  const order = rows.every((row, index) => row.key === baseRows[index]?.key)
    ? [...new Set([...baseState.order].reverse())].reverse().filter((key) => keys.has(key))
    : rows.map((row) => row.key)
  const hidden = rows.every((row) => row.visible === baseByKey.get(row.key)?.visible)
    ? [...new Set(baseState.hidden)].filter((key) => keys.has(key))
    : [...new Set(state.hidden)].filter((key) => keys.has(key))
  const widths = Object.fromEntries(rows.flatMap((row) => {
    const source = Object.is(row.width, baseByKey.get(row.key)?.width) ? baseState : state
    const width = source.widths[row.key]
    return width === undefined ? [] : [[row.key, width]]
  }))
  return { order, widths, hidden }
}

type ChooserEdit = { kind: "move" | "show" | "hide" | "width"; key: string } | { kind: "reset" }

function createAnnouncements() {
  const empty = { text: "", revision: 0 }
  let snapshot = empty
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => empty,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
        if (!listeners.size) snapshot = empty
      }
    },
    publish: (text: string) => {
      if (!listeners.size) return
      snapshot = { text, revision: snapshot.revision + 1 }
      listeners.forEach((listener) => listener())
    },
  }
}

function editAnnouncement(edit: ChooserEdit, rows: readonly ColumnChooserEntry[], presented: readonly ColumnChooserEntry[], labels: ColumnChooserLabels) {
  if (edit.kind === "reset") return labels.announceReset ?? DEFAULT_COLUMN_CHOOSER_LABELS.announceReset
  const row = rows.find((row) => row.key === edit.key)
  if (!row) return ""
  const index = presented.findIndex((row) => row.key === edit.key)
  const label = edit.kind === "move" ? (index < 0 ? "announceReorder" : "announceMove") : edit.kind === "show" ? "announceShow" : edit.kind === "hide" ? "announceHide" : "announceResetWidth"
  const template = labels[label] ?? DEFAULT_COLUMN_CHOOSER_LABELS[label]
  return template.replace(/\{(name|n|m)\}/g, (_, token: string) => token === "name" ? row.name : String(token === "n" ? index + 1 : presented.length))
}

export function ColumnChooser<T>({ columns, columnState, onColumnStateChange, baseState = EMPTY_COLUMN_STATE, presented, rules, labels: labelsProp, children, className, ref, role = "group", tabIndex = -1, "aria-label": ariaLabel, onFocusCapture, onBlurCapture, ...props }: ColumnChooserProps<T>) {
  const labels = { ...DEFAULT_COLUMN_CHOOSER_LABELS, ...labelsProp }
  // Definition-hidden columns keep their settings if application policy exposes them later.
  const knownColumns = useMemo(() => columns.map((column) => column.hidden ? { ...column, hidden: false } : column), [columns])
  const stateRows = useMemo(() => chooserRows(knownColumns, columnState, rules), [knownColumns, columnState, rules])
  const baseRows = useMemo(() => chooserRows(knownColumns, baseState), [knownColumns, baseState])
  const rows = useMemo(() => {
    const editable = new Set(columns.filter((column) => !column.hidden).map((column) => column.key))
    const baseByKey = new Map(baseRows.map((row) => [row.key, row]))
    return stateRows.filter((row) => editable.has(row.key)).map(({ column, rules, ...row }) => ({ ...row, resized: !Object.is(row.width, baseByKey.get(row.key)?.width), rules: rules.map((rule) => ({ rule, description: describeRule(rule, [column]) })) }))
  }, [columns, stateRows, baseRows])
  const [query, setQuery] = useState("")
  const [dragging, setDragging] = useState<string | null>(null)
  const drag = useRef<{ key: string; frozen: boolean } | null>(null)
  const id = useId()
  const dragType = `application/x-tradecn-column-${id.replace(/[^a-z0-9]/gi, "").toLowerCase()}`
  const root = useRef<HTMLDivElement>(null)
  const rootRef = useChooserRef(root, ref)
  const focused = useRef<HTMLElement | null>(null)
  const q = query.trim().toLowerCase()
  const shown = q ? rows.filter((row) => row.name.toLowerCase().includes(q) || row.key.toLowerCase().includes(q)) : rows
  const rowByKey = new Map(rows.map((row) => [row.key, row]))
  const presentedRows = [...new Set(presented ?? shown.map((row) => row.key))].flatMap((key) => {
    const row = rowByKey.get(key)
    return row ? [row] : []
  })
  const neighbors = new Map<string, { up?: string; down?: string }>()
  for (const frozen of [true, false]) {
    const group = presentedRows.filter((row) => row.frozen === frozen)
    group.forEach((row, index) => neighbors.set(row.key, { up: group[index - 1]?.key, down: group[index + 1]?.key }))
  }
  const hiddenCount = rows.filter((row) => !row.visible).length
  const isDefault = sameSettings(stateRows, baseRows)
  // One presented item carries the tab stop; arrows move between items (roving focus).
  const [active, setActive] = useState<string | null>(null)
  const activeKey = active !== null && presentedRows.some((row) => row.key === active) ? active : presentedRows[0]?.key ?? null
  const itemNodes = useRef(new Map<string, HTMLElement>())
  const registerItem = useCallback((key: string, node: HTMLElement | null) => {
    if (node) itemNodes.current.set(key, node)
    else itemNodes.current.delete(key)
  }, [])
  const focusStep = (from: string, step: -1 | 1 | "first" | "last") => {
    const keys = presentedRows.map((row) => row.key)
    const index = keys.indexOf(from)
    const target = step === "first" ? keys[0] : step === "last" ? keys[keys.length - 1] : index < 0 ? undefined : keys[index + step]
    if (target === undefined || target === from) return
    const node = itemNodes.current.get(target)
    if (!node || unavailable(node)) return
    setActive(target)
    node.focus()
  }
  const [announcements] = useState(createAnnouncements)
  const committed = useRef({ state: columnState, rows: stateRows })
  const pending = useRef<{ state: ColumnState; before: ChooserRow<T>[]; rows: ChooserRow<T>[]; edit: ChooserEdit } | null>(null)
  useLayoutEffect(() => {
    const previous = committed.current
    committed.current = { state: columnState, rows: stateRows }
    if (sameSettings(previous.rows, stateRows)) return
    const proposed = pending.current
    // A child layout effect can submit the next edit before this root processes the current commit.
    if (proposed?.state === columnState && sameSettings(proposed.before, stateRows)) return
    pending.current = null
    if (previous.state !== columnState && proposed && sameSettings(proposed.rows, stateRows)) {
      const message = editAnnouncement(proposed.edit, rows, presentedRows, labels)
      if (message) announcements.publish(message)
    }
  })
  const focusFallback = useCallback(() => {
    const node = root.current
    if (!node?.isConnected) return
    const search = [...node.querySelectorAll<HTMLInputElement>("[data-column-search]:not(:disabled):not([hidden])")].find(input => input.closest("[data-slot=tradecn-column-chooser]") === node)
    const target = search && !unavailable(search) ? search : node
    target.focus()
  }, [])
  const endDrag = useCallback((key?: string) => {
    if (!drag.current || (key !== undefined && drag.current.key !== key)) return
    drag.current = null
    setDragging(null)
  }, [setDragging])
  useLayoutEffect(() => {
    const current = drag.current
    if (current && !rows.some((row) => row.key === current.key && row.frozen === current.frozen)) endDrag(current.key)
    const node = root.current
    const previous = focused.current
    if (node && previous && unavailable(previous) && (node.ownerDocument.activeElement === previous || node.ownerDocument.activeElement === node.ownerDocument.body)) focusFallback()
  })
  const change = (next: ColumnState, edit: ChooserEdit) => {
    if (next === columnState) return
    const nextRows = chooserRows(knownColumns, next)
    if (sameSettings(stateRows, nextRows)) return
    pending.current = { state: columnState, before: stateRows, rows: nextRows, edit }
    onColumnStateChange(normalizeSettings(nextRows, next, baseRows, baseState))
  }
  const byKey = new Map(rows.map((row): [string, ColumnChooserItemState] => [row.key, {
    row,
    canMoveUp: neighbors.get(row.key)?.up !== undefined,
    canMoveDown: neighbors.get(row.key)?.down !== undefined,
    dragging: dragging === row.key,
    setVisible: (visible) => change(setColumnVisible(columnState, row.key, visible), { kind: visible ? "show" : "hide", key: row.key }),
    move: (delta) => {
      const target = neighbors.get(row.key)?.[delta === -1 ? "up" : "down"]
      if (target !== undefined) change(moveColumnTo(stateRows, columnState, row.key, target), { kind: "move", key: row.key })
    },
    moveToEdge: (edge) => {
      if (!presentedRows.some((presentedRow) => presentedRow.key === row.key)) return
      const side = presentedRows.filter((presentedRow) => presentedRow.frozen === row.frozen)
      const target = edge === "start" ? side[0] : side[side.length - 1]
      if (target && target.key !== row.key) change(moveColumnTo(stateRows, columnState, row.key, target.key), { kind: "move", key: row.key })
    },
    resetWidth: () => {
      const width = baseState.widths[row.key]
      change(width === undefined ? resetColumnWidth(columnState, row.key) : { ...columnState, widths: { ...columnState.widths, [row.key]: width } }, { kind: "width", key: row.key })
    },
  }]))
  const accepts = (key: string, event: DragEvent<HTMLDivElement>) => {
    const current = drag.current
    const from = current && byKey.get(current.key)?.row
    const target = byKey.get(key)?.row
    return !!(current && from && target && current.key !== key && from.frozen === current.frozen && from.frozen === target.frozen && event.dataTransfer.types.includes(dragType))
  }
  return <ChooserContext value={{
    rows, shown, presented: presentedRows, query, setQuery, labels, hiddenCount, isDefault, byKey, focusFallback, endDrag, announcements,
    activeKey, setActive, registerItem, focusStep,
    reset: () => change(baseState, { kind: "reset" }),
    startDrag: (key, event) => {
      const row = byKey.get(key)?.row
      if (!row) return
      event.dataTransfer.setData(dragType, key)
      event.dataTransfer.setData("text/plain", key)
      event.dataTransfer.effectAllowed = "move"
      drag.current = { key, frozen: row.frozen }
      setDragging(key)
    },
    dragOver: (key, event) => {
      if (!accepts(key, event)) return
      event.preventDefault()
      event.dataTransfer.dropEffect = "move"
    },
    drop: (key, event) => {
      const current = drag.current
      const accepted = accepts(key, event)
      if (current) endDrag(current.key)
      if (!accepted || !current) return
      event.preventDefault()
      change(moveColumnTo(stateRows, columnState, current.key, key), { kind: "move", key: current.key })
    },
  }}>
    <div role={role} tabIndex={tabIndex} aria-label={ariaLabel ?? (props["aria-labelledby"] ? undefined : labels.title)} data-hidden={hiddenCount} className={cn("flex min-w-0 flex-col gap-2 text-xs lining-nums tabular-nums", className)} {...props} data-slot="tradecn-column-chooser" ref={rootRef} onFocusCapture={(event) => {
      onFocusCapture?.(event)
      if (event.currentTarget.contains(event.target) && event.target.closest("[data-slot=tradecn-column-chooser]") === event.currentTarget) focused.current = event.target
    }} onBlurCapture={(event) => {
      onBlurCapture?.(event)
      if (!event.currentTarget.contains(event.relatedTarget) && (event.relatedTarget || !unavailable(event.target))) focused.current = null
    }}>{children}</div>
  </ChooserContext>
}

/** Mount once per chooser. Announces committed states matching pending edits; unrelated updates stay silent. */
export function ColumnChooserAnnouncer({ className, ...props }: Omit<ComponentProps<"span">, "children">) {
  const { announcements } = useChooserContext()
  const message = useSyncExternalStore(announcements.subscribe, announcements.getSnapshot, announcements.getServerSnapshot)
  return <span role="status" aria-live="polite" aria-atomic="true" className={cn("sr-only", className)} {...props}>{message.text && <span key={message.revision}>{message.text}</span>}</span>
}

export function ColumnChooserSearch({ onChange, className, "aria-label": ariaLabel, ...props }: Omit<ComponentProps<typeof Input>, "value" | "defaultValue">) {
  const { query, setQuery, labels } = useColumnChooser()
  return <Input aria-label={ariaLabel ?? (props["aria-labelledby"] ? undefined : labels.search)} placeholder={labels.search} spellCheck={false} autoComplete="off" data-column-search="" className={cn("h-7 max-w-56 text-xs md:text-xs", className)} {...props} value={query} onChange={(event) => {
    onChange?.(event)
    if (!event.defaultPrevented) setQuery(event.target.value)
  }} />
}

export function ColumnChooserHiddenCount({ className, ...props }: Omit<ComponentProps<"span">, "children">) {
  const { hiddenCount, labels } = useColumnChooser()
  return <span data-column-hidden-count={hiddenCount} className={cn("text-muted-foreground", NUMERIC_CLASS, className)} {...props}>{hiddenCount} {labels.hidden}</span>
}

type ActionProps = Omit<ComponentProps<typeof Button>, "children"> & { children: ReactNode }

export function ColumnChooserResetAll({ type = "button", variant = "outline", size, disabled, onClick, className, ...props }: ActionProps) {
  const { isDefault, reset } = useColumnChooser()
  return <Button type={type} variant={variant} size={size === undefined ? "sm" : size} className={cn(size === undefined && "h-7 px-2 text-xs", className)} {...props} disabled={disabled || isDefault} onClick={(event) => {
    onClick?.(event)
    if (!event.defaultPrevented) reset()
  }} />
}

export interface ColumnChooserItemProps extends ComponentProps<"div"> {
  columnKey: string
  children: ReactNode
}

export function ColumnChooserItem({ columnKey, ...props }: ColumnChooserItemProps) {
  const { byKey } = useChooserContext()
  const item = byKey.get(columnKey)
  return item ? <ChooserItem key={columnKey} item={item} {...props} /> : null
}

function isElement(target: EventTarget): target is Element {
  // Popouts can contain nodes created in either window, even after adoption back to the page.
  return "nodeType" in target && target.nodeType === 1
}

function ownsItemEvent(event: { target: EventTarget; currentTarget: HTMLDivElement }) {
  return isElement(event.target) && event.currentTarget.contains(event.target) && event.target.closest("[data-slot=tradecn-column-chooser-item]") === event.currentTarget && event.target.closest("[data-slot=tradecn-column-chooser]") === event.currentTarget.closest("[data-slot=tradecn-column-chooser]")
}

// Widget roles whose keyboard model uses the arrows, per the ARIA authoring practices. A separator
// only receives keys when it is focusable, and a focusable separator is a splitter that owns them.
const ARROW_OWNING_ROLES = new Set("application columnheader combobox grid gridcell listbox menu menubar menuitem menuitemcheckbox menuitemradio option radio radiogroup row rowheader scrollbar searchbox separator slider spinbutton tab tablist textbox toolbar tree treegrid treeitem".split(" "))

// Controls whose own keys matter: carets, selects, radios, sliders, and ARIA widgets built on
// generic elements. Any recognized arrow-owning token counts, a conservative reading of fallback
// role lists. A checkbox or plain button owns no arrows. The walk stays inside the item.
function arrowOwningTarget(target: EventTarget, item: HTMLElement) {
  if (!isElement(target)) return false
  for (let node: Element | null = target; node && node !== item; node = node.parentElement) {
    if (node.matches('input:not([type="checkbox"]):not([type="button"]):not([type="submit"]):not([type="reset"]), textarea, select, [contenteditable]:not([contenteditable="false"])')) return true
    const role = node.getAttribute("role")
    if (role && role.toLowerCase().split(/[\t\n\f\r ]+/).some((token) => ARROW_OWNING_ROLES.has(token))) return true
  }
  return false
}

function ChooserItem({ item, className, ref, role = "group", tabIndex, draggable = true, "aria-label": ariaLabel, onKeyDown, onDragStart, onDragOver, onDrop, onDragEnd, onFocusCapture, onBlurCapture, ...props }: ComponentProps<"div"> & { item: ColumnChooserItemState }) {
  const { row, dragging, move, moveToEdge, setVisible, resetWidth } = item
  const { labels, focusFallback, startDrag, dragOver, drop, endDrag, activeKey, setActive, registerItem, focusStep } = useChooserContext()
  const root = useRef<HTMLDivElement>(null)
  const forwardedRef = useChooserRef(root, ref)
  const rootRef = useCallback((node: HTMLDivElement | null) => {
    registerItem(row.key, node)
    const cleanup = forwardedRef(node)
    return () => {
      registerItem(row.key, null)
      cleanup?.()
    }
  }, [row.key, registerItem, forwardedRef])
  const focused = useRef<HTMLElement | null>(null)
  useLayoutEffect(() => {
    const node = root.current
    const previous = focused.current
    if (node && previous && unavailable(previous) && (node.ownerDocument.activeElement === previous || node.ownerDocument.activeElement === node.ownerDocument.body)) node.focus()
    // Keyed DOM moves can return focus to body without removing the focused control.
    else if (node && previous && node.contains(previous) && node.ownerDocument.activeElement === node.ownerDocument.body) previous.focus()
  })
  useLayoutEffect(() => {
    const node = root.current
    return () => {
      endDrag(row.key)
      if (node?.contains(node.ownerDocument.activeElement)) {
        const ownerDocument = node.ownerDocument
        queueMicrotask(() => {
          if (!node.isConnected && ownerDocument.activeElement === ownerDocument.body) focusFallback()
        })
      }
    }
  }, [row.key, endDrag, focusFallback])
  return <ItemContext value={item}><div role={role} tabIndex={tabIndex ?? (activeKey === row.key ? 0 : -1)} draggable={draggable} aria-label={ariaLabel ?? (props["aria-labelledby"] ? undefined : row.name)} aria-description={row.visible ? undefined : labels.hidden} aria-keyshortcuts="Space Alt+ArrowUp Alt+ArrowDown Alt+Home Alt+End Delete" data-column={row.key} data-visible={row.visible ? "true" : "false"} data-frozen={row.frozen || undefined} data-dragging={dragging || undefined} className={cn("group flex min-w-0 items-center gap-2 rounded-sm border border-transparent px-1.5 py-1 outline-none focus-visible:border-ring data-[dragging]:opacity-50", !row.visible && "text-muted-foreground", className)} {...props} data-slot="tradecn-column-chooser-item" ref={rootRef} onFocusCapture={(event) => {
    onFocusCapture?.(event)
    if (ownsItemEvent(event)) {
      focused.current = event.target
      setActive(row.key)
    }
  }} onBlurCapture={(event) => {
    onBlurCapture?.(event)
    if (!event.currentTarget.contains(event.relatedTarget) && (event.relatedTarget || !unavailable(event.target))) focused.current = null
  }} onKeyDown={(event) => {
    onKeyDown?.(event)
    if (!ownsItemEvent(event) || event.defaultPrevented || event.nativeEvent.isComposing || event.ctrlKey || event.metaKey) return
    // A control that owns its arrows keeps every arrow chord: word movement, combobox opening, slider steps.
    if (arrowOwningTarget(event.target, event.currentTarget)) return
    if (event.altKey) {
      if (event.shiftKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown" && event.key !== "Home" && event.key !== "End")) return
      event.preventDefault()
      event.stopPropagation()
      if (event.key === "ArrowUp" || event.key === "ArrowDown") move(event.key === "ArrowUp" ? -1 : 1)
      else moveToEdge(event.key === "Home" ? "start" : "end")
      return
    }
    if (event.shiftKey) return
    if (event.key === "ArrowUp" || event.key === "ArrowDown" || event.key === "Home" || event.key === "End") {
      event.preventDefault()
      event.stopPropagation()
      focusStep(row.key, event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : event.key === "Home" ? "first" : "last")
      return
    }
    if (event.target !== event.currentTarget) return
    if (event.key === " ") {
      event.preventDefault()
      event.stopPropagation()
      setVisible(!row.visible)
    } else if ((event.key === "Delete" || event.key === "Backspace") && row.resized) {
      event.preventDefault()
      event.stopPropagation()
      resetWidth()
    }
  }} onDragStart={(event) => {
    onDragStart?.(event)
    if (ownsItemEvent(event) && !event.defaultPrevented) startDrag(row.key, event)
  }} onDragOver={(event) => {
    onDragOver?.(event)
    if (ownsItemEvent(event) && !event.defaultPrevented) dragOver(row.key, event)
  }} onDrop={(event) => {
    onDrop?.(event)
    if (!ownsItemEvent(event)) return
    if (!event.defaultPrevented) drop(row.key, event)
    else endDrag()
  }} onDragEnd={(event) => {
    onDragEnd?.(event)
    if (ownsItemEvent(event)) endDrag(row.key)
  }} /></ItemContext>
}

export function ColumnChooserVisibility({ onClick, onCheckedChange, tabIndex = -1, "aria-label": ariaLabel, ...props }: Omit<ComponentProps<typeof Checkbox>, "checked" | "defaultChecked" | "indeterminate">) {
  const { row, setVisible } = useColumnChooserItem()
  const { labels } = useColumnChooser()
  return <Checkbox tabIndex={tabIndex} aria-label={ariaLabel ?? (props["aria-labelledby"] ? undefined : `${labels.show} ${row.name}`)} {...props} checked={row.visible} onClick={(event) => {
    onClick?.(event)
    // Some built-ins separate browser cancellation from their own click handler.
    if (event.defaultPrevented && "preventBaseUIHandler" in event && typeof event.preventBaseUIHandler === "function") event.preventBaseUIHandler()
  }} onCheckedChange={(...args) => {
    onCheckedChange?.(...args)
    const details: unknown = args.slice(1)[0]
    if (details && typeof details === "object" && "isCanceled" in details && details.isCanceled) return
    setVisible(args[0] === true)
  }} />
}

export function ColumnChooserName({ className, ...props }: Omit<ComponentProps<"span">, "children">) {
  const { row } = useColumnChooserItem()
  return <span title={row.name} className={cn("min-w-20 flex-1 truncate font-medium", className)} {...props}>{row.name}</span>
}

export function ColumnChooserFrozen({ className, ...props }: Omit<ComponentProps<typeof Badge>, "children">) {
  const { row } = useColumnChooserItem()
  const { labels } = useColumnChooser()
  return row.frozen ? <Badge variant="outline" data-column-frozen className={cn("h-4 px-1.5 text-xs", className)} {...props}>{labels.frozen}</Badge> : null
}

export function ColumnChooserRule({ ruleIndex, className, ...props }: Omit<ComponentProps<typeof Badge>, "children"> & { ruleIndex: number }) {
  const { row } = useColumnChooserItem()
  const reading = row.rules[ruleIndex]
  if (!reading) return null
  const { rule, description } = reading
  return <Badge variant="outline" data-column-rule={rule.id} title={description} className={cn("h-4 min-w-0 shrink px-1.5 text-xs", RULE_TONE_CLASS[rule.tone], className)} {...props}><span className="min-w-0 truncate">{rule.label?.trim() || description}</span></Badge>
}

export function ColumnChooserWidth({ className, "aria-label": ariaLabel, ...props }: Omit<ComponentProps<"span">, "children">) {
  const { row } = useColumnChooserItem()
  const { labels } = useColumnChooser()
  return <span aria-label={ariaLabel ?? (props["aria-labelledby"] ? undefined : `${labels.width} ${row.width}`)} data-column-width={row.width} className={cn("w-14 shrink-0 text-right text-muted-foreground", NUMERIC_CLASS, className)} {...props}>{row.width} px</span>
}

export function ColumnChooserResetWidth({ type = "button", variant = "ghost", size, disabled, onClick, className, tabIndex = -1, "aria-label": ariaLabel, ...props }: ActionProps) {
  const { row, resetWidth } = useColumnChooserItem()
  const { labels } = useColumnChooser()
  return <Button type={type} variant={variant} size={size === undefined ? "sm" : size} aria-label={ariaLabel ?? (props["aria-labelledby"] ? undefined : `${labels.resetWidth}: ${row.name}`)} aria-hidden={!row.resized || undefined} tabIndex={tabIndex} className={cn(size === undefined && "h-6 px-1.5 text-xs", !row.resized && "invisible", className)} {...props} disabled={disabled || !row.resized} onClick={(event) => {
    onClick?.(event)
    if (!event.defaultPrevented) resetWidth()
  }} />
}

export function ColumnChooserMove({ direction, type = "button", variant = "ghost", size, disabled, onClick, className, tabIndex = -1, "aria-label": ariaLabel, ...props }: ActionProps & { direction: "up" | "down" }) {
  const { row, canMoveUp, canMoveDown, move } = useColumnChooserItem()
  const { labels } = useColumnChooser()
  return <Button type={type} variant={variant} size={size === undefined ? "sm" : size} aria-label={ariaLabel ?? (props["aria-labelledby"] ? undefined : `${direction === "up" ? labels.moveUp : labels.moveDown}: ${row.name}`)} tabIndex={tabIndex} className={cn(size === undefined && "h-6 px-1.5 text-xs", className)} {...props} disabled={disabled || !(direction === "up" ? canMoveUp : canMoveDown)} onClick={(event) => {
    onClick?.(event)
    if (!event.defaultPrevented) move(direction === "up" ? -1 : 1)
  }} />
}
