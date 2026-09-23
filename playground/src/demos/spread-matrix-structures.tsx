import { useState } from "react"
import type { InstrumentConvention } from "@/registry/tradecn/lib/format"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import { SpreadMatrix, type SpreadInstrument, type SpreadStructure } from "@/registry/tradecn/ui/spread-matrix"

const T32: InstrumentConvention = { price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 }
const instruments: SpreadInstrument[] = [
  { id: "2Y", label: "2Y", convention: { ...T32, tick: 1 / 128 } },
  { id: "5Y", label: "5Y", convention: T32 },
  { id: "10Y", label: "10Y", convention: T32 },
]

const structures: SpreadStructure[] = [
  { id: "2s10s", label: "2s10s", legs: ["2Y", "10Y"] },
  { id: "2s5s10s", label: "2s5s10s", legs: ["2Y", "5Y", "10Y"] },
]

export default function SpreadMatrixStructuresDemo() {
  const [store] = useState(() => {
    const store = createRowStore<{ id: string; yield: number }>({ getRowId: (quote) => quote.id })
    store.applyDeltas({ upsert: [
      { id: "2Y", yield: 4.25 },
      { id: "5Y", yield: 4.125 },
      { id: "10Y", yield: 4.375 },
    ] })
    return store
  })
  return <SpreadMatrix store={store} instruments={instruments} structures={structures} basis="bps" label="Yield curves and butterflies" className="w-fit max-w-full" />
}
