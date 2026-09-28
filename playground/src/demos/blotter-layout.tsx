import { useRef, useState } from "react"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import { Blotter, BlotterActionScope, BlotterGrid, BlotterNewButton, BlotterSelection, blotterColumns, useBlotterActions, type BlotterRow } from "@/registry/tradecn/ui/blotter"
import { useOrderActionFocus } from "./blotter-actions"

const orders: BlotterRow[] = [
  { id: "O-1", time: 1, symbol: "ES", side: "buy", quantity: 10, status: "Working", allowedActions: ["cancel", "amend"] },
  { id: "O-2", time: 2, symbol: "CL", side: "sell", quantity: 5, status: "Filled", allowedActions: [] },
]
const columns = blotterColumns().filter(column => ["symbol", "status"].includes(column.key)).map(column => column.key === "symbol" ? { ...column, width: 100 } : column)

export function OrderActionPicker() {
  const select = useRef<HTMLSelectElement>(null)
  const focus = useOrderActionFocus<HTMLFormElement>(() => select.current?.focus())
  const { ids, actions, run } = useBlotterActions()
  const [actionId, setActionId] = useState("cancel")
  const action = actions.find(action => action.id === actionId)
  // A disappearing choice must not silently select or later restore another command.
  if (actionId && !action) setActionId("")
  return <form {...focus} className="grid content-start gap-2 text-xs lining-nums tabular-nums" onSubmit={event => {
    event.preventDefault()
    select.current?.focus()
    if (action) run(action.id)
  }}>
    <label className="grid gap-1">Order action
      <select ref={select} value={action?.id ?? ""} onChange={event => setActionId(event.target.value)} className="min-w-0 rounded border border-border bg-background px-2 py-1">
        <option value="">{actions.length ? "Choose an action" : "No actions available"}</option>
        {actions.map(action => <option key={action.id} value={action.id}>{action.label}</option>)}
      </select>
    </label>
    <p aria-live="polite" aria-atomic="true">{action ? `${action.allowedIds.length} of ${ids.length} orders permit ${action.label}.` : actions.length ? "Choose an action." : "No actions available."}</p>
    <button type="submit" data-action={action?.id ?? ""} disabled={!action?.allowedIds.length} className="rounded border border-border px-2 py-1 disabled:opacity-50">{action ? `Apply ${action.label}` : "Apply action"}</button>
  </form>
}

export default function BlotterLayoutDemo() {
  const [store] = useState(() => {
    const rows = createRowStore<BlotterRow>({ getRowId: row => row.id, lane: "ordered" })
    rows.applyDeltas({ upsert: orders })
    return rows
  })
  const [event, setEvent] = useState("Select an order")
  const [amend, setAmend] = useState(true)
  const [selection, setSelection] = useState<ReadonlySet<string>>(() => new Set())
  const [focusedRowId, setFocusedRowId] = useState<string | null>(null)
  return <>
    <div data-demo-controls className="flex flex-wrap gap-2 text-xs">
      <button type="button" className="rounded border border-border px-2 py-1" onClick={() => store.applyDeltas({ upsert: orders })}>Restore orders</button>
      <button type="button" className="rounded border border-border px-2 py-1" onClick={() => { store.clear(); setSelection(new Set()); setFocusedRowId(null) }}>Clear orders</button>
      <button type="button" className="rounded border border-border px-2 py-1" onClick={() => setAmend(value => !value)}>{amend ? "Remove" : "Restore"} Amend</button>
    </div>
    <Blotter store={store} selection={selection} onSelectionChange={setSelection} focusedRowId={focusedRowId} onFocusedRowChange={setFocusedRowId} onNew={() => setEvent("Ticket requested")} className="w-[36rem] max-w-full gap-3" actions={[
      { id: "cancel", label: "Cancel", run: (_, ids) => {
        store.applyDeltas({ patch: ids.map(id => ({ id, fields: { status: "Cancelled", allowedActions: [] } })) })
        setEvent(`Cancelled: ${ids.join(", ")}`)
      } },
      ...(amend ? [{ id: "amend", label: "Amend", run: () => setEvent("Amend requested") }] : []),
    ]}>
      <div className="flex items-center justify-between gap-2"><h2 className="text-sm font-medium">Order review</h2><BlotterNewButton>Open ticket</BlotterNewButton></div>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
        <div className="h-40 min-w-0"><BlotterGrid columns={columns} selectionColumn={false} /></div>
        <BlotterActionScope><OrderActionPicker /></BlotterActionScope>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs"><BlotterSelection className="ml-0" /><p role="status">{event}</p></div>
    </Blotter>
  </>
}
