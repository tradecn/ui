import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import type { InstrumentConvention } from "@/registry/tradecn/lib/format"
import { createRowStore, type RowStore } from "@/registry/tradecn/lib/row-store"
import { SpreadMatrix, type SpreadBasis, type SpreadInstrument, type SpreadStructure } from "@/registry/tradecn/ui/spread-matrix"

// The cash curve as a spread matrix and as a list of structures, over one store of pretend quotes. A walk
// moves one note a tick every half second; the buttons move a chosen note by hand, switch the basis between
// ticks and basis points, and swap the matrix for the structures.

const T32: InstrumentConvention = { price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 }
const HALVES: InstrumentConvention = { price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 128 }

interface Quote {
  id: string
  price: number
  yield: number
}

const CURVE: SpreadInstrument[] = [
  { id: "2Y", label: "2Y", convention: HALVES },
  { id: "3Y", label: "3Y", convention: HALVES },
  { id: "5Y", label: "5Y", convention: T32 },
  { id: "7Y", label: "7Y", convention: T32 },
  { id: "10Y", label: "10Y", convention: T32 },
  { id: "30Y", label: "30Y", convention: T32 },
]
const STRUCTURES: SpreadStructure[] = [
  { id: "2s10s", label: "2s10s", legs: ["2Y", "10Y"] },
  { id: "5s30s", label: "5s30s", legs: ["5Y", "30Y"] },
  { id: "2s5s10s", label: "2s5s10s", legs: ["2Y", "5Y", "10Y"] },
  { id: "5s10s30s", label: "5s10s30s", legs: ["5Y", "10Y", "30Y"] },
]
const START: Quote[] = [
  { id: "2Y", price: 100.25, yield: 4.25 },
  { id: "3Y", price: 100.0625, yield: 4.2 },
  { id: "5Y", price: 99.75, yield: 4.125 },
  { id: "7Y", price: 99.625, yield: 4.25 },
  { id: "10Y", price: 99.515625, yield: 4.375 },
  { id: "30Y", price: 98.6875, yield: 4.625 },
]

function move(store: RowStore<Quote>, id: string, ticks: number) {
  const note = CURVE.find((i) => i.id === id)
  const quote = store.getRow(id)
  if (!note || !quote) return
  store.applyDeltas({ patch: [{ id, fields: { price: quote.price + ticks * note.convention.tick, yield: quote.yield - ticks * 0.004 } }] })
}

export function SpreadMatrixScene() {
  const [store] = useState(() => {
    const s = createRowStore<Quote>({ getRowId: (q) => q.id })
    s.applyDeltas({ upsert: START })
    return s
  })
  const [walking, setWalking] = useState(true)
  const [basis, setBasis] = useState<SpreadBasis>("ticks")
  const [mode, setMode] = useState<"matrix" | "structures">("matrix")
  const [note, setNote] = useState("10Y")
  const noteRef = useRef(note)
  useEffect(() => {
    noteRef.current = note
  })
  useEffect(() => {
    if (!walking) return
    const timer = setInterval(() => move(store, CURVE[Math.floor(Math.random() * CURVE.length)]!.id, Math.random() < 0.5 ? -1 : 1), 500)
    return () => clearInterval(timer)
  }, [store, walking])
  const pressed = "aria-pressed:bg-accent dark:aria-pressed:bg-accent"
  return (
    <main className="flex h-screen flex-col gap-3 p-4 text-xs">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-sm font-semibold">spread-matrix</h1>
        <span className="text-muted-foreground">Each cell is the row less the column, with its sign; a cell flashes when either leg moves.</span>
        <Button type="button" variant="outline" size="sm" className="ml-auto" onClick={() => setWalking((w) => !w)}>
          {walking ? "Pause the walk" : "Run the walk"}
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground">Basis</span>
        <Button type="button" variant="outline" size="sm" aria-pressed={basis === "ticks"} className={pressed} onClick={() => setBasis("ticks")}>
          ticks
        </Button>
        <Button type="button" variant="outline" size="sm" aria-pressed={basis === "bps"} className={pressed} onClick={() => setBasis("bps")}>
          basis points
        </Button>
        <span className="ml-3 text-muted-foreground">Show</span>
        <Button type="button" variant="outline" size="sm" aria-pressed={mode === "matrix"} className={pressed} onClick={() => setMode("matrix")}>
          the matrix
        </Button>
        <Button type="button" variant="outline" size="sm" aria-pressed={mode === "structures"} className={pressed} onClick={() => setMode("structures")}>
          the structures
        </Button>
        <span className="ml-3 text-muted-foreground">Move</span>
        <select aria-label="Note to move" value={note} onChange={(e) => setNote(e.target.value)} className="h-8 rounded-md border border-input bg-background px-2">
          {CURVE.map((i) => (
            <option key={i.id} value={i.id}>
              {i.label}
            </option>
          ))}
        </select>
        <Button type="button" variant="outline" size="sm" onClick={() => move(store, noteRef.current, 1)}>
          a tick richer
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => move(store, noteRef.current, -1)}>
          a tick cheaper
        </Button>
      </div>
      <SpreadMatrix store={store} instruments={CURVE} basis={basis} structures={mode === "structures" ? STRUCTURES : undefined} label={mode === "matrix" ? "Curve spreads" : "Curve structures"} className="w-fit" />
    </main>
  )
}
