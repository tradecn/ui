import { cn } from "cn"
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ComponentProps, type KeyboardEvent, type ReactNode, type Ref } from "react"
import { Button } from "@/components/ui/button"
import { ContextMenuItem } from "@/components/ui/context-menu"
import { Input } from "@/components/ui/input"
import { directionClass, directionOf } from "@/registry/tradecn/hooks/use-flash"
import { NULL_TOKEN, formatNotional, formatPercent, formatPrice, formatSigned } from "@/registry/tradecn/lib/format"
import type { RowId, RowStore } from "@/registry/tradecn/lib/row-store"
import { DataGrid, type ColumnDef, type DataGridProps } from "@/registry/tradecn/ui/data-grid"

// The caller owns the layout and controls. The root coordinates selection and commands; each add
// form owns its draft, so typing does not wake grid rows. Rows still belong to the caller's store.

export interface WatchlistRow {
  /** The row's id in the store. */
  symbol: string
  name?: string
  last?: number | null
  bid?: number | null
  ask?: number | null
  /** Against the previous close, in price. */
  change?: number | null
  changePct?: number | null
  volume?: number | null
}

export interface WatchlistColumnOptions<T extends WatchlistRow> {
  /** How to print a price for this row. Instruments differ (32nds, decimals), so it gets the row. Two decimals by default. */
  price?: (value: number, row: T) => string
}

const twoDecimals = (value: number) => formatPrice(value, { kind: "decimal", decimals: 2 })

/** Symbol, last, bid, ask, change, change %, volume. Spread them into your own list to add, drop, or reorder. */
export function watchlistColumns<T extends WatchlistRow>(options: WatchlistColumnOptions<T> = {}): ColumnDef<T>[] {
  const price = options.price ?? twoDecimals
  const px = (value: unknown, row: T) => (typeof value === "number" ? price(value, row) : NULL_TOKEN)
  const signed = (value: unknown, text: string) => <span className={directionClass(typeof value === "number" ? directionOf(0, value) : "flat")}>{text}</span>
  return [
    { key: "symbol", header: "Symbol", width: 84, frozen: "left", sortable: true, accessor: (r) => r.symbol, cell: ({ row }) => <span className="font-semibold">{row.symbol}</span> },
    { key: "last", header: "Last", width: 84, numeric: true, sortable: true, accessor: (r) => r.last ?? null, format: px },
    { key: "bid", header: "Bid", width: 84, numeric: true, accessor: (r) => r.bid ?? null, format: px },
    { key: "ask", header: "Ask", width: 84, numeric: true, accessor: (r) => r.ask ?? null, format: px },
    // The sign is printed, so the color is not the only thing saying which way.
    { key: "change", header: "Chg", width: 76, numeric: true, sortable: true, flash: false, accessor: (r) => r.change ?? null, cell: ({ value }) => signed(value, formatSigned(value as number | null)) },
    { key: "changePct", header: "Chg %", width: 76, numeric: true, sortable: true, flash: false, accessor: (r) => r.changePct ?? null, cell: ({ value }) => signed(value, formatPercent(value as number | null, { signed: true })) },
    { key: "volume", header: "Volume", width: 84, numeric: true, sortable: true, flash: false, accessor: (r) => r.volume ?? null, format: (v) => formatNotional(v as number | null, { compact: true }) },
  ]
}

export interface WatchlistProps<T extends WatchlistRow = WatchlistRow> extends Omit<ComponentProps<"div">, "children"> {
  store: RowStore<T>
  children: ReactNode
  onAdd?: (symbol: string) => void
  onRemove?: (symbols: RowId[]) => void
  /** Trims and upper-cases by default. */
  normalize?: (raw: string) => string
  /** False refuses a new symbol. Existing symbols are selected before validation. */
  validate?: (symbol: string) => boolean
  selection?: ReadonlySet<RowId>
  onSelectionChange?: (selection: ReadonlySet<RowId>) => void
  focusedRowId?: RowId | null
  onFocusedRowChange?: (id: RowId | null) => void
}

export interface WatchlistState {
  selection: ReadonlySet<RowId>
  focusedRowId: RowId | null
  /** Selection, or the focused row when nothing is selected. */
  targets: readonly RowId[]
  select: (selection: ReadonlySet<RowId>) => void
  focus: (id: RowId | null) => void
}

export interface WatchlistActions {
  canAdd: boolean
  canRemove: boolean
  /** Normalize, select a duplicate, or request a new symbol. False means refused. */
  add: (raw: string) => boolean
  /** Requests removal; it never edits the store. */
  remove: (ids: readonly RowId[]) => void
}

const defaultNormalize = (raw: string) => raw.trim().toUpperCase()
const StoreContext = createContext<RowStore<WatchlistRow> | null>(null)
const StateContext = createContext<WatchlistState | null>(null)
const ActionsContext = createContext<WatchlistActions | null>(null)

function useActions() {
  const actions = useContext(ActionsContext)
  if (!actions) throw new Error("Watchlist parts must be inside Watchlist.")
  return actions
}

function useSelection() {
  const state = useContext(StateContext)
  if (!state) throw new Error("Watchlist parts must be inside Watchlist.")
  return state
}

/** Shared commands and selection, without a store subscription. */
export function useWatchlist(): WatchlistState & WatchlistActions {
  const state = useSelection()
  const actions = useActions()
  return useMemo(() => ({ ...state, ...actions }), [state, actions])
}

export function Watchlist<T extends WatchlistRow = WatchlistRow>({ store, children, onAdd, onRemove, normalize = defaultNormalize, validate, selection: selectionProp, onSelectionChange, focusedRowId: focusedProp, onFocusedRowChange, className, ...props }: WatchlistProps<T>) {
  const [ownSelection, setOwnSelection] = useState<ReadonlySet<RowId>>(() => new Set())
  const [ownFocused, setOwnFocused] = useState<RowId | null>(null)
  const selection = selectionProp ?? ownSelection
  const focusedRowId = focusedProp !== undefined ? focusedProp : ownFocused
  const latest = useRef({ onAdd, onRemove, normalize, validate, onSelectionChange, onFocusedRowChange })
  useEffect(() => {
    latest.current = { onAdd, onRemove, normalize, validate, onSelectionChange, onFocusedRowChange }
  })
  const selectionControlled = selectionProp !== undefined
  const focusControlled = focusedProp !== undefined
  const select = useCallback((next: ReadonlySet<RowId>) => {
    if (!selectionControlled) setOwnSelection(next)
    latest.current.onSelectionChange?.(next)
  }, [selectionControlled])
  const focus = useCallback((next: RowId | null) => {
    if (!focusControlled) setOwnFocused(next)
    latest.current.onFocusedRowChange?.(next)
  }, [focusControlled])
  const add = useCallback((raw: string): boolean => {
    const current = latest.current
    if (!current.onAdd || !raw.trim()) return false
    const symbol = current.normalize(raw)
    if (!symbol) return true
    if (store.getRow(symbol)) {
      focus(symbol)
      select(new Set([symbol]))
      return true
    }
    if (current.validate && !current.validate(symbol)) return false
    current.onAdd(symbol)
    return true
  }, [store, focus, select])
  const remove = useCallback((ids: readonly RowId[]) => {
    if (ids.length) latest.current.onRemove?.([...ids])
  }, [])
  const canAdd = Boolean(onAdd)
  const canRemove = Boolean(onRemove)
  const actions = useMemo(() => ({ canAdd, canRemove, add, remove }), [canAdd, canRemove, add, remove])
  const state = useMemo(() => ({ selection, focusedRowId, targets: selection.size ? [...selection] : focusedRowId !== null ? [focusedRowId] : [], select, focus }), [selection, focusedRowId, select, focus])
  // The grid restores its row type at this context boundary; the command hooks expose no row data.
  return <StoreContext.Provider value={store as RowStore<WatchlistRow>}><ActionsContext.Provider value={actions}><StateContext.Provider value={state}>
    <div {...props} data-slot="tradecn-watchlist" className={cn("flex h-full min-h-0 flex-col gap-1 lining-nums tabular-nums", className)}>{children}</div>
  </StateContext.Provider></ActionsContext.Provider></StoreContext.Provider>
}

export interface WatchlistGridProps<T extends WatchlistRow = WatchlistRow> extends Omit<DataGridProps<T>, "store" | "preset" | "columns" | "label" | "selection" | "onSelectionChange" | "focusedRowId" | "onFocusedRowChange">, WatchlistColumnOptions<T> {
  columns?: ColumnDef<T>[]
  label?: string
  /** Ref and key handler on the grid's sizing wrapper. */
  ref?: Ref<HTMLDivElement>
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void
}

export function WatchlistGrid<T extends WatchlistRow = WatchlistRow>({ columns, price, label = "Watchlist", renderContextMenu, getRowProps, className, ref, onKeyDown, ...grid }: WatchlistGridProps<T>) {
  const source = useContext(StoreContext)
  if (!source) throw new Error("WatchlistGrid must be inside Watchlist.")
  const store = source as RowStore<T>
  const { selection, focusedRowId, targets, select, focus } = useSelection()
  const { canRemove, remove } = useActions()
  const latest = useRef({ renderContextMenu, getRowProps })
  useEffect(() => { latest.current = { renderContextMenu, getRowProps } })
  const all = useMemo(() => columns ?? watchlistColumns<T>({ price }), [columns, price])
  const rowProps = useCallback((row: T, id: RowId) => {
    const own = latest.current.getRowProps?.(row, id)
    return { ...own, className: cn("group/row", own?.className) }
  }, [])
  const menu = useCallback((rows: T[], ids: RowId[]) => latest.current.renderContextMenu?.(rows, ids), [])
  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    onKeyDown?.(event)
    if (!canRemove || event.defaultPrevented || (event.key !== "Delete" && event.key !== "Backspace")) return
    if (!(event.target as Element).closest?.('[role="grid"]') || !targets.length) return
    event.preventDefault()
    remove(targets)
  }
  return <div ref={ref} onKeyDown={keyDown} data-slot="tradecn-watchlist-grid" className={cn("min-h-0 flex-1", className)}>
    <DataGrid<T> {...grid} store={store} preset="watchlist" label={label} columns={all} selection={selection} onSelectionChange={select} focusedRowId={focusedRowId} onFocusedRowChange={focus} getRowProps={rowProps} renderContextMenu={renderContextMenu ? menu : undefined} />
  </div>
}

export interface WatchlistAddState {
  draft: string
  invalid: boolean
  canAdd: boolean
  canSubmit: boolean
  setDraft: (draft: string) => void
  submit: () => void
}

const AddContext = createContext<WatchlistAddState | null>(null)

/** Form-local state for a custom input, select, or submit control. */
export function useWatchlistAdd(): WatchlistAddState {
  const state = useContext(AddContext)
  if (!state) throw new Error("Watchlist add controls must be inside WatchlistAddForm.")
  return state
}

export interface WatchlistAddFormProps extends Omit<ComponentProps<"form">, "children"> {
  children: ReactNode
}

export function WatchlistAddForm({ children, onSubmit, className, ...props }: WatchlistAddFormProps) {
  const { canAdd, add } = useActions()
  const [draft, setText] = useState("")
  const [invalid, setInvalid] = useState(false)
  const setDraft = useCallback((next: string) => { setText(next); setInvalid(false) }, [])
  const canSubmit = canAdd && Boolean(draft.trim())
  const submit = useCallback(() => {
    if (!canSubmit) return
    if (add(draft)) setText("")
    else setInvalid(true)
  }, [canSubmit, add, draft])
  const state = useMemo(() => ({ draft, invalid, canAdd, canSubmit, setDraft, submit }), [draft, invalid, canAdd, canSubmit, setDraft, submit])
  return <AddContext.Provider value={state}><form {...props} className={cn("flex shrink-0 items-center gap-1", className)} onSubmit={event => {
    onSubmit?.(event)
    if (event.defaultPrevented) return
    event.preventDefault()
    submit()
  }}>{children}</form></AddContext.Provider>
}

export type WatchlistAddInputProps = Omit<ComponentProps<typeof Input>, "value" | "defaultValue" | "aria-invalid"> & { "aria-invalid"?: never }

export function WatchlistAddInput({ onChange, placeholder = "Add symbol", disabled, className, ...props }: WatchlistAddInputProps) {
  const { draft, setDraft, invalid, canAdd } = useWatchlistAdd()
  return <Input aria-label={placeholder} placeholder={placeholder} spellCheck={false} autoComplete="off" autoCapitalize="characters" {...props} value={draft} aria-invalid={invalid || undefined} disabled={disabled || !canAdd} className={cn("h-6 flex-1 rounded-sm px-1.5 py-0 font-(family-name:--tradecn-font-mono) text-xs md:text-xs", className)} onChange={event => {
    onChange?.(event)
    if (!event.defaultPrevented) setDraft(event.target.value)
  }} />
}

export function WatchlistAddButton({ children = "Add", disabled, ...props }: ComponentProps<typeof Button>) {
  const { canSubmit } = useWatchlistAdd()
  return <Button type="submit" variant="outline" size="sm" className="h-6 px-2 text-xs" {...props} disabled={disabled || !canSubmit}>{children}</Button>
}

const removeLabel = (ids: readonly RowId[]) => ids.length > 1 ? `Remove ${ids.length}` : `Remove ${ids[0] ?? ""}`

export interface WatchlistRemoveButtonProps extends ComponentProps<"button"> {
  ids: readonly RowId[]
}

export function WatchlistRemoveButton({ ids, children, disabled, onClick, ...props }: WatchlistRemoveButtonProps) {
  const { canRemove, remove } = useActions()
  return <button type="button" {...props} disabled={disabled || !canRemove || !ids.length} onClick={event => {
    onClick?.(event)
    if (!event.defaultPrevented && !disabled && canRemove) remove(ids)
  }}>{children ?? removeLabel(ids)}</button>
}

export interface WatchlistRemoveMenuItemProps extends ComponentProps<typeof ContextMenuItem> {
  ids: readonly RowId[]
}

export function WatchlistRemoveMenuItem({ ids, children, disabled, onClick, ...props }: WatchlistRemoveMenuItemProps) {
  const { canRemove, remove } = useActions()
  return <ContextMenuItem {...props} disabled={disabled || !canRemove || !ids.length} onClick={event => {
    onClick?.(event)
    if (!event.defaultPrevented && !disabled && canRemove) remove(ids)
  }}>{children ?? removeLabel(ids)}</ContextMenuItem>
}

/** The ordinary row removal control; include or position it in your own column list. */
export function watchlistRemoveColumn<T extends WatchlistRow>(): ColumnDef<T> {
  return { key: "__remove", header: <span className="sr-only">Remove</span>, width: 28, align: "center", flash: false, accessor: () => null, cell: ({ row }) => (
    <WatchlistRemoveButton ids={[row.symbol]} tabIndex={-1} aria-label={`Remove ${row.symbol}`} className="size-4 rounded-sm leading-none text-muted-foreground opacity-0 outline-none group-hover/row:opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100">×</WatchlistRemoveButton>
  ) }
}
