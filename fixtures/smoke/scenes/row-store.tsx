import { Activity, memo, useState } from "react"
import { DataGrid, type ColumnDef } from "@/components/ui/data-grid"
import { useRow, useRowIds, useView } from "@/hooks/use-row-store"
import { createRowStore, type RowStore, type ViewOptions } from "@/lib/row-store"

interface Quote { id: string; px: number }
const quotes: Quote[] = [{ id: "ALPHA", px: 2 }, { id: "BETA", px: 1 }]
const options: ViewOptions<Quote> = { comparator: (a, b) => a.px - b.px, reorderHoldMs: 500 }
const columns: ColumnDef<Quote>[] = [
  { key: "id", header: "Symbol", width: 120, accessor: (row) => row.id },
  { key: "px", header: "Price", width: 100, numeric: true, accessor: (row) => row.px },
]

const QuoteRow = memo(function QuoteRow({ store, id }: { store: RowStore<Quote>; id: string }) {
  const row = useRow(store, id)
  if (!row) return null
  return <tr><th scope="row" className="p-1 text-left">{id}</th><td className="p-1 text-right">{row.px}</td></tr>
})

function Readings({ store }: { store: RowStore<Quote> }) {
  const view = useView(store, options)!
  const ids = useRowIds(view)
  const [shared, setShared] = useState(true)
  return <div className="flex flex-col gap-2">
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={() => setShared((value) => !value)}>{shared ? "Use grid order" : "Share table order"}</button>
      <button type="button" onClick={() => {
        view.touch()
        store.applyDeltas({ patch: [{ id: "ALPHA", fields: { px: 0 } }] })
      }}>Hold and lower ALPHA</button>
    </div>
    <table aria-label="Sorted quotes" className="w-full max-w-xs">
      <thead><tr><th scope="col" className="p-1 text-left">Symbol</th><th scope="col" className="p-1 text-right">Price</th></tr></thead>
      <tbody>{ids.length ? ids.map((id) => <QuoteRow key={id} store={store} id={id} />) : <tr><td colSpan={2}>No quotes</td></tr>}</tbody>
    </table>
    <div className="h-36 max-w-full">
      <DataGrid store={store} view={shared ? view : undefined} columns={columns} label="Quote grid" />
    </div>
  </div>
}

export function RowStoreScene() {
  const [store] = useState(() => {
    const store = createRowStore<Quote>({ getRowId: (row) => row.id })
    store.applyDeltas({ upsert: quotes })
    return store
  })
  const [visible, setVisible] = useState(true)
  return <div data-slot="tradecn-row-store" className="flex flex-col gap-2 text-xs lining-nums tabular-nums">
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={() => setVisible((value) => !value)}>{visible ? "Hide quotes" : "Show quotes"}</button>
      <button type="button" onClick={() => store.applyDeltas({ upsert: [{ id: "GAMMA", px: -1 }] })}>Add GAMMA</button>
      <button type="button" onClick={() => store.applyDeltas({ remove: ["BETA"] })}>Remove BETA</button>
      <button type="button" onClick={() => store.clear()}>Clear quotes</button>
      <button type="button" onClick={() => { store.clear(); store.applyDeltas({ upsert: quotes }) }}>Reset quotes</button>
    </div>
    <Activity mode={visible ? "visible" : "hidden"}><Readings store={store} /></Activity>
  </div>
}
