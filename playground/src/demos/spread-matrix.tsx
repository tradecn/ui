import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import type { InstrumentConvention } from "@/registry/tradecn/lib/format"
import { createRowStore, type RowStore } from "@/registry/tradecn/lib/row-store"
import { SpreadMatrix, type SpreadBasis, type SpreadInstrument, type SpreadStructure } from "@/registry/tradecn/ui/spread-matrix"

// The cash curve as a spread matrix: four Treasuries down the side and across the top, each cell the row
// less the column, in ticks of the row's price or in basis points of yield, and under it the desk's
// structures, two curves and a butterfly, as weighted legs. A pretend feed moves one note every half
// second; the cells that note is part of flash by the direction the spread moved, and the sign is
// printed, so the flash is never the only word.

const T32: InstrumentConvention = { price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 }
const HALVES: InstrumentConvention = { price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 128 }

interface Quote {
  id: string
  price: number
  yield: number
}

const CURVE: SpreadInstrument[] = [
  { id: "2Y", label: "2Y", convention: HALVES },
  { id: "5Y", label: "5Y", convention: T32 },
  { id: "10Y", label: "10Y", convention: T32 },
  { id: "30Y", label: "30Y", convention: T32 },
]
const STRUCTURES: SpreadStructure[] = [
  { id: "2s10s", label: "2s10s", legs: ["2Y", "10Y"] },
  { id: "5s30s", label: "5s30s", legs: ["5Y", "30Y"] },
  { id: "2s5s10s", label: "2s5s10s", legs: ["2Y", "5Y", "10Y"] },
]
const START: Quote[] = [
  { id: "2Y", price: 100.25, yield: 4.25 },
  { id: "5Y", price: 99.75, yield: 4.125 },
  { id: "10Y", price: 99.515625, yield: 4.375 },
  { id: "30Y", price: 98.6875, yield: 4.625 },
]

// The pretend feed: one note a tick richer or cheaper every half second, its yield the other way.
function useCurve(store: RowStore<Quote>) {
  useEffect(() => {
    const timer = setInterval(() => {
      const note = CURVE[Math.floor(Math.random() * CURVE.length)]!
      const quote = store.getRow(note.id)
      if (!quote) return
      const ticks = Math.random() < 0.5 ? -1 : 1
      store.applyDeltas({ patch: [{ id: note.id, fields: { price: quote.price + ticks * note.convention.tick, yield: quote.yield - ticks * 0.004 } }] })
    }, 500)
    return () => clearInterval(timer)
  }, [store])
}

export default function SpreadMatrixDemo() {
  const [store] = useState(() => {
    const s = createRowStore<Quote>({ getRowId: (q) => q.id })
    s.applyDeltas({ upsert: START })
    return s
  })
  useCurve(store)
  const [basis, setBasis] = useState<SpreadBasis>("ticks")
  return (
    <div className="flex flex-col gap-2 text-xs">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">Spreads in</span>
        <Button type="button" variant="outline" size="sm" aria-pressed={basis === "ticks"} className="aria-pressed:bg-accent dark:aria-pressed:bg-accent" onClick={() => setBasis("ticks")}>
          ticks
        </Button>
        <Button type="button" variant="outline" size="sm" aria-pressed={basis === "bps"} className="aria-pressed:bg-accent dark:aria-pressed:bg-accent" onClick={() => setBasis("bps")}>
          basis points
        </Button>
      </div>
      <SpreadMatrix store={store} instruments={CURVE} basis={basis} label="Curve spreads" className="w-fit" />
      <SpreadMatrix store={store} instruments={CURVE} structures={STRUCTURES} basis={basis} label="Curve structures" className="w-fit" />
    </div>
  )
}
