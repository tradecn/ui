import { cn } from "cn"
import { createContext, memo, useCallback, useContext, useInsertionEffect, useMemo, useRef, useState, useSyncExternalStore, type ComponentProps, type KeyboardEvent, type ReactNode, type Ref } from "react"
import { Button } from "@/components/ui/button"
import { ContextMenuItem } from "@/components/ui/context-menu"
import { NULL_TOKEN, formatPrice, formatQuantity } from "@/registry/tradecn/lib/format"
import type { RowId, RowStore } from "@/registry/tradecn/lib/row-store"
import { DataGrid, type ColumnDef, type DataGridProps } from "@/registry/tradecn/ui/data-grid"

// The caller owns the layout. The root coordinates selection and commands; each action scope
// listens only to its target rows. Status and permissions belong to the server, and permissions
// are checked again at invocation because an order can fill between the render and the press.

export type BlotterSide = "buy" | "sell"

export interface BlotterRow {
  id: string
  /** When, in ms since the epoch. */
  time: number
  symbol: string
  side: BlotterSide
  quantity: number
  filled?: number | null
  price?: number | null
  /** The server's word for where the order stands. Printed as is. */
  status: string
  account?: string
  /** What the server says may be done to this order now. No list means nothing may. */
  allowedActions?: readonly string[]
}

export interface BlotterAction<T extends BlotterRow = BlotterRow> {
  /** Matched against each order's `allowedActions`. */
  id: string
  /** A verb: "Cancel". The button adds how many. */
  label: string
  /** Only the orders that allow it, read from the store as the click landed. */
  run: (rows: T[], ids: RowId[]) => void
  destructive?: boolean
}

export interface BlotterColumnOptions<T extends BlotterRow> {
  /** How to print a price for this order. Two decimals by default. */
  price?: (value: number, row: T) => string
  /** How to print the time. Local HH:MM:SS by default. */
  time?: (ms: number) => string
}

const twoDecimals = (value: number) => formatPrice(value, { kind: "decimal", decimals: 2 })
let clock: Intl.DateTimeFormat | null = null
const localTime = (ms: number) => (clock ??= new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })).format(ms)

/** Time, symbol, side, quantity, filled, price, status, account. Spread them into your own list to add, drop, or reorder. */
export function blotterColumns<T extends BlotterRow>(options: BlotterColumnOptions<T> = {}): ColumnDef<T>[] {
  const price = options.price ?? twoDecimals
  const time = options.time ?? localTime
  return [
    { key: "time", header: "Time", width: 76, sortable: true, flash: false, accessor: (r) => r.time, format: (v) => time(v as number) },
    { key: "symbol", header: "Symbol", width: 76, sortable: true, accessor: (r) => r.symbol, cell: ({ row }) => <span className="font-semibold">{row.symbol}</span> },
    // The word is always there, so the color is not the only thing saying which side.
    { key: "side", header: "Side", width: 56, sortable: true, accessor: (r) => r.side, cell: ({ row }) => <span className={row.side === "buy" ? "text-up" : "text-down"}>{row.side === "buy" ? "BUY" : "SELL"}</span> },
    { key: "quantity", header: "Qty", width: 84, numeric: true, sortable: true, flash: false, accessor: (r) => r.quantity, format: (v) => formatQuantity(v as number) },
    { key: "filled", header: "Filled", width: 84, numeric: true, sortable: true, accessor: (r) => r.filled ?? null, format: (v) => formatQuantity(v as number | null) },
    { key: "price", header: "Price", width: 84, numeric: true, sortable: true, accessor: (r) => r.price ?? null, format: (v, row) => (typeof v === "number" ? price(v, row) : NULL_TOKEN) },
    // Not numeric, so a change of status flashes flat: something happened, and it has no direction.
    { key: "status", header: "Status", width: 120, sortable: true, flash: "fill", accessor: (r) => r.status },
    { key: "account", header: "Account", width: 96, sortable: true, accessor: (r) => r.account ?? null },
  ]
}

/** The orders among `ids` that allow `action`, read from the store now. */
export function allowedRows<T extends BlotterRow>(store: RowStore<T>, ids: readonly RowId[], action: string): { rows: T[]; ids: RowId[] } {
  const rows: T[] = []
  const allowed: RowId[] = []
  for (const id of ids) {
    const row = store.getRow(id)
    if (row?.allowedActions?.includes(action)) {
      rows.push(row)
      allowed.push(id)
    }
  }
  return { rows, ids: allowed }
}

export interface BlotterProps<T extends BlotterRow = BlotterRow> extends Omit<ComponentProps<"div">, "children"> {
  store: RowStore<T>
  children: ReactNode
  onNew?: () => void
  /** Available commands. Callers choose which controls and menu items to render. */
  actions?: readonly BlotterAction<T>[]
  selection?: ReadonlySet<RowId>
  onSelectionChange?: (selection: ReadonlySet<RowId>) => void
  focusedRowId?: RowId | null
  onFocusedRowChange?: (id: RowId | null) => void
}

export interface BlotterState {
  selection: ReadonlySet<RowId>
  focusedRowId: RowId | null
  /** Selection, or the focused row when nothing is selected. */
  targets: readonly RowId[]
  select: (selection: ReadonlySet<RowId>) => void
  focus: (id: RowId | null) => void
}

export interface BlotterCommands {
  canNew: boolean
  newOrder: () => void
  /** Rechecks the current definition and store permissions before calling the action. */
  run: (action: string, ids: readonly RowId[]) => void
}

export interface BlotterActionState {
  id: string
  label: string
  destructive?: boolean
  readonly allowedIds: readonly RowId[]
}

export interface BlotterActionsState {
  readonly ids: readonly RowId[]
  readonly actions: readonly BlotterActionState[]
  run: (action: string) => void
}

const NO_ACTIONS: readonly BlotterAction<never>[] = []
const StoreContext = createContext<RowStore<BlotterRow> | null>(null)
const StateContext = createContext<BlotterState | null>(null)
const CommandsContext = createContext<BlotterCommands | null>(null)
const DefinitionsContext = createContext<readonly Pick<BlotterAction, "id" | "label" | "destructive">[] | null>(null)
const ActionsContext = createContext<BlotterActionsState | null>(null)

function useSelection() {
  const state = useContext(StateContext)
  if (!state) throw new Error("Blotter parts must be inside Blotter.")
  return state
}

function useCommands() {
  const commands = useContext(CommandsContext)
  if (!commands) throw new Error("Blotter parts must be inside Blotter.")
  return commands
}

/** Selection and commands, without a store subscription. */
export function useBlotter(): BlotterState & BlotterCommands {
  const state = useSelection()
  const commands = useCommands()
  return useMemo(() => ({ ...state, ...commands }), [state, commands])
}

export function Blotter<T extends BlotterRow = BlotterRow>({ store, children, onNew, actions = NO_ACTIONS as readonly BlotterAction<T>[], selection: selectionProp, onSelectionChange, focusedRowId: focusedProp, onFocusedRowChange, className, ...props }: BlotterProps<T>) {
  const [ownSelection, setOwnSelection] = useState<ReadonlySet<RowId>>(() => new Set())
  const [ownFocused, setOwnFocused] = useState<RowId | null>(null)
  const selection = selectionProp ?? ownSelection
  const focusedRowId = focusedProp !== undefined ? focusedProp : ownFocused
  const latest = useRef({ actions, onNew, onSelectionChange, onFocusedRowChange })
  // Publish committed callbacks before descendants can invoke commands from layout effects.
  useInsertionEffect(() => { latest.current = { actions, onNew, onSelectionChange, onFocusedRowChange } })
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
  const newOrder = useCallback(() => { latest.current.onNew?.() }, [])
  const run = useCallback((actionId: string, ids: readonly RowId[]) => {
    const action = latest.current.actions.find(action => action.id === actionId)
    if (!action) return
    const allowed = allowedRows(store, ids, actionId)
    if (allowed.ids.length) action.run(allowed.rows, allowed.ids)
  }, [store])
  const canNew = Boolean(onNew)
  const commands = useMemo(() => ({ canNew, newOrder, run }), [canNew, newOrder, run])
  const state = useMemo(() => ({ selection, focusedRowId, targets: selection.size ? [...selection] : focusedRowId !== null ? [focusedRowId] : [], select, focus }), [selection, focusedRowId, select, focus])
  // The grid restores its row type at this boundary; public hooks expose no unchecked row handlers.
  return <StoreContext.Provider value={store as RowStore<BlotterRow>}><CommandsContext.Provider value={commands}><DefinitionsContext.Provider value={actions}><StateContext.Provider value={state}>
    <div {...props} data-slot="tradecn-blotter" className={cn("flex h-full min-h-0 min-w-0 flex-col gap-1 lining-nums tabular-nums", className)}>{children}</div>
  </StateContext.Provider></DefinitionsContext.Provider></CommandsContext.Provider></StoreContext.Provider>
}

export interface BlotterGridProps<T extends BlotterRow = BlotterRow> extends Omit<DataGridProps<T>, "store" | "preset" | "columns" | "label" | "selection" | "onSelectionChange" | "focusedRowId" | "onFocusedRowChange">, BlotterColumnOptions<T> {
  columns?: ColumnDef<T>[]
  label?: string
  /** Opt in to Delete and Backspace dispatching this action inside the grid. */
  deleteAction?: string
  /** Ref and key handler on the grid's sizing wrapper. */
  ref?: Ref<HTMLDivElement>
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void
}

export function BlotterGrid<T extends BlotterRow = BlotterRow>({ columns, price, time, label = "Blotter", selectionColumn = true, deleteAction, className, ref, onKeyDown, ...grid }: BlotterGridProps<T>) {
  const source = useContext(StoreContext)
  if (!source) throw new Error("BlotterGrid must be inside Blotter.")
  const store = source as RowStore<T>
  const { selection, focusedRowId, targets, select, focus } = useSelection()
  const { run } = useCommands()
  const all = useMemo(() => columns ?? blotterColumns<T>({ price, time }), [columns, price, time])
  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    onKeyDown?.(event)
    if (!deleteAction || event.defaultPrevented || (event.key !== "Delete" && event.key !== "Backspace")) return
    if (!event.currentTarget.contains(event.target as Node) || !(event.target as Element).closest?.('[role="grid"]') || !targets.length) return
    event.preventDefault()
    run(deleteAction, targets)
  }
  return <div ref={ref} onKeyDown={keyDown} data-slot="tradecn-blotter-grid" className={cn("h-full min-h-0 min-w-0 flex-1", className)}>
    <DataGrid<T> {...grid} store={store} preset="blotter" label={label} columns={all} selectionColumn={selectionColumn} selection={selection} onSelectionChange={select} focusedRowId={focusedRowId} onFocusedRowChange={focus} />
  </div>
}

export interface BlotterActionScopeProps {
  children: ReactNode
  /** Omit to use root selection/focus. Explicit ids can target a row or a context menu. */
  ids?: readonly RowId[]
}

/** Shares one row subscription set across any number of controls, without adding markup. */
export function BlotterActionScope({ ids, children }: BlotterActionScopeProps) {
  const { targets } = useSelection()
  return <ActionsForIds ids={ids ?? targets}>{children}</ActionsForIds>
}

function actionRowsSource(store: RowStore<BlotterRow>, key: string) {
  const watched: RowId[] = JSON.parse(key)
  let version = -1
  let rows: (BlotterRow | undefined)[] = []
  return {
    ids: watched,
    subscribe(cb: () => void) {
      const offs = [...new Set(watched)].map(id => store.subscribeRow(id, cb))
      return () => offs.forEach(off => off())
    },
    get() {
      // Cache scans within a batch, but keep the snapshot stable when only unrelated rows change.
      // Reading current rows also closes the gap between rendering and subscribing.
      const nextVersion = store.getMeta().version
      if (nextVersion !== version) {
        const next = watched.map(id => store.getRow(id))
        if (next.length !== rows.length || next.some((row, index) => row !== rows[index])) rows = next
        version = nextVersion
      }
      return rows
    },
  }
}

const ActionsForIds = memo(function ActionsForIds({ ids, children }: { ids: readonly RowId[]; children: ReactNode }) {
  const store = useContext(StoreContext)
  const definitions = useContext(DefinitionsContext)
  const commands = useCommands()
  if (!store || !definitions) throw new Error("BlotterActionScope must be inside Blotter.")
  // A lossless key avoids resubscribing to equal arrays, including empty and delimiter-bearing ids.
  const key = JSON.stringify(ids)
  const source = useMemo(() => actionRowsSource(store, key), [store, key])
  const rows = useSyncExternalStore(source.subscribe, source.get, source.get)
  const run = useCallback((action: string) => commands.run(action, source.ids), [commands, source])
  const actions = useMemo(() => definitions.map(({ id, label, destructive }) => ({ id, label, destructive, allowedIds: source.ids.filter((_, index) => rows[index]?.allowedActions?.includes(id)) })), [definitions, source, rows])
  const state = useMemo(() => ({ ids: source.ids, actions, run }), [source, actions, run])
  return <ActionsContext.Provider value={state}>{children}</ActionsContext.Provider>
})

/** Live permission readings and checked dispatch from the nearest action scope. */
export function useBlotterActions(): BlotterActionsState {
  const state = useContext(ActionsContext)
  if (!state) throw new Error("Blotter action controls must be inside BlotterActionScope.")
  return state
}

export function BlotterNewButton({ children = "New order", disabled, onClick, size, className, ...props }: ComponentProps<typeof Button>) {
  const { canNew, newOrder } = useCommands()
  return <Button type="button" variant="outline" size={size === undefined ? "sm" : size} {...props} className={cn(size === undefined && "h-6 px-2 text-xs", className)} disabled={disabled || !canNew} onClick={event => {
    onClick?.(event)
    if (!event.defaultPrevented && !disabled && canNew) newOrder()
  }}>{children}</Button>
}

/** The root target count, including the focused-row fallback, regardless of any enclosing scope. */
export function BlotterSelection({ children, className, ...props }: ComponentProps<"span">) {
  const { targets } = useSelection()
  return <span aria-live="polite" data-numeric="" {...props} className={cn("ml-auto text-xs text-muted-foreground lining-nums tabular-nums", className)}>{children === undefined ? (targets.length ? `${targets.length} selected` : "") : children}</span>
}

function actionLabel(action: BlotterActionState | undefined, id: string, count: number, menu = false) {
  const label = action?.label ?? id
  const allowed = action?.allowedIds.length ?? 0
  return allowed === 0 || (menu && count === 1) ? label : allowed === count ? `${label} ${allowed}` : `${label} ${allowed} of ${count}`
}

export interface BlotterActionButtonProps extends ComponentProps<typeof Button> {
  action: string
}

export function BlotterActionButton({ action: id, children, disabled, onClick, size, className, ...props }: BlotterActionButtonProps) {
  const { ids, actions, run } = useBlotterActions()
  const action = actions.find(action => action.id === id)
  const allowed = Boolean(action?.allowedIds.length)
  return <Button type="button" variant={action?.destructive ? "destructive" : "outline"} size={size === undefined ? "sm" : size} data-action={id} {...props} className={cn(size === undefined && "h-6 px-2 text-xs", className)} disabled={disabled || !allowed} onClick={event => {
    onClick?.(event)
    if (!event.defaultPrevented && !disabled && allowed) run(id)
  }}>{children === undefined ? actionLabel(action, id, ids.length) : children}</Button>
}

export interface BlotterActionMenuItemProps extends ComponentProps<typeof ContextMenuItem> {
  action: string
}

export function BlotterActionMenuItem({ action: id, children, disabled, onClick, ...props }: BlotterActionMenuItemProps) {
  const { ids, actions, run } = useBlotterActions()
  const action = actions.find(action => action.id === id)
  const allowed = Boolean(action?.allowedIds.length)
  return <ContextMenuItem data-action={id} {...props} disabled={disabled || !allowed} onClick={event => {
    onClick?.(event)
    if (!event.defaultPrevented && !disabled && allowed) run(id)
  }}>{children === undefined ? actionLabel(action, id, ids.length, true) : children}</ContextMenuItem>
}
