import { useEffect, useMemo, useState } from "react"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import { Blotter, type BlotterAction, type BlotterRow } from "@/registry/tradecn/ui/blotter"

const SYMBOLS = ["ZN", "ZB", "ES", "NQ", "CL", "GC"]
const PX: Record<string, number> = { ZN: 110.5, ZB: 118.75, ES: 5012.25, NQ: 17650.5, CL: 78.1, GC: 2380.4 }

let next = 1

function order(): BlotterRow {
  const symbol = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]!
  return { id: `o${next++}`, time: Date.now(), symbol, side: Math.random() < 0.5 ? "buy" : "sell", quantity: (1 + Math.floor(Math.random() * 20)) * 100, filled: 0, price: PX[symbol]!, status: "Working", account: `A-${1 + Math.floor(Math.random() * 3)}`, allowedActions: ["cancel", "amend"] }
}

// Stands in for the server: it decides the status and what is still allowed. The blotter decides neither.
function serverFill(o: BlotterRow): Partial<BlotterRow> {
  const filled = Math.min(o.quantity, (o.filled ?? 0) + Math.ceil(o.quantity / 4))
  return filled >= o.quantity ? { filled, status: "Filled", allowedActions: [] } : { filled, status: "PartiallyFilled" }
}

export default function BlotterDemo() {
  const [store] = useState(() => {
    const s = createRowStore<BlotterRow>({ getRowId: (r) => r.id, lane: "ordered" })
    s.applyDeltas({ upsert: Array.from({ length: 6 }, order) })
    return s
  })
  const [log, setLog] = useState("Orders fill on their own, a quarter at a time. Select some, working and filled: the button says how many it will cancel.")
  useEffect(() => {
    const t = setInterval(() => {
      const working = store.getIds().filter((id) => store.getRow(id)?.allowedActions?.includes("cancel"))
      const id = working[Math.floor(Math.random() * working.length)]
      const row = id ? store.getRow(id) : undefined
      if (row) store.applyDeltas({ patch: [{ id: row.id, fields: serverFill(row) }] })
    }, 1500)
    return () => clearInterval(t)
  }, [store])
  // An action runs only on rows whose allowedActions lists it, checked again as the click lands.
  const actions = useMemo<BlotterAction[]>(
    () => [
      {
        id: "cancel",
        label: "Cancel",
        destructive: true,
        run: (orders, ids) => {
          store.applyDeltas({ patch: ids.map((id) => ({ id, fields: { status: "Cancelled", allowedActions: [] } })) })
          setLog(`cancelled ${orders.map((o) => `${o.symbol} ${o.quantity}`).join(", ")}`)
        },
      },
      { id: "amend", label: "Amend", run: (orders) => setLog(`amend ${orders[0]?.symbol ?? ""}: your ticket opens here`) },
    ],
    [store],
  )
  return (
    <div className="space-y-2 font-(family-name:--tradecn-font-mono) text-xs">
      <div className="h-72">
        <Blotter
          store={store}
          sort={{ key: "time", dir: "desc" }}
          actions={actions}
          deleteAction="cancel"
          onNew={() => {
            const o = order()
            store.applyDeltas({ upsert: [o] })
            setLog(`new ${o.side} ${o.quantity} ${o.symbol}`)
          }}
        />
      </div>
      <p className="text-muted-foreground">{log}</p>
    </div>
  )
}
