import { useState } from "react"
import { AuditChangesTable } from "./audit-trail"
import { createInstrumentFormatter } from "@/registry/tradecn/lib/format"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import { AuditTrail, AuditTrailGrid, AuditTrailExportButton, formatAuditValue, type AuditEvent } from "@/registry/tradecn/ui/audit-trail"

const T32 = createInstrumentFormatter({ price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 })
export const auditValue = (field: string, v: unknown) => (field === "price" && typeof v === "number" ? T32.price(v) : formatAuditValue(v))

const events: Omit<AuditEvent, "at">[] = [
  { id: "e1", event: "New", by: "trader", message: "Buy 5,000 ZN limit", changes: [{ field: "side", to: "buy" }, { field: "quantity", to: 5000 }, { field: "price", to: 99.515625 }, { field: "status", to: "New" }] },
  { id: "e2", event: "Acknowledged", by: "venue", message: "Order id 8817", changes: [{ field: "status", from: "New", to: "Working" }] },
  { id: "e3", event: "PartiallyFilled", by: "venue", changes: [{ field: "filled", from: 0, to: 2000 }, { field: "status", from: "Working", to: "PartiallyFilled" }] },
  { id: "e4", event: "Amended", by: "trader", message: "Price to 99-17", changes: [{ field: "price", from: 99.515625, to: 99.53125 }] },
  { id: "e5", event: "Acknowledged", by: "venue", message: "Amend accepted" },
  { id: "e6", event: "PartiallyFilled", by: "venue", changes: [{ field: "filled", from: 2000, to: 3500 }] },
  { id: "e7", event: "Filled", by: "venue", changes: [{ field: "filled", from: 3500, to: 5000 }, { field: "status", from: "PartiallyFilled", to: "Filled" }] },
]

const start = Date.UTC(2026, 8, 23, 14, 30)
export const auditTime = (ms: number) => new Date(ms).toISOString().slice(11, 23)

export function createAuditHistory() {
  const store = createRowStore<AuditEvent>({ getRowId: (event) => event.id, lane: "ordered" })
  store.applyDeltas({ upsert: events.map((event, index) => ({ ...event, at: start + index * 1500 })) })
  return store
}

export default function AuditTrailHistoryDemo() {
  const [store] = useState(createAuditHistory)
  const [csv, setCsv] = useState("")
  return (
    <div className="w-5xl max-w-full space-y-2 text-xs lining-nums tabular-nums">
      <p className="text-muted-foreground">Sample order history · 23 September 2026 · UTC</p>
      <AuditTrail store={store} time={auditTime} value={auditValue} className="h-auto">
        <div className="flex justify-end"><AuditTrailExportButton onExport={setCsv} /></div>
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="h-64 min-w-0"><AuditTrailGrid selectionColumn label="Order events" /></div>
          <AuditChangesTable />
        </div>
      </AuditTrail>
      {csv && <pre role="region" aria-label="Exported CSV" tabIndex={0} className="max-h-36 overflow-auto rounded border border-border p-2 font-(family-name:--tradecn-font-mono)">{csv}</pre>}
    </div>
  )
}
