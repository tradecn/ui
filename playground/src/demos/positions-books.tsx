import { useState } from "react"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import { Positions, type PositionRow } from "@/registry/tradecn/ui/positions"

const futures: PositionRow[] = [
  { id: "TY", book: "Futures", instrument: "TY", position: 120, quantityUnit: "contracts", average: 110.25, mark: 110.5, dayPnl: 26_250, totalPnl: 41_000, risk: 8_400 },
]
const cash: PositionRow[] = [
  { id: "T10", book: "Cash", instrument: "T 10Y", position: -25_000_000, average: 99.5, mark: 99.515625, dayPnl: -3_906, totalPnl: -12_000, risk: -21_000 },
]

function Book({ name, rows }: { name: string; rows: PositionRow[] }) {
  const [store] = useState(() => {
    const store = createRowStore<PositionRow>({ getRowId: (row) => row.id })
    store.applyDeltas({ upsert: rows })
    return store
  })
  return (
    <section aria-label={`${name} book`} className="space-y-1">
      <h3 className="text-xs font-semibold">{name}</h3>
      <div className="h-32"><Positions store={store} label={`${name} positions`} riskHeader="DV01" /></div>
    </section>
  )
}

export default function PositionsBooksDemo() {
  return <div className="w-fit max-w-full space-y-4"><Book name="Futures" rows={futures} /><Book name="Cash" rows={cash} /></div>
}
