import { useState } from "react"
import { QuotePanel, type QuoteAction, type QuoteRow } from "@/registry/tradecn/blocks/quote-panel/quote-panel"
import type { InstrumentConvention } from "@/registry/tradecn/lib/format"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import type { ColumnState } from "@/registry/tradecn/ui/data-grid"

const convention: InstrumentConvention = { price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 }
const quotes: QuoteRow[] = [
  { id: "2Y", instrument: "2Y Treasury", status: "Quoting", marketBid: 100.234375, marketAsk: 100.25, bid: 100.21875, ask: 100.265625, allowedActions: ["edit", "pause", "pull"] },
  { id: "5Y", instrument: "5Y Treasury", status: "Paused", marketBid: 99.734375, marketAsk: 99.75, bid: 99.71875, ask: 99.765625, allowedActions: ["edit", "resume", "pull"] },
  { id: "10Y", instrument: "10Y Treasury", status: "Pulled", marketBid: 99.515625, marketAsk: 99.53125, bid: null, ask: null, allowedActions: ["resume"] },
]

export default function QuotePanelActionsDemo() {
  const [columnState, setColumnState] = useState<ColumnState>({ order: [], widths: {}, hidden: ["marketBid", "marketAsk", "skew", "width", "bidSize", "askSize"] })
  const [store] = useState(() => {
    const store = createRowStore<QuoteRow>({ getRowId: (row) => row.id })
    store.applyDeltas({ upsert: quotes })
    return store
  })
  const pull = (rows: QuoteRow[]) => {
    store.applyDeltas({ patch: rows.map((row) => ({ id: row.id, fields: { status: "Pulled", bid: null, ask: null, allowedActions: ["resume"] } })) })
  }
  const [actions] = useState<QuoteAction[]>(() => [
    { id: "pause", label: "Pause", run: (row) => {
      store.applyDeltas({ patch: [{ id: row.id, fields: { status: "Paused", allowedActions: ["edit", "resume", "pull"] } }] })
    } },
    { id: "resume", label: "Resume", run: (row) => {
      store.applyDeltas({ patch: [{ id: row.id, fields: { status: "Quoting", bid: row.marketBid, ask: row.marketAsk, allowedActions: ["edit", "pause", "pull"] } }] })
    } },
    { id: "pull", label: "Pull", destructive: true, run: (row) => pull([row]) },
  ])
  return (
    <div className="h-48 w-fit max-w-full">
      <QuotePanel store={store} convention={convention} columnState={columnState} onColumnStateChange={setColumnState} actions={actions} onPullAll={pull} onEdit={({ rowId, key, value }) => {
        store.applyDeltas({ patch: [{ id: rowId, fields: { [key]: value } }] })
      }} />
    </div>
  )
}
