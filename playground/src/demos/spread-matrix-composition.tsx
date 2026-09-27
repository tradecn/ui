import { useState } from "react"
import type { InstrumentConvention } from "@/registry/tradecn/lib/format"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import {
  SpreadMatrix,
  SpreadMatrixTable,
  SpreadMatrixHead,
  SpreadMatrixRow,
  SpreadMatrixCell,
  SpreadMatrixStructureRow,
  SpreadMatrixStructureCell,
  SpreadMatrixValue,
  useSpreadMatrixCell,
  useSpreadMatrixStructure,
  type SpreadInstrument,
  type SpreadStructure,
} from "@/registry/tradecn/ui/spread-matrix"

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
const rows = instruments.slice(1).reverse()

function SpreadReadingButton({ label, onSelect }: { label: string; onSelect: () => void }) {
  const { spread, diagonal } = useSpreadMatrixCell()
  return <button type="button" disabled={spread === null || diagonal} onClick={onSelect} className="rounded px-1 underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"><span className="sr-only">{label}: </span><SpreadMatrixValue /></button>
}

function StructureLegDescription() {
  const { legLabels } = useSpreadMatrixStructure()
  return <span className="block text-muted-foreground">{legLabels.join(" / ")}</span>
}

export default function SpreadMatrixCompositionDemo() {
  const [store] = useState(() => {
    const store = createRowStore<{ id: string; yield: number }>({ getRowId: (quote) => quote.id })
    store.applyDeltas({ upsert: [{ id: "2Y", yield: 4.25 }, { id: "5Y", yield: 4.125 }, { id: "10Y", yield: 4.375 }] })
    return store
  })
  const [selected, setSelected] = useState("No spread selected.")
  return (
    <div className="w-fit max-w-full space-y-2 text-xs lining-nums tabular-nums">
      <SpreadMatrix store={store} instruments={instruments} basis="bps" className="space-y-4 p-2">
        <SpreadMatrixTable label="Long maturities against 2Y">
          <caption className="pb-2 text-left">Row less 2Y, in bp.</caption>
          <thead><tr><SpreadMatrixHead className="text-left">Instrument</SpreadMatrixHead><SpreadMatrixHead>Spread (bp)</SpreadMatrixHead></tr></thead>
          <tbody>
            {rows.map((instrument) => (
              <SpreadMatrixRow key={instrument.id} instrument={instrument}>
                <SpreadMatrixHead scope="row">{instrument.label}</SpreadMatrixHead>
                <SpreadMatrixCell column="2Y"><SpreadReadingButton label={`Select ${instrument.label} over 2Y`} onSelect={() => setSelected(`${instrument.label} over 2Y selected.`)} /></SpreadMatrixCell>
              </SpreadMatrixRow>
            ))}
          </tbody>
        </SpreadMatrixTable>
        <SpreadMatrixTable label="Selected curves and butterflies">
          <caption className="pb-2 text-left">Weighted yield spreads, in bp.</caption>
          <thead><tr><SpreadMatrixHead className="text-left">Structure and legs</SpreadMatrixHead><SpreadMatrixHead>Spread (bp)</SpreadMatrixHead></tr></thead>
          <tbody>
            {structures.toReversed().map((structure) => (
              <SpreadMatrixStructureRow key={structure.id} structure={structure}>
                <SpreadMatrixHead scope="row">{structure.label}<StructureLegDescription /></SpreadMatrixHead>
                <SpreadMatrixStructureCell><strong><SpreadMatrixValue /></strong></SpreadMatrixStructureCell>
              </SpreadMatrixStructureRow>
            ))}
          </tbody>
        </SpreadMatrixTable>
      </SpreadMatrix>
      <p role="status">{selected}</p>
    </div>
  )
}
