import { useLayoutEffect, useRef, useState, type FocusEvent, type ReactNode } from "react"
import { ContextMenuItem, ContextMenuSeparator } from "@/components/ui/context-menu"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import { Blotter, BlotterActionButton, BlotterActionMenuItem, BlotterActionScope, BlotterGrid, BlotterNewButton, BlotterSelection, blotterColumns, useBlotter, useBlotterActions, type BlotterRow } from "@/registry/tradecn/ui/blotter"

const unavailable = (node: HTMLElement) => !node.isConnected || node.matches(':disabled, [aria-disabled="true"], [data-disabled]')

// Recover only while an action owns focus; an ordinary blur releases that ownership.
export function useOrderActionFocus<T extends HTMLElement = HTMLDivElement>(focusFallback?: (container: T, action: HTMLElement) => void) {
  const ref = useRef<T>(null)
  const focused = useRef<HTMLElement | null>(null)
  useLayoutEffect(() => {
    const node = focused.current
    if (!node || !unavailable(node)) return
    if (document.activeElement === node || document.activeElement === document.body) {
      const target = ref.current
      if (target) {
        if (focusFallback) focusFallback(target, node)
        else target.focus()
      }
    }
    focused.current = document.activeElement === node ? node : null
  })
  return {
    ref,
    onFocusCapture(event: FocusEvent<T>) { focused.current = (event.target as HTMLElement).closest<HTMLElement>("[data-action]") },
    onBlurCapture(event: FocusEvent<T>) {
      const node = focused.current
      if (!node || !unavailable(node) || (event.relatedTarget && event.relatedTarget !== document.body)) focused.current = null
    },
  }
}

export function OrderToolbar({ newLabel = "New order" }: { newLabel?: ReactNode }) {
  return <BlotterActionScope><OrderControls newLabel={newLabel} /></BlotterActionScope>
}

function OrderControls({ newLabel }: { newLabel: ReactNode }) {
  const { canNew } = useBlotter()
  const { actions } = useBlotterActions()
  const focus = useOrderActionFocus()
  return <div {...focus} tabIndex={-1} role="toolbar" aria-label="Orders" className="flex shrink-0 flex-wrap items-center gap-1 rounded outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
    {canNew && <BlotterNewButton>{newLabel}</BlotterNewButton>}
    <BlotterSelection />
    {actions.map(action => <BlotterActionButton key={action.id} action={action.id} />)}
  </div>
}

/** Custom content precedes the permitted actions. Pass hasCustom when a renderer can return undefined. */
export function OrderMenu({ children, hasCustom = children !== undefined }: { children?: ReactNode; hasCustom?: boolean }) {
  const { ids, actions } = useBlotterActions()
  const key = JSON.stringify(ids)
  const offered = () => actions.filter(action => action.allowedIds.length > 0).map(({ id, label }) => ({ id, label }))
  const [menu, setMenu] = useState(() => ({ key, items: offered() }))
  // Keep open-menu positions stable under the pointer; live parts disable revoked commands.
  if (menu.key !== key) setMenu({ key, items: offered() })
  const focus = useOrderActionFocus((container, action) => {
    // Keep the revoked command inert under the keyboard, just as it stays under the pointer.
    if (action.isConnected) action.focus()
    else container.closest<HTMLElement>('[role="menu"]')?.focus()
  })
  return <div {...focus} role="group" aria-label="Order menu" className="outline-none">
    {children}
    {hasCustom && menu.items.length > 0 && <ContextMenuSeparator />}
    {menu.items.map(item => <BlotterActionMenuItem key={item.id} action={item.id} className="focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">{actions.some(action => action.id === item.id) ? undefined : item.label}</BlotterActionMenuItem>)}
    {!hasCustom && menu.items.length === 0 && <ContextMenuItem disabled>Nothing to do here</ContextMenuItem>}
  </div>
}

const orders: BlotterRow[] = [
  { id: "O-1", time: 1, symbol: "ES", side: "buy", quantity: 10, filled: 0, status: "Working", allowedActions: ["cancel", "amend"] },
  { id: "O-2", time: 2, symbol: "CL", side: "sell", quantity: 5, filled: 2, status: "PartiallyFilled", allowedActions: ["cancel"] },
  { id: "O-3", time: 3, symbol: "GC", side: "buy", quantity: 2, filled: 2, status: "Filled", allowedActions: [] },
]
const columns = blotterColumns().filter((column) => ["symbol", "quantity", "status"].includes(column.key)).map(column => column.key === "symbol" ? { ...column, width: 100 } : column)

export default function BlotterActionsDemo() {
  const [store] = useState(() => {
    const rows = createRowStore<BlotterRow>({ getRowId: (row) => row.id, lane: "ordered" })
    rows.applyDeltas({ upsert: orders })
    return rows
  })
  const [event, setEvent] = useState("No request yet")

  return (
    <>
      <div data-demo-controls className="flex flex-wrap gap-2 text-xs">
        <button type="button" className="rounded border border-border px-2 py-1" onClick={() => store.applyDeltas({ upsert: orders })}>Restore orders</button>
        <button type="button" className="rounded border border-border px-2 py-1" onClick={() => store.applyDeltas({ patch: [{ id: "O-1", fields: { filled: 10, status: "Filled", allowedActions: [] } }] })}>Finish first order</button>
      </div>
      <div className="w-96 max-w-full space-y-3 text-xs lining-nums tabular-nums">
        <div className="h-52 min-w-0">
          <Blotter store={store} onNew={() => setEvent("New order requested")} actions={[
            { id: "cancel", label: "Cancel", destructive: true, run: (_rows, ids) => {
              store.applyDeltas({ patch: ids.map((id) => ({ id, fields: { status: "Cancelled", allowedActions: [] } })) })
              setEvent(`Cancelled: ${ids.join(", ")}`)
            } },
            { id: "amend", label: "Amend", run: (_rows, ids) => setEvent(`Amend requested: ${ids.join(", ")}`) },
          ]}>
            <OrderToolbar />
            <BlotterGrid columns={columns} deleteAction="cancel" renderContextMenu={(_, ids) => <BlotterActionScope ids={ids}><OrderMenu /></BlotterActionScope>} />
          </Blotter>
        </div>
        <p role="status">{event}</p>
      </div>
    </>
  )
}
