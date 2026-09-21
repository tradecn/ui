import { act, fireEvent, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createRowStore, type RowId, type RowStore } from "@/registry/tradecn/lib/row-store"
import { Watchlist, watchlistColumns, type WatchlistProps, type WatchlistRow } from "@/registry/tradecn/ui/watchlist"

const RECT = { width: 700, height: 220 }
const saved = new Map<string, PropertyDescriptor | undefined>()

beforeEach(() => {
  // happy-dom has real Web Animations now, and its cancel() rejects `finished` without marking it
  // handled the way the spec says to, so a flash cancelled at unmount surfaces as an unhandled rejection.
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

const ROWS: WatchlistRow[] = [
  { symbol: "ZN", last: 110.5, bid: 110.46875, ask: 110.53125, change: 0.25, changePct: 0.23, volume: 1_250_000 },
  { symbol: "ES", last: 5012.25, bid: 5012, ask: 5012.5, change: -12.5, changePct: -0.25, volume: 980_000 },
  { symbol: "CL", last: 78.1, change: 0, changePct: 0, volume: null },
]

function seeded(): RowStore<WatchlistRow> {
  const store = createRowStore<WatchlistRow>({ getRowId: (r) => r.symbol })
  store.applyDeltas({ upsert: ROWS })
  return store
}

function Harness({ store, ...props }: Partial<WatchlistProps> & { store: RowStore<WatchlistRow> }) {
  return (
    <div style={{ height: 300 }}>
      <Watchlist store={store} initialRect={RECT} {...props} />
    </div>
  )
}

const rowOf = (symbol: string) => document.querySelector<HTMLElement>(`[data-row-id="${symbol}"]`)!

describe("watchlistColumns", () => {
  it("prints prices through your convention, signs the changes, and uses one token for nothing", () => {
    const store = seeded()
    render(<Harness store={store} price={(v, row) => (row.symbol === "ZN" ? `${Math.floor(v)}-${String(Math.round((v % 1) * 32)).padStart(2, "0")}` : v.toFixed(2))} />)
    expect(within(rowOf("ZN")).getByText("110-16")).toBeInTheDocument()
    expect(within(rowOf("ES")).getByText("5012.25")).toBeInTheDocument()
    expect(within(rowOf("ZN")).getByText("+0.25")).toBeInTheDocument()
    expect(within(rowOf("ES")).getByText("−12.50")).toBeInTheDocument()
    expect(within(rowOf("ES")).getByText("−0.25%")).toBeInTheDocument()
    // No bid, no ask, no volume: one sentinel each, never a blank or a NaN.
    expect(within(rowOf("CL")).getAllByText("–")).toHaveLength(3)
  })

  it("colors a change by its sign, and zero is flat", () => {
    render(<Harness store={seeded()} />)
    expect(within(rowOf("ZN")).getByText("+0.25").className).toContain("text-up")
    expect(within(rowOf("ES")).getByText("−12.50").className).toContain("text-down")
    expect(within(rowOf("CL")).getByText("0.00").className).toContain("text-flat")
  })

  it("is a list you can spread into your own", () => {
    const keys = watchlistColumns().map((c) => c.key)
    expect(keys).toEqual(["symbol", "last", "bid", "ask", "change", "changePct", "volume"])
    const store = seeded()
    render(<Harness store={store} columns={[...watchlistColumns().slice(0, 2), { key: "name", header: "Name", width: 120, accessor: (r) => r.name ?? "" }]} />)
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual(expect.arrayContaining([expect.stringContaining("Name")]))
    expect(screen.queryByRole("columnheader", { name: /Volume/ })).toBeNull()
  })
})

describe("Watchlist", () => {
  it("is the watchlist preset of the grid, under its own slot", () => {
    render(<Harness store={seeded()} />)
    const root = document.querySelector("[data-slot='tradecn-watchlist']")!
    const grid = within(root as HTMLElement).getByRole("grid", { name: "Watchlist" })
    expect(grid).toHaveAttribute("data-preset", "watchlist")
    expect(grid).toHaveAttribute("aria-rowcount", "4")
  })

  it("has no add field and nothing to remove with until you ask for them", () => {
    render(<Harness store={seeded()} />)
    expect(screen.queryByRole("textbox")).toBeNull()
    expect(screen.queryByRole("button", { name: /Remove/ })).toBeNull()
  })

  it("adds what you type, trimmed and upper-cased, and keeps the field for the next one", async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn()
    render(<Harness store={seeded()} onAdd={onAdd} />)
    const field = screen.getByRole("textbox", { name: "Add symbol" })
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled()
    await user.type(field, " gc {Enter}")
    expect(onAdd).toHaveBeenCalledWith("GC")
    expect(field).toHaveValue("")
    expect(field).toHaveFocus()
    await user.type(field, "nq")
    await user.click(screen.getByRole("button", { name: "Add" }))
    expect(onAdd).toHaveBeenLastCalledWith("NQ")
  })

  it("goes to a symbol that is already on the list instead of adding it twice", async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn()
    const onSelectionChange = vi.fn()
    render(<Harness store={seeded()} onAdd={onAdd} onSelectionChange={onSelectionChange} />)
    await user.type(screen.getByRole("textbox"), "es{Enter}")
    expect(onAdd).not.toHaveBeenCalled()
    expect(rowOf("ES")).toHaveAttribute("aria-selected", "true")
    expect(rowOf("ES")).toHaveAttribute("data-focused", "true")
    expect([...onSelectionChange.mock.lastCall![0]]).toEqual(["ES"])
  })

  it("keeps a symbol that does not validate in the field, marked invalid, until it changes", async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn()
    render(<Harness store={seeded()} onAdd={onAdd} validate={(s) => s !== "NOPE"} />)
    const field = screen.getByRole("textbox")
    await user.type(field, "nope{Enter}")
    expect(onAdd).not.toHaveBeenCalled()
    expect(field).toHaveValue("nope")
    expect(field).toHaveAttribute("aria-invalid", "true")
    await user.type(field, "x")
    expect(field).not.toHaveAttribute("aria-invalid")
  })

  it("removes the focused row on Delete, and the whole selection when there is one", () => {
    const onRemove = vi.fn()
    const view = render(<Harness store={seeded()} onRemove={onRemove} focusedRowId="ES" />)
    const grid = screen.getByRole("grid")
    fireEvent.keyDown(grid, { key: "Delete" })
    expect(onRemove).toHaveBeenLastCalledWith(["ES"])
    view.rerender(<Harness store={seeded()} onRemove={onRemove} focusedRowId="ES" selection={new Set(["ZN", "CL"])} />)
    fireEvent.keyDown(screen.getByRole("grid"), { key: "Backspace" })
    expect(onRemove).toHaveBeenLastCalledWith(["ZN", "CL"])
  })

  it("leaves Delete and Backspace alone in the add field, and does nothing with no row in hand", async () => {
    const user = userEvent.setup()
    const onRemove = vi.fn()
    render(<Harness store={seeded()} onAdd={() => {}} onRemove={onRemove} />)
    fireEvent.keyDown(screen.getByRole("grid"), { key: "Delete" })
    const field = screen.getByRole("textbox")
    await user.type(field, "zn{Backspace}")
    expect(field).toHaveValue("z")
    expect(onRemove).not.toHaveBeenCalled()
  })

  it("gives each row a remove button that stays out of the tab order", async () => {
    const user = userEvent.setup()
    const onRemove = vi.fn()
    render(<Harness store={seeded()} onRemove={onRemove} />)
    const button = within(rowOf("CL")).getByRole("button", { name: "Remove CL" })
    expect(button).toHaveAttribute("tabindex", "-1")
    await user.click(button)
    expect(onRemove).toHaveBeenCalledWith(["CL"])
  })

  it("follows the store: a removed symbol leaves, an added one arrives", () => {
    function Live() {
      const [store] = useState(seeded)
      return <Harness store={store} onAdd={(symbol) => store.applyDeltas({ upsert: [{ symbol, last: 1 }] })} onRemove={(ids: RowId[]) => store.applyDeltas({ remove: ids })} focusedRowId="ZN" />
    }
    render(<Live />)
    fireEvent.keyDown(screen.getByRole("grid"), { key: "Delete" })
    expect(rowOf("ZN")).toBeNull()
    expect(screen.getByRole("grid")).toHaveAttribute("aria-rowcount", "3")
  })

  it("does not re-render a row of the grid while you type in the add field, or when the parent re-renders", async () => {
    const user = userEvent.setup()
    let cellRenders = 0
    const columns = [...watchlistColumns(), { key: "probe", header: "Probe", width: 40, accessor: () => 0, cell: () => ((cellRenders += 1), (<i>p</i>)) }]
    const store = seeded()
    function Parent() {
      const [n, setN] = useState(0)
      // Inline callbacks on purpose: the component reads them through a ref so they can be.
      return (
        <>
          <button onClick={() => setN(n + 1)}>parent {n}</button>
          <Harness store={store} columns={columns} onAdd={() => {}} onRemove={() => {}} renderContextMenu={() => null} />
        </>
      )
    }
    render(<Parent />)
    const before = cellRenders
    expect(before).toBeGreaterThan(0)
    await user.type(screen.getByRole("textbox"), "abcdef")
    expect(cellRenders).toBe(before)
    await user.click(screen.getByRole("button", { name: /parent/ }))
    expect(cellRenders).toBe(before)
    // And a delta to one row still re-renders that row.
    act(() => store.applyDeltas({ patch: [{ id: "ZN", fields: { last: 111 } }] }))
    expect(cellRenders).toBe(before + 1)
  })
})
