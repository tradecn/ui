import { useState } from "react"
import { createInstrumentFormatter, formatNotional } from "@/registry/tradecn/lib/format"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import { ColumnChooser } from "@/registry/tradecn/ui/column-chooser"
import { DataGrid, type ColumnDef, type ColumnState } from "@/registry/tradecn/ui/data-grid"

type Quote = { id: string; client: string; size: number; price: number }
const ust = createInstrumentFormatter({ price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 })
const columns: ColumnDef<Quote>[] = [
  { key: "client", header: "Client", width: 112, accessor: (row) => row.client },
  { key: "size", header: "Size", width: 96, numeric: true, accessor: (row) => row.size, format: (value) => formatNotional(value as number, { unit: "mm" }) },
  { key: "price", header: "Price", width: 96, numeric: true, font: "mono", accessor: (row) => row.price, format: (value) => ust.price(value as number), parse: ust.parsePrice },
]

export default function ColumnChooserDemo() {
  const [store] = useState(() => {
    const rows = createRowStore<Quote>({ getRowId: (row) => row.id })
    rows.applyDeltas({ upsert: [
      { id: "Q-1", client: "ALPHA", size: 5_000_000, price: 99.5 },
      { id: "Q-2", client: "BETA", size: 10_000_000, price: 99.515625 },
    ] })
    return rows
  })
  const [columnState, setColumnState] = useState<ColumnState>({ order: [], widths: {}, hidden: [] })
  const [open, setOpen] = useState(false)

  return (
    <>
      <div data-demo-controls className="text-xs">
        <button type="button" className="rounded border border-border px-2 py-1" onClick={() => setOpen(true)}>Columns</button>
      </div>
      <div className="flex min-h-104 w-fit max-w-full flex-col justify-center">
        <ColumnChooser open={open} onOpenChange={setOpen} columns={columns} columnState={columnState} onColumnStateChange={setColumnState} className="max-h-[calc(100%-2rem)] grid-cols-1 overflow-auto" />
        <div className="h-40">
          <DataGrid store={store} columns={columns} columnState={columnState} onColumnStateChange={setColumnState} label="Quotes" />
        </div>
      </div>
    </>
  )
}
