import { useState } from "react"
import type { InstrumentConvention } from "@/registry/tradecn/lib/format"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import { SpreadMatrix, type SpreadInstrument } from "@/registry/tradecn/ui/spread-matrix"

const T32: InstrumentConvention = { price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 }
const instruments: SpreadInstrument[] = [
  { id: "2Y", label: "2Y", convention: { ...T32, tick: 1 / 128 } },
  { id: "5Y", label: "5Y", convention: T32 },
  { id: "10Y", label: "10Y", convention: T32 },
]

const quotes = [
  { id: "2Y", price: 100.25 },
  { id: "5Y", price: 99.75 },
  { id: "10Y", price: 99.515625 },
]

export default function SpreadMatrixUpdatesDemo() {
  const [store] = useState(() => {
    const store = createRowStore<{ id: string; price: number }>({ getRowId: (quote) => quote.id })
    store.applyDeltas({ upsert: quotes })
    return store
  })
  const [moved, setMoved] = useState(false)
  const move = () => {
    store.applyDeltas({ patch: [{ id: "5Y", fields: { price: 99.734375 } }] })
    setMoved(true)
  }
  const restore = () => {
    store.applyDeltas({ upsert: quotes })
    setMoved(false)
  }
  return (
    <>
      <div data-demo-controls className="flex flex-wrap gap-2 text-xs lining-nums tabular-nums">
        <button type="button" className="rounded border px-2 py-1 disabled:opacity-50" disabled={moved} onClick={move}>Lower 5Y by one tick</button>
        <button type="button" className="rounded border px-2 py-1" onClick={restore}>Restore quotes</button>
      </div>
      <div className="w-fit max-w-full space-y-2 text-xs lining-nums tabular-nums">
        <SpreadMatrix store={store} instruments={instruments} label="Updating price spreads" />
        <p role="status" className="text-muted-foreground">{moved ? "5Y price lowered by 1/64. Its row falls; its column rises." : "Initial quotes."}</p>
      </div>
    </>
  )
}
