import { useState } from "react"
import { Positions, type PositionRow } from "@/components/ui/positions"
import { createRowStore } from "@/lib/row-store"

const ROWS: PositionRow[] = [
  { id: "zn", book: "Rates", instrument: "ZN", position: 120, quantityUnit: "contracts", average: 110.25, mark: 110.5, dayPnl: 12_500, totalPnl: 30_000, risk: 8_400 },
  { id: "ty", book: "Rates", instrument: "T 4 1/8 05/15/34", position: -25_000_000, average: 99.5, mark: 99.25, dayPnl: -62_500, totalPnl: -12_000, risk: -21_000 },
  { id: "fv", book: "Rates", instrument: "FV", position: 0, quantityUnit: "contracts", average: null, mark: 107.125, dayPnl: 0, totalPnl: null, risk: null },
]

export function PositionsScene() {
  const [store] = useState(() => {
    const s = createRowStore<PositionRow>({ getRowId: (r) => r.id })
    s.applyDeltas({ upsert: ROWS })
    return s
  })
  return (
    <div className="flex flex-col gap-1">
      <div className="w-[52rem]" style={{ height: 160 }}>
        <Positions store={store} riskHeader="DV01" />
      </div>
      <button type="button" onClick={() => store.applyDeltas({ patch: [{ id: "ty", fields: { mark: 99.75, dayPnl: 62_500 } }] })}>
        mark moves
      </button>
    </div>
  )
}
