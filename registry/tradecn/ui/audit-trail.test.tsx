import { createRef, StrictMode, useLayoutEffect, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { AuditChangesTable } from "@/demos/audit-trail"
import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import { AuditTrail, AuditTrailChanges, AuditTrailGrid, AuditTrailExportButton, useAuditTrail, useAuditTrailChanges, DEFAULT_AUDIT_TRAIL_LABELS, auditTrailColumns, diffEvents, foldChanges, formatAuditValue, type AuditEvent } from "@/registry/tradecn/ui/audit-trail"

const T0 = 1_700_000_000_000
const EVENTS: AuditEvent[] = [
  { id: "e1", at: T0, event: "New", by: "trader", changes: [{ field: "quantity", to: 5000 }, { field: "price", to: "99-16+" }, { field: "status", to: "New" }] },
  { id: "e2", at: T0 + 1200, event: "Acknowledged", by: "venue", message: "Order id 8817", changes: [{ field: "status", from: "New", to: "Working" }] },
  { id: "e3", at: T0 + 4000, event: "PartiallyFilled", by: "venue", changes: [{ field: "filled", from: 0, to: 2000 }, { field: "status", from: "Working", to: "PartiallyFilled" }] },
  { id: "e4", at: T0 + 9000, event: "Amended", by: "trader", changes: [{ field: "price", from: "99-16+", to: "99-17" }] },
  { id: "e5", at: T0 + 9500, event: "Heartbeat", by: "system" },
]

const RECT = { width: 900, height: 200 }

const descriptors = new Map(["animate", "offsetWidth", "offsetHeight"].map(key => [key, Object.getOwnPropertyDescriptor(HTMLElement.prototype, key)]))
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
afterEach(() => {
  vi.restoreAllMocks()
  for (const [key, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(HTMLElement.prototype, key, descriptor)
    else Reflect.deleteProperty(HTMLElement.prototype, key)
  }
})

describe("the pure parts", () => {
  it("prints whole milliseconds for a fractional timestamp", () => {
    // A server timestamp of 1700000000123.4 must read .123, never .123.4000000953.
    const columns = auditTrailColumns()
    const at = columns.find(column => column.key === "at")!
    const printed = at.format!(1_700_000_000_123.4, { id: "e", at: 1_700_000_000_123.4, kind: "fill", message: "x" } as never)
    expect(printed).toMatch(/\.123$/)
  })

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
    expect(columns[4]?.format?.(3, EVENTS[0]!)).toBe("Fields: 3")
    expect(columns[4]?.format?.(0, EVENTS[4]!)).toBe("–")
    expect(columns.every((c) => c.flash === false)).toBe(true)
  })
})

describe("AuditTrail", () => {
  function setup(onExport?: (csv: string) => void) {
    const store = createRowStore<AuditEvent>({ getRowId: (e) => e.id, lane: "ordered" })
    store.applyDeltas({ upsert: EVENTS })
    render(<AuditTrail store={store} time={(ms) => `t${ms - T0}`}>
      {onExport && <AuditTrailExportButton onExport={onExport} />}
      <AuditTrailGrid initialRect={RECT} />
      <AuditChangesTable />
    </AuditTrail>)
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
    expect(row("e2")).toHaveTextContent("t1200AcknowledgedvenueOrder id 8817Fields: 1")
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
    expect(csv).toContain("t1200,Acknowledged,venue,Order id 8817,Fields: 1")
    expect(csv).toContain("t12000,Filled,venue,,Fields: 2")
    expect(csv.trim().split("\r\n")).toHaveLength(7)
  })

  it("takes the desk's own value formatter and hides the pane", () => {
    const store = createRowStore<AuditEvent>({ getRowId: (e) => e.id })
    store.applyDeltas({ upsert: EVENTS })
    const { rerender } = render(<AuditTrail store={store} value={(field, v) => (field === "quantity" ? `${Number(v) / 1000}k` : formatAuditValue(v))} selection={new Set(["e1"])}><AuditTrailGrid initialRect={RECT} /><AuditChangesTable /></AuditTrail>)
    const pane = screen.getByRole("region", { name: "Changes" })
    expect(pane.querySelector("[data-audit-change='quantity'] [data-audit-to]")).toHaveTextContent("5k")
    expect(pane.querySelector("[data-audit-change='price'] [data-audit-to]")).toHaveTextContent("99-16+")
    expect(screen.queryByRole("button", { name: "Export CSV" })).toBeNull()
    rerender(<AuditTrail store={store}><AuditTrailGrid initialRect={RECT} /></AuditTrail>)
    expect(screen.queryByRole("region", { name: "Changes" })).toBeNull()
  })
})

function seeded() {
  const store = createRowStore<AuditEvent>({ getRowId: event => event.id, lane: "ordered" })
  store.applyDeltas({ upsert: EVENTS })
  return store
}

function Reading({ children }: { children?: ReactNode }) {
  const state = useAuditTrailChanges()
  return <output data-kind={state.kind}>{state.title}|{state.emptyMessage}|{state.changes.map(change => `${change.field}:${state.formatValue(change.field, change.from)}>${state.formatValue(change.field, change.to)}`).join(",")}{children}</output>
}

describe("composition and shared behavior", () => {
  it("forwards native refs and events, and gives the ordinary table real column and row headers", () => {
    const root = createRef<HTMLDivElement>()
    const section = createRef<HTMLElement>()
    const button = createRef<HTMLButtonElement>()
    const key = vi.fn()
    const clicked = vi.fn()
    const store = seeded()
    render(<AuditTrail ref={root} store={store} selection={new Set(["e1"])} onKeyDown={key} aria-label="Order history">
      <AuditChangesTable />
      <AuditTrailChanges ref={section} aria-label="Notes" onClick={clicked}><Reading /></AuditTrailChanges>
      <AuditTrailExportButton ref={button} onExport={() => {}} title="Download">Save</AuditTrailExportButton>
    </AuditTrail>)
    expect(root.current).toHaveAttribute("aria-label", "Order history")
    fireEvent.keyDown(root.current!, { key: "Escape" })
    expect(key).toHaveBeenCalledOnce()
    fireEvent.click(section.current!)
    expect(clicked).toHaveBeenCalledOnce()
    expect(button.current).toHaveAccessibleName("Save")
    expect(button.current).toHaveAttribute("type", "button")
    const table = screen.getByRole("table", { name: "Changes" })
    expect(within(table).getAllByRole("columnheader").map(header => header.textContent)).toEqual(["Field", "From", "To"])
    for (const header of within(table).getAllByRole("columnheader")) expect(header).toHaveAttribute("scope", "col")
    for (const header of within(table).getAllByRole("rowheader")) expect(header).toHaveAttribute("scope", "row")
  })

  it("keeps the root and export controls out of store subscriptions, reads current CSV, and respects cancellation and disabled", () => {
    const store = seeded()
    const meta = vi.spyOn(store, "subscribeMeta")
    const order = vi.spyOn(store, "subscribeOrder")
    const renderRoot = vi.fn()
    function Controls() {
      renderRoot()
      const { exportCsv } = useAuditTrail()
      return <button onClick={() => custom(exportCsv())}>Custom export</button>
    }
    const custom = vi.fn()
    const exported = vi.fn()
    const { rerender } = render(<AuditTrail store={store}><Controls /><AuditTrailExportButton onExport={exported} /></AuditTrail>)
    act(() => store.applyDeltas({ patch: [{ id: "e1", fields: { message: "corrected" } }], upsert: [{ id: "e6", at: T0 + 12000, event: "Filled" }] }))
    expect(meta).not.toHaveBeenCalled()
    expect(order).not.toHaveBeenCalled()
    expect(renderRoot).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }))
    expect(exported.mock.calls[0]![0]).toContain("corrected")
    expect(exported.mock.calls[0]![0]).toContain("Filled")
    fireEvent.click(screen.getByRole("button", { name: "Custom export" }))
    expect(custom.mock.calls[0]![0]).toBe(exported.mock.calls[0]![0])
    rerender(<AuditTrail store={store}><AuditTrailExportButton onExport={exported} onClick={event => event.preventDefault()} /></AuditTrail>)
    fireEvent.click(screen.getByRole("button"))
    rerender(<AuditTrail store={store}><AuditTrailExportButton onExport={exported} disabled /></AuditTrail>)
    fireEvent.click(screen.getByRole("button"))
    expect(exported).toHaveBeenCalledOnce()
  })

  it("uses the current view, columns and callbacks before descendant layout effects run", () => {
    const store = seeded()
    const view = store.createView({ filter: event => event.id === "e2" })
    const first = vi.fn()
    const second = vi.fn()
    const columns = auditTrailColumns<AuditEvent>({ time: ms => `t${ms - T0}` }).filter(column => column.key === "event")
    const csv = vi.fn()
    function Commands({ tick }: { tick: number }) {
      const { select, exportCsv } = useAuditTrail()
      useLayoutEffect(() => { select(new Set(["e2"])); csv(exportCsv()) }, [select, exportCsv, tick])
      return null
    }
    const { rerender, unmount } = render(<AuditTrail store={store} selection={new Set()} onSelectionChange={first}><Commands tick={0} /></AuditTrail>)
    rerender(<AuditTrail store={store} view={view} columns={columns} selection={new Set()} onSelectionChange={second}><Commands tick={1} /></AuditTrail>)
    expect(first).toHaveBeenCalledOnce()
    expect(second).toHaveBeenCalledWith(new Set(["e2"]))
    expect(csv.mock.calls[1]![0]).toBe("Event\r\nAcknowledged\r\n")
    unmount()
    expect(view.isDisposed()).toBe(false)
    view.dispose()
  })

  it("shares one scope subscription with any number of readings and cleans up StrictMode/store/view changes", () => {
    const store = seeded()
    const other = seeded()
    const active = new Set<() => void>()
    for (const source of [store, other]) {
      for (const method of ["subscribeMeta", "subscribeOrder"] as const) {
        const subscribe = source[method].bind(source)
        vi.spyOn(source, method).mockImplementation(callback => {
          active.add(callback)
          const off = subscribe(callback)
          return () => { active.delete(callback); off() }
        })
      }
    }
    const selected = new Set(["e3"])
    const content = <><Reading /><Reading /></>
    const { rerender, unmount } = render(<StrictMode><AuditTrail store={store} selection={selected}><AuditTrailChanges>{content}</AuditTrailChanges></AuditTrail></StrictMode>)
    expect(active.size).toBe(2)
    act(() => store.applyDeltas({ patch: [{ id: "e3", fields: { changes: [{ field: "filled", from: 0, to: 2100 }] } }] }))
    for (const output of screen.getAllByRole("status")) expect(output).toHaveTextContent("filled:0>2100")
    const view = other.createView({ filter: event => event.id !== "e5" })
    rerender(<StrictMode><AuditTrail store={other} view={view} selection={selected}><AuditTrailChanges>{content}</AuditTrailChanges></AuditTrail></StrictMode>)
    // The caller-owned view has its own subscription; the changes scope owns only metadata now.
    expect(active.size).toBe(1)
    for (const output of screen.getAllByRole("status")) expect(output).toHaveTextContent("filled:0>2000")
    unmount()
    expect(active.size).toBe(0)
    expect(view.isDisposed()).toBe(false)
    view.dispose()
  })

  it("updates a comparison when preceding history changes, preserves ordering, and ignores missing rows", () => {
    const store = seeded()
    const value = vi.fn((field: string, raw: unknown, event: AuditEvent) => `${field}=${formatAuditValue(raw)}@${event.id}`)
    const { rerender } = render(<AuditTrail store={store} value={value} selection={new Set(["e5", "e3", "missing"])} time={ms => `t${ms - T0}`}><AuditTrailChanges><Reading /></AuditTrailChanges></AuditTrail>)
    expect(screen.getByRole("status")).toHaveTextContent("PartiallyFilled t4000 to Heartbeat t9500")
    expect(screen.getByRole("status")).toHaveTextContent("price:price=99-16+@e5>price=99-17@e5")
    act(() => store.applyDeltas({ patch: [{ id: "e1", fields: { changes: [{ field: "price", to: "98-00" }] } }] }))
    expect(screen.getByRole("status")).toHaveTextContent("price=98-00@e5")
    act(() => store.applyDeltas({ remove: ["e5"] }))
    expect(screen.getByRole("status")).toHaveAttribute("data-kind", "event")
    act(() => store.applyDeltas({ remove: ["e3"] }))
    expect(screen.getByRole("status")).toHaveAttribute("data-kind", "none")
    rerender(<AuditTrail store={store} selection={new Set(["e1", "e4"])}><AuditTrailChanges>{({ changes }) => <ol>{[...changes].reverse().map((change, index) => <li key={index}>{change.field}</li>)}</ol>}</AuditTrailChanges></AuditTrail>)
    expect(screen.getAllByRole("listitem").map(item => item.textContent)).toEqual(["status", "price"])
  })

  it("lets callers select without a grid, keeps controlled selection authoritative and shares localized empty readings", () => {
    const store = seeded()
    const selected = vi.fn()
    function Select() {
      const { select } = useAuditTrail()
      return <button onClick={() => select(new Set(["e5"]))}>Choose heartbeat</button>
    }
    const parts = <><Select /><AuditTrailChanges><Reading /></AuditTrailChanges></>
    const { rerender } = render(<AuditTrail store={store} onSelectionChange={selected} labels={{ noChanges: "No fields" }}>{parts}</AuditTrail>)
    fireEvent.click(screen.getByRole("button"))
    expect(selected).toHaveBeenCalledWith(new Set(["e5"]))
    expect(screen.getByRole("status")).toHaveTextContent("No fields")
    rerender(<AuditTrail store={store} selection={new Set(["e4", "e5"])} labels={{ same: "No difference" }}>{parts}</AuditTrail>)
    fireEvent.click(screen.getByRole("button"))
    expect(screen.getByRole("status")).toHaveAttribute("data-kind", "diff")
    expect(screen.getByRole("status")).toHaveTextContent("No difference")
  })

  it("keeps the event array intact when untyped consumer code reorders a reading", () => {
    const store = seeded()
    store.applyDeltas({ patch: [{ id: "e1", fields: { changes: [{ field: "alpha", to: 1 }, { field: "beta", to: 2 }] } }] })
    render(<AuditTrail store={store} selection={new Set(["e1"])}><AuditTrailChanges>{({ changes }) => (
      <button onClick={() => { Reflect.apply(Array.prototype.reverse, changes, []) }}>Reverse displayed changes</button>
    )}</AuditTrailChanges></AuditTrail>)
    fireEvent.click(screen.getByRole("button", { name: "Reverse displayed changes" }))
    expect(store.getRow("e1")?.changes?.map(change => change.field)).toEqual(["alpha", "beta"])
  })

  it("carries its own numeric styling and slot through a portal", () => {
    const store = seeded()
    const { unmount } = render(<AuditTrail store={store} selection={new Set(["e1"])} time={String}>
      {createPortal(<AuditTrailChanges aria-label="Detached changes">{({ title }) => <h2>{title}</h2>}</AuditTrailChanges>, document.body)}
    </AuditTrail>)
    const region = screen.getByRole("region", { name: "Detached changes" })
    expect(region.closest('[data-slot="tradecn-audit-trail"]')).toBeNull()
    expect(region).toHaveAttribute("data-slot", "tradecn-audit-trail-changes")
    expect(region).toHaveClass("lining-nums", "tabular-nums")
    expect(within(region).getByRole("heading")).toHaveTextContent(`New at ${T0}`)
    unmount()
    expect(screen.queryByRole("region", { name: "Detached changes" })).toBeNull()
  })

  it("preserves repeated fields as separate entries in the shared table", () => {
    const store = seeded()
    store.applyDeltas({ patch: [{ id: "e1", fields: { changes: [{ field: "status", from: "New", to: "Working" }, { field: "status", from: "Working", to: "Filled" }] } }] })
    render(<AuditTrail store={store} selection={new Set(["e1"])}><AuditChangesTable /></AuditTrail>)
    expect(screen.getAllByRole("rowheader", { name: "status" })).toHaveLength(2)
    expect(screen.getByRole("table")).toHaveTextContent("NewWorkingstatusWorkingFilled")
    expect(document.querySelectorAll('[data-audit-from=""], [data-audit-to=""]')).toHaveLength(4)
  })

  it.each([
    ["none", []],
    ["event", ["e5"]],
    ["diff", ["e4", "e5"]],
  ] as const)("keeps a %s reading empty when its message is blank", (kind, ids) => {
    const store = seeded()
    const labels = { select: "", noChanges: "", same: "" }
    const { rerender } = render(<AuditTrail store={store} selection={new Set(ids)} labels={labels}><AuditChangesTable /></AuditTrail>)
    expect(screen.getByRole("region", { name: "Changes" })).toHaveAttribute("data-audit-pane", kind)
    expect(screen.queryByRole("table")).toBeNull()
    expect(screen.queryByRole("columnheader")).toBeNull()
    rerender(<AuditTrail store={store} selection={new Set(["e1"])} labels={labels}><AuditChangesTable /></AuditTrail>)
    expect(screen.getAllByRole("columnheader")).toHaveLength(3)
    expect(screen.getAllByRole("rowheader")).toHaveLength(3)
  })
})

// Checked by the real TypeScript compiler as part of the repository typecheck.
export function auditTrailCallShapes(store: ReturnType<typeof seeded>) {
  // @ts-expect-error Released minimal calls need explicit composition.
  const minimal = <AuditTrail store={store} />
  // @ts-expect-error Retained inputs must not allow an obsolete empty root.
  const retained = <AuditTrail store={store} time={String} columns={auditTrailColumns()} selection={new Set()} />
  // @ts-expect-error Export callback belongs to the export control.
  const exported = <AuditTrail store={store} onExport={() => {}}><AuditTrailGrid /></AuditTrail>
  // @ts-expect-error Pane visibility is caller-owned composition.
  const pane = <AuditTrail store={store} pane={false}><AuditTrailGrid /></AuditTrail>
  // @ts-expect-error Grid options moved to AuditTrailGrid.
  const checkbox = <AuditTrail store={store} selectionColumn><AuditTrailGrid /></AuditTrail>
  // @ts-expect-error Grid labels moved to AuditTrailGrid.
  const label = <AuditTrail store={store} label="Events"><AuditTrailGrid /></AuditTrail>
  // @ts-expect-error Context menus moved to AuditTrailGrid.
  const menu = <AuditTrail store={store} renderContextMenu={() => null}><AuditTrailGrid /></AuditTrail>
  // @ts-expect-error Sorting moved to AuditTrailGrid.
  const sort = <AuditTrail store={store} sort={{ key: "at", dir: "desc" }}><AuditTrailGrid /></AuditTrail>
  // @ts-expect-error Changes require caller-owned content.
  const changes = <AuditTrailChanges />
  // @ts-expect-error CSV needs a destination callback.
  const button = <AuditTrailExportButton />
  // @ts-expect-error The inherited root mode was always ignored and is removed.
  const mode = <AuditTrail store={store} selectionMode="single"><AuditTrailGrid /></AuditTrail>
  // @ts-expect-error AuditTrailGrid fixes multi-selection.
  const gridMode = <AuditTrailGrid selectionMode="single" />
  const replacement = <AuditTrail store={store} ref={createRef()} onKeyDown={() => {}}><AuditTrailGrid selectionColumn label="Events" renderContextMenu={rows => rows[0]?.event} sort={{ key: "at", dir: "desc" }} /><AuditChangesTable /><AuditTrailExportButton onExport={() => {}} /></AuditTrail>
  const conditional = <AuditTrail store={store}>{store.getIds().length > 0 && <AuditTrailGrid />}</AuditTrail>
  return { minimal, retained, exported, pane, checkbox, label, menu, sort, changes, button, mode, gridMode, replacement, conditional }
}
