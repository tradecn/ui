import { act, fireEvent, render, renderHook, screen, within } from "@testing-library/react"
import { StrictMode, useLayoutEffect } from "react"
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

  it("prints the null token for an arrival time that is not an instant, and never hands one to a formatter", () => {
    const time = vi.fn((ms: number) => `t${ms}`)
    const format = rfqStackColumns({ time })[0]!.format!
    for (const ms of [Number.NaN, Infinity, -Infinity, 8.64e15 + 1, -8.64e15 - 1]) expect(format(ms, q1)).toBe("–")
    expect(time).not.toHaveBeenCalled()
    // With the default clock, a bad time is one empty cell, not a stack taken down.
    const store = seeded()
    render(<Harness store={store} />)
    act(() => store.applyDeltas({ patch: [{ id: "q1", fields: { receivedAt: Number.NaN } }] }))
    expect(rowOf("q1").querySelector('[data-col="time"]')).toHaveTextContent(/^–$/)
    expect(rowOf("q2").querySelector('[data-col="time"]')).toHaveTextContent(/^\d{2}:\d{2}:\d{2}$/)
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
    const timer = within(rowOf("q1")).getByRole("timer", { name: /^Time left q1 / })
    expect(timer.dataset.tier).toBe("plenty")
    expect(timer.querySelector("[aria-hidden]")).toBeNull()
    expect(within(rowOf("q3")).getByText("auto")).toBeInTheDocument()
    expect(within(rowOf("q1")).queryByText("auto")).toBeNull()
    expect(within(rowOf("q3")).getByText("Quoted")).toBeInTheDocument()
  })

  it("prints a side outside the three as the server sent it", () => {
    const store = seeded()
    store.applyDeltas({ upsert: [{ ...q1, id: "q7", side: "cross" as RfqStackRow["side"] }, { ...q1, id: "q8", side: "__proto__" as RfqStackRow["side"] }] })
    render(<Harness store={store} />)
    expect(within(rowOf("q7")).getByText("cross")).toBeInTheDocument()
    expect(within(rowOf("q8")).getByText("__proto__")).toBeInTheDocument()
  })

  it("names each row's timer with the time left, so a row read from its cells says it", () => {
    render(<Harness store={seeded()} />)
    expect(within(rowOf("q1")).getByRole("timer")).toHaveAccessibleName(/^Time left q1 \d+:\d\d$/)
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

  it("puts a value that is not a finite number last, so one bad row cannot disorder the good ones", () => {
    const bad = { ...q2, id: "bad", expiresAt: NaN, quantity: NaN, receivedAt: NaN }
    // Store order sixty seconds, unreadable, twenty seconds: a raw subtraction leaves it as it is.
    expect([q1, bad, q3].sort(byTimeLeft).map((r) => r.id)).toEqual(["q3", "q1", "bad"])
    expect([q1, bad, q3].sort(bySize).map((r) => r.id)).toEqual(["q1", "q3", "bad"])
    expect([q1, bad, q3].sort(byArrival).map((r) => r.id)).toEqual(["q3", "q1", "bad"])
    // A comparator that cannot tell, NaN included, leaves it to the next.
    expect([q1, q2, q3].sort(stackOrder(() => NaN, bySize)).map((r) => r.id)).toEqual(["q2", "q1", "q3"])
  })
})

// Module-level, so the rows keep their identity across renders.
const idLabel = (row: RfqStackRow) => row.id

describe("RfqStack", () => {
  it("names each row by who asks, which way, and for what, which hold while its market moves, and takes your name instead", () => {
    const store = seeded()
    const { rerender } = render(<Harness store={store} />)
    expect([rowOf("q1"), rowOf("q4")].map((row) => row.getAttribute("aria-label"))).toEqual(["Client A, BUY, T 4 1/8 05/15/34", "Client D, 2-WAY, ZN"])
    act(() => store.applyDeltas({ patch: [{ id: "q1", fields: { bid: 99.75, status: "Quoted" } }] }))
    expect(rowOf("q1")).toHaveAttribute("aria-label", "Client A, BUY, T 4 1/8 05/15/34")
    rerender(<Harness store={store} getRowLabel={idLabel} />)
    expect(rowOf("q1")).toHaveAttribute("aria-label", "q1")
  })

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

  it("re-filters when your filter changes, without waiting for the feed, and redraws when getRowProps does", () => {
    const store = seeded()
    const ids = () => [...rows()].map((row) => row.getAttribute("data-row-id"))
    const { rerender } = render(<Harness store={store} filter={(row) => row.client === "Client A"} />)
    expect(ids()).toEqual(["q1"])
    rerender(<Harness store={store} filter={(row) => row.client === "Client B"} />)
    expect(ids()).toEqual(["q2"])
    rerender(<Harness store={store} filter={(row) => row.client === "Client B"} getRowProps={() => ({ className: "desk-rates" })} />)
    expect(rowOf("q2").className).toContain("desk-rates")
  })

  it("keeps its columns through a re-render with the same thresholds written inline", () => {
    const price = vi.fn((value: number) => value.toFixed(2))
    const store = seeded()
    const { rerender } = render(<Harness store={store} price={price} thresholds={{ soonMs: 10_000 }} />)
    const calls = price.mock.calls.length
    expect(calls).toBeGreaterThan(0)
    rerender(<Harness store={store} price={price} thresholds={{ soonMs: 10_000 }} />)
    expect(price.mock.calls.length).toBe(calls)
  })

  it("prints a threshold it is handed as plain digits, never as an exponent it would refuse", () => {
    const { rerender } = render(<Harness store={seeded()} threshold={0.5} thresholdField />)
    const field = screen.getByLabelText("Hide auto under") as HTMLInputElement
    expect(field.value).toBe("0.0000005")
    expect(field).not.toHaveAttribute("aria-invalid")
    rerender(<Harness store={seeded()} threshold={0.25} thresholdField />)
    expect(field.value).toBe("0.00000025")
    expect(field).not.toHaveAttribute("aria-invalid")
  })

  it("refuses a threshold that is not a plain size, marks it, and keeps the one in force", () => {
    const onThresholdChange = vi.fn()
    render(<Harness store={seeded()} defaultThreshold={5_000_000} thresholdField onThresholdChange={onThresholdChange} />)
    const field = screen.getByLabelText("Hide auto under") as HTMLInputElement
    for (const text of ["0x10", "1e3", "1,000", "2,5", "-1"]) {
      fireEvent.change(field, { target: { value: text } })
      expect(field).toHaveAttribute("aria-invalid", "true")
    }
    expect(onThresholdChange).not.toHaveBeenCalled()
    expect(document.querySelector('[data-row-id="q3"]')).toBeNull()
    fireEvent.change(field, { target: { value: "1.5" } })
    expect(field).not.toHaveAttribute("aria-invalid")
    expect(onThresholdChange).toHaveBeenLastCalledWith(1_500_000)
    fireEvent.change(field, { target: { value: "0" } })
    expect(onThresholdChange).toHaveBeenLastCalledWith(null)
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

  it("keeps the inquiry in the ticket when the trader picks one the server has just ended, or one that is gone", () => {
    const store = seeded()
    const view = store.createView({ comparator: byArrival })
    const { result } = renderHook(() => useActiveInquiry(view, { isEnded: ended }))
    act(() => result.current.setActive("q2"))
    expect(result.current.activeId).toBe("q2")
    // q4 ends on the server just before the trader's Enter on its row lands.
    act(() => store.applyDeltas({ patch: [{ id: "q4", fields: { status: "Expired" } }] }))
    act(() => result.current.setActive("q4"))
    expect(result.current.activeId).toBe("q2")
    act(() => result.current.setActive("missing"))
    expect(result.current.activeId).toBe("q2")
    // Null hands it back to the stack's own choice: the first open one in its order.
    act(() => result.current.setActive(null))
    expect(result.current.activeId).toBe("q3")
  })

  it("judges a pick by the end-state rule of the render that handed setActive out, a pick in that commit's layout effect included", () => {
    const store = seeded()
    const endsQ2 = (row: RfqStackRow) => ended(row) || row.id === "q2"
    function Picker({ isEnded, pick }: { isEnded: (row: RfqStackRow) => boolean; pick: string }) {
      const active = useActiveInquiry(store, { isEnded })
      const { setActive } = active
      useLayoutEffect(() => {
        setActive(pick)
      }, [pick, setActive])
      return <output>{active.activeId}</output>
    }
    const { rerender } = render(<Picker isEnded={ended} pick="q3" />)
    expect(screen.getByRole("status")).toHaveTextContent("q3")
    // The rule that ends q2 arrives in the same commit as the pick of q2: the pick is refused and q3 stays.
    rerender(<Picker isEnded={endsQ2} pick="q2" />)
    expect(screen.getByRole("status")).toHaveTextContent("q3")
  })

  it("keeps setActive one function through a new end-state rule, as v1 did", () => {
    const store = seeded()
    const { result, rerender } = renderHook(({ isEnded }: { isEnded: (row: RfqStackRow) => boolean }) => useActiveInquiry(store, { isEnded }), { initialProps: { isEnded: ended } })
    const first = result.current.setActive
    rerender({ isEnded: (row: RfqStackRow) => ended(row) })
    expect(result.current.setActive).toBe(first)
  })

  it("chooses and tells the same under StrictMode", () => {
    const store = seeded()
    const onChange = vi.fn()
    const { result } = renderHook(() => useActiveInquiry(store, { isEnded: ended, onChange }), { wrapper: StrictMode })
    expect(result.current.activeId).toBe("q1")
    expect(onChange).toHaveBeenCalledTimes(1)
    act(() => store.applyDeltas({ patch: [{ id: "q1", fields: { status: "Done" } }] }))
    expect(result.current.activeId).toBe("q2")
    expect(onChange).toHaveBeenCalledTimes(2)
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

describe("the stack's word beside a rule's", () => {
  it("joins its word on the active and a parked row to a row rule's description, and an empty label adds nothing", () => {
    const store = seeded()
    const large: GridRules = { columns: [{ id: "big", column: "size", when: { op: "gte", value: "5,000,000" }, tone: "primary", target: "row", label: "Large" }] }
    const { rerender } = render(<Harness store={store} rules={large} activeId="q2" parkedIds={new Set(["q1"])} />)
    expect(rowOf("q2")).toHaveAttribute("data-rule", "big")
    expect(rowOf("q2")).toHaveAttribute("aria-description", "Large, In the ticket")
    expect(rowOf("q1")).toHaveAttribute("aria-description", "Large, Parked")
    expect(rowOf("q4")).not.toHaveAttribute("aria-description")
    rerender(<Harness store={store} rules={large} activeId="q2" parkedIds={new Set(["q1"])} activeLabel="" />)
    expect(rowOf("q2")).toHaveAttribute("aria-description", "Large")
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

describe("parking", () => {
  const ended = (row: RfqStackRow) => row.status === "Done" || row.status === "Expired"

  it("a parked inquiry is never the next one, parking the active one hands the ticket on, picking one brings it back, and it leaves the set with its row", () => {
    const store = seeded()
    const view = store.createView({ comparator: bySize })
    const { result } = renderHook(() => useActiveInquiry(view, { isEnded: ended }))
    expect(result.current.activeId).toBe("q2")
    act(() => result.current.park("q2"))
    expect(result.current.activeId).toBe("q1")
    expect([...result.current.parked]).toEqual(["q2"])
    // The server ends the active one: the next open one is q3, not the parked q2 ahead of it.
    act(() => store.applyDeltas({ patch: [{ id: "q1", fields: { status: "Done" } }] }))
    expect(result.current.activeId).toBe("q3")
    // Let back in line, it waits its turn.
    act(() => result.current.unpark("q2"))
    expect(result.current.activeId).toBe("q3")
    expect(result.current.parked.size).toBe(0)
    // Picking a parked one is the trader's word: it is active and parked no more.
    act(() => result.current.park("q2"))
    act(() => result.current.setActive("q2"))
    expect(result.current.activeId).toBe("q2")
    expect(result.current.parked.has("q2")).toBe(false)
    // next() skips a parked row as well.
    act(() => result.current.park("q4"))
    act(() => result.current.next())
    expect(result.current.activeId).toBe("q3")
    // A parked row that leaves the store leaves the set.
    act(() => store.applyDeltas({ remove: ["q4"] }))
    expect(result.current.parked.size).toBe(0)
    view.dispose()
  })

  it("the stack mutes a parked row, marks it, and says so; the active mark wins", () => {
    render(<Harness store={seeded()} activeId="q2" parkedIds={new Set(["q1", "q2"])} />)
    expect(rowOf("q1").dataset.state).toBe("parked")
    expect(rowOf("q1").getAttribute("aria-description")).toBe("Parked")
    expect(rowOf("q1").className).toContain("text-muted-foreground")
    expect(rowOf("q2").dataset.state).toBe("active")
    expect(rowOf("q2").className).not.toContain("text-muted-foreground")
    // The active row is said to a screen reader too.
    expect(rowOf("q2").getAttribute("aria-description")).toBe("In the ticket")
    expect(rowOf("q3").dataset.state).toBeUndefined()
  })

  it("says the active row and a parked one in your words, and yours win over both", () => {
    const { rerender } = render(<Harness store={seeded()} activeId="q2" parkedIds={new Set(["q1"])} activeLabel="Quoting" parkedLabel="Set aside" />)
    expect(rowOf("q2").getAttribute("aria-description")).toBe("Quoting")
    expect(rowOf("q1").getAttribute("aria-description")).toBe("Set aside")
    rerender(<Harness store={seeded()} activeId="q2" parkedIds={new Set(["q1"])} getRowProps={() => ({ "aria-description": "Desk A" })} />)
    expect(rowOf("q2").getAttribute("aria-description")).toBe("Desk A")
    expect(rowOf("q1").getAttribute("aria-description")).toBe("Desk A")
  })
})
