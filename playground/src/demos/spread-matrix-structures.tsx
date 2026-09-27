import { useState } from "react"
import type { InstrumentConvention } from "@/registry/tradecn/lib/format"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import { SpreadMatrix, SpreadMatrixTable, SpreadMatrixHead, SpreadMatrixStructureRow, SpreadMatrixLegs, SpreadMatrixStructureCell, type SpreadBasis, type SpreadInstrument, type SpreadStructure } from "@/registry/tradecn/ui/spread-matrix"

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

export function SpreadStructuresContent({ structures, basis = "ticks", label }: { structures: readonly SpreadStructure[]; basis?: SpreadBasis; label: string }) {
  const unit = basis === "ticks" ? "ticks" : "bp"
  return (
    <SpreadMatrixTable label={label}>
      <caption className="sr-only">Spread: {unit}.</caption>
      <thead>
        <tr>
          <SpreadMatrixHead className="text-left">Structure</SpreadMatrixHead>
          <SpreadMatrixHead className="text-left">Legs</SpreadMatrixHead>
          <SpreadMatrixHead>Spread ({unit})</SpreadMatrixHead>
        </tr>
      </thead>
      <tbody>
        {structures.map((structure) => (
          <SpreadMatrixStructureRow key={structure.id} structure={structure}>
            <SpreadMatrixHead scope="row">{structure.label}</SpreadMatrixHead>
            <SpreadMatrixLegs />
            <SpreadMatrixStructureCell />
          </SpreadMatrixStructureRow>
        ))}
      </tbody>
    </SpreadMatrixTable>
  )
}

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
  return <SpreadMatrix store={store} instruments={instruments} basis="bps" className="w-fit max-w-full"><SpreadStructuresContent structures={structures} basis="bps" label="Yield curves and butterflies" /></SpreadMatrix>
}
