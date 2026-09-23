import { useState } from "react"
import { QuotePanel, type QuoteRow } from "@/registry/tradecn/blocks/quote-panel/quote-panel"
import type { InstrumentConvention } from "@/registry/tradecn/lib/format"
import { createRowStore } from "@/registry/tradecn/lib/row-store"

const convention: InstrumentConvention = { price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 }
const quotes: QuoteRow[] = [
  { id: "2Y", instrument: "2Y Treasury", status: "Quoting", marketBid: 100.234375, marketAsk: 100.25, bid: 100.21875, ask: 100.265625, skew: 0, width: 3, bidSize: 5_000_000, askSize: 5_000_000, allowedActions: ["edit"] },
  { id: "10Y", instrument: "10Y Treasury", status: "Quoting", marketBid: 99.515625, marketAsk: 99.53125, bid: 99.5, ask: 99.5625, skew: 0.5, width: 4, bidSize: 10_000_000, askSize: 10_000_000, allowedActions: ["edit"] },
]

export default function QuotePanelDemo() {
  const [store] = useState(() => {
    const store = createRowStore<QuoteRow>({ getRowId: (row) => row.id })
    store.applyDeltas({ upsert: quotes })
    return store
  })
  return (
    <div className="h-40 w-fit max-w-full">
      <QuotePanel store={store} convention={convention} onEdit={({ rowId, key, value }) => {
        store.applyDeltas({ patch: [{ id: rowId, fields: { [key]: value } }] })
      }} />
    </div>
  )
}
