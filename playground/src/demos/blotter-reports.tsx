import { useState } from "react"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import { Blotter, blotterColumns, type BlotterRow } from "@/registry/tradecn/ui/blotter"

const order: BlotterRow = { id: "O-1", time: 1, symbol: "ES", side: "buy", quantity: 4, filled: 0, status: "Working" }
const reports = [
  { filled: 1, status: "PartiallyFilled" },
  { filled: 4, status: "PartiallyFilled" },
  { filled: 4, status: "Filled" },
]
const columns = blotterColumns().filter((column) => ["symbol", "quantity", "filled", "status"].includes(column.key))

export default function BlotterReportsDemo() {
  const [store] = useState(() => {
    const rows = createRowStore<BlotterRow>({ getRowId: (row) => row.id, lane: "ordered" })
    rows.applyDeltas({ upsert: [order] })
    return rows
  })
  const [step, setStep] = useState(0)

  function receive() {
    const report = reports[step]
    if (!report) return
    store.applyDeltas({ patch: [{ id: order.id, fields: report }] })
    setStep(step + 1)
  }

  return (
    <>
      <div data-demo-controls className="flex flex-wrap items-center gap-2 text-xs lining-nums tabular-nums">
        <button type="button" className="rounded border border-border px-2 py-1 disabled:opacity-50" disabled={step === reports.length} onClick={receive}>Receive report</button>
        <button type="button" className="rounded border border-border px-2 py-1" onClick={() => { store.applyDeltas({ upsert: [order] }); setStep(0) }}>Reset reports</button>
        <span role="status">Reports received: {step}</span>
      </div>
      <div className="h-40 w-fit max-w-full">
        <Blotter store={store} columns={columns} selectionColumn={false} label="Order reports" />
      </div>
    </>
  )
}
