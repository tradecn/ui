import { useState } from "react"
import { createInstrumentFormatter, formatNotional } from "@/registry/tradecn/lib/format"
import { describeRule, type GridRules } from "@/registry/tradecn/lib/grid-rules"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import { DataGrid, type ColumnDef } from "@/registry/tradecn/ui/data-grid"

interface Request {
  id: string
  size: number
  price: number | null
  status: string
}

const note = createInstrumentFormatter({ price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 })
const columns: ColumnDef<Request>[] = [
  { key: "id", header: "Request", width: 96, accessor: (row) => row.id },
  { key: "size", header: "Size", width: 96, numeric: true, accessor: (row) => row.size, format: (value) => formatNotional(value as number, { unit: "mm" }) },
  { key: "price", header: "Price", width: 88, numeric: true, font: "mono", accessor: (row) => row.price, format: (value) => note.price(value as number | null), parse: note.parsePrice },
  { key: "status", header: "Status", width: 104, accessor: (row) => row.status },
]
const rules: GridRules = {
  columns: [
    { id: "rich", column: "price", when: { op: "gte", value: "100-00" }, tone: "up", label: "Rich to the market" },
    { id: "cheap", column: "price", when: { op: "lt", value: "99-16" }, tone: "down", label: "Cheap to the market" },
    { id: "large", column: "size", when: { op: "gte", value: "10,000,000" }, tone: "primary", target: "row", label: "Large" },
    { id: "gone", column: "status", when: { op: "eq", value: "Done away" }, tone: "stale", target: "row" },
  ],
}
const requests: Request[] = [
  { id: "Q-1", size: 5_000_000, price: 99.5, status: "Open" },
  { id: "Q-2", size: 25_000_000, price: 100.015625, status: "Open" },
  { id: "Q-3", size: 2_000_000, price: 99.25, status: "Done away" },
  { id: "Q-4", size: 3_000_000, price: null, status: "Quoted" },
]

export default function GridRulesDataGridDemo() {
  const [enabled, setEnabled] = useState(true)
  const [store] = useState(() => {
    const store = createRowStore<Request>({ getRowId: (row) => row.id })
    store.applyDeltas({ upsert: requests })
    return store
  })

  return (
    <>
      <div data-demo-controls className="text-xs"><label className="flex items-center gap-1"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />Show highlights</label></div>
      <div className="w-fit max-w-full space-y-3 text-xs lining-nums tabular-nums">
        <div className="h-40"><DataGrid store={store} columns={columns} preset="rfq" label="Request highlights" rules={enabled ? rules : undefined} /></div>
        <ul role="list" aria-label="Highlight rules" className="space-y-1 text-muted-foreground">
          {rules.columns!.map((rule) => <li key={rule.id}>{describeRule(rule, columns)} ({rule.target ?? "cell"})</li>)}
        </ul>
      </div>
    </>
  )
}
