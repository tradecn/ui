import { useState } from "react"
import { createInstrumentFormatter, formatDv01 } from "@/registry/tradecn/lib/format"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import { Positions, type PositionRow } from "@/registry/tradecn/ui/positions"

const note = createInstrumentFormatter({ price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 })
const price = (value: number, row: PositionRow) => row.instrument === "T 10Y" ? note.price(value) : value.toFixed(3)
const money = (value: number) => formatDv01(value, { compact: true })

export default function PositionsFormatsDemo() {
  const [store] = useState(() => {
    const store = createRowStore<PositionRow>({ getRowId: (row) => row.id })
    store.applyDeltas({ upsert: [
      { id: "TY", book: "Rates", instrument: "TY", position: 120, quantityUnit: "contracts", average: 110.281, mark: 110.5, dayPnl: 26_250, totalPnl: 41_000, risk: 8_400 },
      { id: "T10", book: "Rates", instrument: "T 10Y", position: -25_000_000, average: 99.5, mark: 99.515625, dayPnl: -3_906, totalPnl: -12_000, risk: -21_000 },
    ] })
    return store
  })
  return <div className="h-40 w-fit max-w-full"><Positions store={store} label="Formatted rates positions" riskHeader="DV01" price={price} pnl={money} risk={money} /></div>
}
