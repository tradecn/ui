import { useState } from "react"
import { formatNotional } from "@/registry/tradecn/lib/format"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import { DataGrid, type ColumnDef, type ColumnState, type SortState } from "@/registry/tradecn/ui/data-grid"

interface Inquiry { id: string; client: string; side: "Buy" | "Sell"; size: number }

const columns: ColumnDef<Inquiry>[] = [
  { key: "client", header: "Client", width: 160, frozen: "left", sortable: true, accessor: (row) => row.client },
  { key: "side", header: "Side", width: 100, sortable: true, accessor: (row) => row.side, cell: ({ row }) => <span className={row.side === "Buy" ? "text-up" : "text-down"}>{row.side}</span> },
  { key: "size", header: "Size", width: 120, numeric: true, sortable: true, accessor: (row) => row.size, format: (value) => formatNotional(value as number, { unit: "mm" }) },
]
const initialColumns: ColumnState = { order: [], widths: {}, hidden: [] }
const initialSort: SortState = { key: "size", dir: "desc" }

export default function DataGridControlledDemo() {
  const [store] = useState(() => {
    const store = createRowStore<Inquiry>({ getRowId: (row) => row.id })
    store.applyDeltas({ upsert: [
      { id: "Q-1", client: "ALPHA", side: "Buy", size: 5_000_000 },
      { id: "Q-2", client: "BETA", side: "Sell", size: 15_000_000 },
      { id: "Q-3", client: "GAMMA", side: "Buy", size: 10_000_000 },
    ] })
    return store
  })
  const [sort, setSort] = useState<SortState>(initialSort)
  const [columnState, setColumnState] = useState<ColumnState>(initialColumns)
  return (
    <>
      <div data-demo-controls className="flex flex-wrap items-center gap-3 text-xs lining-nums tabular-nums">
        <button type="button" className="rounded border px-2 py-1" onClick={() => { setSort(initialSort); setColumnState(initialColumns) }}>Reset view</button>
        <span>{sort ? `Sort: ${sort.key} ${sort.dir}` : "No sort"} · {columnState.hidden.length} hidden</span>
      </div>
      <div className="h-48 w-full">
        <DataGrid store={store} columns={columns} preset="rfq" label="Inquiries with controlled columns" sort={sort} onSortChange={setSort} columnState={columnState} onColumnStateChange={setColumnState} />
      </div>
    </>
  )
}
