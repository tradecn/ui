import { useState } from "react"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import { DataGrid, type ColumnDef, type ColumnState } from "@/registry/tradecn/ui/data-grid"

type Quote = { id: string; price: number; size: number }
const columns: ColumnDef<Quote>[] = [
  { key: "id", header: "Quote", width: 96, frozen: "left", accessor: row => row.id },
  { key: "price", header: "Price", width: 100, numeric: true, accessor: row => row.price, format: value => Number(value).toFixed(2) },
  { key: "size", header: "Size", width: 90, numeric: true, accessor: row => row.size },
]
const compact: ColumnState = { order: [], widths: { price: 144 }, hidden: ["size"] }
const expanded: ColumnState = { order: ["id", "size", "price"], widths: { price: 120 }, hidden: [] }

export default function DataGridDefaultsDemo() {
  const [store] = useState(() => {
    const store = createRowStore<Quote>({ getRowId: row => row.id })
    store.applyDeltas({ upsert: [
      { id: "Q-1", price: 100.25, size: 500 },
      { id: "Q-2", price: 99.75, size: 250 },
    ] })
    return store
  })
  const [expandedDefaults, setExpandedDefaults] = useState(false)
  return (
    <>
      <div data-demo-controls className="flex max-w-sm flex-col gap-2 text-xs">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={expandedDefaults} onChange={event => setExpandedDefaults(event.target.checked)} />
          Show size on reset
        </label>
        <p className="text-muted-foreground">Change the defaults, then choose Reset columns from a column menu.</p>
      </div>
      <div className="h-40 w-fit max-w-full">
        <DataGrid store={store} columns={columns} baseState={expandedDefaults ? expanded : compact} label="Quotes with local settings" />
      </div>
    </>
  )
}
