import { useState } from "react"
import { AuditTrail, type AuditEvent } from "@/components/ui/audit-trail"
import { createRowStore } from "@/lib/row-store"

const T0 = 1_700_000_000_000
const EVENTS: AuditEvent[] = [
  { id: "e1", at: T0, event: "New", by: "trader", message: "Buy 5,000 ZN", changes: [{ field: "quantity", to: 5000 }, { field: "price", to: "99-16+" }, { field: "status", to: "New" }] },
  { id: "e2", at: T0 + 1200, event: "Acknowledged", by: "venue", message: "Order id 8817", changes: [{ field: "status", from: "New", to: "Working" }] },
  { id: "e3", at: T0 + 4000, event: "PartiallyFilled", by: "venue", changes: [{ field: "filled", from: 0, to: 2000 }, { field: "status", from: "Working", to: "PartiallyFilled" }] },
  { id: "e4", at: T0 + 9000, event: "Amended", by: "trader", changes: [{ field: "price", from: "99-16+", to: "99-17" }] },
]

// Four events of one order; a button lands the fifth at the tail; the CSV lands in the attribute.
export function AuditTrailScene() {
  const [store] = useState(() => {
    const s = createRowStore<AuditEvent>({ getRowId: (e) => e.id, lane: "ordered" })
    s.applyDeltas({ upsert: EVENTS })
    return s
  })
  const [csv, setCsv] = useState("")
  return (
    <div className="flex flex-col gap-1" data-audit-csv={csv}>
      <div className="w-[60rem]" style={{ height: 180 }}>
        <AuditTrail store={store} time={(ms) => `t${ms - T0}`} onExport={setCsv} />
      </div>
      <button type="button" onClick={() => store.applyDeltas({ upsert: [{ id: "e5", at: T0 + 12_000, event: "Filled", by: "venue", changes: [{ field: "filled", from: 2000, to: 5000 }, { field: "status", from: "PartiallyFilled", to: "Filled" }] }] })}>
        next event
      </button>
    </div>
  )
}
