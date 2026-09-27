import { useState } from "react"
import type { InstrumentConvention } from "@/registry/tradecn/lib/format"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import { SpreadMatrix, SpreadMatrixTable, SpreadMatrixHead, SpreadMatrixRow, SpreadMatrixCell, type SpreadBasis, type SpreadInstrument } from "@/registry/tradecn/ui/spread-matrix"

const T32: InstrumentConvention = { price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 }
const instruments: SpreadInstrument[] = [
  { id: "2Y", label: "2Y", convention: { ...T32, tick: 1 / 128 } },
  { id: "5Y", label: "5Y", convention: T32 },
  { id: "10Y", label: "10Y", convention: T32 },
]

export function SpreadMatrixContent({ instruments, columns = instruments, basis = "ticks", label }: { instruments: readonly SpreadInstrument[]; columns?: readonly SpreadInstrument[]; basis?: SpreadBasis; label: string }) {
  const unit = basis === "ticks" ? "ticks" : "bp"
  return (
    <SpreadMatrixTable label={label}>
      <caption className="sr-only">Each cell is the row less the column. {unit}.</caption>
      <thead>
        <tr>
          <SpreadMatrixHead className="text-left">Instrument ({unit})</SpreadMatrixHead>
          {columns.map((column) => <SpreadMatrixHead key={column.id} data-column={column.id}>{column.label}</SpreadMatrixHead>)}
        </tr>
      </thead>
      <tbody>
        {instruments.map((instrument) => (
          <SpreadMatrixRow key={instrument.id} instrument={instrument}>
            <SpreadMatrixHead scope="row">{instrument.label}</SpreadMatrixHead>
            {columns.map((column) => <SpreadMatrixCell key={column.id} column={column.id} />)}
          </SpreadMatrixRow>
        ))}
      </tbody>
    </SpreadMatrixTable>
  )
}

export default function SpreadMatrixYieldsDemo() {
  const [store] = useState(() => {
    const store = createRowStore<{ id: string; yield: number }>({ getRowId: (quote) => quote.id })
    store.applyDeltas({ upsert: [
      { id: "2Y", yield: 4.25 },
      { id: "5Y", yield: 4.125 },
      { id: "10Y", yield: 4.375 },
    ] })
    return store
  })
  return <SpreadMatrix store={store} instruments={instruments} basis="bps" className="w-fit max-w-full"><SpreadMatrixContent instruments={instruments} basis="bps" label="Yield spreads" /></SpreadMatrix>
}
