import { useState } from "react"
import type { InstrumentConvention } from "@/registry/tradecn/lib/format"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import {
  SpreadMatrix,
  SpreadMatrixTable,
  SpreadMatrixHead,
  SpreadMatrixRow,
  SpreadMatrixCell,
  type SpreadInstrument,
} from "@/registry/tradecn/ui/spread-matrix"

const T32: InstrumentConvention = { price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 }
const instruments: SpreadInstrument[] = [
  { id: "2Y", label: "2Y", convention: { ...T32, tick: 1 / 128 } },
  { id: "5Y", label: "5Y", convention: T32 },
  { id: "10Y", label: "10Y", convention: T32 },
]

export default function SpreadMatrixDemo() {
  const [store] = useState(() => {
    const store = createRowStore<{ id: string; price: number }>({ getRowId: (quote) => quote.id })
    store.applyDeltas({ upsert: [
      { id: "2Y", price: 100.25 },
      { id: "5Y", price: 99.75 },
      { id: "10Y", price: 99.515625 },
    ] })
    return store
  })
  return (
    <SpreadMatrix store={store} instruments={instruments} className="w-fit max-w-full">
      <SpreadMatrixTable label="Price spreads">
        <caption className="sr-only">Each cell is the row less the column. ticks.</caption>
        <thead>
          <tr>
            <SpreadMatrixHead className="text-left">Instrument (ticks)</SpreadMatrixHead>
            {instruments.map((column) => <SpreadMatrixHead key={column.id} data-column={column.id}>{column.label}</SpreadMatrixHead>)}
          </tr>
        </thead>
        <tbody>
          {instruments.map((instrument) => (
            <SpreadMatrixRow key={instrument.id} instrument={instrument}>
              <SpreadMatrixHead scope="row">{instrument.label}</SpreadMatrixHead>
              {instruments.map((column) => <SpreadMatrixCell key={column.id} column={column.id} />)}
            </SpreadMatrixRow>
          ))}
        </tbody>
      </SpreadMatrixTable>
    </SpreadMatrix>
  )
}
