import { useState } from "react"
import { formatNotional } from "@/registry/tradecn/lib/format"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import { DataGrid, type ColumnDef } from "@/registry/tradecn/ui/data-grid"

interface Inquiry { id: string; client: string; size: number }

const columns: ColumnDef<Inquiry>[] = [
  { key: "client", header: "Client", width: 160, accessor: (row) => row.client },
  { key: "size", header: "Size", width: 120, numeric: true, accessor: (row) => row.size, format: (value) => formatNotional(value as number, { unit: "mm" }) },
]
const largeInquiry = (row: Inquiry) => row.size >= 10_000_000
const footer = {
  client: (rows: Inquiry[]) => `${rows.length} inquiries`,
  size: (rows: Inquiry[]) => formatNotional(rows.reduce((total, row) => total + row.size, 0), { unit: "mm" }),
}

export default function DataGridTotalsDemo() {
  const [store] = useState(() => {
    const store = createRowStore<Inquiry>({ getRowId: (row) => row.id })
    store.applyDeltas({ upsert: [
      { id: "Q-1", client: "ALPHA", size: 5_000_000 },
      { id: "Q-2", client: "BETA", size: 10_000_000 },
      { id: "Q-3", client: "GAMMA", size: 15_000_000 },
    ] })
    return store
  })
  const [largeOnly, setLargeOnly] = useState(false)
  return (
    <>
      <div data-demo-controls className="text-xs lining-nums tabular-nums">
        <label className="flex items-center gap-2"><input type="checkbox" checked={largeOnly} onChange={(event) => setLargeOnly(event.target.checked)} />Only sizes of at least 10mm</label>
      </div>
      <div className="h-48 w-full">
        <DataGrid store={store} columns={columns} preset="rfq" label="Inquiry totals" filter={largeOnly ? largeInquiry : undefined} footer={footer} />
      </div>
    </>
  )
}
