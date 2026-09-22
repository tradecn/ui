import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { ContextMenuItem } from "@/components/ui/context-menu"
import { createInstrumentFormatter, formatDv01 } from "@/registry/tradecn/lib/format"
import { createRowStore, type RowStore } from "@/registry/tradecn/lib/row-store"
import { Positions, type PositionRow } from "@/registry/tradecn/ui/positions"

// Three books, one grid each, over a pretend server that marks positions and figures the P&L. The grid prints
// and adds and works nothing out. The buttons stand in for fills the server reports: a new position lands, a
// short is covered, and the totals under each book follow.

const T32 = createInstrumentFormatter({ price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 })
const price = (value: number, row: PositionRow) => (row.instrument.startsWith("T ") ? T32.price(value) : value.toFixed(3))
const pnl = (value: number) => formatDv01(value, { compact: true })

const BOOKS: Record<string, PositionRow[]> = {
  Futures: [
    { id: "TU", book: "Futures", instrument: "TU", position: 250, quantityUnit: "contracts", average: 102.734, mark: 102.75, dayPnl: 4_000, totalPnl: 18_500, risk: 9_200 },
    { id: "FV", book: "Futures", instrument: "FV", position: -180, quantityUnit: "contracts", average: 107.203, mark: 107.125, dayPnl: 14_000, totalPnl: -6_200, risk: -14_600 },
    { id: "TY", book: "Futures", instrument: "TY", position: 120, quantityUnit: "contracts", average: 110.281, mark: 110.5, dayPnl: 26_250, totalPnl: 41_000, risk: 8_400 },
    { id: "UXY", book: "Futures", instrument: "UXY", position: -40, quantityUnit: "contracts", average: 113.5, mark: 113.625, dayPnl: -5_000, totalPnl: -9_800, risk: -6_100 },
    { id: "US", book: "Futures", instrument: "US", position: 0, quantityUnit: "contracts", average: null, mark: 118.75, dayPnl: 0, totalPnl: 3_100, risk: 0 },
  ],
  Cash: [
    { id: "T2", book: "Cash", instrument: "T 4 1/4 02/15/29", position: 50_000_000, average: 100.25, mark: 100.28125, dayPnl: 15_625, totalPnl: 62_000, risk: 21_500 },
    { id: "T5", book: "Cash", instrument: "T 3 7/8 08/15/30", position: -15_000_000, average: 99.125, mark: 99.09375, dayPnl: 4_687, totalPnl: 1_200, risk: -13_400 },
    { id: "T10", book: "Cash", instrument: "T 4 1/8 05/15/34", position: -25_000_000, average: 99.5, mark: 99.515625, dayPnl: -3_906, totalPnl: -12_000, risk: -21_000 },
    { id: "T30", book: "Cash", instrument: "T 4 5/8 05/15/54", position: 10_000_000, average: 98.75, mark: 98.6875, dayPnl: -6_250, totalPnl: 8_750, risk: 19_800 },
  ],
  Swaps: [
    { id: "S5", book: "Swaps", instrument: "USD 5Y", position: 100_000_000, average: 3.842, mark: 3.851, dayPnl: -41_000, totalPnl: 12_500, risk: -45_500 },
    { id: "S10", book: "Swaps", instrument: "USD 10Y", position: -60_000_000, average: 3.915, mark: 3.902, dayPnl: 62_400, totalPnl: 88_000, risk: 48_000 },
  ],
}

let fills = 0

function useMarks(stores: Record<string, RowStore<PositionRow>>, running: boolean) {
  useEffect(() => {
    if (!running) return
    const t = setInterval(() => {
      for (const store of Object.values(stores)) {
        const id = store.getIds()[Math.floor(Math.random() * store.getIds().length)]
        const row = id ? store.getRow(id) : undefined
        if (!row || row.mark === null || row.mark === undefined) continue
        const tick = row.instrument.startsWith("T ") ? 1 / 64 : row.instrument.startsWith("USD") ? 0.001 : 1 / 128
        const move = (Math.random() < 0.5 ? -1 : 1) * tick
        const dv = row.quantityUnit === "contracts" ? row.position * 1000 * move : row.instrument.startsWith("USD") ? -(row.risk ?? 0) * (move / 0.0001) * 0.01 : (row.position / 100) * move
        store.applyDeltas({ patch: [{ id: row.id, fields: { mark: row.mark + move, dayPnl: (row.dayPnl ?? 0) + dv, totalPnl: (row.totalPnl ?? 0) + dv } }] })
      }
    }, 800)
    return () => clearInterval(t)
  }, [stores, running])
}

export function PositionsScene() {
  const [stores] = useState(() =>
    Object.fromEntries(
      Object.entries(BOOKS).map(([book, rows]) => {
        const store = createRowStore<PositionRow>({ getRowId: (r) => r.id })
        store.applyDeltas({ upsert: rows })
        return [book, store]
      }),
    ),
  )
  const [running, setRunning] = useState(true)
  const [log, setLog] = useState("")
  useMarks(stores, running)
  const futures = stores.Futures!
  const newPosition = () => {
    const id = `TN${++fills}`
    futures.applyDeltas({ upsert: [{ id, book: "Futures", instrument: `TN ${fills}`, position: 30, quantityUnit: "contracts", average: 115.5, mark: 115.5, dayPnl: 0, totalPnl: 0, risk: 4_200 }] })
    setLog(`the server reports a new position ${id}`)
  }
  const cover = () => {
    futures.applyDeltas({ patch: [{ id: "FV", fields: { position: 0, dayPnl: 15_200, risk: 0 } }] })
    setLog("the server reports FV covered: flat, its P&L realized")
  }
  return (
    <main className="flex h-screen flex-col gap-3 p-4 font-(family-name:--tradecn-font-mono) text-xs">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-sm font-semibold">positions</h1>
        <span className="text-muted-foreground">One grid per book; totals of what each shows under it. Marks move on the server and the P&L moves with them.</span>
        <span className="ml-auto text-muted-foreground">{log}</span>
        <Button type="button" variant="outline" size="sm" onClick={() => setRunning((r) => !r)}>
          {running ? "Pause marks" : "Run marks"}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={newPosition}>
          New position
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={cover}>
          Cover FV
        </Button>
      </div>
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-2">
        {Object.entries(stores).map(([book, store]) => (
          <div key={book} className="flex min-h-0 flex-col gap-1">
            <h2 className="font-semibold">{book}</h2>
            <div className="min-h-0 flex-1">
              <Positions
                store={store}
                label={`${book} positions`}
                riskHeader="DV01"
                price={price}
                pnl={pnl}
                risk={pnl}
                sort={{ key: "risk", dir: "desc" }}
                renderContextMenu={(rows) => (
                  <>
                    <ContextMenuItem onClick={() => setLog(`hedge ${rows.map((r) => r.instrument).join(", ")}: your ticket opens here`)}>Hedge</ContextMenuItem>
                    <ContextMenuItem onClick={() => setLog(`close ${rows.map((r) => r.instrument).join(", ")}: your ticket opens here`)}>Close</ContextMenuItem>
                  </>
                )}
              />
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}
