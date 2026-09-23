import { memo, useState } from "react"
import { useRow, useRowIds, useView } from "@/registry/tradecn/hooks/use-row-store"
import { createRowStore, type RowStore, type ViewOptions } from "@/registry/tradecn/lib/row-store"

interface Quote { id: string; change: number }
const quotes: Quote[] = [{ id: "ALPHA", change: 0.02 }, { id: "BETA", change: -0.01 }, { id: "GAMMA", change: 0.01 }]
const options: ViewOptions<Quote> = { comparator: (a, b) => b.change - a.change, filter: (quote) => quote.change >= 0, reorderHoldMs: 2000 }

const QuoteRow = memo(function QuoteRow({ store, id }: { store: RowStore<Quote>; id: string }) {
  const quote = useRow(store, id)
  if (!quote) return null
  return (
    <tr className="border-t">
      <th scope="row" className="px-3 py-1 text-left font-medium">{id}</th>
      <td className="px-3 py-1 text-right">{quote.change > 0 ? "+" : ""}{quote.change.toFixed(2)}</td>
    </tr>
  )
})

export default function RowStoreViewsDemo() {
  const [store] = useState(() => {
    const store = createRowStore<Quote>({ getRowId: (quote) => quote.id })
    store.applyDeltas({ upsert: quotes })
    return store
  })
  const view = useView(store, options)!
  const ids = useRowIds(view)
  const storeIds = useRowIds(store)
  const beta = useRow(store, "BETA")!
  const raise = () => {
    view.touch()
    store.applyDeltas({ patch: [{ id: "BETA", fields: { change: 0.03 } }] })
  }
  return (
    <>
      <div data-demo-controls className="flex flex-wrap gap-2 text-xs">
        <button type="button" className="rounded border px-2 py-1 disabled:opacity-50" disabled={beta.change >= 0} onClick={raise}>Hold and raise BETA</button>
        <button type="button" className="rounded border px-2 py-1" onClick={() => store.applyDeltas({ upsert: quotes })}>Reset view example</button>
      </div>
      <div className="w-fit max-w-full space-y-2 text-xs lining-nums tabular-nums">
        <div className="overflow-auto rounded border">
          <table className="w-full" aria-label="Nonnegative changes, highest first">
            <thead className="text-muted-foreground"><tr><th scope="col" className="px-3 py-1 text-left font-medium">Symbol</th><th scope="col" className="px-3 py-1 text-right font-medium">Change</th></tr></thead>
            <tbody>{ids.map((id) => <QuoteRow key={id} store={store} id={id} />)}</tbody>
          </table>
        </div>
        <p className="max-w-64 text-muted-foreground">Store order: {storeIds.join(", ")}</p>
        <p role="status" className="max-w-64 text-muted-foreground">View order: {ids.join(", ")}</p>
      </div>
    </>
  )
}
