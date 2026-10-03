import { type ComponentProps, useEffect, useLayoutEffect, createRef } from "react"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { InstrumentConvention } from "@/registry/tradecn/lib/format"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import { DepthLadder, DepthLadderHeader, DepthLadderColumnHeader, DepthLadderViewport, DepthLadderEmpty, DepthLadderRows, DepthLadderRow, DepthLadderSizeCell, DepthLadderPriceCell, DepthLadderRecenter, DepthLadderOwnSize, DepthLadderSize, useDepthLadderRow, type DepthLadderProps, levelId, priceAtTick, tickIndexOf, type DepthLevel, type LadderStage } from "@/registry/tradecn/ui/depth-ladder"

// The ordinary consumer owns the complete tree; the tests exercise its public parts.
function Ladder({ emptyState, ...props }: Omit<DepthLadderProps, "children"> & { emptyState?: React.ReactNode }) {
  return <DepthLadder {...props}>
    <DepthLadderHeader>
      <DepthLadderColumnHeader column="bid" />
      <DepthLadderColumnHeader column="price" />
      <DepthLadderColumnHeader column="ask" />
    </DepthLadderHeader>
    <DepthLadderViewport>
      <DepthLadderEmpty>{emptyState}</DepthLadderEmpty>
      <DepthLadderRows>{() => (
        <DepthLadderRow>
          <DepthLadderSizeCell side="bid" />
          <DepthLadderPriceCell />
          <DepthLadderSizeCell side="ask" />
        </DepthLadderRow>
      )}</DepthLadderRows>
    </DepthLadderViewport>
    <DepthLadderRecenter className="absolute bottom-2 left-1/2 z-30 -translate-x-1/2" />
  </DepthLadder>
}

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
    render(<Ladder store={seed()} convention={ZN} mid={MID} label="ZN ladder" depth={4} initialRect={RECT} />)
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
    render(<Ladder store={store} convention={ZN} mid={MID} label="ZN ladder" depth={4} initialRect={RECT} />)
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
    render(<Ladder store={store} convention={ZN} mid={MID} label="ZN ladder" depth={4} initialRect={RECT} formatSize={formatSize} />)
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
    render(<Ladder store={store} convention={ZN} mid={MID} label="ZN ladder" depth={4} initialRect={RECT} onStage={onStage} />)
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
    expect(screen.getByRole("grid", { name: "ZN ladder" })).toHaveAttribute("aria-activedescendant", cell(6371, "price")!.id)
  })

  it("follows the mid until a pointer touches it, then offers Recenter, which follows again", () => {
    render(<Ladder store={seed()} convention={ZN} mid={MID} label="ZN ladder" depth={4} initialRect={RECT} />)
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
    render(<Ladder store={store} convention={ZN} mid={MID} label="ZN ladder" depth={4} initialRect={RECT} onStage={onStage} />)
    const grid = screen.getByRole("grid", { name: "ZN ladder" })
    expect(grid).not.toHaveAttribute("aria-activedescendant")
    // A hotkey registry's chord passes through: nothing moves, and the ladder keeps following.
    fireEvent.keyDown(grid, { key: "ArrowUp", altKey: true })
    expect(grid).toHaveAttribute("data-following", "true")
    expect(grid).not.toHaveAttribute("aria-activedescendant")
    // Up from nowhere starts at the mid and goes one tick higher; a key is a hand on the ladder.
    fireEvent.keyDown(grid, { key: "ArrowUp" })
    expect(grid).toHaveAttribute("data-following", "false")
    expect(grid).toHaveAttribute("aria-activedescendant", cell(6370, "price")!.id)
    expect(cell(6370, "price")).toHaveAttribute("data-focused-col", "true")
    expect(cell(6370, "price")).toHaveAttribute("aria-selected", "true")
    fireEvent.keyDown(grid, { key: "ArrowRight" })
    expect(cell(6370, "ask")).toHaveAttribute("data-focused-col", "true")
    // The selected state travels with the active cell: marked on the new one, gone from the old.
    expect(cell(6370, "ask")).toHaveAttribute("aria-selected", "true")
    expect(cell(6370, "price")).not.toHaveAttribute("aria-selected")
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
    expect(cell(6368, "ask")).toHaveAttribute("aria-selected", "true")
    expect(cell(6370, "ask")).not.toHaveAttribute("aria-selected")
    fireEvent.keyDown(grid, { key: "Enter" })
    expect(onStage).toHaveBeenLastCalledWith({ price: 99.5, side: "sell", tick: 6368, level: store.getRow("6368") })
    // A page is a viewport of rungs; the focus stops at the range's edge.
    fireEvent.keyDown(grid, { key: "PageDown" })
    expect(grid).toHaveAttribute("aria-activedescendant", cell(6365, "ask")!.id)
    fireEvent.keyDown(grid, { key: "PageUp" })
    expect(grid).toHaveAttribute("aria-activedescendant", cell(6373, "ask")!.id)
    fireEvent.keyDown(grid, { key: "ArrowUp" })
    expect(grid).toHaveAttribute("aria-activedescendant", cell(6373, "ask")!.id)
    fireEvent.keyDown(grid, { key: "Home" })
    expect(grid).toHaveAttribute("data-following", "true")
  })

  it("moves the range with a mid that drifts while following, and holds it under a hand until Recenter", () => {
    const store = seed()
    const { rerender } = render(<Ladder store={store} convention={ZN} mid={MID} label="ZN ladder" depth={4} initialRect={RECT} />)
    expect(rung(6373)).not.toBeNull()
    expect(rung(6376)).toBeNull()
    // Three ticks up is more than half the depth: the range is rebuilt around the new mid.
    rerender(<Ladder store={store} convention={ZN} mid={priceAtTick(6372, ZN.tick)} label="ZN ladder" depth={4} initialRect={RECT} />)
    expect(rung(6372)).toHaveAttribute("data-mid", "")
    expect(rung(6376)).not.toBeNull()
    expect(rung(6367)).toBeNull()
    // Under a hand the range stays: the mid walks off the top and the prices on screen do not move.
    const grid = screen.getByRole("grid", { name: "ZN ladder" })
    fireEvent.pointerDown(grid.querySelector(".overflow-auto")!)
    rerender(<Ladder store={store} convention={ZN} mid={priceAtTick(6380, ZN.tick)} label="ZN ladder" depth={4} initialRect={RECT} />)
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
    const { rerender } = render(<Ladder store={store} convention={ZN} mid={null} label="ZN ladder" depth={4} initialRect={RECT} />)
    const grid = screen.getByRole("grid", { name: "ZN ladder" })
    expect(grid).toHaveTextContent("No market")
    expect(grid).toHaveAttribute("aria-rowcount", "1")
    expect(document.querySelector("[role='row'][data-tick]")).toBeNull()
    rerender(<Ladder store={store} convention={ZN} mid={MID} label="ZN ladder" depth={4} initialRect={RECT} />)
    expect(grid).toHaveAttribute("aria-rowcount", "10")
    expect(grid).not.toHaveTextContent("No market")
    expect(rung(6369)).toHaveAttribute("data-mid", "")
    // A market that goes away after the ladder is built leaves the prices up and drops the mid mark.
    rerender(<Ladder store={store} convention={ZN} mid={undefined} label="ZN ladder" depth={4} initialRect={RECT} />)
    expect(grid).toHaveAttribute("aria-rowcount", "10")
    expect(document.querySelector("[data-mid]")).toBeNull()
    expect(cell(6368, "bid")).toHaveTextContent("120")
  })

  it("prints its own words for the empty state", () => {
    render(<Ladder store={seed()} convention={ZN} mid={null} label="ZN ladder" depth={4} initialRect={RECT} emptyState="Waiting" />)
    expect(screen.getByRole("grid", { name: "ZN ladder" })).toHaveTextContent("Waiting")
  })

  it("prints the sizes through formatSize, the words through labels, and a decimal price through its convention", () => {
    const bill: InstrumentConvention = { price: { kind: "tick", tick: 0.0005 }, tick: 0.0005 }
    const store = createRowStore<DepthLevel>({ getRowId: (level) => levelId(level.tick) })
    store.applyDeltas({ upsert: [{ tick: tickIndexOf(5.234, bill.tick), bidSize: 25_000_000, myBid: 5_000_000 }] })
    render(
      <Ladder
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

describe("composition", () => {
  const rootProps = { store: seed(), convention: ZN, mid: MID, label: "Composed ladder", depth: 4, initialRect: RECT }

  it("requires migration of released calls, including calls using only retained props", () => {
    // @ts-expect-error v1's minimal call needs explicit content.
    const minimal = <DepthLadder store={seed()} convention={ZN} mid={MID} label="ZN" />
    // @ts-expect-error Retained optional props still require a composition.
    const configured = <DepthLadder {...rootProps} formatSize={String} labels={{ mine: "ours" }} />
    // @ts-expect-error Empty content belongs to DepthLadderEmpty.
    const emptyState = <DepthLadder {...rootProps} emptyState="Waiting"><span /></DepthLadder>
    // @ts-expect-error Rows requires an explicit render callback.
    const rows = <DepthLadderRows />
    // @ts-expect-error A row needs caller content.
    const row = <DepthLadderRow />
    // @ts-expect-error Generated row ids are reserved; descendants point at cells.
    const customId = <DepthLadderRow id="custom"><span /></DepthLadderRow>
    // @ts-expect-error The root owns its active descendant.
    const customGrid = { ...rootProps, children: null, "aria-activedescendant": "application-row" } satisfies DepthLadderProps
    const conditional = <DepthLadder {...rootProps}>{Boolean(vi.fn()()) && <DepthLadderEmpty />}</DepthLadder>
    const empty = <DepthLadder {...rootProps}>{null}</DepthLadder>
    // @ts-expect-error Cell ids are generated for the grid's active descendant.
    const cellId = <DepthLadderPriceCell id="custom" />
    // @ts-expect-error The selected state belongs to the keyboard model.
    const cellSelected = <DepthLadderSizeCell side="bid" aria-selected={false} />
    expect([minimal, configured, emptyState, rows, row, customId, customGrid, conditional, empty, cellId, cellSelected]).toHaveLength(11)
  })

  it("supports ascending prices, reordered cells and readings, and caller controls without extra row subscriptions", () => {
    const store = seed()
    const subscribe = vi.spyOn(store, "subscribeRow")
    const renderRow = vi.fn(() => <DepthLadderRow>
      <DepthLadderPriceCell />
      <DepthLadderSizeCell side="ask"><DepthLadderSize side="ask" /><DepthLadderOwnSize side="ask" /></DepthLadderSizeCell>
      <DepthLadderSizeCell side="bid"><DepthLadderSize side="bid" /><DepthLadderOwnSize side="bid" /></DepthLadderSizeCell>
    </DepthLadderRow>)
    const stage = vi.fn()
    render(<DepthLadder {...rootProps} store={store} columns={["price", "ask", "bid"]} order="ascending" onStage={stage}>
      <div>Desk content <DepthLadderRecenter>Follow market</DepthLadderRecenter></div>
      <DepthLadderHeader><DepthLadderColumnHeader column="price" /><DepthLadderColumnHeader column="ask" /><DepthLadderColumnHeader column="bid" /></DepthLadderHeader>
      <DepthLadderViewport><DepthLadderRows>{renderRow}</DepthLadderRows></DepthLadderViewport>
    </DepthLadder>)
    expect(screen.getAllByRole("columnheader").map((el) => el.textContent)).toEqual(["Price", "Ask", "Bid"])
    expect([...document.querySelectorAll("[data-tick]")].map((el) => Number(el.getAttribute("data-tick")))).toEqual([6365, 6366, 6367, 6368, 6369, 6370, 6371, 6372, 6373])
    expect(cell(6368, "bid")).toHaveTextContent("1205 yours")
    expect(cell(6368, "bid")).toHaveAttribute("aria-colindex", "3")
    expect(subscribe).toHaveBeenCalledTimes(9)
    renderRow.mockClear()
    act(() => store.applyDeltas({ patch: [{ id: "6368", fields: { bidSize: 140 } }] }))
    expect(renderRow).toHaveBeenCalledTimes(1)
    expect(cell(6368, "bid")).toHaveTextContent("1405 yours")
    const grid = screen.getByRole("grid")
    fireEvent.keyDown(grid, { key: "ArrowUp" })
    expect(cell(6368, "price")).toHaveAttribute("data-focused-col", "true")
    fireEvent.keyDown(grid, { key: "ArrowRight" })
    fireEvent.keyDown(grid, { key: "Enter" })
    expect(stage).toHaveBeenLastCalledWith(expect.objectContaining({ tick: 6368, side: "sell" }))
    expect(screen.getByRole("button", { name: "Follow market" })).toBeInTheDocument()
  })

  it("forwards native props and refs and lets handlers cancel selection and grid shortcuts", () => {
    const root = createRef<HTMLDivElement>()
    const price = createRef<HTMLDivElement>()
    const viewport = createRef<HTMLDivElement>()
    const stage = vi.fn()
    // A JavaScript caller can spread past the types; the managed id and selected state still win.
    const rogue = { id: "rogue", "aria-selected": false } as object
    render(<DepthLadder {...rootProps} ref={root} data-desk="rates" onStage={stage} onKeyDown={(event) => event.preventDefault()}>
      <DepthLadderViewport ref={viewport}><DepthLadderRows>{() => <DepthLadderRow>
        <DepthLadderSizeCell side="bid" onClick={(event) => event.preventDefault()} />
        <DepthLadderPriceCell ref={price} title="Quoted price" {...rogue} />
        <DepthLadderSizeCell side="ask"><button type="button">Inspect level</button></DepthLadderSizeCell>
      </DepthLadderRow>}</DepthLadderRows></DepthLadderViewport>
    </DepthLadder>)
    expect(root.current).toHaveAttribute("data-desk", "rates")
    expect(viewport.current).toHaveAttribute("data-slot", "tradecn-depth-ladder-viewport")
    expect(price.current).toHaveAttribute("title", "Quoted price")
    expect(price.current!.id).not.toBe("rogue")
    fireEvent.click(cell(6368, "bid")!)
    fireEvent.click(screen.getAllByRole("button", { name: "Inspect level" })[0]!)
    expect(stage).not.toHaveBeenCalled()
    fireEvent.keyDown(root.current!, { key: "ArrowLeft" })
    expect(root.current).not.toHaveAttribute("aria-activedescendant")
    // The rogue spread loses throughout: selecting the cell marks it and the descendant resolves.
    fireEvent.click(price.current!)
    expect(price.current).toHaveAttribute("aria-selected", "true")
    expect(root.current).toHaveAttribute("aria-activedescendant", price.current!.id)
  })

  it("leaves Enter on Recenter to the button without staging the selected size", () => {
    const onStage = vi.fn()
    render(<Ladder store={seed()} convention={ZN} mid={MID} label="ZN ladder" depth={4} initialRect={RECT} onStage={onStage} />)
    const grid = screen.getByRole("grid", { name: "ZN ladder" })
    fireEvent.keyDown(grid, { key: "ArrowLeft" })
    const recenter = screen.getByRole("button", { name: "Recenter" })
    recenter.focus()
    expect(fireEvent.keyDown(recenter, { key: "Enter" })).toBe(true)
    expect(onStage).not.toHaveBeenCalled()
  })

  it("restores grid focus when Recenter disappears, including loss of the market", () => {
    const store = seed()
    const view = render(<Ladder {...rootProps} store={store} />)
    const grid = screen.getByRole("grid")
    fireEvent.keyDown(grid, { key: "ArrowLeft" })
    const button = screen.getByRole("button", { name: "Recenter" })
    button.focus()
    fireEvent.click(button)
    expect(grid).toHaveFocus()
    fireEvent.keyDown(grid, { key: "ArrowLeft" })
    screen.getByRole("button", { name: "Recenter" }).focus()
    view.rerender(<Ladder {...rootProps} store={store} mid={null} />)
    expect(grid).toHaveFocus()
    expect(screen.queryByRole("button", { name: "Recenter" })).toBeNull()
  })

  it("keeps nested controls and composing Enter independent of grid selection", () => {
    const stage = vi.fn()
    render(<DepthLadder {...rootProps} onStage={stage}>
      <input aria-label="Order note" />
      <DepthLadderViewport><DepthLadderRows>{() => <DepthLadderRow><DepthLadderSizeCell side="bid" /><DepthLadderPriceCell /><DepthLadderSizeCell side="ask" /></DepthLadderRow>}</DepthLadderRows></DepthLadderViewport>
    </DepthLadder>)
    const grid = screen.getByRole("grid")
    fireEvent.keyDown(grid, { key: "ArrowLeft" })
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "ArrowRight" })
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" })
    fireEvent.keyDown(grid, { key: "Enter", isComposing: true })
    expect(stage).not.toHaveBeenCalled()
    fireEvent.keyDown(grid, { key: "Enter" })
    expect(stage).toHaveBeenCalledTimes(1)
  })

  it("uses the latest callback and row for staging and preserves the selected tick across recenter", () => {
    const store = seed()
    const first = vi.fn()
    const second = vi.fn()
    const view = render(<Ladder {...rootProps} store={store} onStage={first} />)
    const grid = screen.getByRole("grid")
    fireEvent.click(cell(6368, "bid")!)
    expect(grid).toHaveFocus()
    view.rerender(<Ladder {...rootProps} store={store} mid={priceAtTick(6390, ZN.tick)} onStage={second} />)
    fireEvent.click(screen.getByRole("button", { name: "Recenter" }))
    expect(grid).not.toHaveAttribute("aria-activedescendant")
    act(() => store.applyDeltas({ remove: ["6368"] }))
    // The selection survived the recenter but sits far outside the new range: staging refuses it.
    fireEvent.keyDown(grid, { key: "Enter" })
    expect(second).not.toHaveBeenCalled()
    // Navigation clamps back into range, and the latest callback stages the in-range rung with
    // the store row as it is at stage time.
    fireEvent.keyDown(grid, { key: "ArrowUp" })
    act(() => store.applyDeltas({ upsert: [{ tick: 6387, bidSize: 55 }] }))
    fireEvent.keyDown(grid, { key: "Enter" })
    expect(second).toHaveBeenCalledExactlyOnceWith({ price: priceAtTick(6387, ZN.tick), side: "buy", tick: 6387, level: store.getRow("6387") })
    expect(store.getRow("6387")!.bidSize).toBe(55)
    expect(first).toHaveBeenCalledTimes(1)
  })

  it("mounts only a viewport of a deep range and cleans up row subscriptions and flashes", () => {
    const store = seed()
    const unsubscribes: ReturnType<typeof vi.fn>[] = []
    const subscribe = store.subscribeRow.bind(store)
    vi.spyOn(store, "subscribeRow").mockImplementation((id, cb) => {
      const unsubscribe = vi.fn(subscribe(id, cb))
      unsubscribes.push(unsubscribe)
      return unsubscribe
    })
    const view = render(<Ladder {...rootProps} store={store} depth={10_000} />)
    expect(document.querySelectorAll("[data-tick]").length).toBeLessThan(40)
    expect(screen.getByRole("grid")).toHaveAttribute("aria-rowcount", "20002")
    act(() => store.applyDeltas({ patch: [{ id: "6368", fields: { bidSize: 150 } }] }))
    const animation = animate.mock.results.at(-1)?.value
    expect(animation).toBeDefined()
    view.unmount()
    expect(unsubscribes.every((unsubscribe) => unsubscribe.mock.calls.length === 1)).toBe(true)
    expect(animation.cancel).toHaveBeenCalled()
  })

  it("shares subscribed row state with custom readings and supports omitted columns and header", () => {
    function Reading() {
      const row = useDepthLadderRow()
      return <span>{row.priceText} / {row.bidSize ?? "empty"}</span>
    }
    render(<DepthLadder {...rootProps} columns={["price"]} headerRows={0}>
      <DepthLadderViewport><DepthLadderRows>{() => <DepthLadderRow><DepthLadderPriceCell><Reading /></DepthLadderPriceCell></DepthLadderRow>}</DepthLadderRows></DepthLadderViewport>
    </DepthLadder>)
    expect(screen.getByRole("grid")).toHaveAttribute("aria-rowcount", "9")
    expect(screen.getByRole("grid")).toHaveAttribute("aria-colcount", "1")
    expect(rung(6373)).toHaveAttribute("aria-rowindex", "1")
    expect(cell(6368, "price")).toHaveTextContent("99-16 / 120")
  })
})

describe("native control isolation", () => {
  it("does not stage when nested labels, disclosures, or editable content are clicked", () => {
    const stage = vi.fn()
    render(<DepthLadder store={seed()} convention={ZN} mid={MID} label="Book" depth={0} initialRect={RECT} onStage={stage}>
      <DepthLadderViewport><DepthLadderRows>{() => <DepthLadderRow>
        <DepthLadderSizeCell side="bid"><label><input type="checkbox" />Include level</label><details><summary>Orders</summary>Own orders</details><span contentEditable="plaintext-only" suppressContentEditableWarning>Note</span></DepthLadderSizeCell>
        <DepthLadderPriceCell /><DepthLadderSizeCell side="ask" />
      </DepthLadderRow>}</DepthLadderRows></DepthLadderViewport>
    </DepthLadder>)
    fireEvent.click(screen.getByText("Include level"))
    fireEvent.click(screen.getByText("Orders"))
    fireEvent.click(screen.getByText("Note"))
    expect(stage).not.toHaveBeenCalled()
  })
})

describe("Recenter refs", () => {
  it("keeps Recenter focused across callback ref replacement and honors callback cleanup", () => {
    const cleanup = vi.fn()
    const blurred = vi.fn()
    const focused = vi.fn()
    function Consumer() {
      return <DepthLadder store={seed()} convention={ZN} mid={MID} label="Book" depth={0} initialRect={RECT}>
        <DepthLadderViewport><DepthLadderRows>{() => <DepthLadderRow><DepthLadderSizeCell side="bid" /><DepthLadderPriceCell /><DepthLadderSizeCell side="ask" /></DepthLadderRow>}</DepthLadderRows></DepthLadderViewport>
        <DepthLadderRecenter ref={() => cleanup} onBlur={blurred} onFocus={focused} />
      </DepthLadder>
    }
    const view = render(<Consumer />)
    fireEvent.keyDown(screen.getByRole("grid"), { key: "ArrowLeft" })
    const button = screen.getByRole("button", { name: "Recenter" })
    button.addEventListener("blur", blurred)
    button.addEventListener("focus", focused)
    button.focus()
    blurred.mockClear()
    focused.mockClear()
    view.rerender(<Consumer />)
    expect(button).toHaveFocus()
    expect(blurred).not.toHaveBeenCalled()
    expect(focused).not.toHaveBeenCalled()
    expect(cleanup).toHaveBeenCalledTimes(1)
    view.unmount()
    expect(cleanup).toHaveBeenCalledTimes(2)
  })
})

describe("changing a composed layout", () => {
  it("preserves managed grid semantics when extra props arrive through a spread", () => {
    const extra = { role: "list", tabIndex: -1, "aria-label": "Other", "aria-rowcount": 1, "aria-colcount": 8, "aria-activedescendant": "missing", title: "Book detail" }
    render(<Ladder {...extra} store={seed()} convention={ZN} mid={MID} label="Book" depth={0} initialRect={RECT} />)
    const grid = screen.getByRole("grid", { name: "Book" })
    expect(grid).toHaveAttribute("tabindex", "0")
    expect(grid).toHaveAttribute("aria-rowcount", "2")
    expect(grid).toHaveAttribute("aria-colcount", "3")
    expect(grid).toHaveAttribute("title", "Book detail")
    expect(grid).not.toHaveAttribute("aria-activedescendant")
    fireEvent.keyDown(grid, { key: "ArrowLeft" })
    expect(document.getElementById(grid.getAttribute("aria-activedescendant")!)).toBe(cell(6369, "bid"))
  })

  it("omits column indices for parts outside the declared columns", () => {
    render(<Ladder store={seed()} convention={ZN} mid={MID} label="Book" depth={0} columns={["ask"]} initialRect={RECT} />)
    expect(screen.getByRole("columnheader", { name: "Bid" })).not.toHaveAttribute("aria-colindex")
    expect(screen.getByRole("columnheader", { name: "Price" })).not.toHaveAttribute("aria-colindex")
    expect(cell(6369, "bid")).not.toHaveAttribute("aria-colindex")
    expect(cell(6369, "price")).not.toHaveAttribute("aria-colindex")
    expect(cell(6369, "ask")).toHaveAttribute("aria-colindex", "1")
  })

  it.each(["ascending", "descending"] as const)("keeps the selected row mounted across page jumps in %s order", (order) => {
    render(<Ladder store={seed()} convention={ZN} mid={MID} label="Book" depth={40} order={order} initialRect={RECT} />)
    const grid = screen.getByRole("grid")
    fireEvent.keyDown(grid, { key: "ArrowDown" })
    for (let page = 0; page < 3; page++) {
      fireEvent.keyDown(grid, { key: "PageDown" })
      const id = grid.getAttribute("aria-activedescendant")
      expect(id).not.toBeNull()
      expect(document.getElementById(id!)!.closest("[data-tick]")).toHaveAttribute("data-focused", "true")
      expect(document.querySelectorAll("[data-tick]").length).toBeLessThan(40)
    }
  })

  it("renders only the own-size chip when there is no market size", () => {
    const store = seed()
    store.applyDeltas({ upsert: [{ tick: 6369, myBid: 25, myAsk: 15 }] })
    render(<Ladder store={store} convention={ZN} mid={MID} label="Book" depth={0} initialRect={RECT} />)
    for (const side of ["bid", "ask"]) {
      const sizeCell = cell(6369, side)!
      expect(sizeCell.children).toHaveLength(1)
      expect(sizeCell.firstElementChild).toHaveAttribute("data-mine-size")
    }
  })

  it("removes the visible selection and custom row focus state when the selected column disappears", () => {
    const stage = vi.fn()
    const store = seed()
    function Consumer({ showBid }: { showBid: boolean }) {
      return <DepthLadder store={store} convention={ZN} mid={MID} label="Book" depth={0} initialRect={RECT} columns={showBid ? ["bid", "price", "ask"] : ["price", "ask"]} onStage={stage}>
        <DepthLadderViewport><DepthLadderRows>{(row) => <DepthLadderRow>
          {showBid && <DepthLadderSizeCell side="bid" />}
          <DepthLadderPriceCell><span data-selected-column="">{row.focusedColumn ?? "none"}</span></DepthLadderPriceCell>
          <DepthLadderSizeCell side="ask" />
        </DepthLadderRow>}</DepthLadderRows></DepthLadderViewport>
      </DepthLadder>
    }
    const view = render(<Consumer showBid />)
    const grid = screen.getByRole("grid")
    fireEvent.keyDown(grid, { key: "ArrowLeft" })
    expect(rung(6369)).toHaveAttribute("data-focused", "true")
    view.rerender(<Consumer showBid={false} />)
    expect(grid).not.toHaveAttribute("aria-activedescendant")
    expect(rung(6369)).not.toHaveAttribute("data-focused")
    expect(document.querySelector("[data-selected-column]")).toHaveTextContent("none")
    fireEvent.keyDown(grid, { key: "Enter" })
    expect(stage).not.toHaveBeenCalled()
    fireEvent.keyDown(grid, { key: "ArrowRight" })
    fireEvent.keyDown(grid, { key: "Enter" })
    expect(stage).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ side: "sell", tick: 6369 }))
  })

  it("refuses a kept select reference once its rung leaves the range", () => {
    const store = seed()
    const stage = vi.fn()
    const keep: { select?: (column: "bid" | "ask" | "price") => void } = {}
    function KeepSelect() {
      const row = useDepthLadderRow()
      useEffect(() => {
        if (row.tick === 6368) keep.select = row.select
      })
      return null
    }
    const compose = (mid: number) => (
      <DepthLadder store={store} convention={ZN} mid={mid} label="Book" depth={5} initialRect={RECT} onStage={stage}>
        <DepthLadderRecenter>Recenter</DepthLadderRecenter>
        <DepthLadderViewport><DepthLadderRows>{() => <DepthLadderRow><DepthLadderSizeCell side="bid" /><KeepSelect /><DepthLadderPriceCell /><DepthLadderSizeCell side="ask" /></DepthLadderRow>}</DepthLadderRows></DepthLadderViewport>
      </DepthLadder>
    )
    const view = render(compose(MID))
    act(() => keep.select!("bid"))
    expect(stage).toHaveBeenCalledTimes(1)
    view.rerender(compose(priceAtTick(6390, ZN.tick)))
    fireEvent.click(screen.getByRole("button", { name: "Recenter" }))
    // The rung is out of the recentered range; the reference held by desk code stages nothing.
    act(() => keep.select!("bid"))
    expect(stage).toHaveBeenCalledTimes(1)
  })

  it("validates a layout-effect select against the committed range", () => {
    const store = seed()
    const stage = vi.fn()
    const keep: { select?: (column: "bid" | "ask" | "price") => void } = {}
    function KeepSelect() {
      const row = useDepthLadderRow()
      useEffect(() => {
        if (row.tick === 6368) keep.select = row.select
      })
      return null
    }
    function Prodder({ probe }: { probe: boolean }) {
      useLayoutEffect(() => {
        if (probe) keep.select!("bid")
      }, [probe])
      return null
    }
    const compose = (mid: number, probe: boolean) => (
      <DepthLadder store={store} convention={ZN} mid={mid} label="Book" depth={5} initialRect={RECT} onStage={stage}>
        <Prodder probe={probe} />
        <DepthLadderViewport><DepthLadderRows>{() => <DepthLadderRow><DepthLadderSizeCell side="bid" /><KeepSelect /><DepthLadderPriceCell /><DepthLadderSizeCell side="ask" /></DepthLadderRow>}</DepthLadderRows></DepthLadderViewport>
      </DepthLadder>
    )
    const view = render(compose(MID, false))
    // The drift while following moves the anchor in this commit, and the child's layout effect
    // fires during it holding a reference from the old range: it must see the committed ladder.
    view.rerender(compose(priceAtTick(6390, ZN.tick), true))
    expect(stage).not.toHaveBeenCalled()
  })

  it("emits the selected state only on rendered roles that take it", () => {
    const store = seed()
    const compose = (role: ComponentProps<"div">["role"] | undefined, withRole: boolean) => (
      <DepthLadder store={store} convention={ZN} mid={MID} label="Book" depth={0} initialRect={RECT}>
        <DepthLadderViewport><DepthLadderRows>{() => <DepthLadderRow><DepthLadderSizeCell side="bid" /><DepthLadderPriceCell {...(withRole ? { role } : {})} /><DepthLadderSizeCell side="ask" /></DepthLadderRow>}</DepthLadderRows></DepthLadderViewport>
      </DepthLadder>
    )
    // A row header inherits aria-selected from gridcell, so the price-as-header pattern keeps
    // its state; a presentation cell and an explicit undefined role render without it.
    const view = render(compose("rowheader", true))
    const grid = screen.getByRole("grid")
    fireEvent.keyDown(grid, { key: "ArrowLeft" })
    fireEvent.keyDown(grid, { key: "ArrowRight" })
    expect(cell(6369, "price")).toHaveAttribute("role", "rowheader")
    expect(grid).toHaveAttribute("aria-activedescendant", cell(6369, "price")!.id)
    expect(cell(6369, "price")).toHaveAttribute("aria-selected", "true")
    expect(cell(6369, "bid")).not.toHaveAttribute("aria-selected")
    view.rerender(compose("presentation", true))
    expect(cell(6369, "price")).not.toHaveAttribute("aria-selected")
    view.rerender(compose(undefined, true))
    expect(cell(6369, "price")).not.toHaveAttribute("role")
    expect(cell(6369, "price")).not.toHaveAttribute("aria-selected")
    view.rerender(compose(undefined, false))
    expect(cell(6369, "price")).toHaveAttribute("aria-selected", "true")
  })

  it("resolves active descendants to generated cell ids under legacy row props", () => {
    const legacyProps = { id: "application-row", "data-application-row": "yes" }
    render(<DepthLadder store={seed()} convention={ZN} mid={MID} label="Book" depth={0} initialRect={RECT}>
      <DepthLadderViewport><DepthLadderRows>{() => <DepthLadderRow {...legacyProps}><DepthLadderSizeCell side="bid" /><DepthLadderPriceCell /><DepthLadderSizeCell side="ask" /></DepthLadderRow>}</DepthLadderRows></DepthLadderViewport>
    </DepthLadder>)
    const grid = screen.getByRole("grid")
    fireEvent.keyDown(grid, { key: "ArrowLeft" })
    const id = grid.getAttribute("aria-activedescendant")!
    expect(document.getElementById(id)).toBe(cell(6369, "bid"))
    expect(rung(6369)).toHaveAttribute("data-application-row", "yes")
  })
})
