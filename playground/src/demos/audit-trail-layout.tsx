import { useState } from "react"
import { MONO_NUMERIC_CLASS, NUMERIC_CLASS } from "@/registry/tradecn/lib/format"
import { AuditTrail, AuditTrailChanges, AuditTrailExportButton, AuditTrailGrid, auditTrailColumns, useAuditTrailChanges } from "@/registry/tradecn/ui/audit-trail"
import { auditTime, auditValue, createAuditHistory } from "./audit-trail-history"

const columns = auditTrailColumns({ time: auditTime }).filter(column => ["at", "event", "changes"].includes(column.key))

function ChangeCards() {
  const { title, changes, emptyMessage, formatValue } = useAuditTrailChanges()
  return <>
    <h2 className="font-medium">{title || "Review an event"}</h2>
    {changes.length === 0 ? <p className="text-muted-foreground">{emptyMessage}</p> : <ol className="grid gap-2 sm:grid-cols-2">
      {[...changes].reverse().map((change, index) => <li key={index} data-audit-change={change.field} className="rounded border border-border p-2">
        <h3 className="font-medium">{change.field}</h3>
        <dl className="mt-1 grid grid-cols-2 gap-x-2 break-words">
          <dt className="text-muted-foreground">Previous</dt><dd data-audit-from="" className={`${NUMERIC_CLASS} line-through`}>{formatValue(change.field, change.from)}</dd>
          <dt className="text-muted-foreground">Current</dt><dd data-audit-to="" className={NUMERIC_CLASS}>{formatValue(change.field, change.to)}</dd>
        </dl>
      </li>)}
    </ol>}
  </>
}

export default function AuditTrailLayoutDemo() {
  const [store] = useState(createAuditHistory)
  const [selection, setSelection] = useState<ReadonlySet<string>>(() => new Set(["e1", "e4"]))
  const [csv, setCsv] = useState("")
  return <>
    <div data-demo-controls className="flex flex-wrap gap-2 text-xs">
      <button type="button" className="rounded border border-border px-2 py-1" onClick={() => store.applyDeltas({ patch: [{ id: "e4", fields: { changes: [{ field: "price", from: 99.515625, to: 99.546875 }] } }] })}>Correct price</button>
      <button type="button" className="rounded border border-border px-2 py-1" onClick={() => store.clear()}>Clear history</button>
      <button type="button" className="rounded border border-border px-2 py-1" onClick={() => { const original = createAuditHistory(); store.applyDeltas({ upsert: original.getIds().map(id => original.getRow(id)!) }) }}>Restore history</button>
    </div>
    <div className="w-[32rem] max-w-full space-y-3 text-xs">
      <AuditTrail store={store} columns={columns} time={auditTime} value={auditValue} selection={selection} onSelectionChange={setSelection} className="h-auto gap-3">
        <div className="h-44"><AuditTrailGrid label="Review events" selectionColumn /></div>
        <AuditTrailChanges className="max-h-64"><ChangeCards /></AuditTrailChanges>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-muted-foreground">Order history · UTC</p>
          <AuditTrailExportButton onExport={setCsv}>Export history</AuditTrailExportButton>
        </div>
      </AuditTrail>
      {csv && <pre role="region" aria-label="Exported CSV" tabIndex={0} className={`max-h-32 overflow-auto rounded border border-border p-2 ${MONO_NUMERIC_CLASS}`}>{csv}</pre>}
    </div>
  </>
}
