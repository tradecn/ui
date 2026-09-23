import { useEffect, useRef, useState } from "react"
import { useRow, useStoreMeta } from "@/registry/tradecn/hooks/use-row-store"
import { createFrameBatcher, createRowStore } from "@/registry/tradecn/lib/row-store"

interface Quote { id: string; price: number; size: number }

export default function RowStoreBatchingDemo() {
  const [store] = useState(() => {
    const store = createRowStore<Quote>({ getRowId: (quote) => quote.id })
    store.applyDeltas({ upsert: [{ id: "ALPHA", price: 100, size: 100 }] })
    return store
  })
  const [batcher] = useState(() => createFrameBatcher(store.applyDeltas, { getRowId: store.getRowId }))
  useEffect(() => () => batcher.cancel(), [batcher])
  const nextPrice = useRef(100)
  const [received, setReceived] = useState(0)
  const quote = useRow(store, "ALPHA")!
  const meta = useStoreMeta(store)
  const receive = (cancel: boolean) => {
    const price = nextPrice.current
    nextPrice.current += 0.03
    batcher.push({ patch: [{ id: "ALPHA", fields: { price: price + 0.01 } }] })
    batcher.push({ patch: [{ id: "ALPHA", fields: { size: 200 } }] })
    batcher.push({ patch: [{ id: "ALPHA", fields: { price: price + 0.03 } }] })
    setReceived((count) => count + 3)
    if (cancel) batcher.cancel()
  }
  return (
    <>
      <div data-demo-controls className="flex flex-wrap gap-2 text-xs">
        <button type="button" className="rounded border px-2 py-1" onClick={() => receive(false)}>Queue three messages</button>
        <button type="button" className="rounded border px-2 py-1" onClick={() => receive(true)}>Queue then cancel</button>
      </div>
      <div className="w-fit max-w-full space-y-2 text-xs lining-nums tabular-nums">
        <div className="overflow-auto rounded border">
          <table className="w-full" aria-label="Batched quote">
            <thead className="text-muted-foreground"><tr><th scope="col" className="px-3 py-1 text-left font-medium">Symbol</th><th scope="col" className="px-3 py-1 text-right font-medium">Price</th><th scope="col" className="px-3 py-1 text-right font-medium">Size</th></tr></thead>
            <tbody><tr className="border-t"><th scope="row" className="px-3 py-1 text-left font-medium">{quote.id}</th><td className="px-3 py-1 text-right">{quote.price.toFixed(2)}</td><td className="px-3 py-1 text-right">{quote.size}</td></tr></tbody>
          </table>
        </div>
        <p role="status" className="max-w-64 text-muted-foreground">Messages received: {received}. Batches applied: {meta.version - 1}.</p>
      </div>
    </>
  )
}
