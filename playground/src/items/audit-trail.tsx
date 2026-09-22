import { useState } from "react"
import { Button } from "@/components/ui/button"
import { createInstrumentFormatter } from "@/registry/tradecn/lib/format"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import { AuditTrail, formatAuditValue, type AuditEvent } from "@/registry/tradecn/ui/audit-trail"

// One order's life as a pretend server reports it, one event per press, and a correction the server
// sends for an event already on the tape. The trail prints the words and folds the changes; it decides
// nothing.

const T32 = createInstrumentFormatter({ price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 })
const value = (field: string, v: unknown) => (field === "price" && typeof v === "number" ? T32.price(v) : field === "quantity" || field === "filled" ? (typeof v === "number" ? v.toLocaleString() : formatAuditValue(v)) : formatAuditValue(v))

const LIFE: Omit<AuditEvent, "at">[] = [
  { id: "e1", event: "New", by: "trader", message: "Buy 5,000 ZN limit day", changes: [{ field: "side", to: "buy" }, { field: "quantity", to: 5000 }, { field: "price", to: 99.515625 }, { field: "tif", to: "day" }, { field: "status", to: "New" }] },
  { id: "e2", event: "Acknowledged", by: "venue", message: "Order id 8817", changes: [{ field: "status", from: "New", to: "Working" }] },
  { id: "e3", event: "PartiallyFilled", by: "venue", message: "2,000 at 99-16+", changes: [{ field: "filled", from: 0, to: 2000 }, { field: "status", from: "Working", to: "PartiallyFilled" }] },
  { id: "e4", event: "Amended", by: "trader", message: "Price to 99-17", changes: [{ field: "price", from: 99.515625, to: 99.53125 }] },
  { id: "e5", event: "Acknowledged", by: "venue", message: "Amend accepted" },
  { id: "e6", event: "PartiallyFilled", by: "venue", message: "1,500 at 99-17", changes: [{ field: "filled", from: 2000, to: 3500 }] },
  { id: "e7", event: "Heartbeat", by: "system" },
  { id: "e8", event: "Filled", by: "venue", message: "1,500 at 99-17", changes: [{ field: "filled", from: 3500, to: 5000 }, { field: "status", from: "PartiallyFilled", to: "Filled" }] },
]

export function AuditTrailScene() {
  const [store] = useState(() => {
    const s = createRowStore<AuditEvent>({ getRowId: (e) => e.id, lane: "ordered" })
    const now = Date.now()
    s.applyDeltas({ upsert: LIFE.slice(0, 3).map((e, i) => ({ ...e, at: now - (3 - i) * 4000 })) })
    return s
  })
  const [next, setNext] = useState(3)
  const [csv, setCsv] = useState("")
  const push = () => {
    const event = LIFE[next]
    if (!event) return
    store.applyDeltas({ upsert: [{ ...event, at: Date.now() }] })
    setNext((n) => n + 1)
  }
  const correct = () => store.applyDeltas({ patch: [{ id: "e3", fields: { message: "2,000 at 99-16+ (corrected: 2,100)", changes: [{ field: "filled", from: 0, to: 2100 }, { field: "status", from: "Working", to: "PartiallyFilled" }] } }] })
  return (
    <main className="flex h-screen flex-col gap-3 p-4 font-(family-name:--tradecn-font-mono) text-xs">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-sm font-semibold">audit-trail</h1>
        <span className="text-muted-foreground">Click an event for what it changed, select two (Shift, or mod) for what changed between them. The server's next event lands at the tail; a correction rewrites one already there.</span>
        <Button type="button" variant="outline" size="sm" className="ml-auto" onClick={push} disabled={next >= LIFE.length}>
          Next event
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={correct}>
          Server corrects the first fill
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        <AuditTrail store={store} value={value} onExport={setCsv} />
      </div>
      <pre className="h-24 overflow-auto rounded-md border border-border bg-card p-2 text-muted-foreground">{csv || "the CSV lands here"}</pre>
    </main>
  )
}
