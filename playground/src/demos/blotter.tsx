import { useState } from "react"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import { Blotter, type BlotterRow } from "@/registry/tradecn/ui/blotter"

const TIME = Date.UTC(2026, 8, 23, 14, 30)

export default function BlotterDemo() {
  const [store] = useState(() => {
    const rows = createRowStore<BlotterRow>({ getRowId: (row) => row.id, lane: "ordered" })
    rows.applyDeltas({ upsert: [
      { id: "O-1", time: TIME, symbol: "ES", side: "buy", quantity: 10, filled: 0, price: 5012.25, status: "Working", account: "A-1" },
      { id: "O-2", time: TIME + 1000, symbol: "CL", side: "sell", quantity: 5, filled: 5, price: 78.1, status: "Filled", account: "A-2" },
    ] })
    return rows
  })

  return (
    <div className="h-40 w-fit max-w-full">
      <Blotter store={store} sort={{ key: "time", dir: "desc" }} />
    </div>
  )
}
