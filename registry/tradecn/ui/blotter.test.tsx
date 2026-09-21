import { act, fireEvent, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createRowStore, type RowStore } from "@/registry/tradecn/lib/row-store"
import { Blotter, allowedRows, blotterColumns, type BlotterAction, type BlotterProps, type BlotterRow } from "@/registry/tradecn/ui/blotter"

const RECT = { width: 900, height: 240 }
const saved = new Map<string, PropertyDescriptor | undefined>()

beforeEach(() => {
  // happy-dom's cancel() rejects `finished` without marking it handled, so a flash cancelled at unmount surfaces as an unhandled rejection.
  saved.set("animate", Object.getOwnPropertyDescriptor(HTMLElement.prototype, "animate"))
  Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, writable: true, value: vi.fn(() => ({ cancel: vi.fn(), currentTime: 0, onfinish: null })) })
  // No layout in happy-dom: the virtualizer reads offsetWidth and offsetHeight off the scroll container.
  for (const [prop, size] of [["offsetWidth", RECT.width], ["offsetHeight", RECT.height]] as const) {
    saved.set(prop, Object.getOwnPropertyDescriptor(HTMLElement.prototype, prop))
    Object.defineProperty(HTMLElement.prototype, prop, {
      configurable: true,
      get(this: HTMLElement) {
        return this.classList.contains("overflow-auto") ? size : 0
      },
    })
  }
})
afterEach(() => {
  for (const [prop, descriptor] of saved) {
    if (descriptor) Object.defineProperty(HTMLElement.prototype, prop, descriptor)
    else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[prop]
  }
  saved.clear()
  vi.restoreAllMocks()
})

const ORDERS: BlotterRow[] = [
  { id: "o1", time: 1, symbol: "ZN", side: "buy", quantity: 5000, filled: 2000, price: 110.5, status: "PartiallyFilled", account: "A-1", allowedActions: ["cancel", "amend"] },
  { id: "o2", time: 2, symbol: "ES", side: "sell", quantity: 10, filled: 0, price: 5012.25, status: "Working", account: "A-2", allowedActions: ["cancel"] },
  { id: "o3", time: 3, symbol: "CL", side: "buy", quantity: 3, filled: 3, price: null, status: "Filled" },
]

function seeded(): RowStore<BlotterRow> {
  const store = createRowStore<BlotterRow>({ getRowId: (r) => r.id })
  store.applyDeltas({ upsert: ORDERS })
  return store
}

function Harness({ store, ...props }: Partial<BlotterProps> & { store: RowStore<BlotterRow> }) {
  return (
    <div style={{ height: 320 }}>
      <Blotter store={store} initialRect={RECT} time={(ms) => `t${ms}`} {...props} />
    </div>
  )
}

const rowOf = (id: string) => document.querySelector<HTMLElement>(`[data-row-id="${id}"]`)!
const cancel = (run = vi.fn()): BlotterAction => ({ id: "cancel", label: "Cancel", run, destructive: true })

describe("blotterColumns", () => {
  it("prints an order: time and price your way, the side as a word, nothing for a missing price", () => {
    render(<Harness store={seeded()} price={(v) => `$${v}`} />)
    const zn = within(rowOf("o1"))
    expect(zn.getByText("t1")).toBeInTheDocument()
    expect(zn.getByText("BUY").className).toContain("text-up")
    expect(within(rowOf("o2")).getByText("SELL").className).toContain("text-down")
    expect(zn.getByText("5,000")).toBeInTheDocument()
    expect(zn.getByText("2,000")).toBeInTheDocument()
    expect(zn.getByText("$110.5")).toBeInTheDocument()
    // One null token per empty cell: o3 has no price and no account.
    expect(rowOf("o3").querySelector('[data-col="price"]')).toHaveTextContent("–")
    expect(rowOf("o3").querySelector('[data-col="account"]')).toHaveTextContent("–")
  })

  it("prints the status the server sent, and never works one out", () => {
    const store = seeded()
    render(<Harness store={store} />)
    // Filled 3 of 3 and still "Filled" only because the server said so; o1 is 2,000 of 5,000 and says what it was told.
    expect(within(rowOf("o1")).getByText("PartiallyFilled")).toBeInTheDocument()
    // Fully filled by the numbers, and the server has not said so yet: the blotter does not get ahead of it.
    act(() => store.applyDeltas({ patch: [{ id: "o1", fields: { filled: 5000 } }] }))
    expect(within(rowOf("o1")).getByText("PartiallyFilled")).toBeInTheDocument()
    act(() => store.applyDeltas({ patch: [{ id: "o1", fields: { status: "Done for day" } }] }))
    expect(within(rowOf("o1")).getByText("Done for day")).toBeInTheDocument()
  })

  it("has a default clock, and is a list you can spread", () => {
    expect(blotterColumns().map((c) => c.key)).toEqual(["time", "symbol", "side", "quantity", "filled", "price", "status", "account"])
    const format = blotterColumns()[0]!.format!
    expect(format(Date.UTC(2026, 0, 2, 3, 4, 5), ORDERS[0]!)).toMatch(/^\d{2}:\d{2}:\d{2}$/)
  })
})

describe("allowedRows", () => {
  it("keeps the orders that list the action, and treats no list as nothing allowed", () => {
    const store = seeded()
    expect(allowedRows(store, ["o1", "o2", "o3", "gone"], "cancel").ids).toEqual(["o1", "o2"])
    expect(allowedRows(store, ["o1", "o2", "o3"], "amend").ids).toEqual(["o1"])
    expect(allowedRows(store, ["o3"], "cancel")).toEqual({ rows: [], ids: [] })
  })
})

describe("Blotter", () => {
  it("is the blotter preset of the grid, multi-select with a checkbox column, under its own slot", () => {
    render(<Harness store={seeded()} />)
    const root = document.querySelector<HTMLElement>("[data-slot='tradecn-blotter']")!
    const grid = within(root).getByRole("grid", { name: "Blotter" })
    expect(grid).toHaveAttribute("data-preset", "blotter")
    expect(grid).toHaveAttribute("aria-multiselectable", "true")
    expect(within(rowOf("o1")).getByRole("checkbox", { name: "Select row" })).toBeInTheDocument()
    expect(screen.queryByRole("toolbar")).toBeNull()
  })

  it("starts a new order from its button", async () => {
    const user = userEvent.setup()
    const onNew = vi.fn()
    render(<Harness store={seeded()} onNew={onNew} newLabel="New ticket" />)
    await user.click(within(screen.getByRole("toolbar", { name: "Orders" })).getByRole("button", { name: "New ticket" }))
    expect(onNew).toHaveBeenCalledTimes(1)
  })

  it("offers an action for the orders that allow it, and says how many", () => {
    const run = vi.fn()
    const view = render(<Harness store={seeded()} actions={[cancel(run)]} />)
    const button = () => screen.getByRole("button", { name: /^Cancel/ })
    expect(button()).toBeDisabled()
    expect(button()).toHaveTextContent(/^Cancel$/)
    view.rerender(<Harness store={seeded()} actions={[cancel(run)]} selection={new Set(["o1", "o2"])} />)
    expect(button()).toHaveTextContent("Cancel 2")
    view.rerender(<Harness store={seeded()} actions={[cancel(run)]} selection={new Set(["o1", "o2", "o3"])} />)
    expect(button()).toHaveTextContent("Cancel 2 of 3")
    expect(screen.getByText("3 selected")).toBeInTheDocument()
    view.rerender(<Harness store={seeded()} actions={[cancel(run)]} selection={new Set(["o3"])} />)
    expect(button()).toBeDisabled()
  })

  it("runs an action on the allowed orders only", async () => {
    const user = userEvent.setup()
    const run = vi.fn()
    render(<Harness store={seeded()} actions={[cancel(run)]} selection={new Set(["o1", "o2", "o3"])} />)
    await user.click(screen.getByRole("button", { name: "Cancel 2 of 3" }))
    expect(run).toHaveBeenCalledTimes(1)
    expect(run.mock.calls[0]![1]).toEqual(["o1", "o2"])
    expect(run.mock.calls[0]![0].map((r: BlotterRow) => r.symbol)).toEqual(["ZN", "ES"])
  })

  it("acts on the focused order when nothing is selected", async () => {
    const user = userEvent.setup()
    const run = vi.fn()
    render(<Harness store={seeded()} actions={[cancel(run)]} focusedRowId="o2" />)
    await user.click(screen.getByRole("button", { name: "Cancel 1" }))
    expect(run.mock.calls[0]![1]).toEqual(["o2"])
  })

  it("follows the store: an order that stops allowing an action drops out of the count without the grid re-rendering", () => {
    let cellRenders = 0
    const columns = [...blotterColumns(), { key: "probe", header: "Probe", width: 40, accessor: () => 0, cell: () => ((cellRenders += 1), (<i>p</i>)) }]
    const store = seeded()
    render(<Harness store={store} columns={columns} actions={[cancel()]} selection={new Set(["o1", "o2"])} />)
    expect(screen.getByRole("button", { name: "Cancel 2" })).toBeInTheDocument()
    const before = cellRenders
    act(() => store.applyDeltas({ patch: [{ id: "o2", fields: { status: "Filled", allowedActions: [] } }] }))
    expect(screen.getByRole("button", { name: "Cancel 1 of 2" })).toBeInTheDocument()
    // One row changed, so one row's cells rendered. The other two did not.
    expect(cellRenders).toBe(before + 1)
    act(() => store.applyDeltas({ remove: ["o1"] }))
    expect(screen.getByRole("button", { name: /^Cancel/ })).toBeDisabled()
  })

  it("asks the store again as the click lands, not what the button said when it was drawn", () => {
    const run = vi.fn()
    const store = seeded()
    render(<Harness store={store} actions={[cancel(run)]} selection={new Set(["o1", "o2"])} />)
    const button = screen.getByRole("button", { name: "Cancel 2" })
    // The order fills between the draw and the press. No act(): React has not re-rendered yet.
    store.applyDeltas({ patch: [{ id: "o2", fields: { allowedActions: [] } }] })
    fireEvent.click(button)
    expect(run.mock.calls[0]![1]).toEqual(["o1"])
    store.applyDeltas({ patch: [{ id: "o1", fields: { allowedActions: [] } }] })
    fireEvent.click(button)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it("leaves Delete alone unless you name the action it runs", () => {
    const run = vi.fn()
    const view = render(<Harness store={seeded()} actions={[cancel(run)]} selection={new Set(["o1", "o3"])} />)
    fireEvent.keyDown(screen.getByRole("grid"), { key: "Delete" })
    expect(run).not.toHaveBeenCalled()
    view.rerender(<Harness store={seeded()} actions={[cancel(run)]} selection={new Set(["o1", "o3"])} deleteAction="cancel" />)
    fireEvent.keyDown(screen.getByRole("grid"), { key: "Delete" })
    expect(run.mock.calls[0]![1]).toEqual(["o1"])
    fireEvent.keyDown(screen.getByRole("button", { name: /^Cancel/ }), { key: "Backspace" })
    expect(run).toHaveBeenCalledTimes(1)
  })

  it("does not re-render a row when the parent re-renders with inline actions", async () => {
    const user = userEvent.setup()
    let cellRenders = 0
    const columns = [...blotterColumns(), { key: "probe", header: "Probe", width: 40, accessor: () => 0, cell: () => ((cellRenders += 1), (<i>p</i>)) }]
    const store = seeded()
    function Parent() {
      const [n, setN] = useState(0)
      return (
        <>
          <button onClick={() => setN(n + 1)}>parent {n}</button>
          <Harness store={store} columns={columns} onNew={() => {}} actions={[{ id: "cancel", label: "Cancel", run: () => {} }]} renderContextMenu={() => null} />
        </>
      )
    }
    render(<Parent />)
    const before = cellRenders
    await user.click(screen.getByRole("button", { name: /parent/ }))
    expect(cellRenders).toBe(before)
  })
})
