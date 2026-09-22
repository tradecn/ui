import { act, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import { Positions, formatPosition, positionSide, positionsColumns, positionsTotals, withSign, type PositionRow } from "@/registry/tradecn/ui/positions"

const ROWS: PositionRow[] = [
  { id: "zn", book: "Rates", instrument: "ZN", position: 120, quantityUnit: "contracts", average: 110.25, mark: 110.5, dayPnl: 12_500, totalPnl: 30_000, risk: 8_400 },
  { id: "ty", book: "Rates", instrument: "T 4 1/8 05/15/34", position: -25_000_000, average: 99.5, mark: 99.25, dayPnl: -62_500, totalPnl: -12_000, risk: -21_000 },
  { id: "fv", book: "Rates", instrument: "FV", position: 0, quantityUnit: "contracts", average: null, mark: 107.125, dayPnl: 0, totalPnl: null, risk: null },
]

const RECT = { width: 900, height: 200 }

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, writable: true, value: vi.fn(() => ({ cancel: vi.fn(), currentTime: 0, onfinish: null })) })
  for (const [prop, size] of [["offsetWidth", RECT.width], ["offsetHeight", RECT.height]] as const) {
    Object.defineProperty(HTMLElement.prototype, prop, {
      configurable: true,
      get(this: HTMLElement) {
        return this.classList.contains("overflow-auto") ? size : 0
      },
    })
  }
})
afterEach(() => vi.restoreAllMocks())

describe("the position's words", () => {
  it("prints the position signed in its unit, millions of notional or a count, and zero flat with no sign", () => {
    expect(formatPosition(ROWS[0]!)).toBe("+120")
    expect(formatPosition(ROWS[1]!)).toBe("−25mm")
    expect(formatPosition({ id: "x", instrument: "x", position: 2_500_000 })).toBe("+2.5mm")
    expect(formatPosition(ROWS[2]!)).toBe("0")
    expect(formatPosition({ id: "x", instrument: "x", position: -3, quantityUnit: "contracts" })).toBe("−3")
    expect(positionSide(120)).toBe("long")
    expect(positionSide(-1)).toBe("short")
    expect(positionSide(0)).toBe("flat")
  })

  it("lays out book, instrument, position, average, mark, both P&Ls, and the risk column under the desk's name", () => {
    const columns = positionsColumns({ riskHeader: "DV01" })
    expect(columns.map((c) => c.key)).toEqual(["book", "instrument", "position", "average", "mark", "dayPnl", "totalPnl", "risk"])
    expect(columns.find((c) => c.key === "instrument")).toMatchObject({ frozen: "left" })
    expect(columns.find((c) => c.key === "risk")?.header).toBe("DV01")
    expect(columns.find((c) => c.key === "dayPnl")?.format?.(-62_500, ROWS[1]!)).toBe("−62,500")
    expect(columns.find((c) => c.key === "mark")?.format?.(null, ROWS[2]!)).toBe("–")
  })

  it("totals the P&Ls and the risk of the rows shown, counts the positions, and leaves a total with nothing in it blank", () => {
    const totals = positionsTotals()
    expect(totals.instrument!(ROWS)).toBe("3 positions")
    expect(totals.instrument!([ROWS[0]!])).toBe("1 position")
    expect(totals.dayPnl!(ROWS)).toBe("−50,000")
    expect(totals.totalPnl!(ROWS)).toBe("+18,000")
    expect(totals.risk!(ROWS)).toBe("−12,600")
    expect(totals.risk!([ROWS[2]!])).toBe("–")
    expect(totals.position).toBeUndefined()
    // A formatter of the desk's that drops the plus gets it back, in a cell and in a total: the sign is the channel the color is not.
    const bp = positionsTotals({ pnl: (v) => `${v / 1000}k` })
    expect(bp.dayPnl!(ROWS)).toBe("-50k")
    expect(bp.totalPnl!(ROWS)).toBe("+18k")
    expect(withSign(4000, "$4.00K")).toBe("+$4.00K")
    expect(withSign(-4000, "-$4.00K")).toBe("-$4.00K")
    expect(withSign(0, "$0")).toBe("$0")
    expect(withSign(5, "+5")).toBe("+5")
  })
})

describe("Positions", () => {
  it("renders the book with the sign printed and the side named, colors by direction, and totals in the footer", () => {
    const store = createRowStore<PositionRow>({ getRowId: (r) => r.id })
    store.applyDeltas({ upsert: ROWS })
    render(<Positions store={store} riskHeader="DV01" initialRect={RECT} />)
    const grid = screen.getByRole("grid", { name: "Positions" })
    expect(document.querySelector("[data-slot='tradecn-positions']")).toBeInTheDocument()
    expect(grid).toHaveAttribute("data-preset", "blotter")
    expect(grid).not.toHaveAttribute("aria-multiselectable")
    const cell = (id: string, key: string) => document.querySelector<HTMLElement>(`[data-row-id="${id}"] [data-col="${key}"]`)!
    const position = cell("ty", "position").querySelector("[data-side]")!
    expect(position).toHaveTextContent("−25mm")
    expect(position).toHaveAttribute("data-side", "short")
    expect(position.className).toContain("text-down")
    expect(cell("zn", "position").querySelector("[data-side]")).toHaveAttribute("data-side", "long")
    expect(cell("zn", "position").querySelector("[data-side]")!.className).toContain("text-up")
    expect(cell("fv", "position").querySelector("[data-side]")).toHaveAttribute("data-side", "flat")
    expect(cell("zn", "dayPnl")).toHaveTextContent("+12,500")
    expect(cell("zn", "dayPnl").querySelector("span > span")!.className).toContain("text-up")
    expect(cell("ty", "totalPnl").querySelector("span > span")!.className).toContain("text-down")
    expect(cell("fv", "totalPnl")).toHaveTextContent("–")
    expect(cell("ty", "risk")).toHaveTextContent("−21,000")
    expect(screen.getByRole("columnheader", { name: /DV01/ })).toBeInTheDocument()
    // The row names its side to a screen reader; a flat one says nothing.
    expect(document.querySelector("[data-row-id='ty']")).toHaveAttribute("data-state", "short")
    expect(document.querySelector("[data-row-id='ty']")).toHaveAttribute("aria-description", "short")
    expect(document.querySelector("[data-row-id='fv']")).toHaveAttribute("data-state", "flat")
    expect(document.querySelector("[data-row-id='fv']")).not.toHaveAttribute("aria-description")
    // The footer: totals of what is shown, recomputed when a mark moves the P&L.
    const footer = grid.querySelector("[data-grid-footer]")!
    expect(footer.querySelector("[data-col='instrument']")).toHaveTextContent("3 positions")
    expect(footer.querySelector("[data-col='dayPnl']")).toHaveTextContent("−50,000")
    expect(footer.querySelector("[data-col='position']")).toHaveTextContent("")
    act(() => store.applyDeltas({ patch: [{ id: "ty", fields: { mark: 99.75, dayPnl: 62_500 } }] }))
    expect(footer.querySelector("[data-col='dayPnl']")).toHaveTextContent("+75,000")
    expect(cell("ty", "dayPnl")).toHaveTextContent("+62,500")
  })

  it("takes the desk's own formats and totals, and none at all", () => {
    const store = createRowStore<PositionRow>({ getRowId: (r) => r.id })
    store.applyDeltas({ upsert: ROWS })
    const { rerender } = render(<Positions store={store} initialRect={RECT} pnl={(v) => `${Math.round(v / 1000)}k`} price={(v) => v.toFixed(3)} totals={{ dayPnl: () => "custom" }} />)
    const grid = screen.getByRole("grid", { name: "Positions" })
    expect(document.querySelector("[data-row-id='zn'] [data-col='dayPnl']")).toHaveTextContent("+13k")
    expect(document.querySelector("[data-row-id='zn'] [data-col='mark']")).toHaveTextContent("110.500")
    expect(grid.querySelector("[data-grid-footer] [data-col='dayPnl']")).toHaveTextContent("custom")
    rerender(<Positions store={store} initialRect={RECT} totals={false} />)
    expect(grid.querySelector("[data-grid-footer]")).toBeNull()
  })
})
