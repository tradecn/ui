import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import { AuditTrail, DEFAULT_AUDIT_TRAIL_LABELS, auditTrailColumns, diffEvents, foldChanges, formatAuditValue, type AuditEvent } from "@/registry/tradecn/ui/audit-trail"

const T0 = 1_700_000_000_000
const EVENTS: AuditEvent[] = [
  { id: "e1", at: T0, event: "New", by: "trader", changes: [{ field: "quantity", to: 5000 }, { field: "price", to: "99-16+" }, { field: "status", to: "New" }] },
  { id: "e2", at: T0 + 1200, event: "Acknowledged", by: "venue", message: "Order id 8817", changes: [{ field: "status", from: "New", to: "Working" }] },
  { id: "e3", at: T0 + 4000, event: "PartiallyFilled", by: "venue", changes: [{ field: "filled", from: 0, to: 2000 }, { field: "status", from: "Working", to: "PartiallyFilled" }] },
  { id: "e4", at: T0 + 9000, event: "Amended", by: "trader", changes: [{ field: "price", from: "99-16+", to: "99-17" }] },
  { id: "e5", at: T0 + 9500, event: "Heartbeat", by: "system" },
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

describe("the pure parts", () => {
  it("folds the changes up to an event into the state at that moment", () => {
    expect(Object.fromEntries(foldChanges(EVENTS, "e1"))).toEqual({ quantity: 5000, price: "99-16+", status: "New" })
    expect(Object.fromEntries(foldChanges(EVENTS, "e3"))).toEqual({ quantity: 5000, price: "99-16+", status: "PartiallyFilled", filled: 2000 })
    expect(Object.fromEntries(foldChanges(EVENTS, "e5"))).toEqual({ quantity: 5000, price: "99-17", status: "PartiallyFilled", filled: 2000 })
  })

  it("differences two events whichever way they are named, and finds nothing between two that leave every field where it was", () => {
    expect(diffEvents(EVENTS, "e1", "e4")).toEqual([
      { field: "price", from: "99-16+", to: "99-17" },
      { field: "status", from: "New", to: "PartiallyFilled" },
      { field: "filled", from: undefined, to: 2000 },
    ])
    expect(diffEvents(EVENTS, "e4", "e1")).toEqual(diffEvents(EVENTS, "e1", "e4"))
    expect(diffEvents(EVENTS, "e4", "e5")).toEqual([])
    expect(diffEvents(EVENTS, "e1", "nope")).toEqual([])
  })

  it("prints a value as text and nothing as the null token", () => {
    expect(formatAuditValue(5000)).toBe("5000")
    expect(formatAuditValue("99-16+")).toBe("99-16+")
    expect(formatAuditValue(null)).toBe("–")
    expect(formatAuditValue(undefined)).toBe("–")
    expect(formatAuditValue("")).toBe("–")
    expect(formatAuditValue({ a: 1 })).toBe('{"a":1}')
  })

  it("lays out time, event, by, message, and the count of changed fields", () => {
    const columns = auditTrailColumns({ time: (ms) => `t${ms - T0}` })
    expect(columns.map((c) => c.key)).toEqual(["at", "event", "by", "message", "changes"])
    expect(columns[0]?.format?.(T0 + 1200, EVENTS[1]!)).toBe("t1200")
    expect(columns[4]?.format?.(3, EVENTS[0]!)).toBe("3 fields")
    expect(columns[4]?.format?.(0, EVENTS[4]!)).toBe("–")
    expect(columns.every((c) => c.flash === false)).toBe(true)
  })
})

describe("AuditTrail", () => {
  function setup(onExport?: (csv: string) => void) {
    const store = createRowStore<AuditEvent>({ getRowId: (e) => e.id, lane: "ordered" })
    store.applyDeltas({ upsert: EVENTS })
    render(<AuditTrail store={store} initialRect={RECT} time={(ms) => `t${ms - T0}`} onExport={onExport} />)
    const grid = screen.getByRole("grid", { name: "Audit trail" })
    const pane = screen.getByRole("region", { name: "Changes" })
    const row = (id: string) => document.querySelector<HTMLElement>(`[data-row-id="${id}"]`)!
    return { store, grid, pane, row }
  }

  it("is the tape with the pane beside it: nothing selected says so, one event shows its changes, two show the difference between them", () => {
    const { grid, pane, row } = setup()
    expect(document.querySelector("[data-slot='tradecn-audit-trail']")).toBeInTheDocument()
    expect(grid).toHaveAttribute("data-preset", "tape")
    expect(grid).toHaveAttribute("aria-multiselectable", "true")
    expect(grid).toHaveAttribute("aria-rowcount", "6")
    expect(row("e2")).toHaveTextContent("t1200AcknowledgedvenueOrder id 88171 fields")
    expect(row("e5").querySelector("[data-col='changes']")).toHaveTextContent("–")
    expect(pane).toHaveAttribute("data-audit-pane", "none")
    expect(pane).toHaveTextContent(DEFAULT_AUDIT_TRAIL_LABELS.select)
    // One event.
    fireEvent.pointerDown(row("e3").querySelector("[role='gridcell']")!)
    expect(pane).toHaveAttribute("data-audit-pane", "event")
    expect(within(pane).getByRole("heading")).toHaveTextContent("PartiallyFilled at t4000")
    const filled = pane.querySelector("[data-audit-change='filled']")!
    expect(filled.querySelector("[data-audit-from]")).toHaveTextContent("0")
    expect(filled.querySelector("[data-audit-to]")).toHaveTextContent("2000")
    expect(pane.querySelector("[data-audit-change='status'] [data-audit-to]")).toHaveTextContent("PartiallyFilled")
    expect(pane.querySelectorAll("[data-audit-change]")).toHaveLength(2)
    // An event that changed nothing.
    fireEvent.pointerDown(row("e5").querySelector("[role='gridcell']")!)
    expect(pane).toHaveTextContent(DEFAULT_AUDIT_TRAIL_LABELS.noChanges)
    // Two events: the difference, first by the trail's order whichever was clicked first.
    fireEvent.pointerDown(row("e4").querySelector("[role='gridcell']")!)
    fireEvent.pointerDown(row("e1").querySelector("[role='gridcell']")!, { ctrlKey: true })
    expect(pane).toHaveAttribute("data-audit-pane", "diff")
    expect(within(pane).getByRole("heading")).toHaveTextContent("New t0 to Amended t9000")
    expect([...pane.querySelectorAll("[data-audit-change]")].map((el) => el.getAttribute("data-audit-change"))).toEqual(["price", "status", "filled"])
    expect(pane.querySelector("[data-audit-change='price'] [data-audit-from]")).toHaveTextContent("99-16+")
    expect(pane.querySelector("[data-audit-change='price'] [data-audit-to]")).toHaveTextContent("99-17")
    expect(pane.querySelector("[data-audit-change='filled'] [data-audit-from]")).toHaveTextContent("–")
  })

  it("follows the trail as events arrive, redraws the pane for a change to a selected event, and exports what is shown as CSV", () => {
    const onExport = vi.fn()
    const { store, grid, pane, row } = setup(onExport)
    fireEvent.pointerDown(row("e4").querySelector("[role='gridcell']")!)
    act(() => store.applyDeltas({ upsert: [{ id: "e6", at: T0 + 12_000, event: "Filled", by: "venue", changes: [{ field: "filled", from: 2000, to: 5000 }, { field: "status", from: "PartiallyFilled", to: "Filled" }] }] }))
    expect(grid).toHaveAttribute("aria-rowcount", "7")
    expect(row("e6")).toHaveTextContent("Filled")
    // The server corrects the selected event's words: the pane follows.
    act(() => store.applyDeltas({ patch: [{ id: "e4", fields: { changes: [{ field: "price", from: "99-16+", to: "99-17+" }] } }] }))
    expect(pane.querySelector("[data-audit-change='price'] [data-audit-to]")).toHaveTextContent("99-17+")
    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }))
    expect(onExport).toHaveBeenCalledTimes(1)
    const csv = onExport.mock.calls[0]![0] as string
    expect(csv.split("\r\n")[0]).toBe("Time,Event,By,Message,Changes")
    expect(csv).toContain("t1200,Acknowledged,venue,Order id 8817,1 fields")
    expect(csv).toContain("t12000,Filled,venue,,2 fields")
    expect(csv.trim().split("\r\n")).toHaveLength(7)
  })

  it("takes the desk's own value formatter and hides the pane", () => {
    const store = createRowStore<AuditEvent>({ getRowId: (e) => e.id })
    store.applyDeltas({ upsert: EVENTS })
    const { rerender } = render(<AuditTrail store={store} initialRect={RECT} value={(field, v) => (field === "quantity" ? `${Number(v) / 1000}k` : formatAuditValue(v))} selection={new Set(["e1"])} />)
    const pane = screen.getByRole("region", { name: "Changes" })
    expect(pane.querySelector("[data-audit-change='quantity'] [data-audit-to]")).toHaveTextContent("5k")
    expect(pane.querySelector("[data-audit-change='price'] [data-audit-to]")).toHaveTextContent("99-16+")
    expect(screen.queryByRole("button", { name: "Export CSV" })).toBeNull()
    rerender(<AuditTrail store={store} initialRect={RECT} pane={false} />)
    expect(screen.queryByRole("region", { name: "Changes" })).toBeNull()
  })
})
