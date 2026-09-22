import { useEffect, useState } from "react"
import { createInstrumentFormatter } from "@/registry/tradecn/lib/format"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import { AuditTrail, formatAuditValue, type AuditEvent } from "@/registry/tradecn/ui/audit-trail"

// One order's life, one event at a time, as a pretend server reports it. Click an event for its changes;
// select two for what changed between them. The words are the server's; the demo only replays them.

const T32 = createInstrumentFormatter({ price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 })
const value = (field: string, v: unknown) => (field === "price" && typeof v === "number" ? T32.price(v) : formatAuditValue(v))

const LIFE: Omit<AuditEvent, "at">[] = [
  { id: "e1", event: "New", by: "trader", message: "Buy 5,000 ZN limit", changes: [{ field: "side", to: "buy" }, { field: "quantity", to: 5000 }, { field: "price", to: 99.515625 }, { field: "status", to: "New" }] },
  { id: "e2", event: "Acknowledged", by: "venue", message: "Order id 8817", changes: [{ field: "status", from: "New", to: "Working" }] },
  { id: "e3", event: "PartiallyFilled", by: "venue", changes: [{ field: "filled", from: 0, to: 2000 }, { field: "status", from: "Working", to: "PartiallyFilled" }] },
  { id: "e4", event: "Amended", by: "trader", message: "Price to 99-17", changes: [{ field: "price", from: 99.515625, to: 99.53125 }] },
  { id: "e5", event: "Acknowledged", by: "venue", message: "Amend accepted" },
  { id: "e6", event: "PartiallyFilled", by: "venue", changes: [{ field: "filled", from: 2000, to: 3500 }] },
  { id: "e7", event: "Filled", by: "venue", changes: [{ field: "filled", from: 3500, to: 5000 }, { field: "status", from: "PartiallyFilled", to: "Filled" }] },
]

export default function AuditTrailDemo() {
  const [store] = useState(() => createRowStore<AuditEvent>({ getRowId: (e) => e.id, lane: "ordered" }))
  const [csv, setCsv] = useState("")
  useEffect(() => {
    let i = 0
    const push = () => {
      const next = LIFE[i++]
      if (!next) return
      store.applyDeltas({ upsert: [{ ...next, at: Date.now() }] })
    }
    push()
    const t = setInterval(push, 1500)
    return () => clearInterval(t)
  }, [store])
  return (
    <div className="flex h-72 flex-col gap-2 font-(family-name:--tradecn-font-mono) text-xs">
      <p className="text-muted-foreground">Click an event for what it changed; select two for what changed between them. Export hands you the CSV.</p>
      <div className="min-h-0 flex-1">
        <AuditTrail store={store} value={value} onExport={setCsv} />
      </div>
      {csv && <pre className="max-h-16 overflow-auto rounded-md border border-border bg-card p-2 text-muted-foreground">{csv}</pre>}
    </div>
  )
}
