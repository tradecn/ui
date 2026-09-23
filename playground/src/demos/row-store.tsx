import { memo, useState } from "react"
import { useRow, useRowIds } from "@/registry/tradecn/hooks/use-row-store"
import { createRowStore, type RowStore } from "@/registry/tradecn/lib/row-store"

interface Quote { id: string; price: number }

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

export default function RowStoreDemo() {
  const [store] = useState(() => {
    const store = createRowStore<Quote>({ getRowId: (quote) => quote.id })
    store.applyDeltas({ upsert: [{ id: "ALPHA", price: 99.5 }, { id: "BETA", price: 100.25 }] })
    return store
  })
  const ids = useRowIds(store)
  const update = () => store.applyDeltas({ patch: [{ id: "ALPHA", fields: { price: store.getRow("ALPHA")!.price + 0.01 } }] })
  return (
    <>
      <div data-demo-controls className="text-xs">
        <button type="button" className="rounded border px-2 py-1" onClick={update}>Update ALPHA</button>
      </div>
      <div className="w-fit max-w-full overflow-auto rounded border text-xs lining-nums tabular-nums">
        <table aria-label="Quotes">
          <thead className="text-muted-foreground"><tr><th scope="col" className="px-3 py-1 text-left font-medium">Symbol</th><th scope="col" className="px-3 py-1 text-right font-medium">Price</th></tr></thead>
          <tbody>{ids.map((id) => <QuoteRow key={id} store={store} id={id} />)}</tbody>
        </table>
      </div>
    </>
  )
}
