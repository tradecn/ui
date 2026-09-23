import { useState } from "react"
import { createInstrumentFormatter, formatNotional } from "@/registry/tradecn/lib/format"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import { DataGrid, type ColumnDef } from "@/registry/tradecn/ui/data-grid"

interface Inquiry {
  id: string
  client: string
  size: number
  price: number
}

const rows: Inquiry[] = [
  { id: "Q-1", client: "ALPHA", size: 5_000_000, price: 99.5 },
  { id: "Q-2", client: "BETA", size: 10_000_000, price: 99.515625 },
  { id: "Q-3", client: "GAMMA", size: 15_000_000, price: 99.53125 },
]
const note = createInstrumentFormatter({ price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 })
const columns: ColumnDef<Inquiry>[] = [
  { key: "client", header: "Client", width: 140, accessor: (row) => row.client },
  { key: "size", header: "Size", width: 100, numeric: true, accessor: (row) => row.size, format: (value) => formatNotional(value as number, { unit: "mm" }) },
  { key: "price", header: "Price", width: 100, numeric: true, font: "mono", accessor: (row) => row.price, format: (value) => note.price(value as number) },
]

export default function DataGridDemo() {
  const [store] = useState(() => {
    const store = createRowStore<Inquiry>({ getRowId: (row) => row.id })
    store.applyDeltas({ upsert: rows })
    return store
  })
  return <div className="h-40 w-full"><DataGrid store={store} columns={columns} preset="rfq" label="Open inquiries" /></div>
}
