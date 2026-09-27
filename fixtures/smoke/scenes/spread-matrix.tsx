import { useState } from "react"
import { SpreadMatrix, SpreadMatrixValue, useSpreadMatrixStructure, SpreadMatrixTable, SpreadMatrixHead, SpreadMatrixRow, SpreadMatrixCell, SpreadMatrixStructureRow, SpreadMatrixLegs, SpreadMatrixStructureCell, type SpreadBasis, type SpreadInstrument, type SpreadStructure } from "@/components/ui/spread-matrix"
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
  const [selected, setSelected] = useState("No selection")
  return (
    <div className="flex flex-col gap-1">
      <div className="w-[24rem]">
        <SpreadMatrix store={store} instruments={CURVE} basis={basis} flashWindowMs={3000}>
          <SpreadMatrixTable label="Curve spreads">
            <caption className="sr-only">Each cell is the row less the column. {basis === "ticks" ? "ticks" : "bp"}.</caption>
            <thead>
              <tr>
                <SpreadMatrixHead className="text-left">Instrument ({basis === "ticks" ? "ticks" : "bp"})</SpreadMatrixHead>
                {CURVE.map((column) => <SpreadMatrixHead key={column.id} data-column={column.id}>{column.label}</SpreadMatrixHead>)}
              </tr>
            </thead>
            <tbody>
              {CURVE.map((instrument) => (
                <SpreadMatrixRow key={instrument.id} instrument={instrument}>
                  <SpreadMatrixHead scope="row">{instrument.label}</SpreadMatrixHead>
                  {CURVE.map((column) => <SpreadMatrixCell key={column.id} column={column.id} />)}
                </SpreadMatrixRow>
              ))}
            </tbody>
          </SpreadMatrixTable>
        </SpreadMatrix>
      </div>
      <div className="w-[24rem]">
        <SpreadMatrix store={store} instruments={CURVE} basis="bps" flashWindowMs={3000}>
          <SpreadMatrixTable label="Curve structures">
            <caption className="sr-only">Spread: bp.</caption>
            <thead>
              <tr>
                <SpreadMatrixHead className="text-left">Structure</SpreadMatrixHead>
                <SpreadMatrixHead className="text-left">Legs</SpreadMatrixHead>
                <SpreadMatrixHead>Spread (bp)</SpreadMatrixHead>
              </tr>
            </thead>
            <tbody>
              {STRUCTURES.map((structure) => (
                <SpreadMatrixStructureRow key={structure.id} structure={structure}>
                  <SpreadMatrixHead scope="row">{structure.label}</SpreadMatrixHead>
                  <SpreadMatrixLegs />
                  <SpreadMatrixStructureCell />
                </SpreadMatrixStructureRow>
              ))}
            </tbody>
          </SpreadMatrixTable>
        </SpreadMatrix>
      </div>
      <SpreadMatrix store={store} instruments={CURVE} basis="bps" className="w-fit">
        <SpreadMatrixTable label="Alternate matrix">
          <caption>Row less 2Y, bp.</caption>
          <thead><tr><SpreadMatrixHead>Spread (bp)</SpreadMatrixHead><SpreadMatrixHead>Instrument</SpreadMatrixHead></tr></thead>
          <tbody>{CURVE.slice(1).reverse().map((instrument) => <SpreadMatrixRow key={instrument.id} instrument={instrument}>
            <SpreadMatrixCell column="2Y"><button onClick={() => setSelected(instrument.label)}><span className="sr-only">Select {instrument.label}: </span><SpreadMatrixValue /></button></SpreadMatrixCell>
            <SpreadMatrixHead scope="row">{instrument.label}</SpreadMatrixHead>
          </SpreadMatrixRow>)}</tbody>
        </SpreadMatrixTable>
        <SpreadMatrixTable label="Alternate structures">
          <caption>Weighted yields, bp.</caption>
          <thead><tr><SpreadMatrixHead>Spread (bp)</SpreadMatrixHead><SpreadMatrixHead>Structure</SpreadMatrixHead></tr></thead>
          <tbody>{STRUCTURES.toReversed().map((structure) => <SpreadMatrixStructureRow key={structure.id} structure={structure}>
            <SpreadMatrixStructureCell><strong><SpreadMatrixValue /></strong></SpreadMatrixStructureCell>
            <SpreadMatrixHead scope="row">{structure.label}<StructureLegs /></SpreadMatrixHead>
          </SpreadMatrixStructureRow>)}</tbody>
        </SpreadMatrixTable>
      </SpreadMatrix>
      <p role="status">{selected}</p>
      <button type="button" onClick={() => store.applyDeltas({ patch: [{ id: "10Y", fields: { price: 99.484375, yield: 4.385 } }] })}>
        10Y cheapens
      </button>
      <button type="button" onClick={() => setBasis((b) => (b === "ticks" ? "bps" : "ticks"))}>
        basis flips
      </button>
    </div>
  )
}

function StructureLegs() {
  const { legLabels } = useSpreadMatrixStructure()
  return <span className="block">{legLabels.join(" / ")}</span>
}
