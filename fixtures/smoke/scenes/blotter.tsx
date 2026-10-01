import { useState } from "react"
import { createPortal } from "react-dom"
import { Blotter, BlotterActionScope, BlotterGrid, blotterColumns, type BlotterRow } from "@/components/ui/blotter"
import { OrderMenu, OrderToolbar } from "./recipes/blotter-actions"
import { createRowStore } from "@/lib/row-store"

const ORDERS: BlotterRow[] = [
  { id: "o1", time: 1, symbol: "ZN", side: "buy", quantity: 5000, filled: 2000, price: 110.5, status: "PartiallyFilled", allowedActions: ["cancel", "amend"] },
  { id: "o2", time: 2, symbol: "ES", side: "sell", quantity: 10, filled: 0, price: 5012.25, status: "Working", allowedActions: ["cancel"] },
  { id: "o3", time: 3, symbol: "CL", side: "buy", quantity: 3, filled: 3, price: 78.1, status: "Filled" },
]

export function BlotterScene() {
  const [keyboard, setKeyboard] = useState(false)
  const [store] = useState(() => {
    const s = createRowStore<BlotterRow>({ getRowId: (r) => r.id })
    s.applyDeltas({ upsert: ORDERS })
    return s
  })
  const [news, setNews] = useState(0)
  const [amends, setAmends] = useState(0)
  if (keyboard) return <BlotterKeyboardScene />
  return (
    <div style={{ width: 760 }} data-blotter-new={news} data-blotter-amends={amends}>
      <button type="button" onClick={() => setKeyboard(true)}>Keyboard controls</button>
      <button type="button" onClick={() => store.applyDeltas({ patch: [{ id: "o1", fields: { status: "Filled", allowedActions: [] } }] })}>Finish first order</button>
      <button type="button" onClick={() => store.applyDeltas({ upsert: ORDERS })}>Restore orders</button>
      <Blotter
        className="h-44"
        store={store}
        onNew={() => setNews((n) => n + 1)}
        actions={[
          { id: "cancel", label: "Cancel", destructive: true, run: (_, ids) => store.applyDeltas({ patch: ids.map((id) => ({ id, fields: { status: "Cancelled", allowedActions: [] } })) }) },
          { id: "amend", label: "Amend", run: () => setAmends(n => n + 1) },
        ]}
      >
        <OrderToolbar />
        <BlotterGrid time={(ms) => `t${ms}`} deleteAction="cancel" renderContextMenu={(_, ids) => <BlotterActionScope ids={ids}><OrderMenu /></BlotterActionScope>} />
      </Blotter>
    </div>
  )
}

const editableColumns = [
  ...blotterColumns().filter(column => column.key === "symbol"),
  { key: "quantity", header: "Quantity", width: 100, accessor: (row: BlotterRow) => row.quantity, edit: { parse: (text: string) => Number(text) } },
  { key: "note", header: "Note", width: 260, accessor: () => "", cell: ({ row }: { row: BlotterRow }) => <>
    <input aria-label={`${row.symbol} note`} defaultValue="ABC" className="w-20 border" />
    <div role="grid" aria-label={`${row.symbol} nested grid`} tabIndex={0}><div role="row"><div role="gridcell">Nested</div></div></div>
    {row.id === "o1" && createPortal(<div role="grid" aria-label="Portaled orders" tabIndex={0}><div role="row"><div role="gridcell">Portaled orders</div></div></div>, document.body)}
  </> },
]

function BlotterKeyboardScene() {
  const [store] = useState(() => {
    const value = createRowStore<BlotterRow>({ getRowId: row => row.id })
    value.applyDeltas({ upsert: ORDERS })
    return value
  })
  const [requests, setRequests] = useState<string[][]>([])
  const [enabled, setEnabled] = useState(true)
  const [cancel, setCancel] = useState(false)
  const [selection, setSelection] = useState<ReadonlySet<string>>(() => new Set())
  const [focused, setFocused] = useState<string | null>(null)
  return <div className="w-full max-w-2xl">
    <label><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} />Enable deletion keys</label>
    <label><input type="checkbox" checked={cancel} onChange={event => setCancel(event.target.checked)} />Cancel deletion keys</label>
    <button onClick={() => store.applyDeltas({ patch: [{ id: "o1", fields: { allowedActions: [] } }] })}>Revoke cancellation</button>
    <button onClick={() => {
      store.clear()
      setSelection(new Set())
      setFocused(null)
    }}>Clear orders</button>
    <output aria-label="Action requests">{JSON.stringify(requests)}</output>
    <div className="h-44"><Blotter store={store} selection={selection} onSelectionChange={setSelection} focusedRowId={focused} onFocusedRowChange={setFocused} actions={[{ id: "cancel", label: "Cancel", run: (_, ids) => setRequests(previous => [...previous, ids]) }]}>
      <BlotterGrid columns={editableColumns} label="Editable blotter" deleteAction={enabled ? "cancel" : undefined} onKeyDown={event => {
        if (cancel && (event.key === "Delete" || event.key === "Backspace")) event.preventDefault()
      }} onEdit={({ rowId, value }) => store.applyDeltas({ patch: [{ id: rowId, fields: { quantity: Number(value) } }] })} />
    </Blotter></div>
  </div>
}
