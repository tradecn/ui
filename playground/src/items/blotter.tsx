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

export function BlotterScene() {
  const [store] = useState(() => {
    const s = createRowStore<BlotterRow>({ getRowId: (r) => r.id, lane: "ordered" })
    s.applyDeltas({ upsert: Array.from({ length: 6 }, order) })
    return s
  })
  const [log, setLog] = useState<string[]>([])
  const say = (line: string) => setLog((l) => [line, ...l].slice(0, 5))
  useEffect(() => {
    const t = setInterval(() => {
      const working = store.getIds().filter((id) => store.getRow(id)?.allowedActions?.includes("cancel"))
      const id = working[Math.floor(Math.random() * working.length)]
      const row = id ? store.getRow(id) : undefined
      if (row) store.applyDeltas({ patch: [{ id: row.id, fields: serverFill(row) }] })
    }, 1500)
    return () => clearInterval(t)
  }, [store])
  const actions = useMemo<BlotterAction[]>(
    () => [
      {
        id: "cancel",
        label: "Cancel",
        destructive: true,
        run: (orders, ids) => {
          store.applyDeltas({ patch: ids.map((id) => ({ id, fields: { status: "Cancelled", allowedActions: [] } })) })
          setLog((l) => [`cancelled ${orders.map((o) => `${o.symbol} ${o.quantity}`).join(", ")}`, ...l].slice(0, 5))
        },
      },
      { id: "amend", label: "Amend", run: (orders) => setLog((l) => [`amend ${orders[0]?.symbol ?? ""} (your ticket opens here)`, ...l].slice(0, 5)) },
    ],
    [store],
  )
  return (
    <main className="mx-auto max-w-4xl space-y-3 p-6 font-mono text-xs">
      <h1 className="text-sm font-semibold">blotter</h1>
      <p className="text-muted-foreground">Orders fill on their own, a quarter at a time. Select a few, some working and some filled: the button says how many it will cancel. Watch a selected order fill and the count drop without the grid re-rendering. Delete runs Cancel here because this scene turned that on. The status column is whatever the stand-in server last said.</p>
      <div className="h-80">
        <Blotter
          store={store}
          sort={{ key: "time", dir: "desc" }}
          actions={actions}
          deleteAction="cancel"
          onNew={() => {
            const o = order()
            store.applyDeltas({ upsert: [o] })
            say(`new ${o.side} ${o.quantity} ${o.symbol}`)
          }}
        />
      </div>
      <ol className="text-muted-foreground">
        {log.map((line, i) => (
          <li key={log.length - i}>{line}</li>
        ))}
      </ol>
    </main>
  )
}
