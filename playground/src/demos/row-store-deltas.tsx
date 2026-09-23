import { memo, useState } from "react"
import { useRow, useRowIds, useStoreMeta } from "@/registry/tradecn/hooks/use-row-store"
import { createRowStore, type RowStore } from "@/registry/tradecn/lib/row-store"

interface Quote { id: string; price: number }

function seeded() {
  const store = createRowStore<Quote>({ getRowId: (quote) => quote.id, lane: "coalesced" })
  store.applyDeltas({ upsert: [{ id: "ALPHA", price: 99.5 }, { id: "BETA", price: 100.25 }] })
  return store
}

const QuoteRow = memo(function QuoteRow({ store, id }: { store: RowStore<Quote>; id: string }) {
  const quote = useRow(store, id)
  if (!quote) return null
  return (
    <tr className="border-t">
      <th scope="row" className="px-3 py-1 text-left font-medium">{id}</th>
      <td className="px-3 py-1 text-right">{quote.price.toFixed(2)}</td>
    </tr>
  )
})

export default function RowStoreDeltasDemo() {
  const [store, setStore] = useState(seeded)
  const ids = useRowIds(store)
  const meta = useStoreMeta(store)
  const receive = () => store.applyDeltas({
    upsert: [{ id: "GAMMA", price: 101.25 }],
    patch: [{ id: "ALPHA", fields: { price: 99.75 } }],
    remove: ["BETA"],
    meta: { dropped: 3 },
  })
  return (
    <>
      <div data-demo-controls className="flex flex-wrap gap-2 text-xs">
        <button type="button" className="rounded border px-2 py-1 disabled:opacity-50" disabled={meta.version !== 1} onClick={receive}>Apply feed batch</button>
        <button type="button" className="rounded border px-2 py-1 disabled:opacity-50" disabled={meta.version !== 2} onClick={() => store.applyDeltas({ meta: { dropped: 2 } })}>Report two more drops</button>
        <button type="button" className="rounded border px-2 py-1" onClick={() => setStore(seeded())}>Reset batch example</button>
      </div>
      <div className="w-fit max-w-full space-y-2 text-xs lining-nums tabular-nums">
        <div className="overflow-auto rounded border">
          <table className="w-full" aria-label="Batch quotes">
            <thead className="text-muted-foreground"><tr><th scope="col" className="px-3 py-1 text-left font-medium">Symbol</th><th scope="col" className="px-3 py-1 text-right font-medium">Price</th></tr></thead>
            <tbody>{ids.map((id) => <QuoteRow key={id} store={store} id={id} />)}</tbody>
          </table>
        </div>
        <p role="status" className="max-w-64 text-muted-foreground">Lane: {meta.lane}. Batch {meta.version}. Rows: {meta.size}. Dropped: {meta.dropped}.</p>
      </div>
    </>
  )
}
