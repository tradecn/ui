import { useRef, useState } from "react"
import { createInstrumentFormatter, formatSigned } from "@/registry/tradecn/lib/format"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import { DataGrid, type ColumnDef } from "@/registry/tradecn/ui/data-grid"

interface Inquiry { id: string; price: number; change: number }

const note = createInstrumentFormatter({ price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 })
const columns: ColumnDef<Inquiry>[] = [
  { key: "id", header: "Inquiry", width: 120, frozen: "left", accessor: (row) => row.id },
  { key: "price", header: "Price", width: 100, numeric: true, font: "mono", accessor: (row) => row.price, format: (value) => note.price(value as number) },
  { key: "change", header: "Change", width: 100, numeric: true, accessor: (row) => row.change, format: (value) => formatSigned(value as number, { decimals: 6 }) },
]

export default function DataGridUpdatesDemo() {
  const [store] = useState(() => {
    const store = createRowStore<Inquiry>({ getRowId: (row) => row.id, lane: "ordered" })
    store.applyDeltas({ upsert: Array.from({ length: 12 }, (_, i) => ({ id: `Q-${i + 1}`, price: 99.5, change: 0 })) })
    return store
  })
  const nextId = useRef(13)
  const [received, setReceived] = useState(0)
  const receive = () => {
    const ids = store.getIds()
    const patches = ids.slice(1).map((id, i) => {
      const row = store.getRow(id)!
      const change = (i % 2 === 0 ? 1 : -1) / 64
      return { id, fields: { price: row.price + change, change } }
    })
    // A feed supplies one batch: changed quotes, an expired inquiry, and a new arrival.
    store.applyDeltas({ patch: patches, remove: [ids[0]!], upsert: [{ id: `Q-${nextId.current++}`, price: 99.5, change: 0 }] })
    setReceived((count) => count + 1)
  }
  return (
    <>
      <div data-demo-controls className="flex items-center gap-3 text-xs lining-nums tabular-nums">
        <button type="button" className="rounded border px-2 py-1" onClick={receive}>Receive a batch</button>
        <span>Batches received: {received}</span>
      </div>
      <div className="h-56 w-fit max-w-full">
        <DataGrid store={store} columns={columns} preset="rfq" label="Updating inquiries" />
      </div>
    </>
  )
}
