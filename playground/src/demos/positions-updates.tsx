import { useState } from "react"
import { createRowStore, type DeltaBatch } from "@/registry/tradecn/lib/row-store"
import { Positions, type PositionRow } from "@/registry/tradecn/ui/positions"

const rows: PositionRow[] = [
  { id: "T2", book: "Cash", instrument: "T 2Y", position: 50_000_000, average: 100.25, mark: 100.28125, dayPnl: 15_625, totalPnl: 62_000, risk: 21_500 },
  { id: "T10", book: "Cash", instrument: "T 10Y", position: -25_000_000, average: 99.5, mark: 99.515625, dayPnl: -3_906, totalPnl: -12_000, risk: -21_000 },
]
const updates: { message: string; batch: DeltaBatch<PositionRow> }[] = [
  { message: "Mark updated; P&L and risk unchanged.", batch: { patch: [{ id: "T10", fields: { mark: 99.53125 } }] } },
  { message: "Server P&L and risk applied.", batch: { patch: [{ id: "T10", fields: { dayPnl: -3_000, totalPnl: -11_000, risk: -20_500 } }] } },
]

export default function PositionsUpdatesDemo() {
  const [store] = useState(() => {
    const store = createRowStore<PositionRow>({ getRowId: (row) => row.id })
    store.applyDeltas({ upsert: rows })
    return store
  })
  const [step, setStep] = useState(0)
  const advance = () => {
    const update = updates[step]
    if (!update) return
    store.applyDeltas(update.batch)
    setStep(step + 1)
  }
  const restore = () => {
    store.applyDeltas({ upsert: rows })
    setStep(0)
  }
  return (
    <>
      <div data-demo-controls className="flex flex-wrap gap-2 text-xs">
        <button type="button" className="rounded border px-2 py-1 disabled:opacity-50" disabled={step === updates.length} onClick={advance}>Apply next server batch</button>
        <button type="button" className="rounded border px-2 py-1" onClick={restore}>Restore book</button>
      </div>
      <div className="w-fit max-w-full space-y-2 text-xs lining-nums tabular-nums">
        <div className="h-40"><Positions store={store} label="Updated cash positions" riskHeader="DV01" /></div>
        <p role="status" className="text-muted-foreground">{updates[step - 1]?.message ?? "Initial book."}</p>
      </div>
    </>
  )
}
