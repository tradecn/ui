import { useState } from "react"
import { SpreadMatrix, type SpreadBasis, type SpreadInstrument, type SpreadStructure } from "@/components/ui/spread-matrix"
import type { InstrumentConvention } from "@/lib/format"
import { createRowStore } from "@/lib/row-store"

const T32: InstrumentConvention = { price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 }
const HALVES: InstrumentConvention = { price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 128 }

interface Quote {
  id: string
  price: number
  yield: number
}

// 2Y at 100-08 in 1/128ths, 5Y at 99-24 and 10Y at 99-16+ in 1/64ths; yields 4.25, 4.125, 4.375.
const CURVE: SpreadInstrument[] = [
  { id: "2Y", label: "2Y", convention: HALVES },
  { id: "5Y", label: "5Y", convention: T32 },
  { id: "10Y", label: "10Y", convention: T32 },
]
const STRUCTURES: SpreadStructure[] = [
  { id: "2s10s", label: "2s10s", legs: ["2Y", "10Y"] },
  { id: "2s5s10s", label: "2s5s10s", legs: ["2Y", "5Y", "10Y"] },
]
const QUOTES: Quote[] = [
  { id: "2Y", price: 100.25, yield: 4.25 },
  { id: "5Y", price: 99.75, yield: 4.125 },
  { id: "10Y", price: 99.515625, yield: 4.375 },
]

export function SpreadMatrixScene() {
  const [store] = useState(() => {
    const s = createRowStore<Quote>({ getRowId: (q) => q.id })
    s.applyDeltas({ upsert: QUOTES })
    return s
  })
  const [basis, setBasis] = useState<SpreadBasis>("ticks")
  return (
    <div className="flex flex-col gap-1">
      <div className="w-[24rem]">
        <SpreadMatrix store={store} instruments={CURVE} basis={basis} label="Curve spreads" flashWindowMs={3000} />
      </div>
      <div className="w-[24rem]">
        <SpreadMatrix store={store} instruments={CURVE} structures={STRUCTURES} basis="bps" label="Curve structures" flashWindowMs={3000} />
      </div>
      <button type="button" onClick={() => store.applyDeltas({ patch: [{ id: "10Y", fields: { price: 99.484375, yield: 4.385 } }] })}>
        10Y cheapens
      </button>
      <button type="button" onClick={() => setBasis((b) => (b === "ticks" ? "bps" : "ticks"))}>
        basis flips
      </button>
    </div>
  )
}
