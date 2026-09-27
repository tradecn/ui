import { createRef } from "react"
import userEvent from "@testing-library/user-event"
import { act, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NULL_TOKEN, type InstrumentConvention } from "@/registry/tradecn/lib/format"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import { SpreadMatrix, SpreadMatrixValue, useSpreadMatrixRow, useSpreadMatrixStructure, type SpreadBasis, SpreadMatrixTable, SpreadMatrixHead, SpreadMatrixRow, SpreadMatrixCell, SpreadMatrixStructureRow, SpreadMatrixLegs, SpreadMatrixStructureCell, type SpreadMatrixProps, defaultWeights, formatSpread, spreadBetween, structureSpread, type SpreadInstrument, type SpreadQuote, type SpreadStructure } from "@/registry/tradecn/ui/spread-matrix"

const T32: InstrumentConvention = { price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 }
const HALVES: InstrumentConvention = { price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 128 }

interface Quote extends SpreadQuote {
  id: string
}

const INSTRUMENTS: SpreadInstrument[] = [
  { id: "2Y", label: "2Y", convention: HALVES },
  { id: "5Y", label: "5Y", convention: T32 },
  { id: "10Y", label: "10Y", convention: T32 },
]

// 2Y at 100-08, 5Y at 99-24, 10Y at 99-16+; yields rising along the curve.
const QUOTES: Quote[] = [
  { id: "2Y", price: 100.25, yield: 4.25 },
  { id: "5Y", price: 99.75, yield: 4.125 },
  { id: "10Y", price: 99.515625, yield: 4.375 },
]

function seed(quotes: Quote[] = QUOTES) {
  const store = createRowStore<Quote>({ getRowId: (q) => q.id })
  store.applyDeltas({ upsert: quotes })
  return store
}

function MatrixPresentation<T extends object>({ label, columns, structures, labels = {}, ...props }: Omit<SpreadMatrixProps<T>, "children"> & { label: string; columns?: readonly SpreadInstrument[]; structures?: readonly SpreadStructure[]; labels?: { instrument?: string; ticks?: string; rule?: string } }) {
  const instruments = props.instruments
  const across = columns ?? instruments
  const unit = props.basis === "bps" ? "bp" : labels.ticks ?? "ticks"
  return <SpreadMatrix {...props} instruments={columns ? [...instruments, ...columns] : instruments} data-mode={structures ? "structures" : "matrix"}>
    {structures ? <SpreadMatrixTable label={label}>
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
    </SpreadMatrixTable> : <SpreadMatrixTable label={label}>
        <caption className="sr-only">{labels.rule ?? "Each cell is the row less the column."} {unit}.</caption>
        <thead>
          <tr>
            <SpreadMatrixHead className="text-left">{labels.instrument ?? "Instrument"} ({unit})</SpreadMatrixHead>
            {across.map((column) => <SpreadMatrixHead key={column.id} data-column={column.id}>{column.label}</SpreadMatrixHead>)}
          </tr>
        </thead>
        <tbody>
          {instruments.map((instrument) => (
            <SpreadMatrixRow key={instrument.id} instrument={instrument}>
              <SpreadMatrixHead scope="row">{instrument.label}</SpreadMatrixHead>
              {across.map((column) => <SpreadMatrixCell key={column.id} column={column.id} />)}
            </SpreadMatrixRow>
          ))}
        </tbody>
      </SpreadMatrixTable>}
  </SpreadMatrix>
}

const cell = (row: string, column: string) => document.querySelector<HTMLElement>(`td[data-row='${row}'][data-column='${column}']`)
const spreadOf = (structure: string) => document.querySelector<HTMLElement>(`tr[data-structure='${structure}'] td[data-spread]`)

let animate: ReturnType<typeof vi.fn>

beforeEach(() => {
  animate = vi.fn(() => ({ cancel: vi.fn(), currentTime: 0, onfinish: null }))
  Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, writable: true, value: animate })
})
afterEach(() => vi.restoreAllMocks())

describe("the arithmetic", () => {
  it("measures a spread in ticks of the given tick, to the nearest eighth, or in basis points from yields in percent", () => {
    expect(spreadBetween(99.515625, 99.5, "ticks", 1 / 64)).toBe(1)
    expect(spreadBetween(99.5, 99.515625, "ticks", 1 / 64)).toBe(-1)
    expect(spreadBetween(99.5, 99.515625, "ticks", 1 / 128)).toBe(-2)
    expect(spreadBetween(100.25, 99.75, "ticks", 1 / 64)).toBe(32)
    expect(spreadBetween(99.5, 99.5, "ticks", 1 / 64)).toBe(0)
    expect(spreadBetween(4.375, 4.25, "bps", 1 / 64)).toBe(12.5)
    expect(spreadBetween(4.1, 4.2, "bps", 1 / 64)).toBe(-10)
  })

  it("answers null for a missing side or a tick that is not positive", () => {
    expect(spreadBetween(null, 99.5, "ticks", 1 / 64)).toBeNull()
    expect(spreadBetween(99.5, undefined, "bps", 1 / 64)).toBeNull()
    expect(spreadBetween(NaN, 99.5, "ticks", 1 / 64)).toBeNull()
    expect(spreadBetween(99.5, 99.4, "ticks", 0)).toBeNull()
  })

  it("weights a structure's legs, the second less the first by default and the belly against the wings", () => {
    expect(defaultWeights(2)).toEqual([-1, 1])
    expect(defaultWeights(3)).toEqual([-1, 2, -1])
    expect(defaultWeights(4)).toEqual([])
    // 2s10s in basis points: 4.375 less 4.25.
    expect(structureSpread([4.25, 4.375], undefined, "bps", 1 / 64)).toBe(12.5)
    // 2s5s10s: twice the belly less the wings.
    expect(structureSpread([4.25, 4.125, 4.375], undefined, "bps", 1 / 64)).toBe(-37.5)
    // A price fly in ticks, and a custom weight that hedges a leg.
    expect(structureSpread([100.25, 99.75, 99.515625], undefined, "ticks", 1 / 64)).toBe(-17)
    expect(structureSpread([4.25, 4.375], [-2, 1], "bps", 1 / 64)).toBe(-412.5)
  })

  it("answers null for a structure with a missing leg or the wrong number of weights", () => {
    expect(structureSpread([4.25, null], undefined, "bps", 1 / 64)).toBeNull()
    expect(structureSpread([4.25, 4.375], [1], "bps", 1 / 64)).toBeNull()
    expect(structureSpread([], undefined, "bps", 1 / 64)).toBeNull()
  })

  it("prints a spread with its sign and no unit", () => {
    expect(formatSpread(1, "ticks")).toBe("+1")
    expect(formatSpread(-0.5, "ticks")).toBe("−0.5")
    expect(formatSpread(0, "ticks")).toBe("0")
    expect(formatSpread(12.5, "bps")).toBe("+12.5")
    expect(formatSpread(-0.75, "bps")).toBe("−0.8")
    expect(formatSpread(null, "bps")).toBe(NULL_TOKEN)
  })
})

describe("the matrix", () => {
  it("lays the instruments down the side and across the top, prints each cell as the row less the column with its sign, and leaves the diagonal blank", () => {
    render(<MatrixPresentation store={seed()} instruments={INSTRUMENTS} label="Curve" />)
    const table = screen.getByRole("table", { name: "Curve" })
    expect(table.closest("[data-slot='tradecn-spread-matrix']")).toHaveAttribute("data-basis", "ticks")
    expect(table.closest("[data-slot='tradecn-spread-matrix']")).toHaveAttribute("data-mode", "matrix")
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Instrument (ticks)", "2Y", "5Y", "10Y"])
    expect(screen.getAllByRole("rowheader").map((h) => h.textContent)).toEqual(["2Y", "5Y", "10Y"])
    expect(table.querySelector("caption")).toHaveTextContent("Each cell is the row less the column. ticks.")
    // 5Y over 10Y: 99-24 less 99-16+ is 7.5 32nds, 15 ticks of 1/64; the other way round is negative.
    expect(cell("5Y", "10Y")).toHaveTextContent("+15")
    expect(cell("10Y", "5Y")).toHaveTextContent("−15")
    // 2Y counts in its own tick of 1/128: 100-08 less 99-24 is half a point, 64 of them.
    expect(cell("2Y", "5Y")).toHaveTextContent("+64")
    expect(cell("5Y", "2Y")).toHaveTextContent("−32")
    for (const id of ["2Y", "5Y", "10Y"]) {
      expect(cell(id, id)).toHaveAttribute("data-diagonal", "")
      expect(cell(id, id)).toHaveTextContent("")
    }
    expect(cell("5Y", "10Y")).toHaveAttribute("data-numeric", "")
    expect(cell("5Y", "10Y")).not.toHaveAttribute("data-diagonal")
  })

  it("prints the null token where a quote is missing, and fills it in when the quote arrives", () => {
    const store = seed(QUOTES.slice(0, 2))
    render(<MatrixPresentation store={store} instruments={INSTRUMENTS} label="Curve" />)
    expect(cell("5Y", "10Y")).toHaveTextContent(NULL_TOKEN)
    expect(cell("10Y", "5Y")).toHaveTextContent(NULL_TOKEN)
    expect(cell("2Y", "5Y")).toHaveTextContent("+64")
    act(() => store.applyDeltas({ upsert: [QUOTES[2]!] }))
    expect(cell("5Y", "10Y")).toHaveTextContent("+15")
    expect(cell("10Y", "5Y")).toHaveTextContent("−15")
  })

  it("wakes only the cells a moved quote is part of, and flashes each by the direction the spread moved", () => {
    const store = seed()
    const format = vi.fn((value: number) => String(value))
    render(<MatrixPresentation store={store} instruments={INSTRUMENTS} label="Curve" format={format} />)
    format.mockClear()
    animate.mockClear()
    // 5Y cheapens a tick: its row's two cells and the two cells in its column reprint, four in all.
    act(() => store.applyDeltas({ patch: [{ id: "5Y", fields: { price: 99.734375 } }] }))
    expect(format).toHaveBeenCalledTimes(4)
    expect(animate).toHaveBeenCalledTimes(4)
    expect(cell("5Y", "10Y")).toHaveTextContent("14")
    expect(cell("5Y", "10Y")).toHaveAttribute("data-direction", "down")
    expect(cell("5Y", "2Y")).toHaveAttribute("data-direction", "down")
    expect(cell("10Y", "5Y")).toHaveTextContent("-14")
    expect(cell("10Y", "5Y")).toHaveAttribute("data-direction", "up")
    expect(cell("2Y", "5Y")).toHaveAttribute("data-direction", "up")
    expect(cell("2Y", "10Y")).not.toHaveAttribute("data-direction")
    expect(cell("5Y", "5Y")).not.toHaveAttribute("data-direction")
  })

  it("measures in basis points from the yields when asked, and reads another field through value", () => {
    const store = seed()
    const { rerender } = render(<MatrixPresentation store={store} instruments={INSTRUMENTS} basis="bps" label="Curve" />)
    expect(screen.getAllByRole("columnheader")[0]).toHaveTextContent("Instrument (bp)")
    expect(cell("10Y", "2Y")).toHaveTextContent("+12.5")
    expect(cell("2Y", "10Y")).toHaveTextContent("−12.5")
    expect(cell("5Y", "2Y")).toHaveTextContent("−12.5")
    // A consumer whose quotes carry the yield under another name reads it through value.
    const store2 = createRowStore<{ id: string; ytm: number }>({ getRowId: (q) => q.id })
    store2.applyDeltas({ upsert: [{ id: "2Y", ytm: 4 }, { id: "5Y", ytm: 4.1 }, { id: "10Y", ytm: 4.3 }] })
    rerender(<MatrixPresentation store={store2} instruments={INSTRUMENTS} basis="bps" label="Curve" value={(q) => q.ytm} />)
    expect(cell("10Y", "2Y")).toHaveTextContent("+30")
    expect(cell("5Y", "2Y")).toHaveTextContent("+10")
  })

  it("takes a different set across the top, with no diagonal when the ids differ", () => {
    const store = seed()
    const rows: SpreadInstrument[] = [INSTRUMENTS[0]!]
    const columns: SpreadInstrument[] = [INSTRUMENTS[1]!, INSTRUMENTS[2]!]
    render(<MatrixPresentation store={store} instruments={rows} columns={columns} label="Twos against the rest" />)
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Instrument (ticks)", "5Y", "10Y"])
    expect(screen.getAllByRole("rowheader").map((h) => h.textContent)).toEqual(["2Y"])
    expect(cell("2Y", "5Y")).toHaveTextContent("+64")
    expect(cell("2Y", "10Y")).toHaveTextContent("+94")
    expect(document.querySelector("td[data-diagonal]")).toBeNull()
  })

  it("takes its words from labels", () => {
    render(<MatrixPresentation store={seed()} instruments={INSTRUMENTS} label="Curve" labels={{ instrument: "Bond", ticks: "64ths", rule: "Row over column." }} />)
    expect(screen.getAllByRole("columnheader")[0]).toHaveTextContent("Bond (64ths)")
    expect(screen.getByRole("table").querySelector("caption")).toHaveTextContent("Row over column. 64ths.")
  })
})

describe("the structures", () => {
  const STRUCTURES: SpreadStructure[] = [
    { id: "2s10s", label: "2s10s", legs: ["2Y", "10Y"] },
    { id: "2s5s10s", label: "2s5s10s", legs: ["2Y", "5Y", "10Y"] },
    { id: "hedged", label: "5s10s hedged", legs: ["5Y", "10Y"], weights: [-1, 0.8] },
  ]

  it("lists curves and butterflies as rows, each the weighted sum of its legs, with the legs named", () => {
    render(<MatrixPresentation store={seed()} instruments={INSTRUMENTS} structures={STRUCTURES} basis="bps" label="Structures" />)
    const table = screen.getByRole("table", { name: "Structures" })
    expect(table.closest("[data-slot='tradecn-spread-matrix']")).toHaveAttribute("data-mode", "structures")
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Structure", "Legs", "Spread (bp)"])
    expect(screen.getAllByRole("rowheader").map((h) => h.textContent)).toEqual(["2s10s", "2s5s10s", "5s10s hedged"])
    expect(table.querySelector("caption")).toHaveTextContent("Spread: bp.")
    expect(spreadOf("2s10s")).toHaveTextContent("+12.5")
    expect(spreadOf("2s5s10s")).toHaveTextContent("−37.5")
    // 0.8 × 4.375 less 4.125 is −0.625, in basis points −62.5.
    expect(spreadOf("hedged")).toHaveTextContent("−62.5")
    expect(document.querySelector("tr[data-structure='2s10s'] td[data-legs]")).toHaveTextContent("2Y / 10Y")
    expect(document.querySelector("tr[data-structure='2s10s']")).toHaveAttribute("data-weights", "-1 1")
    expect(document.querySelector("tr[data-structure='2s5s10s']")).toHaveAttribute("data-weights", "-1 2 -1")
    expect(document.querySelector("tr[data-structure='hedged']")).toHaveAttribute("data-weights", "-1 0.8")
    expect(document.querySelector("td[data-column]")).toBeNull()
  })

  it("counts a price structure in the first leg's ticks unless the structure names its own", () => {
    const structures: SpreadStructure[] = [
      { id: "2s5s", label: "2s5s", legs: ["2Y", "5Y"] },
      { id: "2s5s-64", label: "2s5s in 64ths", legs: ["2Y", "5Y"], tick: 1 / 64 },
    ]
    render(<MatrixPresentation store={seed()} instruments={INSTRUMENTS} structures={structures} label="Structures" />)
    // 5Y less 2Y is half a point down: 64 of 2Y's 1/128 ticks, 32 of 1/64.
    expect(spreadOf("2s5s")).toHaveTextContent("−64")
    expect(spreadOf("2s5s-64")).toHaveTextContent("−32")
  })

  it("prints the null token for a structure with a leg the store lacks, and flashes the row when a leg moves", () => {
    const store = seed(QUOTES.slice(0, 2))
    render(<MatrixPresentation store={store} instruments={INSTRUMENTS} structures={STRUCTURES} basis="bps" label="Structures" />)
    expect(spreadOf("2s10s")).toHaveTextContent(NULL_TOKEN)
    expect(spreadOf("2s5s10s")).toHaveTextContent(NULL_TOKEN)
    animate.mockClear()
    act(() => store.applyDeltas({ upsert: [QUOTES[2]!] }))
    expect(spreadOf("2s10s")).toHaveTextContent("+12.5")
    // The curve steepens a basis point: its row flashes up, the fly (twice the belly less the wings) flashes down.
    act(() => store.applyDeltas({ patch: [{ id: "10Y", fields: { yield: 4.385 } }] }))
    expect(spreadOf("2s10s")).toHaveTextContent("+13.5")
    expect(spreadOf("2s10s")).toHaveAttribute("data-direction", "up")
    expect(spreadOf("2s5s10s")).toHaveAttribute("data-direction", "down")
  })
})

describe("public composition", () => {
  it("requires migration of released calls and accepts conditional compositions", () => {
    const store = seed()
    // @ts-expect-error Released minimal calls need explicit composition and a table label.
    const oldMinimal = <SpreadMatrix store={store} instruments={INSTRUMENTS} label="Curve" />
    // @ts-expect-error Using only retained props must not silently render an empty root.
    const retainedMinimal = <SpreadMatrix store={store} instruments={INSTRUMENTS} />
    // @ts-expect-error Retained configuration still requires children.
    const retainedConfigured = <SpreadMatrix store={store} instruments={INSTRUMENTS} basis="bps" format={formatSpread} flashWindowMs={300} />
    // @ts-expect-error Collection ownership moved to the caller.
    const oldColumns = <SpreadMatrix store={store} instruments={INSTRUMENTS} columns={INSTRUMENTS}>{null}</SpreadMatrix>
    // @ts-expect-error Structures are now explicit rows.
    const oldStructures = <SpreadMatrix store={store} instruments={INSTRUMENTS} structures={[]}>{null}</SpreadMatrix>
    // @ts-expect-error Words belong to the composition.
    const oldLabels = <SpreadMatrix store={store} instruments={INSTRUMENTS} labels={{ ticks: "64ths" }}>{null}</SpreadMatrix>
    // @ts-expect-error Tables require a composition.
    const emptyTable = <SpreadMatrixTable label="Curve" />
    // @ts-expect-error Rows require caller-owned cells.
    const emptyRow = <SpreadMatrixRow instrument={INSTRUMENTS[0]!} />
    // @ts-expect-error Structure rows require caller-owned cells.
    const emptyStructure = <SpreadMatrixStructureRow structure={{ id: "curve", label: "Curve", legs: ["2Y", "10Y"] }} />
    const conditional = <SpreadMatrix store={store} instruments={INSTRUMENTS}>{store.getIds().length > 0 && <SpreadMatrixTable label="Curve">{null}</SpreadMatrixTable>}</SpreadMatrix>
    expect([oldMinimal, retainedMinimal, retainedConfigured, oldColumns, oldStructures, oldLabels, emptyTable, emptyRow, emptyStructure, conditional]).toHaveLength(10)
  })

  it("supports reordered rectangular tables, application cells, native refs and keyboard controls", async () => {
    const store = seed()
    const root = createRef<HTMLDivElement>()
    const table = createRef<HTMLTableElement>()
    const row = createRef<HTMLTableRowElement>()
    const head = createRef<HTMLTableCellElement>()
    const reading = createRef<HTMLSpanElement>()
    const valueCell = createRef<HTMLTableCellElement>()
    const click = vi.fn()
    render(<SpreadMatrix ref={root} store={store} instruments={INSTRUMENTS}>
      <p>Benchmark comparison</p>
      <SpreadMatrixTable ref={table} label="Long maturities">
        <caption>Row less 2Y, in ticks.</caption>
        <thead><tr><SpreadMatrixHead>Spread (ticks)</SpreadMatrixHead><SpreadMatrixHead>Instrument</SpreadMatrixHead><SpreadMatrixHead>Desk</SpreadMatrixHead></tr></thead>
        <tbody>{INSTRUMENTS.slice(1).reverse().map((instrument) => <SpreadMatrixRow ref={row} key={instrument.id} instrument={instrument}>
          <SpreadMatrixCell ref={valueCell} column="2Y" title="Compare" className="custom-cell"><button onClick={click}><SpreadMatrixValue ref={reading} /></button></SpreadMatrixCell>
          <SpreadMatrixHead ref={head} scope="row">{instrument.label}</SpreadMatrixHead><td>Rates</td>
        </SpreadMatrixRow>)}</tbody>
      </SpreadMatrixTable>
    </SpreadMatrix>)
    expect(screen.getAllByRole("rowheader").map((node) => node.textContent)).toEqual(["10Y", "5Y"])
    expect(root.current).toHaveAttribute("data-slot", "tradecn-spread-matrix")
    expect(table.current).toBe(screen.getByRole("table"))
    expect(row.current).toHaveAttribute("data-row", "5Y")
    expect(head.current).toHaveAttribute("scope", "row")
    expect(reading.current).toHaveTextContent("−32")
    expect(valueCell.current).toHaveClass("custom-cell")
    expect(valueCell.current).toHaveAttribute("title", "Compare")
    const user = userEvent.setup()
    await user.tab()
    await user.keyboard("{Enter} ")
    expect(click).toHaveBeenCalledTimes(2)
    expect(screen.getAllByRole("button")[0]).toHaveFocus()
  })

  it("shares subscriptions between readings and removes every subscription and flash on unmount", () => {
    const store = seed()
    const original = store.subscribeRow
    const subscribe = vi.spyOn(store, "subscribeRow")
    const cleanups: (() => void)[] = []
    subscribe.mockImplementation((id, callback) => {
      const unsubscribe = vi.fn(original(id, callback))
      cleanups.push(unsubscribe)
      return unsubscribe
    })
    const { unmount } = render(<SpreadMatrix store={store} instruments={INSTRUMENTS}>
      <SpreadMatrixTable label="Readings"><tbody><SpreadMatrixRow instrument={INSTRUMENTS[0]!}><SpreadMatrixCell column="5Y"><SpreadMatrixValue /><SpreadMatrixValue /><RowReading /></SpreadMatrixCell></SpreadMatrixRow></tbody></SpreadMatrixTable>
    </SpreadMatrix>)
    expect(subscribe).toHaveBeenCalledTimes(2)
    animate.mockClear()
    act(() => store.applyDeltas({ patch: [{ id: "5Y", fields: { price: 99.734375 } }] }))
    expect(animate).toHaveBeenCalledTimes(1)
    expect(subscribe).toHaveBeenCalledTimes(2)
    const animation = animate.mock.results[0]!.value
    unmount()
    expect(animation.cancel).toHaveBeenCalled()
    for (const cleanup of cleanups) expect(cleanup).toHaveBeenCalledTimes(1)
  })

  it("keeps unchanged row values and unrelated structures quiet", () => {
    const store = seed()
    const format = vi.fn(formatSpread)
    const structures: SpreadStructure[] = [{ id: "2s10s", label: "2s10s", legs: ["2Y", "10Y"] }]
    render(<><MatrixPresentation store={store} instruments={INSTRUMENTS} label="Prices" format={format} /><MatrixPresentation store={store} instruments={INSTRUMENTS} structures={structures} label="Structures" format={format} /></>)
    format.mockClear()
    animate.mockClear()
    act(() => store.applyDeltas({ patch: [{ id: "5Y", fields: { yield: 4.13 } }] }))
    // Only the two off-diagonal column subscribers reprint; the unchanged row and unrelated structure stay quiet.
    expect(format).toHaveBeenCalledTimes(2)
    format.mockClear()
    expect(animate).not.toHaveBeenCalled()
    act(() => store.applyDeltas({ patch: [{ id: "5Y", fields: { price: 99.734375 } }] }))
    expect(format).toHaveBeenCalledTimes(4)
    expect(animate).toHaveBeenCalledTimes(4)
  })

  it("moves between two and three legs, changes weights and metadata, and handles deletion and arrival", () => {
    const store = seed()
    const structure: SpreadStructure = { id: "spread", label: "Spread", legs: ["2Y", "10Y"] }
    function Layout({ spec, instruments = INSTRUMENTS }: { spec: SpreadStructure; instruments?: SpreadInstrument[] }) {
      return <SpreadMatrix store={store} instruments={instruments} basis="bps"><SpreadMatrixTable label="Structures"><tbody><SpreadMatrixStructureRow structure={spec}>
        <SpreadMatrixStructureCell><strong><SpreadMatrixValue /></strong></SpreadMatrixStructureCell>
        <SpreadMatrixHead scope="row">{spec.label}<StructureReading /></SpreadMatrixHead>
      </SpreadMatrixStructureRow></tbody></SpreadMatrixTable></SpreadMatrix>
    }
    const { rerender } = render(<Layout spec={structure} />)
    expect(spreadOf("spread")).toHaveTextContent("+12.5")
    expect(screen.getByRole("rowheader")).toHaveTextContent("Spread2Y / 10Y")
    const fly: SpreadStructure = { ...structure, legs: ["2Y", "5Y", "10Y"] }
    rerender(<Layout spec={fly} />)
    expect(spreadOf("spread")).toHaveTextContent("−37.5")
    act(() => store.applyDeltas({ patch: [{ id: "5Y", fields: { yield: 4.13 } }] }))
    expect(spreadOf("spread")).toHaveTextContent("−36.5")
    rerender(<Layout spec={{ ...structure, weights: [-2, 1] }} instruments={INSTRUMENTS.map((i) => ({ ...i, label: `UST ${i.label}` }))} />)
    expect(spreadOf("spread")).toHaveTextContent("−412.5")
    expect(screen.getByRole("rowheader")).toHaveTextContent("UST 2Y / UST 10Y")
    act(() => store.applyDeltas({ remove: ["10Y"] }))
    expect(spreadOf("spread")).toHaveTextContent(NULL_TOKEN)
    expect(spreadOf("spread")).toHaveAttribute("data-direction", "flat")
    act(() => store.applyDeltas({ upsert: [QUOTES[2]!] }))
    expect(spreadOf("spread")).toHaveTextContent("−412.5")
  })

  it("keeps diagonal and missing defaults while permitting rich formatting and deliberate empty cells", () => {
    const store = seed()
    const format = vi.fn((value: number, basis: SpreadBasis) => <strong>{formatSpread(value, basis)}</strong>)
    const { rerender } = render(<MatrixPresentation store={store} instruments={INSTRUMENTS} label="Prices" format={format} />)
    expect(cell("5Y", "10Y")?.querySelector("strong")).toHaveTextContent("+15")
    expect(format).toHaveBeenCalledTimes(6)
    act(() => store.applyDeltas({ remove: ["10Y"] }))
    expect(cell("5Y", "10Y")).toHaveTextContent(NULL_TOKEN)
    expect(cell("10Y", "10Y")).toHaveTextContent("")
    rerender(<SpreadMatrix store={store} instruments={INSTRUMENTS}><SpreadMatrixTable label="Empty"><tbody><SpreadMatrixRow instrument={INSTRUMENTS[0]!}><SpreadMatrixCell column="5Y">{null}</SpreadMatrixCell></SpreadMatrixRow></tbody></SpreadMatrixTable></SpreadMatrix>)
    expect(cell("2Y", "5Y")).toHaveTextContent("")
  })

  it("allows static table parts without a store and reports misplaced coordinating parts", () => {
    const { unmount } = render(<SpreadMatrixTable label="No quotes"><thead><tr><SpreadMatrixHead>Instrument</SpreadMatrixHead></tr></thead><tbody><tr><td>No quotes.</td></tr></tbody></SpreadMatrixTable>)
    expect(screen.getByRole("table", { name: "No quotes" })).toBeInTheDocument()
    unmount()
    expect(() => render(<SpreadMatrixRow instrument={INSTRUMENTS[0]!}>{null}</SpreadMatrixRow>)).toThrow("inside SpreadMatrix")
    expect(() => render(<SpreadMatrix store={seed()} instruments={INSTRUMENTS}><SpreadMatrixValue /></SpreadMatrix>)).toThrow("inside SpreadMatrixCell")
  })
})

function RowReading() {
  const { instrument, value } = useSpreadMatrixRow()
  return <span>{instrument.label}: {value}</span>
}

function StructureReading() {
  const { legLabels } = useSpreadMatrixStructure()
  return <span>{legLabels.join(" / ")}</span>
}

describe("structure metadata and lifecycle", () => {
  it("uses the last metadata entry, falls back to leg ids, and needs a tick only in price mode", () => {
    const structure: SpreadStructure = { id: "curve", label: "Curve", legs: ["2Y", "10Y"] }
    const store = seed()
    const instruments = [INSTRUMENTS[0]!, { ...INSTRUMENTS[0]!, label: "Two year", convention: T32 }]
    const { rerender } = render(<MatrixPresentation store={store} instruments={instruments} structures={[structure]} label="Structures" />)
    expect(spreadOf("curve")).toHaveTextContent("−47")
    expect(document.querySelector("td[data-legs]")).toHaveTextContent("Two year / 10Y")
    rerender(<MatrixPresentation store={store} instruments={[]} structures={[structure]} label="Structures" />)
    expect(spreadOf("curve")).toHaveTextContent(NULL_TOKEN)
    rerender(<MatrixPresentation store={store} instruments={[]} structures={[{ ...structure, tick: 1 / 64 }]} label="Structures" />)
    expect(spreadOf("curve")).toHaveTextContent("−47")
    rerender(<MatrixPresentation store={store} instruments={[]} structures={[structure]} basis="bps" label="Structures" />)
    expect(spreadOf("curve")).toHaveTextContent("+12.5")
  })

  it("shares fixed leg subscriptions and one flash with extra readings, including when the curve becomes a fly", () => {
    const store = seed()
    const subscribe = vi.spyOn(store, "subscribeRow")
    const structure: SpreadStructure = { id: "curve", label: "Curve", legs: ["2Y", "10Y"] }
    function Layout({ spec }: { spec: SpreadStructure }) {
      return <SpreadMatrix store={store} instruments={INSTRUMENTS} basis="bps"><SpreadMatrixTable label="Structures"><tbody><SpreadMatrixStructureRow structure={spec}>
        <SpreadMatrixHead scope="row"><StructureReading /><StructureReading /></SpreadMatrixHead>
        <SpreadMatrixStructureCell><SpreadMatrixValue /><SpreadMatrixValue /></SpreadMatrixStructureCell>
      </SpreadMatrixStructureRow></tbody></SpreadMatrixTable></SpreadMatrix>
    }
    const { rerender, unmount } = render(<Layout spec={structure} />)
    expect(subscribe.mock.calls.map(([id]) => id)).toEqual(["2Y", "10Y", "10Y"])
    rerender(<Layout spec={{ ...structure, legs: ["2Y", "5Y", "10Y"] }} />)
    expect(subscribe.mock.calls.map(([id]) => id)).toEqual(["2Y", "10Y", "10Y", "5Y"])
    animate.mockClear()
    act(() => store.applyDeltas({ patch: [{ id: "5Y", fields: { yield: 4.13 } }] }))
    expect(animate).toHaveBeenCalledTimes(1)
    unmount()
    animate.mockClear()
    act(() => store.applyDeltas({ patch: [{ id: "5Y", fields: { yield: 4.14 } }] }))
    expect(animate).not.toHaveBeenCalled()
  })
})

describe("cell identity", () => {
  it.each(["row", "column"] as const)("resets a flash when the %s changes, without replacing the cell or its focused content", (changed) => {
    const store = seed()
    function Layout({ instrument = INSTRUMENTS[0]!, column = "5Y" }: { instrument?: SpreadInstrument; column?: string }) {
      return <SpreadMatrix store={store} instruments={INSTRUMENTS}><SpreadMatrixTable label="Pair"><tbody><SpreadMatrixRow instrument={instrument}>
        <SpreadMatrixCell column={column}><button><SpreadMatrixValue /></button></SpreadMatrixCell>
      </SpreadMatrixRow></tbody></SpreadMatrixTable></SpreadMatrix>
    }
    const { rerender } = render(<Layout />)
    const button = screen.getByRole("button")
    const td = button.closest("td")
    button.focus()
    act(() => store.applyDeltas({ patch: [{ id: "5Y", fields: { price: 99.734375 } }] }))
    expect(td).toHaveAttribute("data-direction", "up")
    const animation = animate.mock.results.at(-1)!.value
    rerender(changed === "row" ? <Layout instrument={INSTRUMENTS[1]!} /> : <Layout column="2Y" />)
    expect(screen.getByRole("button")).toBe(button)
    expect(button.closest("td")).toBe(td)
    expect(button).toHaveFocus()
    expect(td).toHaveAttribute("data-diagonal", "")
    expect(td).not.toHaveAttribute("data-direction")
    expect(animation.cancel).toHaveBeenCalled()
    expect(button).toHaveTextContent("")
    animate.mockClear()
    rerender(<Layout instrument={INSTRUMENTS[2]!} column="2Y" />)
    expect(button).toHaveTextContent("−47")
    expect(td).not.toHaveAttribute("data-direction")
    expect(animate).not.toHaveBeenCalled()
    act(() => store.applyDeltas({ patch: [{ id: "2Y", fields: { price: 100.265625 } }] }))
    expect(button).toHaveTextContent("−48")
    expect(td).toHaveAttribute("data-direction", "down")
  })
})
