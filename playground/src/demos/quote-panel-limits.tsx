import { useState } from "react"
import { QuotePanel, type QuoteRow } from "@/registry/tradecn/blocks/quote-panel/quote-panel"
import type { InstrumentConvention } from "@/registry/tradecn/lib/format"
import type { Limits } from "@/registry/tradecn/lib/limits"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import type { ColumnState } from "@/registry/tradecn/ui/data-grid"

const convention: InstrumentConvention = { price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 }
const limits: Limits = { maxDistance: { ticks: 4, level: "confirm" }, maxQuantity: { confirm: 50_000_000, block: 100_000_000 } }

export default function QuotePanelLimitsDemo() {
  const [columnState, setColumnState] = useState<ColumnState>({ order: [], widths: { bidSize: 120 }, hidden: ["status", "skew", "width", "askSize", "actions"] })
  const [store] = useState(() => {
    const store = createRowStore<QuoteRow>({ getRowId: (row) => row.id })
    store.applyDeltas({ upsert: [
      { id: "2Y", instrument: "2Y Treasury", status: "Quoting", marketBid: 100.234375, marketAsk: 100.25, bid: 100.21875, ask: 100.265625, skew: 0, width: 3, bidSize: 5_000_000, askSize: 5_000_000, allowedActions: ["edit"] },
    ] })
    return store
  })
  return (
    <div className="h-40 w-fit max-w-full">
      <QuotePanel store={store} convention={convention} columnState={columnState} onColumnStateChange={setColumnState} limits={limits} onEdit={({ rowId, key, value }) => {
        store.applyDeltas({ patch: [{ id: rowId, fields: { [key]: value } }] })
      }} />
    </div>
  )
}
