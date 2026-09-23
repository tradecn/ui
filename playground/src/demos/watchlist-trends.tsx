import { useState } from "react"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import type { ColumnDef } from "@/registry/tradecn/ui/data-grid"
import { Sparkline } from "@/registry/tradecn/ui/sparkline"
import { Watchlist, watchlistColumns, type WatchlistRow } from "@/registry/tradecn/ui/watchlist"

type TrendRow = WatchlistRow & { close: number; closes: number[] }

const columns: ColumnDef<TrendRow>[] = [
  ...watchlistColumns<TrendRow>().filter((column) => column.key === "symbol" || column.key === "last"),
  { key: "trend", header: "Trend", width: 112, flash: false, accessor: (row) => row.closes, cell: ({ row }) => <Sparkline values={row.closes} baseline={row.close} label={`${row.symbol}, last six readings`} width={96} height={18} /> },
]

export default function WatchlistTrendsDemo() {
  const [store] = useState(() => {
    const store = createRowStore<TrendRow>({ getRowId: (row) => row.symbol })
    store.applyDeltas({ upsert: [
      { symbol: "ES", last: 5012.25, close: 5024.75, closes: [5024.75, 5020, 5022.5, 5018.25, 5014, 5012.25] },
      { symbol: "CL", last: 78.1, close: 77.85, closes: [77.85, 77.9, 77.88, 78, 78.05, 78.1] },
    ] })
    return store
  })
  return <div className="h-40 w-fit max-w-full"><Watchlist store={store} columns={columns} label="Watchlist with trends" /></div>
}
