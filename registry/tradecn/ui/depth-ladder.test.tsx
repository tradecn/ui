import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { InstrumentConvention } from "@/registry/tradecn/lib/format"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import { DepthLadder, levelId, priceAtTick, tickIndexOf, type DepthLevel, type LadderStage } from "@/registry/tradecn/ui/depth-ladder"

const ZN: InstrumentConvention = { price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 }
const MID = 99.515625 // 99-16+, tick 6369
const RECT = { width: 480, height: 300 }

// 99-15+ to 99-17+ around an empty mid rung: bids below, offers above, the desk resting on both sides.
const LEVELS: DepthLevel[] = [
  { tick: 6368, bidSize: 120, myBid: 5 },
  { tick: 6367, bidSize: 80 },
  { tick: 6370, askSize: 95 },
  { tick: 6371, askSize: 40, myAsk: 10 },
]

function seed() {
  const store = createRowStore<DepthLevel>({ getRowId: (level) => levelId(level.tick) })
  store.applyDeltas({ upsert: LEVELS })
  return store
}

const rung = (tick: number) => document.querySelector<HTMLElement>(`[data-tick='${tick}']`)
const cell = (tick: number, col: string) => rung(tick)?.querySelector<HTMLElement>(`[data-col='${col}']`)

let animate: ReturnType<typeof vi.fn>

beforeEach(() => {
  animate = vi.fn(() => ({ cancel: vi.fn(), currentTime: 0, onfinish: null }))
  Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, writable: true, value: animate })
  // The virtualizer reads offsetWidth/offsetHeight of its scroll box; happy-dom lays nothing out.
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

describe("prices and ticks", () => {
  it("converts a price to its tick index and back on a fraction grid and a decimal one", () => {
    expect(tickIndexOf(MID, 1 / 64)).toBe(6369)
    expect(priceAtTick(6369, 1 / 64)).toBe(99.515625)
    expect(levelId(6369)).toBe("6369")
    expect(tickIndexOf(99.517, 0.001)).toBe(99517)
    expect(priceAtTick(99517, 0.001)).toBe(99.517)
    expect(priceAtTick(tickIndexOf(110.484375, 1 / 64), 1 / 64)).toBe(110.484375)
  })
})

describe("the ladder", () => {
  it("builds the rungs around the mid, high to low, prints each price in the convention, and marks the mid", () => {
    render(<DepthLadder store={seed()} convention={ZN} mid={MID} label="ZN ladder" depth={4} initialRect={RECT} />)
    const grid = screen.getByRole("grid", { name: "ZN ladder" })
    // Nine rungs and the header.
    expect(grid).toHaveAttribute("aria-rowcount", "10")
    expect(grid).toHaveAttribute("aria-colcount", "3")
    expect(grid).toHaveAttribute("data-following", "true")
    expect(rung(6373)).toHaveAttribute("aria-rowindex", "2")
    expect(rung(6365)).toHaveAttribute("aria-rowindex", "10")
    expect(rung(6364)).toBeNull()
    expect(cell(6368, "price")).toHaveTextContent("99-16")
    expect(cell(6369, "price")).toHaveTextContent("99-16+")
    expect(cell(6370, "price")).toHaveTextContent("99-17")
    expect(rung(6369)).toHaveAttribute("data-mid", "")
    expect(rung(6369)).toHaveAttribute("aria-description", "Mid")
    expect(rung(6368)).not.toHaveAttribute("data-mid")
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Bid", "Price", "Ask"])
    expect(screen.queryByRole("button", { name: "Recenter" })).toBeNull()
  })

  it("prints the bid size left of the price and the ask size right, marks the desk's own size, and leaves an empty rung blank", () => {
    const store = seed()
    render(<DepthLadder store={store} convention={ZN} mid={MID} label="ZN ladder" depth={4} initialRect={RECT} />)
    const bid = cell(6368, "bid")!
    expect(bid).toHaveAttribute("data-side", "bid")
    expect(bid).toHaveAttribute("aria-colindex", "1")
    expect(bid.querySelector("[data-mine-size]")).toHaveTextContent("5 yours")
    expect(bid).toHaveTextContent("5 yours120")
    expect(rung(6368)).toHaveAttribute("data-mine", "bid")
    expect(cell(6368, "ask")).toHaveTextContent("")
    expect(cell(6367, "bid")).toHaveTextContent("80")
    expect(rung(6367)).not.toHaveAttribute("data-mine")
    const ask = cell(6371, "ask")!
    expect(ask).toHaveAttribute("data-side", "ask")
    expect(ask).toHaveAttribute("aria-colindex", "3")
    expect(ask.querySelector("[data-mine-size]")).toHaveTextContent("10 yours")
    expect(rung(6371)).toHaveAttribute("data-mine", "ask")
    // The mid rung has no level: its price prints and its sizes are blank.
    expect(cell(6369, "bid")).toHaveTextContent("")
    expect(cell(6369, "ask")).toHaveTextContent("")
    // Both sides on one rung.
    act(() => store.applyDeltas({ upsert: [{ tick: 6369, bidSize: 1, myBid: 1, askSize: 1, myAsk: 1 }] }))
    expect(rung(6369)).toHaveAttribute("data-mine", "both")
  })

  it("wakes one rung for one level's change, and flashes the cell that moved", () => {
    const store = seed()
    const formatSize = vi.fn((size: number) => String(size))
    render(<DepthLadder store={store} convention={ZN} mid={MID} label="ZN ladder" depth={4} initialRect={RECT} formatSize={formatSize} />)
    formatSize.mockClear()
    animate.mockClear()
    act(() => store.applyDeltas({ patch: [{ id: "6368", fields: { bidSize: 150 } }] }))
    // The rung at 99-16 printed its own size and the market's; no other rung rendered.
    expect(formatSize.mock.calls.map(([size]) => size)).toEqual([5, 150])
    expect(cell(6368, "bid")).toHaveTextContent("5 yours150")
    expect(animate).toHaveBeenCalledTimes(1)
    // A level arriving on an empty rung wakes that rung alone.
    formatSize.mockClear()
    act(() => store.applyDeltas({ upsert: [{ tick: 6369, askSize: 30 }] }))
    expect(formatSize.mock.calls.map(([size]) => size)).toEqual([30])
    expect(cell(6369, "ask")).toHaveTextContent("30")
    // A level leaving blanks its rung.
    act(() => store.applyDeltas({ remove: ["6367"] }))
    expect(cell(6367, "bid")).toHaveTextContent("")
    expect(cell(6367, "price")).toHaveTextContent("99-15+")
  })

  it("stages a buy from the bid column and a sell from the ask column at that rung's price, and nothing from the price column", () => {
    const store = seed()
    const onStage = vi.fn<(stage: LadderStage) => void>()
    render(<DepthLadder store={store} convention={ZN} mid={MID} label="ZN ladder" depth={4} initialRect={RECT} onStage={onStage} />)
    fireEvent.click(cell(6368, "bid")!)
    expect(onStage).toHaveBeenLastCalledWith({ price: 99.5, side: "buy", tick: 6368, level: store.getRow("6368") })
    expect(rung(6368)).toHaveAttribute("data-focused", "true")
    expect(cell(6368, "bid")).toHaveAttribute("data-focused-col", "true")
    fireEvent.click(cell(6370, "ask")!)
    expect(onStage).toHaveBeenLastCalledWith({ price: 99.53125, side: "sell", tick: 6370, level: store.getRow("6370") })
    // An empty rung stages too: the price is the rung's, the level is undefined.
    fireEvent.click(cell(6369, "bid")!)
    expect(onStage).toHaveBeenLastCalledWith({ price: 99.515625, side: "buy", tick: 6369, level: undefined })
    fireEvent.click(cell(6371, "price")!)
    expect(onStage).toHaveBeenCalledTimes(3)
    expect(rung(6371)).toHaveAttribute("data-focused", "true")
    expect(cell(6371, "price")).toHaveAttribute("data-focused-col", "true")
    expect(screen.getByRole("grid", { name: "ZN ladder" })).toHaveAttribute("aria-activedescendant", rung(6371)!.id)
  })

  it("follows the mid until a pointer touches it, then offers Recenter, which follows again", () => {
    render(<DepthLadder store={seed()} convention={ZN} mid={MID} label="ZN ladder" depth={4} initialRect={RECT} />)
    const grid = screen.getByRole("grid", { name: "ZN ladder" })
    const box = grid.querySelector(".overflow-auto")!
    expect(grid).toHaveAttribute("data-following", "true")
    fireEvent.pointerDown(box)
    expect(grid).toHaveAttribute("data-following", "false")
    const recenter = screen.getByRole("button", { name: "Recenter" })
    expect(recenter).toHaveAttribute("data-ladder-recenter", "")
    fireEvent.click(recenter)
    expect(grid).toHaveAttribute("data-following", "true")
    expect(screen.queryByRole("button", { name: "Recenter" })).toBeNull()
    fireEvent.wheel(box)
    expect(grid).toHaveAttribute("data-following", "false")
  })

  it("moves the focus with the arrows from the mid, stages on Enter, leaves a modifier-held key alone, and recenters on Home", () => {
    const store = seed()
    const onStage = vi.fn<(stage: LadderStage) => void>()
    render(<DepthLadder store={store} convention={ZN} mid={MID} label="ZN ladder" depth={4} initialRect={RECT} onStage={onStage} />)
    const grid = screen.getByRole("grid", { name: "ZN ladder" })
    expect(grid).not.toHaveAttribute("aria-activedescendant")
    // A hotkey registry's chord passes through: nothing moves, and the ladder keeps following.
    fireEvent.keyDown(grid, { key: "ArrowUp", altKey: true })
    expect(grid).toHaveAttribute("data-following", "true")
    expect(grid).not.toHaveAttribute("aria-activedescendant")
    // Up from nowhere starts at the mid and goes one tick higher; a key is a hand on the ladder.
    fireEvent.keyDown(grid, { key: "ArrowUp" })
    expect(grid).toHaveAttribute("data-following", "false")
    expect(grid).toHaveAttribute("aria-activedescendant", rung(6370)!.id)
    expect(cell(6370, "price")).toHaveAttribute("data-focused-col", "true")
    fireEvent.keyDown(grid, { key: "ArrowRight" })
    expect(cell(6370, "ask")).toHaveAttribute("data-focused-col", "true")
    // Enter on the price column stages nothing; on a size cell it stages that side.
    fireEvent.keyDown(grid, { key: "ArrowLeft" })
    fireEvent.keyDown(grid, { key: "Enter" })
    expect(onStage).not.toHaveBeenCalled()
    fireEvent.keyDown(grid, { key: "ArrowLeft" })
    expect(cell(6370, "bid")).toHaveAttribute("data-focused-col", "true")
    fireEvent.keyDown(grid, { key: "ArrowLeft" })
    expect(cell(6370, "bid")).toHaveAttribute("data-focused-col", "true")
    fireEvent.keyDown(grid, { key: "Enter" })
    expect(onStage).toHaveBeenLastCalledWith({ price: 99.53125, side: "buy", tick: 6370, level: store.getRow("6370") })
    fireEvent.keyDown(grid, { key: "ArrowRight" })
    fireEvent.keyDown(grid, { key: "ArrowRight" })
    fireEvent.keyDown(grid, { key: "ArrowDown" })
    fireEvent.keyDown(grid, { key: "ArrowDown" })
    fireEvent.keyDown(grid, { key: "Enter" })
    expect(onStage).toHaveBeenLastCalledWith({ price: 99.5, side: "sell", tick: 6368, level: store.getRow("6368") })
    // A page is a viewport of rungs; the focus stops at the range's edge.
    fireEvent.keyDown(grid, { key: "PageDown" })
    expect(grid).toHaveAttribute("aria-activedescendant", rung(6365)!.id)
    fireEvent.keyDown(grid, { key: "PageUp" })
    expect(grid).toHaveAttribute("aria-activedescendant", rung(6373)!.id)
    fireEvent.keyDown(grid, { key: "ArrowUp" })
    expect(grid).toHaveAttribute("aria-activedescendant", rung(6373)!.id)
    fireEvent.keyDown(grid, { key: "Home" })
    expect(grid).toHaveAttribute("data-following", "true")
  })

  it("moves the range with a mid that drifts while following, and holds it under a hand until Recenter", () => {
    const store = seed()
    const { rerender } = render(<DepthLadder store={store} convention={ZN} mid={MID} label="ZN ladder" depth={4} initialRect={RECT} />)
    expect(rung(6373)).not.toBeNull()
    expect(rung(6376)).toBeNull()
    // Three ticks up is more than half the depth: the range is rebuilt around the new mid.
    rerender(<DepthLadder store={store} convention={ZN} mid={priceAtTick(6372, ZN.tick)} label="ZN ladder" depth={4} initialRect={RECT} />)
    expect(rung(6372)).toHaveAttribute("data-mid", "")
    expect(rung(6376)).not.toBeNull()
    expect(rung(6367)).toBeNull()
    // Under a hand the range stays: the mid walks off the top and the prices on screen do not move.
    const grid = screen.getByRole("grid", { name: "ZN ladder" })
    fireEvent.pointerDown(grid.querySelector(".overflow-auto")!)
    rerender(<DepthLadder store={store} convention={ZN} mid={priceAtTick(6380, ZN.tick)} label="ZN ladder" depth={4} initialRect={RECT} />)
    expect(rung(6376)).not.toBeNull()
    expect(rung(6380)).toBeNull()
    expect(document.querySelector("[data-mid]")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Recenter" }))
    expect(rung(6380)).toHaveAttribute("data-mid", "")
    expect(rung(6384)).not.toBeNull()
    expect(rung(6375)).toBeNull()
  })

  it("shows the empty state while there is no mid, and builds the ladder when one arrives", () => {
    const store = seed()
    const { rerender } = render(<DepthLadder store={store} convention={ZN} mid={null} label="ZN ladder" depth={4} initialRect={RECT} />)
    const grid = screen.getByRole("grid", { name: "ZN ladder" })
    expect(grid).toHaveTextContent("No market")
    expect(grid).toHaveAttribute("aria-rowcount", "1")
    expect(document.querySelector("[role='row'][data-tick]")).toBeNull()
    rerender(<DepthLadder store={store} convention={ZN} mid={MID} label="ZN ladder" depth={4} initialRect={RECT} />)
    expect(grid).toHaveAttribute("aria-rowcount", "10")
    expect(grid).not.toHaveTextContent("No market")
    expect(rung(6369)).toHaveAttribute("data-mid", "")
    // A market that goes away after the ladder is built leaves the prices up and drops the mid mark.
    rerender(<DepthLadder store={store} convention={ZN} mid={undefined} label="ZN ladder" depth={4} initialRect={RECT} />)
    expect(grid).toHaveAttribute("aria-rowcount", "10")
    expect(document.querySelector("[data-mid]")).toBeNull()
    expect(cell(6368, "bid")).toHaveTextContent("120")
  })

  it("prints its own words for the empty state", () => {
    render(<DepthLadder store={seed()} convention={ZN} mid={null} label="ZN ladder" depth={4} initialRect={RECT} emptyState="Waiting" />)
    expect(screen.getByRole("grid", { name: "ZN ladder" })).toHaveTextContent("Waiting")
  })

  it("prints the sizes through formatSize, the words through labels, and a decimal price through its convention", () => {
    const bill: InstrumentConvention = { price: { kind: "tick", tick: 0.0005 }, tick: 0.0005 }
    const store = createRowStore<DepthLevel>({ getRowId: (level) => levelId(level.tick) })
    store.applyDeltas({ upsert: [{ tick: tickIndexOf(5.234, bill.tick), bidSize: 25_000_000, myBid: 5_000_000 }] })
    render(
      <DepthLadder
        store={store}
        convention={bill}
        mid={5.235}
        label="Bill ladder"
        depth={2}
        initialRect={RECT}
        formatSize={(size) => `${size / 1_000_000}mm`}
        labels={{ bid: "Buyers", ask: "Sellers", mine: "ours", mid: "Market", recenter: "Center" }}
      />,
    )
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Buyers", "Price", "Sellers"])
    const tick = tickIndexOf(5.234, bill.tick)
    expect(cell(tick, "bid")).toHaveTextContent("5mm ours25mm")
    expect(cell(tick, "price")).toHaveTextContent("5.2340")
    expect(rung(tickIndexOf(5.235, bill.tick))).toHaveAttribute("aria-description", "Market")
    fireEvent.pointerDown(screen.getByRole("grid", { name: "Bill ladder" }).querySelector(".overflow-auto")!)
    expect(screen.getByRole("button", { name: "Center" })).toBeInTheDocument()
  })
})
