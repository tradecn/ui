import { useEffect, useRef, useState } from "react"
import { QuotePanel, type QuoteRow } from "@/registry/tradecn/blocks/quote-panel/quote-panel"
import type { InstrumentConvention } from "@/registry/tradecn/lib/format"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import type { ColumnState, EditChange } from "@/registry/tradecn/ui/data-grid"

const convention: InstrumentConvention = { price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 }

export default function QuotePanelPendingDemo() {
  const [columnState, setColumnState] = useState<ColumnState>({ order: [], widths: { width: 260 }, hidden: ["marketBid", "marketAsk", "bid", "ask", "bidSize", "askSize", "actions"] })
  const [store] = useState(() => {
    const store = createRowStore<QuoteRow>({ getRowId: (row) => row.id })
    store.applyDeltas({ upsert: [
      { id: "2Y", instrument: "2Y Treasury", status: "Quoting", marketBid: 100.234375, marketAsk: 100.25, bid: 100.21875, ask: 100.265625, skew: 0, width: 3, bidSize: 5_000_000, askSize: 5_000_000, allowedActions: ["edit"] },
    ] })
    return store
  })
  const timers = useRef(new Map<ReturnType<typeof setTimeout>, () => void>())
  useEffect(() => {
    const pending = timers.current
    return () => {
      for (const [timer, resolve] of pending) { clearTimeout(timer); resolve() }
      pending.clear()
    }
  }, [])
  // Stand in for a server response: accept the edit after one second, or reject a width over 8.
  const onEdit = ({ rowId, key, value }: EditChange<QuoteRow>) => new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      timers.current.delete(timer)
      if (key === "width" && typeof value === "number" && value > 8) {
        reject(new Error("Risk declined a width over 8."))
        return
      }
      store.applyDeltas({ patch: [{ id: rowId, fields: { [key]: value } }] })
      resolve()
    }, 1000)
    timers.current.set(timer, resolve)
  })
  return <div className="h-40 w-fit max-w-full"><QuotePanel store={store} convention={convention} columnState={columnState} onColumnStateChange={setColumnState} onEdit={onEdit} /></div>
}
