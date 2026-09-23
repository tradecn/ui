import { useState } from "react"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import { Positions, type PositionRow } from "@/registry/tradecn/ui/positions"

const rows: PositionRow[] = [
  { id: "T2", book: "Cash", instrument: "T 2Y", position: 50_000_000, average: 100.25, mark: 100.28125, dayPnl: 15_625, totalPnl: 62_000, risk: 21_500 },
  { id: "T10", book: "Cash", instrument: "T 10Y", position: -25_000_000, average: 99.5, mark: 99.515625, dayPnl: -3_906, totalPnl: -12_000, risk: -21_000 },
  { id: "T30", book: "Cash", instrument: "T 30Y", position: 0, average: null, mark: 98.75, dayPnl: 0, totalPnl: null, risk: null },
]

export default function PositionsDemo() {
  const [store] = useState(() => {
    const store = createRowStore<PositionRow>({ getRowId: (row) => row.id })
    store.applyDeltas({ upsert: rows })
    return store
  })
  return <div className="h-48 w-fit max-w-full"><Positions store={store} label="Cash positions" riskHeader="DV01" /></div>
}
