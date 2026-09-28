import { useState } from "react"
import { NUMERIC_CLASS } from "@/registry/tradecn/lib/format"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import { AuditTrail, AuditTrailChanges, AuditTrailGrid, type AuditEvent } from "@/registry/tradecn/ui/audit-trail"

const TIME = Date.UTC(2026, 8, 23, 14, 30)
const time = (ms: number) => new Date(ms).toISOString().slice(11, 23)

export function AuditChangesTable() {
  return <AuditTrailChanges>{({ title, changes, emptyMessage, formatValue, labels }) => <>
    {title && <h3 className="font-medium">{title}</h3>}
    {emptyMessage ? <p className="text-muted-foreground">{emptyMessage}</p> : (
      <table aria-label={labels.changes} className="w-full border-separate border-spacing-x-2 text-left">
        <thead><tr className="text-muted-foreground">
          <th scope="col" className="font-normal">{labels.field}</th>
          <th scope="col" className="font-normal">{labels.from}</th>
          <th scope="col" className="font-normal">{labels.to}</th>
        </tr></thead>
        <tbody>{changes.map((change, index) => <tr key={index} data-audit-change={change.field}>
          <th scope="row" className="font-medium">{change.field}</th>
          <td data-audit-from className={`${NUMERIC_CLASS} text-muted-foreground line-through decoration-muted-foreground/60`}>{formatValue(change.field, change.from)}</td>
          <td data-audit-to className={NUMERIC_CLASS}>{formatValue(change.field, change.to)}</td>
        </tr>)}</tbody>
      </table>
    )}
  </>}</AuditTrailChanges>
}

export default function AuditTrailDemo() {
  const [store] = useState(() => {
    const rows = createRowStore<AuditEvent>({ getRowId: row => row.id, lane: "ordered" })
    rows.applyDeltas({ upsert: [
      { id: "e1", at: TIME, event: "New", changes: [{ field: "quantity", to: 5000 }, { field: "status", to: "New" }] },
      { id: "e2", at: TIME + 1000, event: "Acknowledged", changes: [{ field: "status", from: "New", to: "Working" }] },
    ] })
    return rows
  })

  return <AuditTrail store={store} time={time} className="h-auto w-3xl max-w-full">
    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="h-40 min-w-0"><AuditTrailGrid /></div>
      <AuditChangesTable />
    </div>
  </AuditTrail>
}
