import { useEffect, useState } from "react"
import { createInstrumentFormatter, formatDv01 } from "@/registry/tradecn/lib/format"
import { createRowStore, type RowStore } from "@/registry/tradecn/lib/row-store"
import { Positions, type PositionRow } from "@/registry/tradecn/ui/positions"

// Two books, one grid each, over one pretend server that marks the positions and figures the P&L. The grid
// prints and adds; it never multiplies a position by a mark. One grid per book because rows of one height
// are what keep the viewport still when a row arrives above the first visible one.

const T32 = createInstrumentFormatter({ price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 })
const price = (value: number, row: PositionRow) => (row.instrument.startsWith("T ") ? T32.price(value) : value.toFixed(3))
const pnl = (value: number) => formatDv01(value, { compact: true })

const BOOKS: Record<string, PositionRow[]> = {
  Futures: [
    { id: "TU", book: "Futures", instrument: "TU", position: 250, quantityUnit: "contracts", average: 102.734, mark: 102.75, dayPnl: 4_000, totalPnl: 18_500, risk: 9_200 },
    { id: "FV", book: "Futures", instrument: "FV", position: -180, quantityUnit: "contracts", average: 107.203, mark: 107.125, dayPnl: 14_000, totalPnl: -6_200, risk: -14_600 },
    { id: "TY", book: "Futures", instrument: "TY", position: 120, quantityUnit: "contracts", average: 110.281, mark: 110.5, dayPnl: 26_250, totalPnl: 41_000, risk: 8_400 },
    { id: "US", book: "Futures", instrument: "US", position: 0, quantityUnit: "contracts", average: null, mark: 118.75, dayPnl: 0, totalPnl: 3_100, risk: 0 },
  ],
  Cash: [
    { id: "T2", book: "Cash", instrument: "T 4 1/4 02/15/29", position: 50_000_000, average: 100.25, mark: 100.28125, dayPnl: 15_625, totalPnl: 62_000, risk: 21_500 },
    { id: "T10", book: "Cash", instrument: "T 4 1/8 05/15/34", position: -25_000_000, average: 99.5, mark: 99.515625, dayPnl: -3_906, totalPnl: -12_000, risk: -21_000 },
    { id: "T30", book: "Cash", instrument: "T 4 5/8 05/15/54", position: 10_000_000, average: 98.75, mark: 98.6875, dayPnl: -6_250, totalPnl: 8_750, risk: 19_800 },
  ],
}

// The pretend server: a mark moves a tick, and the P&L moves with it, on its side of the wire.
function useMarks(stores: Record<string, RowStore<PositionRow>>) {
  useEffect(() => {
    const t = setInterval(() => {
      for (const store of Object.values(stores)) {
        const id = store.getIds()[Math.floor(Math.random() * store.getIds().length)]
        const row = id ? store.getRow(id) : undefined
        if (!row || row.mark === null || row.mark === undefined) continue
        const tick = row.instrument.startsWith("T ") ? 1 / 64 : 1 / 128
        const move = (Math.random() < 0.5 ? -1 : 1) * tick
        const dv = row.quantityUnit === "contracts" ? row.position * 1000 * move : (row.position / 100) * move
        store.applyDeltas({ patch: [{ id: row.id, fields: { mark: row.mark + move, dayPnl: (row.dayPnl ?? 0) + dv, totalPnl: (row.totalPnl ?? 0) + dv } }] })
      }
    }, 1200)
    return () => clearInterval(t)
  }, [stores])
}

export default function PositionsDemo() {
  const [stores] = useState(() =>
    Object.fromEntries(
      Object.entries(BOOKS).map(([book, rows]) => {
        const store = createRowStore<PositionRow>({ getRowId: (r) => r.id })
        store.applyDeltas({ upsert: rows })
        return [book, store]
      }),
    ),
  )
  useMarks(stores)
  return (
    <div className="flex flex-col gap-4 font-(family-name:--tradecn-font-mono) text-xs">
      {Object.entries(stores).map(([book, store]) => (
        <div key={book} className="flex flex-col gap-1">
          <h2 className="font-semibold">{book}</h2>
          <div className="h-44">
            <Positions store={store} label={`${book} positions`} riskHeader="DV01" price={price} pnl={pnl} risk={pnl} />
          </div>
        </div>
      ))}
    </div>
  )
}
