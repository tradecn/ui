import { useState } from "react"
import { Blotter, type BlotterRow } from "@/components/ui/blotter"
import { createRowStore } from "@/lib/row-store"

const ORDERS: BlotterRow[] = [
  { id: "o1", time: 1, symbol: "ZN", side: "buy", quantity: 5000, filled: 2000, price: 110.5, status: "PartiallyFilled", allowedActions: ["cancel"] },
  { id: "o2", time: 2, symbol: "ES", side: "sell", quantity: 10, filled: 0, price: 5012.25, status: "Working", allowedActions: ["cancel"] },
  { id: "o3", time: 3, symbol: "CL", side: "buy", quantity: 3, filled: 3, price: 78.1, status: "Filled" },
]

export function BlotterScene() {
  const [store] = useState(() => {
    const s = createRowStore<BlotterRow>({ getRowId: (r) => r.id })
    s.applyDeltas({ upsert: ORDERS })
    return s
  })
  const [news, setNews] = useState(0)
  return (
    <div style={{ height: 180, width: 760 }} data-blotter-new={news}>
      <Blotter
        store={store}
        time={(ms) => `t${ms}`}
        onNew={() => setNews((n) => n + 1)}
        actions={[{ id: "cancel", label: "Cancel", destructive: true, run: (_, ids) => store.applyDeltas({ patch: ids.map((id) => ({ id, fields: { status: "Cancelled", allowedActions: [] } })) }) }]}
      />
    </div>
  )
}
