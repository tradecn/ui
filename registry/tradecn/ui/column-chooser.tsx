import { cn } from "cn"
import { createContext, useCallback, useContext, useId, useLayoutEffect, useMemo, useRef, useState, type ComponentProps, type DragEvent, type ReactNode, type Ref } from "react"
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
}

export const DEFAULT_COLUMN_CHOOSER_LABELS: ColumnChooserLabels = {
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
  dragHint: "Drag a column, or hold Alt with an arrow key, to reorder. Frozen columns stay first.",
}

export interface ColumnChooserProps<T> extends ComponentProps<"div"> {
  columns: ColumnDef<T>[]
  columnState: ColumnState
  onColumnStateChange: (state: ColumnState) => void
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
  rules: { rule: ColumnRule; description: string }[]
}

export interface ColumnChooserState {
  rows: readonly ColumnChooserEntry[]
  shown: readonly ColumnChooserEntry[]
  query: string
  setQuery: (query: string) => void
  labels: ColumnChooserLabels
  hiddenCount: number
  isDefault: boolean
  reset: () => void
}

interface ChooserContextValue extends ColumnChooserState {
  byKey: ReadonlyMap<string, ColumnChooserItemState>
  startDrag: (key: string, event: DragEvent<HTMLDivElement>) => void
  dragOver: (key: string, event: DragEvent<HTMLDivElement>) => void
  drop: (key: string, event: DragEvent<HTMLDivElement>) => void
  endDrag: (key?: string) => void
  focusFallback: () => void
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

export function ColumnChooser<T>({ columns, columnState, onColumnStateChange, rules, labels: labelsProp, children, className, ref, role = "group", tabIndex = -1, "aria-label": ariaLabel, onFocusCapture, onBlurCapture, ...props }: ColumnChooserProps<T>) {
  const labels = { ...DEFAULT_COLUMN_CHOOSER_LABELS, ...labelsProp }
  const sourceRows = useMemo(() => chooserRows(columns, columnState, rules), [columns, columnState, rules])
  const rows = useMemo(() => sourceRows.map(({ column, rules, ...row }) => ({ ...row, rules: rules.map((rule) => ({ rule, description: describeRule(rule, [column]) })) })), [sourceRows])
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
  const hiddenCount = rows.filter((row) => !row.visible).length
  const isDefault = isDefaultColumnState(columnState)
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
  }, [])
  useLayoutEffect(() => {
    const current = drag.current
    if (current && !rows.some((row) => row.key === current.key && row.frozen === current.frozen)) endDrag(current.key)
    const node = root.current
    const previous = focused.current
    if (node && previous && unavailable(previous) && (node.ownerDocument.activeElement === previous || node.ownerDocument.activeElement === node.ownerDocument.body)) focusFallback()
  })
  const change = (next: ColumnState) => {
    if (next !== columnState) onColumnStateChange(next)
  }
  const byKey = new Map(rows.map((row, index): [string, ColumnChooserItemState] => [row.key, {
    row,
    canMoveUp: index > 0 && rows[index - 1]!.frozen === row.frozen,
    canMoveDown: index < rows.length - 1 && rows[index + 1]!.frozen === row.frozen,
    dragging: dragging === row.key,
    setVisible: (visible) => change(setColumnVisible(columnState, row.key, visible)),
    move: (delta) => change(moveColumnBy(sourceRows, columnState, row.key, delta)),
    resetWidth: () => change(resetColumnWidth(columnState, row.key)),
  }]))
  const accepts = (key: string, event: DragEvent<HTMLDivElement>) => {
    const current = drag.current
    const from = current && byKey.get(current.key)?.row
    const target = byKey.get(key)?.row
    return !!(current && from && target && current.key !== key && from.frozen === current.frozen && from.frozen === target.frozen && event.dataTransfer.types.includes(dragType))
  }
  return <ChooserContext value={{
    rows, shown, query, setQuery, labels, hiddenCount, isDefault, byKey, focusFallback, endDrag,
    reset: () => change(EMPTY_COLUMN_STATE),
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
      change(moveColumnTo(sourceRows, columnState, current.key, key))
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

function ChooserItem({ item, className, ref, role = "group", tabIndex = 0, "aria-label": ariaLabel, onKeyDown, onDragStart, onDragOver, onDrop, onDragEnd, onFocusCapture, onBlurCapture, ...props }: ComponentProps<"div"> & { item: ColumnChooserItemState }) {
  const { row, dragging, move } = item
  const { focusFallback, startDrag, dragOver, drop, endDrag } = useChooserContext()
  const root = useRef<HTMLDivElement>(null)
  const rootRef = useChooserRef(root, ref)
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
      if (node?.contains(node.ownerDocument.activeElement)) focusFallback()
    }
  }, [row.key, endDrag, focusFallback])
  return <ItemContext value={item}><div role={role} tabIndex={tabIndex} draggable aria-label={ariaLabel ?? (props["aria-labelledby"] ? undefined : row.name)} aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown" data-column={row.key} data-visible={row.visible ? "true" : "false"} data-frozen={row.frozen || undefined} data-dragging={dragging || undefined} className={cn("group flex min-w-0 items-center gap-2 rounded-sm border border-transparent px-1.5 py-1 outline-none focus-visible:border-ring data-[dragging]:opacity-50", !row.visible && "text-muted-foreground", className)} {...props} data-slot="tradecn-column-chooser-item" ref={rootRef} onFocusCapture={(event) => {
    onFocusCapture?.(event)
    if (ownsItemEvent(event)) focused.current = event.target
  }} onBlurCapture={(event) => {
    onBlurCapture?.(event)
    if (!event.currentTarget.contains(event.relatedTarget) && (event.relatedTarget || !unavailable(event.target))) focused.current = null
  }} onKeyDown={(event) => {
    onKeyDown?.(event)
    if (!ownsItemEvent(event) || event.defaultPrevented || event.nativeEvent.isComposing || !event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return
    event.preventDefault()
    event.stopPropagation()
    move(event.key === "ArrowUp" ? -1 : 1)
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

export function ColumnChooserVisibility({ onClick, onCheckedChange, "aria-label": ariaLabel, ...props }: Omit<ComponentProps<typeof Checkbox>, "checked" | "defaultChecked" | "indeterminate">) {
  const { row, setVisible } = useColumnChooserItem()
  const { labels } = useColumnChooser()
  return <Checkbox aria-label={ariaLabel ?? (props["aria-labelledby"] ? undefined : `${labels.show} ${row.name}`)} {...props} checked={row.visible} onClick={(event) => {
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

export function ColumnChooserResetWidth({ type = "button", variant = "ghost", size, disabled, onClick, className, "aria-label": ariaLabel, ...props }: ActionProps) {
  const { row, resetWidth } = useColumnChooserItem()
  const { labels } = useColumnChooser()
  return <Button type={type} variant={variant} size={size === undefined ? "sm" : size} aria-label={ariaLabel ?? (props["aria-labelledby"] ? undefined : `${labels.resetWidth}: ${row.name}`)} aria-hidden={!row.resized || undefined} tabIndex={row.resized ? undefined : -1} className={cn(size === undefined && "h-6 px-1.5 text-xs", !row.resized && "invisible", className)} {...props} disabled={disabled || !row.resized} onClick={(event) => {
    onClick?.(event)
    if (!event.defaultPrevented) resetWidth()
  }} />
}

export function ColumnChooserMove({ direction, type = "button", variant = "ghost", size, disabled, onClick, className, "aria-label": ariaLabel, ...props }: ActionProps & { direction: "up" | "down" }) {
  const { row, canMoveUp, canMoveDown, move } = useColumnChooserItem()
  const { labels } = useColumnChooser()
  return <Button type={type} variant={variant} size={size === undefined ? "sm" : size} aria-label={ariaLabel ?? (props["aria-labelledby"] ? undefined : `${direction === "up" ? labels.moveUp : labels.moveDown}: ${row.name}`)} className={cn(size === undefined && "h-6 px-1.5 text-xs", className)} {...props} disabled={disabled || !(direction === "up" ? canMoveUp : canMoveDown)} onClick={(event) => {
    onClick?.(event)
    if (!event.defaultPrevented) move(direction === "up" ? -1 : 1)
  }} />
}
