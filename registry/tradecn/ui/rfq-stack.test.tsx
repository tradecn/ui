import { act, fireEvent, render, renderHook, screen, within } from "@testing-library/react"
import { StrictMode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useActiveInquiry } from "@/registry/tradecn/hooks/use-active-inquiry"
import type { GridRules } from "@/registry/tradecn/lib/grid-rules"
import { createRowStore, type RowStore } from "@/registry/tradecn/lib/row-store"
import { RfqStack, byArrival, bySize, byTimeLeft, formatStackSize, rfqStackColumns, rfqThresholdFilter, stackOrder, useRfqStackView, type RfqStackProps, type RfqStackRow } from "@/registry/tradecn/ui/rfq-stack"

const RECT = { width: 900, height: 220 }
const saved = new Map<string, PropertyDescriptor | undefined>()

beforeEach(() => {
  // happy-dom has real Web Animations, and a cancelled one leaves a rejected promise behind; record instead.
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

const NOW = Date.now()
const q1: RfqStackRow = { id: "q1", receivedAt: NOW - 3000, expiresAt: NOW + 60_000, client: "Client A", tier: "Tier 1", instrument: "T 4 1/8 05/15/34", side: "buy", quantity: 5_000_000, bid: 99.5, ask: 99.515625, status: "Open" }
const q2: RfqStackRow = { id: "q2", receivedAt: NOW - 2000, expiresAt: NOW + 40_000, client: "Client B", tier: "Tier 2", instrument: "T 4 1/4 02/15/29", side: "sell", quantity: 25_000_000, bid: 100.25, ask: 100.265625, status: "Open" }
const q3: RfqStackRow = { id: "q3", receivedAt: NOW - 1000, expiresAt: NOW + 20_000, client: "Client C", instrument: "T 3 7/8 08/15/33", side: "buy", quantity: 2_000_000, bid: 98.75, ask: 98.765625, status: "Quoted", auto: true }
const q4: RfqStackRow = { id: "q4", receivedAt: NOW - 500, expiresAt: NOW + 30_000, client: "Client D", instrument: "ZN", side: "two-way", quantity: 250, quantityUnit: "contracts", status: "Open" }
const ROWS = [q1, q2, q3, q4]

function seeded(): RowStore<RfqStackRow> {
  const store = createRowStore<RfqStackRow>({ getRowId: (r) => r.id, lane: "ordered" })
  store.applyDeltas({ upsert: ROWS })
  return store
}

function Harness({ store, ...props }: Partial<RfqStackProps> & { store: RowStore<RfqStackRow> }) {
  return (
    <div style={{ height: 300 }}>
      <RfqStack store={store} initialRect={RECT} {...props} />
    </div>
  )
}
const rowOf = (id: string) => document.querySelector<HTMLElement>(`[data-row-id="${id}"]`)!
const rows = () => document.querySelectorAll("[data-row-id]")

describe("rfqStackColumns", () => {
  it("is the inquiry's columns, in order, as a list to spread", () => {
    expect(rfqStackColumns().map((c) => c.key)).toEqual(["time", "client", "instrument", "side", "size", "bid", "ask", "status", "timeLeft", "auto"])
  })

  it("prints the size as the desk says it, the side as a word, the client with its tier, levels through your convention, a countdown per row, and the auto mark", () => {
    render(<Harness store={seeded()} price={(v) => v.toFixed(3)} />)
    expect(within(rowOf("q1")).getByText("5mm")).toBeInTheDocument()
    expect(within(rowOf("q4")).getByText("250")).toBeInTheDocument()
    expect(within(rowOf("q2")).getByText("SELL")).toBeInTheDocument()
    expect(within(rowOf("q4")).getByText("2-WAY")).toBeInTheDocument()
    expect(within(rowOf("q1")).getByText("Tier 1")).toBeInTheDocument()
    expect(within(rowOf("q1")).getByText("99.500")).toBeInTheDocument()
    expect(within(rowOf("q4")).getAllByText("–")).toHaveLength(2)
    const timer = within(rowOf("q1")).getByRole("timer", { name: "Time left q1" })
    expect(timer.dataset.tier).toBe("plenty")
    expect(timer.querySelector("[aria-hidden]")).toBeNull()
    expect(within(rowOf("q3")).getByText("auto")).toBeInTheDocument()
    expect(within(rowOf("q1")).queryByText("auto")).toBeNull()
    expect(within(rowOf("q3")).getByText("Quoted")).toBeInTheDocument()
  })

  it("says a size in millions or in contracts", () => {
    expect(formatStackSize(q1)).toBe("5mm")
    expect(formatStackSize({ ...q1, quantity: 50_000 })).toBe("0.05mm")
    expect(formatStackSize(q4)).toBe("250")
  })
})

describe("the threshold and the order", () => {
  it("hides an auto-quoted inquiry under the threshold and nothing else", () => {
    const under = rfqThresholdFilter<RfqStackRow>(5_000_000)
    expect(under(q1)).toBe(true)
    expect(under(q3)).toBe(false)
    expect(under({ ...q3, quantity: 5_000_000 })).toBe(true)
    expect(under({ ...q1, quantity: 1_000_000 })).toBe(true)
    expect(rfqThresholdFilter<RfqStackRow>(null)(q3)).toBe(true)
    expect(rfqThresholdFilter<RfqStackRow>(0)(q3)).toBe(true)
  })

  it("orders by time left, by size, by arrival, and chains them", () => {
    expect([q1, q2, q3].sort(byTimeLeft).map((r) => r.id)).toEqual(["q3", "q2", "q1"])
    expect([q1, q2, q3].sort(bySize).map((r) => r.id)).toEqual(["q2", "q1", "q3"])
    expect([q1, q2, q3].sort(byArrival).map((r) => r.id)).toEqual(["q3", "q2", "q1"])
    const same = { ...q3, id: "q5", quantity: q1.quantity, expiresAt: NOW + 10_000 }
    expect([q1, same, q2].sort(stackOrder(bySize, byTimeLeft)).map((r) => r.id)).toEqual(["q2", "q5", "q1"])
  })
})

describe("RfqStack", () => {
  it("is the rfq preset with the slot, marks the active row, and asks for a row in the ticket on Enter", () => {
    const onActivate = vi.fn()
    render(<Harness store={seeded()} activeId="q2" onActivate={onActivate} />)
    const root = document.querySelector<HTMLElement>('[data-slot="tradecn-rfq-stack"]')!
    expect(root.dataset.active).toBe("q2")
    expect(rowOf("q2").dataset.state).toBe("active")
    expect(rowOf("q1").dataset.state).toBeUndefined()
    expect(screen.getByRole("grid", { name: "Inquiries" })).toBeInTheDocument()
    const grid = screen.getByRole("grid")
    fireEvent.keyDown(grid, { key: "ArrowDown" })
    fireEvent.keyDown(grid, { key: "Enter" })
    expect(onActivate).toHaveBeenCalledWith("q1", expect.objectContaining({ id: "q1" }))
  })

  it("hides the small auto-quoted ones under the threshold, from the field or the prop, and shows the field only when asked", () => {
    const onThresholdChange = vi.fn()
    const { unmount } = render(<Harness store={seeded()} defaultThreshold={null} thresholdField onThresholdChange={onThresholdChange} />)
    expect(rows()).toHaveLength(4)
    const field = screen.getByLabelText("Hide auto under") as HTMLInputElement
    fireEvent.change(field, { target: { value: "5" } })
    expect(onThresholdChange).toHaveBeenCalledWith(5_000_000)
    expect(rows()).toHaveLength(3)
    expect(document.querySelector('[data-row-id="q3"]')).toBeNull()
    fireEvent.change(field, { target: { value: "" } })
    expect(onThresholdChange).toHaveBeenLastCalledWith(null)
    expect(rows()).toHaveLength(4)
    unmount()
    render(<Harness store={seeded()} threshold={10_000_000} />)
    expect(document.querySelector('[data-row-id="q3"]')).toBeNull()
    expect(rowOf("q1")).toBeInTheDocument()
    expect((screen.getByLabelText("Hide auto under") as HTMLInputElement).value).toBe("10")
  })

  it("has no threshold field unless a threshold prop is given, and applies your filter with its own", () => {
    const { unmount } = render(<Harness store={seeded()} />)
    expect(screen.queryByLabelText("Hide auto under")).toBeNull()
    expect(rows()).toHaveLength(4)
    unmount()
    render(<Harness store={seeded()} threshold={5_000_000} filter={(row) => row.side !== "two-way"} />)
    expect(rows()).toHaveLength(2)
  })
})

describe("useRfqStackView", () => {
  it("orders by the comparator, folds the threshold and your filter in, and is remade when the threshold moves", () => {
    const store = seeded()
    const notTwoWay = (row: RfqStackRow) => row.side !== "two-way"
    const { result, rerender } = renderHook(({ threshold }: { threshold: number | null }) => useRfqStackView(store, { comparator: bySize, threshold, filter: notTwoWay }), { initialProps: { threshold: null as number | null } })
    expect(result.current.getIds()).toEqual(["q2", "q1", "q3"])
    const before = result.current
    rerender({ threshold: 5_000_000 })
    expect(result.current).not.toBe(before)
    expect(result.current.getIds()).toEqual(["q2", "q1"])
    // The stack reads the same view, so what it shows is what the hook orders.
    render(<Harness store={store} view={result.current} threshold={5_000_000} />)
    expect(rows()).toHaveLength(2)
  })
})

describe("useActiveInquiry", () => {
  const ended = (row: RfqStackRow) => row.status === "Done" || row.status === "Expired"

  it("takes the first open inquiry in order, keeps it when others arrive, moves on when the server ends it, follows the trader, and says so once per change", () => {
    const store = seeded()
    const view = store.createView({ comparator: bySize })
    const onChange = vi.fn()
    const { result } = renderHook(() => useActiveInquiry(view, { isEnded: ended, onChange }))
    expect(result.current.activeId).toBe("q2")
    expect(result.current.row?.id).toBe("q2")
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenLastCalledWith("q2", expect.objectContaining({ id: "q2" }))
    // A bigger one arrives and sorts first: the active one does not move.
    act(() => store.applyDeltas({ upsert: [{ ...q1, id: "q9", quantity: 100_000_000 }] }))
    expect(view.getIds()[0]).toBe("q9")
    expect(result.current.activeId).toBe("q2")
    expect(onChange).toHaveBeenCalledTimes(1)
    // The server ends it: the first open one in order takes its place.
    act(() => store.applyDeltas({ patch: [{ id: "q2", fields: { status: "Done" } }] }))
    expect(result.current.activeId).toBe("q9")
    expect(onChange).toHaveBeenCalledTimes(2)
    // The trader picks one.
    act(() => result.current.setActive("q3"))
    expect(result.current.activeId).toBe("q3")
    expect(onChange).toHaveBeenCalledTimes(3)
    // The trader is done with it before the server has spoken: the next open one, not this one.
    act(() => result.current.next())
    expect(result.current.activeId).toBe("q9")
    // Nothing open: null, said once.
    act(() => store.applyDeltas({ patch: ["q9", "q1", "q3", "q4"].map((id) => ({ id, fields: { status: "Expired" } })) }))
    expect(result.current.activeId).toBeNull()
    expect(result.current.row).toBeNull()
    expect(onChange).toHaveBeenLastCalledWith(null, null)
    const calls = onChange.mock.calls.length
    act(() => store.applyDeltas({ patch: [{ id: "q1", fields: { bid: 99.53125 } }] }))
    expect(onChange).toHaveBeenCalledTimes(calls)
  })

  it("reads a store as well as a view, and a removed inquiry gives way", () => {
    const store = seeded()
    const { result } = renderHook(() => useActiveInquiry(store, { isEnded: ended }))
    expect(result.current.activeId).toBe("q1")
    act(() => store.applyDeltas({ remove: ["q1"] }))
    expect(result.current.activeId).toBe("q2")
  })
})

describe("useRfqStackView with rules", () => {
  it("folds the rules' filter in with the threshold and lets their sort break the comparator's ties", () => {
    const store = seeded()
    const rules: GridRules = {
      filter: [{ column: "status", op: "eq", value: "open" }],
      sort: [{ key: "time", dir: "desc" }],
    }
    // Every open inquiry, by side, then the rules' order, newest first.
    const bySide = (a: RfqStackRow, b: RfqStackRow) => a.side.localeCompare(b.side)
    const { result, rerender } = renderHook(({ threshold }: { threshold: number | null }) => useRfqStackView(store, { comparator: bySide, threshold, rules }), { initialProps: { threshold: null as number | null } })
    expect(result.current.getIds()).toEqual(["q1", "q2", "q4"])
    // Without a comparator the rules' sort is the order.
    const { result: ruled } = renderHook(() => useRfqStackView(store, { rules }))
    expect(ruled.current.getIds()).toEqual(["q4", "q2", "q1"])
    // The threshold still applies with the rules: the auto-quoted q3 was already out for its status; a person's stays.
    rerender({ threshold: 10_000_000 })
    expect(result.current.getIds()).toEqual(["q1", "q2", "q4"])
    // The stack, handed the same view and rules, shows exactly it and still colors by the rules.
    const colored: GridRules = { ...rules, columns: [{ id: "big", column: "size", when: { op: "gte", value: "20,000,000" }, tone: "primary", target: "row", label: "Large" }] }
    render(<Harness store={store} view={result.current} rules={colored} />)
    expect([...rows()].map((el) => el.getAttribute("data-row-id"))).toEqual(["q1", "q2", "q4"])
    expect(rowOf("q2")).toHaveAttribute("data-rule", "big")
    expect(rowOf("q2")).toHaveAttribute("aria-description", "Large")
    expect(rowOf("q1")).not.toHaveAttribute("data-rule")
  })
})

describe("useRfqStackView under StrictMode", () => {
  it("keeps following the store after the mount rehearsal", () => {
    const store = createRowStore<RfqStackRow>({ getRowId: (r) => r.id, lane: "ordered" })
    const { result } = renderHook(() => useRfqStackView(store, { comparator: bySize, threshold: 5_000_000 }), { wrapper: StrictMode })
    expect(result.current.getIds()).toEqual([])
    act(() => store.applyDeltas({ upsert: [q1, q2, q3] }))
    expect(result.current.getIds()).toEqual(["q2", "q1"])
    expect(result.current.isDisposed()).toBe(false)
  })
})
