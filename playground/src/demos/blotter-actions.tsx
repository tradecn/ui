import { useState } from "react"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import { Blotter, blotterColumns, type BlotterRow } from "@/registry/tradecn/ui/blotter"

const orders: BlotterRow[] = [
  { id: "O-1", time: 1, symbol: "ES", side: "buy", quantity: 10, filled: 0, status: "Working", allowedActions: ["cancel", "amend"] },
  { id: "O-2", time: 2, symbol: "CL", side: "sell", quantity: 5, filled: 2, status: "PartiallyFilled", allowedActions: ["cancel"] },
  { id: "O-3", time: 3, symbol: "GC", side: "buy", quantity: 2, filled: 2, status: "Filled", allowedActions: [] },
]
const columns = blotterColumns().filter((column) => ["symbol", "quantity", "status"].includes(column.key))

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
        <div className="overflow-x-auto">
          <div className="h-52 w-96">
            <Blotter store={store} columns={columns} deleteAction="cancel" onNew={() => setEvent("New order requested")} actions={[
              { id: "cancel", label: "Cancel", destructive: true, run: (_rows, ids) => {
                store.applyDeltas({ patch: ids.map((id) => ({ id, fields: { status: "Cancelled", allowedActions: [] } })) })
                setEvent(`Cancelled: ${ids.join(", ")}`)
              } },
              { id: "amend", label: "Amend", run: (_rows, ids) => setEvent(`Amend requested: ${ids.join(", ")}`) },
            ]} />
          </div>
        </div>
        <p role="status">{event}</p>
      </div>
    </>
  )
}
