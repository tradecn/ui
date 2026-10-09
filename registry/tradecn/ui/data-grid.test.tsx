import { act, fireEvent, render, screen } from "@testing-library/react"
import { StrictMode, Suspense, startTransition, useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { formatPrice, parsePrice } from "@/registry/tradecn/lib/format"
import type { GridRules } from "@/registry/tradecn/lib/grid-rules"
import { createRowStore, type RowStore } from "@/registry/tradecn/lib/row-store"
import { DATA_GRID_PRESETS, DataGrid, EMPTY_COLUMN_STATE, compareForSort, editProblem, exportCsv, resolveColumns, type CellEditHandle, type ColumnDef, type ColumnState, type EditChange, type EditCommit, type EditStatus } from "@/registry/tradecn/ui/data-grid"

interface Quote {
  id: string
  sym: string
  px: number
  qty: number | null
}

const columns: ColumnDef<Quote>[] = [
  { key: "sym", header: "Symbol", width: 80, frozen: "left", sortable: true, accessor: (r) => r.sym },
  { key: "px", header: "Price", width: 90, numeric: true, sortable: true, accessor: (r) => r.px, format: (v) => (v as number).toFixed(2) },
  { key: "qty", header: "Qty", width: 70, numeric: true, accessor: (r) => r.qty },
]

const ORIGINAL_RECT = HTMLElement.prototype.getBoundingClientRect
const ROW_HEIGHT = 20
const RECT = { width: 600, height: 200 } // 10 visible rows

function seed(n: number, store: RowStore<Quote>) {
  store.applyDeltas({ upsert: Array.from({ length: n }, (_, i) => ({ id: `r${i}`, sym: `S${String(i).padStart(4, "0")}`, px: 100 + i, qty: i % 7 === 0 ? null : i * 10 })) })
}

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "animate", {
    configurable: true,
    writable: true,
    value: vi.fn(() => ({ cancel: vi.fn(), currentTime: 0, onfinish: null })),
  })
  // No layout in happy-dom: give the scroll container the viewport the test assumes.
  // The virtualizer reads offsetWidth/offsetHeight; the context menu reads getBoundingClientRect.
  for (const [prop, size] of [["offsetWidth", RECT.width], ["offsetHeight", RECT.height]] as const) {
    Object.defineProperty(HTMLElement.prototype, prop, {
      configurable: true,
      get(this: HTMLElement) {
        return this.classList.contains("overflow-auto") ? size : 0
      },
    })
  }
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if (this.classList.contains("overflow-auto")) return { x: 0, y: 0, top: 0, left: 0, right: RECT.width, bottom: RECT.height, width: RECT.width, height: RECT.height, toJSON() {} } as DOMRect
    return ORIGINAL_RECT.call(this)
  })
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe("DataGrid", () => {
  describe("keyboard ownership", () => {
    it.each(["Enter", "Home", "Escape"])("leaves %s on a header control to that control", key => {
      const store = createRowStore<Quote>({ getRowId: row => row.id })
      seed(2, store)
      const activate = vi.fn(), focus = vi.fn(), selection = vi.fn()
      render(<DataGrid store={store} columns={columns} label="Quotes" initialRect={RECT} focusedRowId="r1" selection={new Set(["r1"])} onRowActivate={activate} onFocusedRowChange={focus} onSelectionChange={selection} />)
      const trigger = screen.getByRole("button", { name: "Price column menu" })
      trigger.focus()
      fireEvent.keyDown(trigger, { key })
      expect(activate).not.toHaveBeenCalled()
      expect(focus).not.toHaveBeenCalled()
      expect(selection).not.toHaveBeenCalled()
      fireEvent.keyDown(screen.getByRole("grid"), { key })
      if (key === "Enter") expect(activate).toHaveBeenCalledWith(store.getRow("r1"), "r1")
      else if (key === "Home") expect(focus).toHaveBeenCalledWith("r0")
      else expect(selection).toHaveBeenCalledWith(new Set())
    })

    it("leaves custom cell controls and their unhandled keys available to the application", () => {
      const store = createRowStore<Quote>({ getRowId: row => row.id })
      seed(1, store)
      const activate = vi.fn(), focus = vi.fn(), selection = vi.fn(), sort = vi.fn(), changeColumns = vi.fn(), edit = vi.fn(), appKey = vi.fn(), inputKey = vi.fn()
      const controls: ColumnDef<Quote>[] = [{ ...columns[0]!, edit: { parse: text => text }, cell: () => <>
        <input aria-label="Note" onKeyDown={inputKey} />
        <button type="button">Inspect</button>
        <select aria-label="Route"><option>Primary</option><option>Backup</option></select>
        <div role="textbox" aria-label="Editable note" contentEditable suppressContentEditableWarning>Note</div>
        <span tabIndex={0} aria-label="Custom control">Custom</span>
      </> }]
      render(<div onKeyDown={event => appKey(event.key, event.defaultPrevented)}><DataGrid store={store} columns={controls} label="Quotes" initialRect={RECT} focusedRowId="r0" onRowActivate={activate} onFocusedRowChange={focus} onSelectionChange={selection} onSortChange={sort} onColumnStateChange={changeColumns} onEdit={edit} /></div>)
      const grid = screen.getByRole("grid")
      fireEvent.keyDown(grid, { key: "ArrowRight" })
      appKey.mockClear()
      const targets = [screen.getByRole("textbox", { name: "Note" }), screen.getByRole("button", { name: "Inspect" }), screen.getByRole("combobox"), screen.getByRole("textbox", { name: "Editable note" }), screen.getByLabelText("Custom control")]
      const keys = [{ key: "Enter" }, { key: "Home" }, { key: "ArrowDown" }, { key: "Escape" }, { key: " " }, { key: "a", ctrlKey: true }, { key: "s", altKey: true }, { key: "h", altKey: true }, { key: "F2" }, { key: "x" }]
      for (const target of targets) {
        target.focus()
        for (const event of keys) {
          expect(fireEvent.keyDown(target, event)).toBe(true)
          expect(appKey).toHaveBeenLastCalledWith(event.key, false)
        }
      }
      expect(inputKey).toHaveBeenCalledTimes(keys.length)
      for (const callback of [activate, focus, selection, sort, changeColumns, edit]) expect(callback).not.toHaveBeenCalled()
      expect(document.querySelector("[data-cell-editor]")).toBeNull()
      fireEvent.keyDown(grid, { key: "x" })
      expect(document.querySelector("[data-cell-editor]")).not.toBeNull()
    })

    it("honors a key handled during capture without swallowing application bubbling", () => {
      const store = createRowStore<Quote>({ getRowId: row => row.id })
      seed(2, store)
      const focus = vi.fn(), appKey = vi.fn()
      const layout = (handled: boolean) => <div onKeyDownCapture={event => { if (handled) event.preventDefault() }} onKeyDown={appKey}><DataGrid store={store} columns={columns} label="Quotes" initialRect={RECT} focusedRowId="r0" onFocusedRowChange={focus} /></div>
      const { rerender } = render(layout(true))
      fireEvent.keyDown(screen.getByRole("grid"), { key: "ArrowDown" })
      expect(focus).not.toHaveBeenCalled()
      expect(appKey).toHaveBeenCalledTimes(1)
      rerender(layout(false))
      fireEvent.keyDown(screen.getByRole("grid"), { key: "ArrowDown" })
      expect(focus).toHaveBeenCalledWith("r1")
      expect(appKey).toHaveBeenCalledTimes(2)
    })

    it.each(["control", "handled grid"])("still holds row order and stops following on a %s key", target => {
      vi.useFakeTimers()
      const store = createRowStore<Quote>({ getRowId: row => row.id })
      seed(2, store)
      const view = store.createView({ comparator: (a, b) => b.px - a.px, reorderHoldMs: 1000 })
      try {
        render(<div onKeyDownCapture={event => { if (target === "handled grid") event.preventDefault() }}><DataGrid store={store} view={view} columns={columns} label="Tape" preset="tape" initialRect={RECT} /></div>)
        const grid = screen.getByRole("grid")
        expect(view.getIds()).toEqual(["r1", "r0"])
        const recipient = target === "control" ? screen.getByRole("button", { name: "Price column menu" }) : grid
        fireEvent.keyDown(recipient, { key: "Home" })
        act(() => store.applyDeltas({ patch: [{ id: "r0", fields: { px: 999 } }], upsert: [{ id: "r2", sym: "New", px: 102, qty: 1 }] }))
        expect(view.getIds()).toEqual(["r1", "r0", "r2"])
        expect(grid.querySelector("[data-grid-behind]")).toHaveTextContent("1 new")
        act(() => vi.advanceTimersByTime(1000))
        expect(view.getIds()).toEqual(["r0", "r2", "r1"])
      } finally {
        view.dispose()
        vi.useRealTimers()
      }
    })
  })

  describe("visible column focus", () => {
    it.each(["hidden", "removed", "all hidden"])("forgets a %s column and does not revive its shortcuts when it returns", disappearance => {
      const store = createRowStore<Quote>({ getRowId: row => row.id })
      seed(2, store)
      const sort = vi.fn(), changeColumns = vi.fn()
      const shared = { store, label: "Quotes", initialRect: RECT, focusedRowId: "r0", onSortChange: sort, onColumnStateChange: changeColumns }
      const { rerender } = render(<DataGrid {...shared} columns={columns} columnState={EMPTY_COLUMN_STATE} />)
      const grid = screen.getByRole("grid")
      fireEvent.keyDown(grid, { key: "s", altKey: true })
      expect(sort).not.toHaveBeenCalled()
      fireEvent.keyDown(grid, { key: "ArrowRight" })
      fireEvent.keyDown(grid, { key: "ArrowRight" })
      fireEvent.keyDown(grid, { key: "s", altKey: true })
      expect(sort).toHaveBeenLastCalledWith({ key: "px", dir: "asc" })
      sort.mockClear()
      rerender(<DataGrid {...shared} columns={disappearance === "removed" ? columns.filter(column => column.key !== "px") : columns} columnState={{ ...EMPTY_COLUMN_STATE, hidden: disappearance === "all hidden" ? columns.map(column => column.key) : ["px"] }} />)
      for (const key of ["s", "h"]) fireEvent.keyDown(grid, { key, altKey: true })
      expect(sort).not.toHaveBeenCalled()
      expect(changeColumns).not.toHaveBeenCalled()
      rerender(<DataGrid {...shared} columns={columns} columnState={EMPTY_COLUMN_STATE} />)
      for (const key of ["s", "h"]) fireEvent.keyDown(grid, { key, altKey: true })
      expect(sort).not.toHaveBeenCalled()
      expect(changeColumns).not.toHaveBeenCalled()
      fireEvent.keyDown(grid, { key: "ArrowRight" })
      fireEvent.keyDown(grid, { key: "s", altKey: true })
      expect(sort).toHaveBeenLastCalledWith({ key: "sym", dir: "asc" })
    })

    it("keeps a surviving column through a reorder and a refused hide, then clears it when accepted", () => {
      const store = createRowStore<Quote>({ getRowId: row => row.id })
      seed(2, store)
      const sort = vi.fn(), changeColumns = vi.fn()
      const shared = { store, columns, label: "Quotes", initialRect: RECT, onSortChange: sort, onColumnStateChange: changeColumns }
      const { rerender } = render(<DataGrid {...shared} columnState={EMPTY_COLUMN_STATE} />)
      const grid = screen.getByRole("grid")
      fireEvent.keyDown(grid, { key: "ArrowRight" })
      fireEvent.keyDown(grid, { key: "ArrowRight" })
      const reordered = { ...EMPTY_COLUMN_STATE, order: ["sym", "qty", "px"] }
      rerender(<DataGrid {...shared} columnState={reordered} />)
      fireEvent.keyDown(grid, { key: "h", altKey: true })
      expect(changeColumns).toHaveBeenLastCalledWith({ ...reordered, hidden: ["px"] })
      fireEvent.keyDown(grid, { key: "s", altKey: true })
      expect(sort).toHaveBeenLastCalledWith({ key: "px", dir: "asc" })
      sort.mockClear()
      changeColumns.mockClear()
      rerender(<DataGrid {...shared} columnState={{ ...reordered, hidden: ["px"] }} />)
      fireEvent.keyDown(grid, { key: "s", altKey: true })
      fireEvent.keyDown(grid, { key: "h", altKey: true })
      expect(sort).not.toHaveBeenCalled()
      expect(changeColumns).not.toHaveBeenCalled()
    })
  })

  describe("shared column defaults", () => {
    const baseState: ColumnState = { order: ["sym", "qty", "px"], widths: { px: 144 }, hidden: ["qty"] }
    const savedState: ColumnState = { order: [], widths: { px: 120 }, hidden: [] }
    const latestBase: ColumnState = { order: ["sym", "qty", "px"], widths: { qty: 100 }, hidden: ["px"] }
    const headers = () => screen.getAllByRole("columnheader").map(header => header.getAttribute("data-col"))
    const template = () => screen.getAllByRole("row")[0]!.style.gridTemplateColumns
    const openMenu = async () => {
      fireEvent.click(screen.getByRole("button", { name: "Price column menu" }))
      return screen.findByRole("menuitem", { name: /^Reset columns/ })
    }

    it("initializes uncontrolled columns once and resets to the latest defaults, including with no rows", async () => {
      const store = createRowStore<Quote>({ getRowId: row => row.id })
      const changed = vi.fn()
      const { rerender } = render(<DataGrid store={store} columns={columns} label="Quotes" baseState={baseState} onColumnStateChange={changed} />)
      expect(headers()).toEqual(["sym", "px"])
      expect(template()).toBe("80px 144px")
      expect(changed).not.toHaveBeenCalled()
      const reset = await openMenu()
      rerender(<DataGrid store={store} columns={columns} label="Quotes" baseState={latestBase} onColumnStateChange={changed} />)
      expect(headers()).toEqual(["sym", "px"])
      expect(template()).toBe("80px 144px")
      expect(changed).not.toHaveBeenCalled()
      fireEvent.click(reset)
      expect(changed).toHaveBeenCalledExactlyOnceWith(latestBase)
      expect(headers()).toEqual(["sym", "qty"])
      expect(template()).toBe("80px 100px")
    })

    it("keeps controlled snapshots authoritative and reports the configured reset even when refused", async () => {
      const store = createRowStore<Quote>({ getRowId: row => row.id })
      const changed = vi.fn()
      const { rerender } = render(<DataGrid store={store} columns={columns} label="Quotes" columnState={savedState} onColumnStateChange={changed} baseState={baseState} />)
      expect(headers()).toEqual(["sym", "px", "qty"])
      expect(template()).toBe("80px 120px 70px")
      fireEvent.click(await openMenu())
      expect(changed).toHaveBeenCalledExactlyOnceWith(baseState)
      expect(headers()).toEqual(["sym", "px", "qty"])
      expect(template()).toBe("80px 120px 70px")
      rerender(<DataGrid store={store} columns={columns} label="Quotes" columnState={baseState} onColumnStateChange={changed} baseState={baseState} />)
      expect(headers()).toEqual(["sym", "px"])
      expect(template()).toBe("80px 144px")
      expect(changed).toHaveBeenCalledTimes(1)
    })

    it.each([false, true])("preserves the empty reset and its callback with explicit undefined: %s", async explicit => {
      const store = createRowStore<Quote>({ getRowId: row => row.id })
      const changed = vi.fn()
      render(<DataGrid store={store} columns={columns} label="Quotes" onColumnStateChange={changed} {...(explicit ? { baseState: undefined } : {})} />)
      expect(template()).toBe("80px 90px 70px")
      expect(changed).not.toHaveBeenCalled()
      fireEvent.click(await openMenu())
      expect(changed).toHaveBeenCalledExactlyOnceWith(EMPTY_COLUMN_STATE)
    })

    it("passes through a complete reset snapshot without mutating or normalizing it", async () => {
      const store = createRowStore<Quote>({ getRowId: row => row.id })
      const snapshot: ColumnState = { order: ["retired", "px", "qty", "px"], widths: { px: 2, retired: 99 }, hidden: ["retired"] }
      Object.freeze(snapshot.order)
      Object.freeze(snapshot.widths)
      Object.freeze(snapshot.hidden)
      Object.freeze(snapshot)
      const changed = vi.fn()
      render(<DataGrid store={store} columns={columns} label="Quotes" baseState={snapshot} onColumnStateChange={changed} />)
      expect(headers()).toEqual(["sym", "qty", "px"])
      expect(template()).toBe("80px 70px 48px")
      fireEvent.click(await openMenu())
      expect(changed).toHaveBeenCalledExactlyOnceWith(snapshot)
      expect(changed.mock.calls[0]![0]).toBe(snapshot)
      expect(snapshot.widths).toEqual({ px: 2, retired: 99 })
    })

    it("changing reset defaults preserves row render locality and the existing uncontrolled edits", async () => {
      const store = createRowStore<Quote>({ getRowId: row => row.id })
      seed(20, store)
      const renders = new Map<string, number>()
      const counted: ColumnDef<Quote>[] = columns.map(column => column.key === "sym" ? { ...column, cell: ({ rowId, value }) => {
        renders.set(rowId, (renders.get(rowId) ?? 0) + 1)
        return String(value)
      } } : column)
      const { rerender } = render(<DataGrid store={store} columns={counted} label="Quotes" baseState={savedState} initialRect={RECT} />)
      await openMenu()
      fireEvent.click(screen.getByRole("menuitem", { name: "Move right" }))
      expect(headers()).toEqual(["sym", "qty", "px"])
      const before = new Map(renders)
      expect(before.size).toBeGreaterThan(0)
      rerender(<DataGrid store={store} columns={counted} label="Quotes" baseState={latestBase} initialRect={RECT} />)
      expect(headers()).toEqual(["sym", "qty", "px"])
      expect(template()).toBe("80px 70px 120px")
      expect(renders).toEqual(before)
      act(() => store.applyDeltas({ patch: [{ id: "r3", fields: { px: 999 } }] }))
      expect(renders.get("r3")).toBe(before.get("r3")! + 1)
      for (const [id, n] of before) if (id !== "r3") expect(renders.get(id)).toBe(n)
    })
  })

  it("mounts a thousand rows as only the visible ones plus overscan, with grid semantics", () => {
    const store = createRowStore<Quote>({ getRowId: (r) => r.id })
    seed(1000, store)
    render(<DataGrid store={store} columns={columns} label="Quotes" rowHeight={ROW_HEIGHT} overscan={5} initialRect={RECT} />)
    const grid = screen.getByRole("grid", { name: "Quotes" })
    expect(grid.dataset.slot).toBe("tradecn-data-grid")
    expect(grid).toHaveAttribute("aria-rowcount", "1001")
    expect(grid).toHaveAttribute("aria-colcount", "3")
    const rows = screen.getAllByRole("row")
    expect(rows.length).toBeGreaterThan(5)
    expect(rows.length).toBeLessThanOrEqual(1 + 10 + 5 * 2)
    expect(rows[1]).toHaveAttribute("aria-rowindex", "2")
    expect(screen.getAllByRole("columnheader")).toHaveLength(3)
    expect(screen.getByRole("columnheader", { name: /Price/ })).toHaveAttribute("aria-sort", "none")
    const first = rows[1]!
    expect(first.dataset.rowId).toBe("r0")
    expect(first.querySelectorAll("[role=gridcell]")[1]).toHaveTextContent("100.00")
    expect(first.querySelectorAll("[role=gridcell]")[2]).toHaveTextContent("–")
  })

  it("a patch to one visible row re-renders that row only", () => {
    const store = createRowStore<Quote>({ getRowId: (r) => r.id })
    seed(50, store)
    const renders = new Map<string, number>()
    const counted: ColumnDef<Quote>[] = [
      ...columns,
      {
        key: "probe",
        header: "Probe",
        width: 40,
        accessor: (r) => r.id,
        cell: ({ rowId }) => {
          renders.set(rowId, (renders.get(rowId) ?? 0) + 1)
          return rowId
        },
      },
    ]
    render(<DataGrid store={store} columns={counted} label="Quotes" rowHeight={ROW_HEIGHT} initialRect={RECT} />)
    const before = new Map(renders)
    act(() => store.applyDeltas({ patch: [{ id: "r3", fields: { px: 999 } }] }))
    expect(renders.get("r3")).toBe(before.get("r3")! + 1)
    for (const [id, n] of before) if (id !== "r3") expect(renders.get(id)).toBe(n)
    expect(screen.getByText("999.00")).toBeInTheDocument()
  })

  it("focus and selection are ids, so they survive a reorder; the hold keeps rows still while the user works", () => {
    vi.useFakeTimers()
    try {
      const store = createRowStore<Quote>({ getRowId: (r) => r.id })
      seed(20, store)
      const onFocus = vi.fn()
      render(
        <DataGrid store={store} columns={columns} label="Quotes" preset="rfq" rowHeight={ROW_HEIGHT} initialRect={RECT} sort={{ key: "px", dir: "desc" }} onFocusedRowChange={onFocus} />,
      )
      const grid = screen.getByRole("grid")
      // Sorted by price desc: r19 first.
      expect(screen.getAllByRole("row")[1]!.dataset.rowId).toBe("r19")
      fireEvent.keyDown(grid, { key: "ArrowDown" })
      fireEvent.keyDown(grid, { key: "ArrowDown" })
      expect(onFocus).toHaveBeenLastCalledWith("r18")
      const focusedId = grid.getAttribute("aria-activedescendant")!
      expect(document.getElementById(focusedId)!.dataset.rowId).toBe("r18")
      // Under the rfq hold (1000 ms) a price jump does not move rows.
      act(() => store.applyDeltas({ patch: [{ id: "r0", fields: { px: 5000 } }] }))
      expect(screen.getAllByRole("row")[1]!.dataset.rowId).toBe("r19")
      act(() => {
        vi.advanceTimersByTime(1000)
      })
      expect(screen.getAllByRole("row")[1]!.dataset.rowId).toBe("r0")
      // Still focused on r18 by id.
      expect(document.getElementById(grid.getAttribute("aria-activedescendant")!)!.dataset.rowId).toBe("r18")
    } finally {
      vi.useRealTimers()
    }
  })

  it("keyboard selection in multi mode: range, toggle, select all, clear", () => {
    const store = createRowStore<Quote>({ getRowId: (r) => r.id })
    seed(10, store)
    const onSelection = vi.fn()
    render(<DataGrid store={store} columns={columns} label="Quotes" preset="blotter" rowHeight={ROW_HEIGHT} initialRect={RECT} onSelectionChange={onSelection} />)
    const grid = screen.getByRole("grid")
    fireEvent.keyDown(grid, { key: "ArrowDown" })
    fireEvent.keyDown(grid, { key: " " })
    expect([...onSelection.mock.lastCall![0]]).toEqual(["r0"])
    fireEvent.keyDown(grid, { key: "ArrowDown", shiftKey: true })
    fireEvent.keyDown(grid, { key: "ArrowDown", shiftKey: true })
    expect([...onSelection.mock.lastCall![0]].sort()).toEqual(["r0", "r1", "r2"])
    fireEvent.keyDown(grid, { key: "a", ctrlKey: true })
    expect(onSelection.mock.lastCall![0].size).toBe(10)
    fireEvent.keyDown(grid, { key: "Escape" })
    expect(onSelection.mock.lastCall![0].size).toBe(0)
  })

  it("selects on Space once while the key is held, as a checkbox does", () => {
    const store = createRowStore<Quote>({ getRowId: (r) => r.id })
    seed(3, store)
    const onSelection = vi.fn()
    render(<DataGrid store={store} columns={columns} label="Quotes" preset="blotter" rowHeight={ROW_HEIGHT} initialRect={RECT} onSelectionChange={onSelection} />)
    const grid = screen.getByRole("grid")
    fireEvent.keyDown(grid, { key: "ArrowDown" })
    fireEvent.keyDown(grid, { key: " " })
    expect([...onSelection.mock.lastCall![0]]).toEqual(["r0"])
    const calls = onSelection.mock.calls.length
    fireEvent.keyDown(grid, { key: " ", repeat: true })
    fireEvent.keyDown(grid, { key: " ", repeat: true })
    expect(onSelection.mock.calls.length).toBe(calls)
  })

  it("announces the row count a second after it settles, in the singular for one row", () => {
    vi.useFakeTimers()
    try {
      const store = createRowStore<Quote>({ getRowId: (r) => r.id })
      seed(1, store)
      render(<DataGrid store={store} columns={columns} label="Quotes" preset="blotter" rowHeight={ROW_HEIGHT} initialRect={RECT} />)
      // The region appears with its first announcement.
      const region = () => screen.getByRole("grid").querySelector('[aria-live="polite"]:not([data-grid-row-reading])')
      act(() => void vi.advanceTimersByTime(1000))
      expect(region()).toHaveTextContent(/^1 row$/)
      act(() => seed(2, store))
      act(() => void vi.advanceTimersByTime(1000))
      expect(region()).toHaveTextContent(/^2 rows/)
    } finally {
      vi.useRealTimers()
    }
  })

  it("brings a column the keys move to into view sideways, clear of the frozen ones, and the column an editor opens in", () => {
    type Wide = { id: string } & Record<string, string | number>
    const store = createRowStore<Wide>({ getRowId: (r) => r.id })
    store.applyDeltas({ upsert: [{ id: "a", ...Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`c${i}`, i])) }] })
    // Eight columns, 100px wide but for c7's 250px; the first is frozen and c6 is editable.
    const wide: ColumnDef<Wide>[] = Array.from({ length: 8 }, (_, i) => ({
      key: `c${i}`,
      header: `C${i}`,
      width: i === 7 ? 250 : 100,
      accessor: (r: Wide) => r[`c${i}`] ?? null,
      ...(i === 0 ? { frozen: "left" as const } : {}),
      ...(i === 6 ? { edit: { parse: (t: string) => Number(t) } } : {}),
    }))
    render(<DataGrid store={store} columns={wide} label="Wide" rowHeight={ROW_HEIGHT} initialRect={RECT} onEdit={() => {}} />)
    const grid = screen.getByRole("grid")
    const scroller = grid.querySelector<HTMLElement>(".overflow-auto")!
    // A 300px viewport: c0 stays in its first 100px, so the other columns show between 100 and 300.
    Object.defineProperty(scroller, "clientWidth", { configurable: true, get: () => 300 })
    fireEvent.keyDown(grid, { key: "ArrowDown" })
    for (let i = 0; i < 5; i++) fireEvent.keyDown(grid, { key: "ArrowRight" })
    // c4 spans 400 to 500: its right edge meets the viewport's.
    expect(scroller.scrollLeft).toBe(200)
    fireEvent.keyDown(grid, { key: "ArrowLeft" })
    expect(scroller.scrollLeft).toBe(200)
    // c2 spans 200 to 300: its left edge comes clear of the frozen c0.
    fireEvent.keyDown(grid, { key: "ArrowLeft" })
    expect(scroller.scrollLeft).toBe(100)
    // c1 spans 100 to 200, right after c0.
    fireEvent.keyDown(grid, { key: "ArrowLeft" })
    expect(scroller.scrollLeft).toBe(0)
    // The frozen column is always in view, so focusing it moves nothing.
    scroller.scrollLeft = 150
    fireEvent.keyDown(grid, { key: "ArrowLeft" })
    expect(scroller.scrollLeft).toBe(150)
    // Focus c6, scroll away, and type: the editor opens with its column in view, 600 to 700.
    for (let i = 0; i < 6; i++) fireEvent.keyDown(grid, { key: "ArrowRight" })
    scroller.scrollLeft = 0
    fireEvent.keyDown(grid, { key: "5" })
    expect(screen.getByRole("textbox")).toHaveValue("5")
    expect(scroller.scrollLeft).toBe(400)
    // c7, 700 to 950, is wider than the 200px past c0: its left edge shows first.
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" })
    fireEvent.keyDown(grid, { key: "ArrowRight" })
    expect(scroller.scrollLeft).toBe(600)
    fireEvent.keyDown(grid, { key: "ArrowLeft" })
    expect(scroller.scrollLeft).toBe(500)
    // Moved one place right, past c7, c6 lands at 850 to 950, and comes into view where it now sits.
    fireEvent.keyDown(grid, { key: "ArrowRight", altKey: true })
    expect(scroller.scrollLeft).toBe(650)
  })

  describe("a sheet wider than its viewport", () => {
    type Wide = { id: string } & Record<string, string | number | boolean>
    // Eight columns, 100px wide but for c7's 250px; c0 is frozen, c5 a toggle, and c6 editable as text.
    const wideColumns: ColumnDef<Wide>[] = Array.from({ length: 8 }, (_, i) => ({
      key: `c${i}`,
      header: `C${i}`,
      width: i === 7 ? 250 : 100,
      accessor: (r: Wide) => r[`c${i}`] ?? null,
      ...(i === 0 ? { frozen: "left" as const } : {}),
      ...(i === 5 ? { edit: { parse: (t: string) => t === "true", toggle: (v: unknown) => !v } } : {}),
      ...(i === 6 ? { edit: { parse: (t: string) => Number(t) } } : {}),
    }))
    const wideStore = () => {
      const store = createRowStore<Wide>({ getRowId: (r) => r.id })
      store.applyDeltas({ upsert: [{ id: "a", ...Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`c${i}`, i === 5 ? true : i])) }] })
      return store
    }
    const scrollerOf = () => {
      const scroller = screen.getByRole("grid").querySelector<HTMLElement>(".overflow-auto")!
      Object.defineProperty(scroller, "clientWidth", { configurable: true, get: () => 300 })
      return scroller
    }

    it("counts the selection column in front of the frozen ones", () => {
      render(<DataGrid store={wideStore()} columns={wideColumns} label="Wide" rowHeight={ROW_HEIGHT} initialRect={RECT} selectionMode="multi" selectionColumn />)
      const grid = screen.getByRole("grid")
      const scroller = scrollerOf()
      fireEvent.keyDown(grid, { key: "ArrowDown" })
      for (let i = 0; i < 5; i++) fireEvent.keyDown(grid, { key: "ArrowRight" })
      // After the 32px box, c4 spans 432 to 532: its right edge meets the viewport's.
      expect(scroller.scrollLeft).toBe(232)
      // c2 spans 232 to 332; the box and c0 stick over the first 132px.
      fireEvent.keyDown(grid, { key: "ArrowLeft" })
      fireEvent.keyDown(grid, { key: "ArrowLeft" })
      expect(scroller.scrollLeft).toBe(100)
    })

    it("brings a moved column into view when a controlled parent applies the move later, and not once focus or a pointer has moved on", () => {
      const store = wideStore()
      store.applyDeltas({ upsert: [{ id: "b", ...Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`c${i}`, i === 5 ? false : i * 10])) }] })
      let apply = () => {}
      function Deferred() {
        const [state, setState] = useState<ColumnState>(EMPTY_COLUMN_STATE)
        return <DataGrid store={store} columns={wideColumns} label="Wide" rowHeight={ROW_HEIGHT} initialRect={RECT} onEdit={() => {}} columnState={state} onColumnStateChange={(next) => { apply = () => setState(next) }} />
      }
      render(<Deferred />)
      const grid = screen.getByRole("grid")
      const scroller = scrollerOf()
      fireEvent.keyDown(grid, { key: "ArrowDown" })
      for (let i = 0; i < 7; i++) fireEvent.keyDown(grid, { key: "ArrowRight" })
      expect(scroller.scrollLeft).toBe(400)
      // The parent hasn't taken the move yet, and a commit that moves no column, the next row's focus, reveals nothing.
      fireEvent.keyDown(grid, { key: "ArrowRight", altKey: true })
      fireEvent.keyDown(grid, { key: "ArrowDown" })
      expect(scroller.scrollLeft).toBe(400)
      // It takes it later: c6 lands after c7, at 850 to 950, and comes into view.
      act(() => apply())
      expect(scroller.scrollLeft).toBe(650)
      // Moved back left, but focus moves on to c7 and the sheet scrolls away before the parent answers: no reveal.
      fireEvent.keyDown(grid, { key: "ArrowLeft", altKey: true })
      fireEvent.keyDown(grid, { key: "ArrowLeft" })
      scroller.scrollLeft = 0
      act(() => apply())
      expect(scroller.scrollLeft).toBe(0)
      // c7, now last, moved left, and a pointer presses its own cell before the parent answers: focus stays, and the
      // press still leaves no reveal behind.
      fireEvent.keyDown(grid, { key: "ArrowLeft", altKey: true })
      fireEvent.pointerDown(document.querySelector<HTMLElement>('[data-row-id="a"] [data-focused-col]')!, { button: 0 })
      scroller.scrollLeft = 0
      act(() => apply())
      expect(scroller.scrollLeft).toBe(0)
    })

    it("commits a toggle with its column in view", () => {
      const onEdit = vi.fn()
      render(<DataGrid store={wideStore()} columns={wideColumns} label="Wide" rowHeight={ROW_HEIGHT} initialRect={RECT} onEdit={onEdit} />)
      const grid = screen.getByRole("grid")
      const scroller = scrollerOf()
      fireEvent.keyDown(grid, { key: "ArrowDown" })
      for (let i = 0; i < 6; i++) fireEvent.keyDown(grid, { key: "ArrowRight" })
      // c5 spans 500 to 600; scrolled away, Space brings it back before it commits, and so does Enter.
      scroller.scrollLeft = 0
      fireEvent.keyDown(grid, { key: " " })
      expect(scroller.scrollLeft).toBe(300)
      expect(onEdit).toHaveBeenCalledTimes(1)
      scroller.scrollLeft = 0
      fireEvent.keyDown(grid, { key: "Enter" })
      expect(scroller.scrollLeft).toBe(300)
      expect(onEdit).toHaveBeenCalledTimes(2)
    })

    it("opens Shift+F10's menu at the focused cell, or the grid's visible left edge, when the row runs off to the left", () => {
      const seen: number[] = []
      render(<DataGrid store={wideStore()} columns={wideColumns} label="Wide" rowHeight={ROW_HEIGHT} initialRect={RECT} renderContextMenu={() => <div>menu</div>} />)
      const grid = screen.getByRole("grid")
      scrollerOf()
      const row = document.querySelector<HTMLElement>('[role="row"][data-row-id="a"]')!
      row.addEventListener("contextmenu", (e) => seen.push(e.clientX))
      // Scrolled 400px sideways: the row's own left edge sits 400px left of the grid; c4's cell sits at 150.
      const box = (left: number) => ({ left, top: 0, right: left + 100, bottom: 20, width: 100, height: 20, x: left, y: 0, toJSON() {} }) as DOMRect
      const rects = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
        if (this.getAttribute("data-col") === "c4" && this.closest('[role="row"]')) return box(150)
        if (this.getAttribute("role") === "row") return box(-400)
        return box(0)
      })
      try {
        fireEvent.keyDown(grid, { key: "ArrowDown" })
        fireEvent.keyDown(grid, { key: "F10", shiftKey: true })
        expect(seen.at(-1)).toBe(8)
        for (let i = 0; i < 5; i++) fireEvent.keyDown(grid, { key: "ArrowRight" })
        fireEvent.keyDown(grid, { key: "F10", shiftKey: true })
        expect(seen.at(-1)).toBe(158)
      } finally {
        rects.mockRestore()
      }
    })
  })

  it("activates a row once for a held Enter", () => {
    const store = createRowStore<Quote>({ getRowId: (r) => r.id })
    seed(3, store)
    const onActivate = vi.fn()
    render(<DataGrid store={store} columns={columns} label="Quotes" rowHeight={ROW_HEIGHT} initialRect={RECT} onRowActivate={onActivate} />)
    const grid = screen.getByRole("grid")
    fireEvent.keyDown(grid, { key: "ArrowDown" })
    fireEvent.keyDown(grid, { key: "Enter" })
    fireEvent.keyDown(grid, { key: "Enter", repeat: true })
    fireEvent.keyDown(grid, { key: "Enter", repeat: true })
    expect(onActivate).toHaveBeenCalledTimes(1)
  })

  it("marks a selected row by a bar at the start of its first cell, never a fill behind its text", () => {
    const store = createRowStore<Quote>({ getRowId: (r) => r.id })
    seed(3, store)
    const view = (selectionColumn: boolean) => <DataGrid store={store} columns={columns} label="Quotes" preset="blotter" rowHeight={ROW_HEIGHT} initialRect={RECT} selection={new Set(["r1"])} selectionColumn={selectionColumn} />
    const marked = (id: string) => [...document.querySelectorAll<HTMLElement>(`[data-row-id="${id}"] [role='gridcell']`)].filter((cell) => cell.className.includes("before:bg-primary"))
    const fills = (id: string) => document.querySelector<HTMLElement>(`[data-row-id="${id}"]`)!.className.split(" ").filter((name) => name.startsWith("bg-"))
    const { rerender } = render(view(false))
    expect(fills("r1")).toEqual([])
    expect(marked("r1").map((cell) => cell.getAttribute("data-col"))).toEqual(["sym"])
    // A frozen first cell stays frozen under the bar.
    expect(marked("r1")[0]).toHaveClass("sticky")
    expect(marked("r1")[0]).not.toHaveClass("relative")
    expect(marked("r0")).toEqual([])
    // With the selection box, the bar is the box's.
    rerender(view(true))
    expect(fills("r1")).toEqual([])
    expect(marked("r1").map((cell) => cell.getAttribute("aria-colindex"))).toEqual(["1"])
    expect(marked("r1")[0]!.querySelector("[role='checkbox']")).not.toBeNull()
    expect(marked("r2")).toEqual([])
  })

  it("Enter and double-click activate the row; a right-click targets the row under the pointer", () => {
    const store = createRowStore<Quote>({ getRowId: (r) => r.id })
    seed(5, store)
    const onActivate = vi.fn()
    const menu = vi.fn((_rows: Quote[], ids: string[]) => <div data-testid="menu">{ids.join(",")}</div>)
    render(<DataGrid store={store} columns={columns} label="Quotes" rowHeight={ROW_HEIGHT} initialRect={RECT} onRowActivate={onActivate} renderContextMenu={menu} />)
    const grid = screen.getByRole("grid")
    fireEvent.keyDown(grid, { key: "ArrowDown" })
    fireEvent.keyDown(grid, { key: "Enter" })
    expect(onActivate).toHaveBeenCalledWith(expect.objectContaining({ id: "r0" }), "r0")
    const r3 = document.querySelector<HTMLElement>('[data-row-id="r3"]')!
    fireEvent.contextMenu(r3.firstElementChild!)
    expect(menu).toHaveBeenLastCalledWith([expect.objectContaining({ id: "r3" })], ["r3"], "r3")
  })

  it("hands the menu the row it opened on beside the selection it applies to, by pointer and by keyboard", () => {
    const store = createRowStore<Quote>({ getRowId: (r) => r.id })
    seed(5, store)
    const menu = vi.fn((_rows: Quote[], ids: string[]) => <div data-testid="menu">{ids.join(",")}</div>)
    render(<DataGrid store={store} columns={columns} label="Quotes" rowHeight={ROW_HEIGHT} initialRect={RECT} selectionMode="multi" renderContextMenu={menu} />)
    const row = (id: string) => document.querySelector<HTMLElement>(`[data-row-id="${id}"]`)!.firstElementChild!
    fireEvent.pointerDown(row("r1"), { button: 0 })
    fireEvent.pointerDown(row("r3"), { button: 0, ctrlKey: true })
    // A right-click on a selected row keeps the selection and names the row under the pointer.
    fireEvent.contextMenu(row("r1"))
    expect(menu).toHaveBeenLastCalledWith([expect.objectContaining({ id: "r1" }), expect.objectContaining({ id: "r3" })], ["r1", "r3"], "r1")
    // Shift+F10 opens on the focused row, wherever it sits in the selection.
    const grid = screen.getByRole("grid")
    fireEvent.keyDown(grid, { key: "ArrowDown" })
    fireEvent.keyDown(grid, { key: "ArrowDown" })
    fireEvent.keyDown(grid, { key: "F10", shiftKey: true })
    expect(menu).toHaveBeenLastCalledWith([expect.objectContaining({ id: "r1" }), expect.objectContaining({ id: "r3" })], ["r1", "r3"], "r3")
  })

  it("keeps menu drafts while open and starts fresh on rapid reopening without redrawing rows", async () => {
    const store = createRowStore<Quote>({ getRowId: row => row.id })
    seed(5, store)
    const cleanup = vi.fn()
    const cell = vi.fn(({ row }: { row: Quote }) => <span>{row.sym}</span>)
    const counted = [{ ...columns[0]!, cell }, ...columns.slice(1)]
    const selection = new Set(["r0"])
    function Menu() {
      const [draft, setDraft] = useState("")
      useEffect(() => () => cleanup(), [])
      return <input aria-label="Menu note" value={draft} onChange={event => setDraft(event.target.value)} />
    }
    const menu = (rows: Quote[]) => <><span>Menu price: {rows[0]?.px}</span><Menu /></>
    const layout = (className?: string) => <DataGrid store={store} columns={counted} label="Quotes" rowHeight={ROW_HEIGHT} initialRect={RECT} selection={selection} focusedRowId="r0" renderContextMenu={menu} className={className} />
    const view = render(layout())
    const before = cell.mock.calls.length
    const row = document.querySelector<HTMLElement>('[data-row-id="r0"]')!
    fireEvent.contextMenu(row)
    const input = await screen.findByRole("textbox", { name: "Menu note" })
    fireEvent.change(input, { target: { value: "Pending note" } })
    view.rerender(layout("border"))
    expect(screen.getByRole("textbox", { name: "Menu note" })).toBe(input)
    expect(input).toHaveValue("Pending note")
    expect(cleanup).not.toHaveBeenCalled()
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" })
    act(() => store.applyDeltas({ patch: [{ id: "r0", fields: { px: 123 } }] }))
    expect(cell).toHaveBeenCalledTimes(before + 1)
    fireEvent.contextMenu(row)
    expect(await screen.findByRole("textbox", { name: "Menu note" })).toHaveValue("")
    expect(screen.getByText("Menu price: 123")).toBeInTheDocument()
    expect(cleanup).toHaveBeenCalledTimes(1)
    expect(cell).toHaveBeenCalledTimes(before + 1)
  })

  it("sorting cycles asc, desc, off from the header, and hides and reorders from column state", () => {
    const store = createRowStore<Quote>({ getRowId: (r) => r.id })
    seed(5, store)
    const onSort = vi.fn()
    const onColumns = vi.fn()
    render(<DataGrid store={store} columns={columns} label="Quotes" rowHeight={ROW_HEIGHT} initialRect={RECT} onSortChange={onSort} onColumnStateChange={onColumns} />)
    const price = screen.getByRole("columnheader", { name: /Price/ })
    fireEvent.click(price.querySelector("span")!)
    expect(onSort).toHaveBeenLastCalledWith({ key: "px", dir: "asc" })
    expect(price).toHaveAttribute("aria-sort", "ascending")
    fireEvent.click(price.querySelector("span")!)
    expect(onSort).toHaveBeenLastCalledWith({ key: "px", dir: "desc" })
    fireEvent.click(price.querySelector("span")!)
    expect(onSort).toHaveBeenLastCalledWith(null)
    // Column focus and keyboard column ops.
    const grid = screen.getByRole("grid")
    fireEvent.keyDown(grid, { key: "ArrowRight" })
    fireEvent.keyDown(grid, { key: "ArrowRight" })
    fireEvent.keyDown(grid, { key: "ArrowRight", altKey: true })
    expect(onColumns).toHaveBeenLastCalledWith(expect.objectContaining({ order: ["sym", "qty", "px"] }))
    fireEvent.keyDown(grid, { key: "ArrowRight", altKey: true, shiftKey: true })
    expect(onColumns.mock.lastCall![0].widths.px).toBe(98)
    fireEvent.keyDown(grid, { key: "h", altKey: true })
    expect(onColumns.mock.lastCall![0].hidden).toEqual(["px"])
    expect(screen.queryByRole("columnheader", { name: /Price/ })).toBeNull()
  })

  it("keeps the first visible row pinned when rows arrive above it (ordered lane)", () => {
    const store = createRowStore<Quote>({ getRowId: (r) => r.id, lane: "ordered" })
    seed(40, store)
    render(<DataGrid store={store} columns={columns} label="RFQs" preset="rfq" rowHeight={ROW_HEIGHT} initialRect={RECT} />)
    const scroller = screen.getByRole("grid").querySelector<HTMLElement>(".overflow-auto")!
    scroller.scrollTop = 10 * ROW_HEIGHT
    fireEvent.scroll(scroller)
    act(() => store.applyDeltas({ upsert: [{ id: "n1", sym: "NEW1", px: 1, qty: 1 }, { id: "n2", sym: "NEW2", px: 1, qty: 1 }], order: ["n1", "n2", ...Array.from({ length: 40 }, (_, i) => `r${i}`)] }))
    expect(scroller.scrollTop).toBe(12 * ROW_HEIGHT)
  })

  it("renders the empty state", () => {
    const store = createRowStore<Quote>({ getRowId: (r) => r.id })
    render(<DataGrid store={store} columns={columns} label="Quotes" initialRect={RECT} emptyState="Nothing yet" />)
    expect(screen.getByText("Nothing yet")).toBeInTheDocument()
  })
})

describe("certification pins", () => {
  it("flashes an arrival in its own commit, and a departed row's return as a fresh arrival", () => {
    // The grid marks arrivals in an insertion effect, which runs before any row's
    // layout effect: a row mounting in the commit of its arrival finds its mark.
    // StrictMode's replay masked the old ordering, so this render is deliberately bare.
    const store = createRowStore<Quote>({ getRowId: row => row.id })
    seed(2, store)
    render(<DataGrid store={store} columns={columns} label="Quotes" initialRect={RECT} rowEnter={{ highlight: true }} />)
    act(() => {
      store.applyDeltas({ upsert: [{ id: "fresh", sym: "FRESH", px: 101, qty: 1 }] })
    })
    const fresh = document.querySelector('[data-row-id="fresh"]') as HTMLElement
    expect(fresh.dataset.direction).toBe("flat")
    // A row that arrives beyond the rendered range and departs unseen loses its mark;
    // what flashes on its return is the return's own fresh mark, not the old one.
    act(() => {
      store.applyDeltas({ upsert: Array.from({ length: 30 }, (_, i) => ({ id: `tail${i}`, sym: `T${i}`, px: 1, qty: 1 })) })
    })
    expect(document.querySelector('[data-row-id="tail29"]')).toBeNull()
    act(() => {
      store.applyDeltas({ remove: ["tail29"] })
    })
    act(() => {
      store.applyDeltas({ remove: Array.from({ length: 29 }, (_, i) => `tail${i}`) })
    })
    act(() => {
      store.applyDeltas({ upsert: [{ id: "tail29", sym: "T29", px: 1, qty: 1 }] })
    })
    // The return is itself an arrival: it flashes on its own fresh mark.
    const returned = document.querySelector('[data-row-id="tail29"]') as HTMLElement
    expect(returned).not.toBeNull()
    expect(returned.dataset.direction).toBe("flat")
  })

  it("flashes a fresh off-view arrival scrolled to in time, and not a stale one", () => {
    // A scroll moves the rendered range without touching ids, so no pruning runs and
    // the row's own window check decides: within the window the remainder flashes,
    // past it an old arrival is not news.
    vi.useFakeTimers()
    try {
      vi.setSystemTime(1_000_000)
      const store = createRowStore<Quote>({ getRowId: row => row.id })
      seed(40, store)
      render(<DataGrid store={store} columns={columns} label="Quotes" preset="rfq" rowHeight={ROW_HEIGHT} initialRect={RECT} rowEnter={{ highlight: true }} />)
      const scroller = screen.getByRole("grid").querySelector<HTMLElement>(".overflow-auto")!
      act(() => {
        store.applyDeltas({ upsert: [{ id: "fresh", sym: "FRESH", px: 1, qty: 1 }] })
      })
      expect(document.querySelector('[data-row-id="fresh"]')).toBeNull()
      // Within the window: scroll down, the mount flashes the remainder.
      vi.setSystemTime(1_000_000 + 500)
      scroller.scrollTop = 30 * ROW_HEIGHT
      fireEvent.scroll(scroller)
      const freshRow = document.querySelector('[data-row-id="fresh"]') as HTMLElement
      expect(freshRow).not.toBeNull()
      expect(freshRow.dataset.direction).toBe("flat")
      // Past the window: a second arrival waits two minutes before being scrolled to.
      scroller.scrollTop = 0
      fireEvent.scroll(scroller)
      act(() => {
        store.applyDeltas({ upsert: [{ id: "stale", sym: "STALE", px: 1, qty: 2 }] })
      })
      expect(document.querySelector('[data-row-id="stale"]')).toBeNull()
      vi.setSystemTime(1_000_000 + 120_000)
      scroller.scrollTop = 30 * ROW_HEIGHT
      fireEvent.scroll(scroller)
      const staleRow = document.querySelector('[data-row-id="stale"]') as HTMLElement
      expect(staleRow).not.toBeNull()
      expect(staleRow.dataset.direction).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it("stands the release sweep down when highlighting turns off", () => {
    // A timer armed for a parked mark must not flash after rowEnter.highlight
    // flips to false, however the flip races the timer's own closure.
    vi.useFakeTimers()
    try {
      vi.setSystemTime(1_000_000)
      const store = createRowStore<Quote>({ getRowId: row => row.id })
      seed(12, store)
      const { rerender } = render(<DataGrid store={store} columns={columns} label="Quotes" preset="rfq" rowHeight={ROW_HEIGHT} initialRect={RECT} sort={{ key: "px", dir: "asc" }} rowEnter={{ highlight: true }} />)
      const grid = screen.getByRole("grid")
      fireEvent.keyDown(grid, { key: "ArrowDown" })
      act(() => {
        store.applyDeltas({ upsert: [{ id: "mid", sym: "MID", px: 102.5, qty: 1 }] })
      })
      expect((document.querySelector('[data-row-id="mid"]') as HTMLElement).dataset.direction).toBeUndefined()
      rerender(<DataGrid store={store} columns={columns} label="Quotes" preset="rfq" rowHeight={ROW_HEIGHT} initialRect={RECT} sort={{ key: "px", dir: "asc" }} rowEnter={{ highlight: false }} />)
      act(() => { vi.advanceTimersByTime(1_000) })
      const row = document.querySelector('[data-row-id="mid"]') as HTMLElement
      expect(row).not.toBeNull()
      expect(row.dataset.direction).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it("reports the hold deadline in wall time whatever clock the view runs on", () => {
    // ViewOptions.now takes any millisecond clock — the suite's own store tests use
    // one starting at zero. The grid compares deadlines with Date.now, so the view
    // converts: a hold longer than the flash window still ends in a flash.
    vi.useFakeTimers()
    try {
      vi.setSystemTime(1_000_000)
      let tick = 0
      const store = createRowStore<Quote>({ getRowId: row => row.id })
      seed(40, store)
      const view = store.prepareView({ comparator: (a, b) => a.px - b.px, reorderHoldMs: 2_000, now: () => tick })
      view.connect()
      render(<DataGrid store={store} columns={columns} label="Quotes" preset="rfq" view={view} rowHeight={ROW_HEIGHT} initialRect={RECT} rowEnter={{ highlight: true }} />)
      const grid = screen.getByRole("grid")
      fireEvent.keyDown(grid, { key: "ArrowDown" })
      act(() => {
        store.applyDeltas({ upsert: [{ id: "mid", sym: "MID", px: 102.5, qty: 1 }] })
      })
      expect(document.querySelector('[data-row-id="mid"]')).toBeNull()
      // The hold outlives the 1.5 s window; on the raw view clock the deadline
      // would read as two million milliseconds in the past.
      tick = 2_000
      act(() => { vi.advanceTimersByTime(2_000) })
      // The release sorts mid into the viewport; it mounts there and flashes.
      const row = document.querySelector('[data-row-id="mid"]') as HTMLElement
      expect(row).not.toBeNull()
      expect(row.dataset.direction).toBe("flat")
    } finally {
      vi.useRealTimers()
    }
  })

  it("sweeps only its own rows when a nested grid shares an id", () => {
    // The release sweep finds rows by data-row-id under its scroller, which sees a
    // nested grid's rows too: the DOM id decides whose row flashes.
    vi.useFakeTimers()
    try {
      vi.setSystemTime(1_000_000)
      const inner = createRowStore<Quote>({ getRowId: row => row.id })
      inner.applyDeltas({ upsert: [{ id: "shared", sym: "INNER", px: 1, qty: 1 }] })
      const outer = createRowStore<Quote>({ getRowId: row => row.id })
      seed(40, outer)
      const innerCols: ColumnDef<Quote>[] = [{ key: "sym", header: "Sym", width: 80, accessor: row => row.sym }]
      const cols: ColumnDef<Quote>[] = [
        { key: "sym", header: "Sym", width: 80, accessor: row => row.sym },
        { key: "book", header: "Book", width: 240, accessor: () => "", cell: ({ row }) => (row as Quote).id === "r0" ? <DataGrid store={inner} columns={innerCols} label="Inner" preset="option-chain" rowHeight={ROW_HEIGHT} initialRect={{ width: 200, height: 60 }} rowEnter={{ highlight: false }} /> : null },
      ]
      render(<DataGrid store={outer} columns={cols} label="Outer" preset="blotter" rowHeight={ROW_HEIGHT} initialRect={RECT} sort={{ key: "px", dir: "asc" }} rowEnter={{ highlight: true }} />)
      const grid = screen.getAllByRole("grid")[0]!
      fireEvent.keyDown(grid, { key: "ArrowDown" })
      act(() => {
        outer.applyDeltas({ upsert: [{ id: "shared", sym: "OUTER", px: 999, qty: 1 }] })
      })
      // Parked at the tail, beyond the outer rendered range; the nested grid's
      // "shared" row is mounted. The release must not flash the nested row.
      act(() => { vi.advanceTimersByTime(750) })
      const innerRow = document.querySelector('[data-row-id="shared"]') as HTMLElement
      expect(innerRow.textContent).toContain("INNER")
      expect(innerRow.dataset.direction).toBeUndefined()
      // The outer row still owns its mark: scrolled to in time, it flashes.
      const scroller = grid.querySelector<HTMLElement>(".overflow-auto")!
      scroller.scrollTop = 40 * ROW_HEIGHT
      fireEvent.scroll(scroller)
      const outerRow = Array.from(document.querySelectorAll<HTMLElement>('[data-row-id="shared"]')).find(el => el.textContent?.includes("OUTER"))
      expect(outerRow).not.toBeUndefined()
      expect(outerRow!.dataset.direction).toBe("flat")
    } finally {
      vi.useRealTimers()
    }
  })

  it("flashes an on-screen arrival when a release publishes nothing", () => {
    // Store order: the newcomer lands in its final place, the release reorders
    // nothing, and no commit observes it. The deadline timer plays the flash.
    vi.useFakeTimers()
    try {
      vi.setSystemTime(1_000_000)
      const store = createRowStore<Quote>({ getRowId: row => row.id })
      seed(3, store)
      render(<DataGrid store={store} columns={columns} label="Orders" preset="blotter" rowHeight={ROW_HEIGHT} initialRect={RECT} rowEnter={{ highlight: true }} />)
      const grid = screen.getByRole("grid")
      fireEvent.keyDown(grid, { key: "ArrowDown" })
      act(() => {
        store.applyDeltas({ upsert: [{ id: "n", sym: "N", px: 1, qty: 1 }] })
      })
      const row = document.querySelector('[data-row-id="n"]') as HTMLElement
      expect(row).not.toBeNull()
      expect(row.dataset.direction).toBeUndefined()
      act(() => { vi.advanceTimersByTime(750) })
      expect(row.dataset.direction).toBe("flat")
    } finally {
      vi.useRealTimers()
    }
  })

  it("keeps a parked overscan row's flash for the release", () => {
    // With fewer rows than the rendered range, a parked arrival mounts immediately.
    // Its window still opens at the release: nothing plays off the arrival commit,
    // and the release sweep plays the flash on the mounted row in place.
    vi.useFakeTimers()
    try {
      vi.setSystemTime(1_000_000)
      const store = createRowStore<Quote>({ getRowId: row => row.id })
      seed(12, store)
      render(<DataGrid store={store} columns={columns} label="Quotes" preset="rfq" rowHeight={ROW_HEIGHT} initialRect={RECT} sort={{ key: "px", dir: "asc" }} rowEnter={{ highlight: true }} />)
      const grid = screen.getByRole("grid")
      fireEvent.keyDown(grid, { key: "ArrowDown" })
      act(() => {
        store.applyDeltas({ upsert: [{ id: "mid", sym: "MID", px: 102.5, qty: 1 }] })
      })
      // Mounted in the overscan band, parked at the tail: the flash waits.
      const parked = document.querySelector('[data-row-id="mid"]') as HTMLElement
      expect(parked).not.toBeNull()
      expect(parked.dataset.direction).toBeUndefined()
      // The release reorders mid into place; the sweep plays the flash there.
      act(() => { vi.advanceTimersByTime(1_000) })
      const settled = document.querySelector('[data-row-id="mid"]') as HTMLElement
      expect(settled).not.toBeNull()
      expect(settled.dataset.direction).toBe("flat")
    } finally {
      vi.useRealTimers()
    }
  })

  it("keeps an open editor rendered with its draft and its focus when its row scrolls out of the window and back", () => {
    const onEdit = vi.fn(() => undefined)
    const store = createRowStore<Quote>({ getRowId: row => row.id })
    seed(40, store)
    const cols: ColumnDef<Quote>[] = [{ key: "px", header: "Price", width: 80, accessor: row => row.px, edit: { parse: text => Number(text) } }]
    render(<DataGrid store={store} columns={cols} label="Quotes" preset="parameters" rowHeight={ROW_HEIGHT} initialRect={RECT} onEdit={onEdit} />)
    const grid = screen.getByRole("grid")
    fireEvent.keyDown(grid, { key: "ArrowDown" })
    fireEvent.keyDown(grid, { key: "ArrowRight" })
    fireEvent.keyDown(grid, { key: "F2" })
    const draft = screen.getByRole("textbox") as HTMLInputElement
    expect(document.activeElement).toBe(draft)
    fireEvent.change(draft, { target: { value: "105.5" } })
    const scroller = grid.querySelector<HTMLElement>(".overflow-auto")!
    scroller.scrollTop = 30 * ROW_HEIGHT
    fireEvent.scroll(scroller)
    // The window moved on and the rows near the top went with it, but not the row being edited: the same input,
    // its draft, and focus stay.
    expect(document.querySelector('[data-row-id="r5"]')).toBeNull()
    expect(screen.getByRole("textbox")).toBe(draft)
    expect(document.activeElement).toBe(draft)
    expect(draft.value).toBe("105.5")
    scroller.scrollTop = 0
    fireEvent.scroll(scroller)
    expect(document.activeElement).toBe(draft)
    expect(draft.value).toBe("105.5")
    expect(onEdit).not.toHaveBeenCalled()
  })

  it("keeps a focused row scrolled out of the window rendered, so the active descendant exists and Shift+F10 opens on it", () => {
    const menu = vi.fn(() => null)
    const store = createRowStore<Quote>({ getRowId: row => row.id })
    seed(40, store)
    render(<DataGrid store={store} columns={columns} label="Quotes" rowHeight={ROW_HEIGHT} initialRect={RECT} renderContextMenu={menu} />)
    const grid = screen.getByRole("grid")
    fireEvent.keyDown(grid, { key: "ArrowDown" })
    const scroller = grid.querySelector<HTMLElement>(".overflow-auto")!
    scroller.scrollTop = 30 * ROW_HEIGHT
    fireEvent.scroll(scroller)
    expect(document.querySelector('[data-row-id="r5"]')).toBeNull()
    expect(document.getElementById(grid.getAttribute("aria-activedescendant")!)).toHaveAttribute("data-row-id", "r0")
    fireEvent.keyDown(grid, { key: "F10", shiftKey: true })
    expect(menu).toHaveBeenLastCalledWith([expect.objectContaining({ id: "r0" })], ["r0"], "r0")
    // The menu opens where the row is, and the row is brought into view first.
    expect(scroller.scrollTop).toBe(0)
  })

  it("opens an editor by a key on a focused row scrolled out of the window where the key lands, focused and brought into view", () => {
    const onEdit = vi.fn(() => undefined)
    const store = createRowStore<Quote>({ getRowId: row => row.id })
    seed(40, store)
    const cols: ColumnDef<Quote>[] = [{ key: "px", header: "Price", width: 80, accessor: row => row.px, edit: { parse: text => Number(text) } }]
    render(<DataGrid store={store} columns={cols} label="Quotes" preset="parameters" rowHeight={ROW_HEIGHT} initialRect={RECT} onEdit={onEdit} />)
    const grid = screen.getByRole("grid")
    fireEvent.keyDown(grid, { key: "ArrowDown" })
    fireEvent.keyDown(grid, { key: "ArrowRight" })
    const scroller = grid.querySelector<HTMLElement>(".overflow-auto")!
    scroller.scrollTop = 30 * ROW_HEIGHT
    fireEvent.scroll(scroller)
    // No layout here, so the scroll is read from the call that asks for it, not from where it lands.
    const scrollTo = vi.spyOn(Element.prototype, "scrollTo")
    fireEvent.keyDown(grid, { key: "5" })
    const editor = screen.getByRole("textbox") as HTMLInputElement
    expect(editor.closest("[data-row-id]")).toHaveAttribute("data-row-id", "r0")
    expect(document.activeElement).toBe(editor)
    expect(editor.value).toBe("5")
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }))
    expect(onEdit).not.toHaveBeenCalled()
  })

  it("opens a retained edit handle on a row out of the window rendered, focused, and brought into view", () => {
    const store = createRowStore<Quote>({ getRowId: row => row.id })
    seed(40, store)
    const handles = new Map<string, CellEditHandle>()
    const cols: ColumnDef<Quote>[] = [{ key: "px", header: "Price", width: 80, accessor: row => row.px, edit: { parse: text => Number(text) }, cell: ({ rowId, edit, value }) => { if (edit) handles.set(rowId, edit); return String(value) } }]
    render(<><button>Elsewhere</button><DataGrid store={store} columns={cols} label="Quotes" preset="parameters" rowHeight={ROW_HEIGHT} initialRect={RECT} onEdit={vi.fn()} /></>)
    const retained = handles.get("r2")!
    const scroller = screen.getByRole("grid").querySelector<HTMLElement>(".overflow-auto")!
    scroller.scrollTop = 30 * ROW_HEIGHT
    fireEvent.scroll(scroller)
    expect(document.querySelector('[data-row-id="r2"]')).toBeNull()
    screen.getByRole("button", { name: "Elsewhere" }).focus()
    // The virtualizer clamps a scroll to the scroller's extent, which has no layout here: give it the header and 40 rows.
    Object.defineProperty(scroller, "scrollHeight", { configurable: true, value: 41 * ROW_HEIGHT })
    Object.defineProperty(scroller, "clientHeight", { configurable: true, value: RECT.height })
    const scrollTo = vi.spyOn(Element.prototype, "scrollTo")
    act(() => retained.open())
    const editor = screen.getByRole("textbox") as HTMLInputElement
    expect(editor.closest("[data-row-id]")).toHaveAttribute("data-row-id", "r2")
    expect(document.activeElement).toBe(editor)
    // Row 2 at the top of the window, under the sticky header.
    expect(scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ top: 2 * ROW_HEIGHT }))
    // Scrolled away again while it holds a draft, the same handle asks for the open editor: back in view, draft kept.
    fireEvent.change(editor, { target: { value: "7" } })
    scroller.scrollTop = 30 * ROW_HEIGHT
    fireEvent.scroll(scroller)
    scrollTo.mockClear()
    act(() => retained.open())
    expect(document.activeElement).toBe(editor)
    expect(editor.value).toBe("7")
    expect(scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ top: 2 * ROW_HEIGHT }))
  })

  it("holds the order while keys land in an editor, as keys on the grid do", () => {
    const store = createRowStore<Quote>({ getRowId: row => row.id })
    seed(40, store)
    const view = store.createView({ comparator: (a, b) => b.px - a.px, reorderHoldMs: 1000 })
    const handles = new Map<string, CellEditHandle>()
    const cols: ColumnDef<Quote>[] = [{ key: "px", header: "Price", width: 80, accessor: row => row.px, edit: { parse: text => Number(text) }, cell: ({ rowId, edit, value }) => { if (edit) handles.set(rowId, edit); return String(value) } }]
    render(<DataGrid store={store} view={view} columns={cols} label="Quotes" rowHeight={ROW_HEIGHT} initialRect={RECT} onEdit={vi.fn()} />)
    // Opened from a handle, so no key on the grid has held anything yet.
    act(() => handles.get("r39")!.open())
    expect(view.isHeld()).toBe(false)
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "1" })
    expect(view.isHeld()).toBe(true)
    view.dispose()
  })

  it("keeps an editor rendered and focused when a re-sort with no hold moves its row out of the window", () => {
    const onEdit = vi.fn(() => undefined)
    const store = createRowStore<Quote>({ getRowId: row => row.id })
    seed(40, store)
    const view = store.createView({ comparator: (a, b) => b.px - a.px })
    const cols: ColumnDef<Quote>[] = [{ key: "px", header: "Price", width: 80, accessor: row => row.px, edit: { parse: text => Number(text) } }]
    render(<DataGrid store={store} view={view} columns={cols} label="Quotes" rowHeight={ROW_HEIGHT} initialRect={RECT} onEdit={onEdit} />)
    const grid = screen.getByRole("grid")
    fireEvent.keyDown(grid, { key: "ArrowDown" })
    fireEvent.keyDown(grid, { key: "ArrowRight" })
    fireEvent.keyDown(grid, { key: "F2" })
    const draft = screen.getByRole("textbox") as HTMLInputElement
    expect(draft.closest("[data-row-id]")).toHaveAttribute("data-row-id", "r39")
    fireEvent.change(draft, { target: { value: "1" } })
    // The feed takes the top row's price to the bottom of the order, far past the rendered window.
    act(() => store.applyDeltas({ patch: [{ id: "r39", fields: { px: 0 } }] }))
    expect(view.getIds().at(-1)).toBe("r39")
    expect(screen.getByRole("textbox")).toBe(draft)
    expect(document.activeElement).toBe(draft)
    expect(draft.value).toBe("1")
    expect(onEdit).not.toHaveBeenCalled()
    view.dispose()
  })

  it("ages parked marks from arrival on a view without holdExpiresAt, and the forwarding wrapper keeps the release accounting", () => {
    // The documented fallback and the migration guide's wrapper, side by side: a
    // wrapped view that drops holdExpiresAt loses a flash to a long hold; one that
    // forwards it, as the guide's complete wrapper does, keeps it.
    const wrap = (source: RowStore<Quote>, forward: boolean): RowStore<Quote> => ({
      ...source,
      prepareView(options) {
        const view = source.prepareView(options)
        return {
          store: view.store,
          getIds: () => view.getIds(),
          subscribe: listener => view.subscribe(listener),
          connect: () => view.connect(),
          touch: () => view.touch(),
          isHeld: () => view.isHeld(),
          ...(forward ? { holdExpiresAt: () => view.holdExpiresAt?.() ?? null } : {}),
          dispose: () => view.dispose(),
          isDisposed: () => view.isDisposed(),
        }
      },
    })
    const park = (store: RowStore<Quote>) => {
      seed(40, store)
      const utils = render(<DataGrid store={store} columns={columns} label="Quotes" preset="rfq" rowHeight={ROW_HEIGHT} initialRect={RECT} sort={{ key: "px", dir: "asc" }} rowEnter={{ highlight: true }} />)
      const grid = utils.container.querySelector<HTMLElement>('[role="grid"]')!
      fireEvent.keyDown(grid, { key: "ArrowDown" })
      act(() => {
        store.applyDeltas({ upsert: [{ id: "mid", sym: "MID", px: 102.5, qty: 1 }] })
      })
      act(() => { vi.advanceTimersByTime(900) })
      fireEvent.keyDown(grid, { key: "ArrowDown" })
      act(() => { vi.advanceTimersByTime(900) })
      fireEvent.keyDown(grid, { key: "ArrowDown" })
      act(() => { vi.advanceTimersByTime(1100) })
      const row = utils.container.querySelector<HTMLElement>('[data-row-id="mid"]')
      expect(row).not.toBeNull()
      const direction = row!.dataset.direction
      utils.unmount()
      return direction
    }
    vi.useFakeTimers()
    try {
      vi.setSystemTime(1_000_000)
      expect(park(wrap(createRowStore<Quote>({ getRowId: row => row.id }), false))).toBeUndefined()
      expect(park(wrap(createRowStore<Quote>({ getRowId: row => row.id }), true))).toBe("flat")
    } finally {
      vi.useRealTimers()
    }
  })

  it("flashes an arrival a reorder hold parked once it settles into place", () => {
    // The hold's wait is the grid's, not the row's: a newcomer parked at the tail
    // through sustained navigation still flashes when the hold releases.
    vi.useFakeTimers()
    try {
      vi.setSystemTime(1_000_000)
      const store = createRowStore<Quote>({ getRowId: row => row.id })
      seed(40, store)
      render(<DataGrid store={store} columns={columns} label="Quotes" preset="rfq" rowHeight={ROW_HEIGHT} initialRect={RECT} sort={{ key: "px", dir: "asc" }} rowEnter={{ highlight: true }} />)
      const grid = screen.getByRole("grid")
      fireEvent.keyDown(grid, { key: "ArrowDown" })
      act(() => {
        store.applyDeltas({ upsert: [{ id: "mid", sym: "MID", px: 102.5, qty: 1 }] })
      })
      // Parked at the tail, beyond the rendered range: no mount, no flash yet.
      expect(document.querySelector('[data-row-id="mid"]')).toBeNull()
      // Extend the hold far past the flash window: the grid's own keys carry the
      // extensions to the parked mark, and the mid-hold arrival keeps the feed real.
      act(() => { vi.advanceTimersByTime(900) })
      fireEvent.keyDown(grid, { key: "ArrowDown" })
      act(() => { vi.advanceTimersByTime(900) })
      fireEvent.keyDown(grid, { key: "ArrowDown" })
      act(() => {
        store.applyDeltas({ upsert: [{ id: "noise", sym: "NOISE", px: 400, qty: 1 }] })
      })
      act(() => { vi.advanceTimersByTime(1100) })
      const row = document.querySelector('[data-row-id="mid"]') as HTMLElement
      expect(row).not.toBeNull()
      expect(row.dataset.direction).toBe("flat")
    } finally {
      vi.useRealTimers()
    }
  })

  it("ages only the marks the hold parked, not older strangers", () => {
    // An off-view arrival from before the hold is almost stale when interaction
    // starts; the release must not make it news again.
    vi.useFakeTimers()
    try {
      vi.setSystemTime(1_000_000)
      const store = createRowStore<Quote>({ getRowId: row => row.id })
      seed(40, store)
      render(<DataGrid store={store} columns={columns} label="Quotes" preset="rfq" rowHeight={ROW_HEIGHT} initialRect={RECT} sort={{ key: "px", dir: "asc" }} rowEnter={{ highlight: true }} />)
      const grid = screen.getByRole("grid")
      // An early arrival lands before any hold, at the tail beyond the rendered
      // range, where it stays; the mid-hold newcomer is what reorders at release.
      act(() => {
        store.applyDeltas({ upsert: [{ id: "old", sym: "OLD", px: 500, qty: 1 }] })
      })
      expect(document.querySelector('[data-row-id="old"]')).toBeNull()
      // The hold is extended past the old arrival's window, and a newcomer parks
      // mid-hold beside it.
      vi.setSystemTime(1_000_000 + 900)
      fireEvent.keyDown(grid, { key: "ArrowDown" })
      vi.setSystemTime(1_000_000 + 1_600)
      act(() => {
        store.applyDeltas({ upsert: [{ id: "parked", sym: "PARKED", px: 102.9, qty: 1 }] })
      })
      act(() => { vi.advanceTimersByTime(1_000) })
      // Released: the newcomer the hold parked settles into view and flashes; the
      // stranger whose window passed before the hold began is scrolled to and silent.
      const parked = document.querySelector('[data-row-id="parked"]') as HTMLElement
      expect(parked).not.toBeNull()
      expect(parked.dataset.direction).toBe("flat")
      const scroller = grid.querySelector<HTMLElement>(".overflow-auto")!
      scroller.scrollTop = 32 * ROW_HEIGHT
      fireEvent.scroll(scroller)
      const row = document.querySelector('[data-row-id="old"]') as HTMLElement
      expect(row).not.toBeNull()
      expect(row.dataset.direction).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it("does not revive marks when a hold lapses unobserved and a late commit finds them", () => {
    // Store order never reorders at release, so nothing publishes when the hold
    // lapses: the transition is seen minutes later on an unrelated arrival, and the
    // restamp must use the lapsed deadline, never that commit's clock.
    vi.useFakeTimers()
    try {
      vi.setSystemTime(1_000_000)
      const store = createRowStore<Quote>({ getRowId: row => row.id })
      seed(40, store)
      render(<DataGrid store={store} columns={columns} label="Orders" preset="blotter" rowHeight={ROW_HEIGHT} initialRect={RECT} rowEnter={{ highlight: true }} />)
      const grid = screen.getByRole("grid")
      fireEvent.keyDown(grid, { key: "ArrowDown" })
      act(() => {
        store.applyDeltas({ upsert: [{ id: "x", sym: "X", px: 1, qty: 1 }] })
      })
      expect(document.querySelector('[data-row-id="x"]')).toBeNull()
      // The hold lapses with the order unchanged: nothing publishes. Five minutes of
      // quiet, then an unrelated arrival finally runs the transition.
      act(() => { vi.advanceTimersByTime(300_000) })
      act(() => {
        store.applyDeltas({ upsert: [{ id: "y", sym: "Y", px: 1, qty: 1 }] })
      })
      const scroller = grid.querySelector<HTMLElement>(".overflow-auto")!
      scroller.scrollTop = 32 * ROW_HEIGHT
      fireEvent.scroll(scroller)
      const x = document.querySelector('[data-row-id="x"]') as HTMLElement
      expect(x).not.toBeNull()
      expect(x.dataset.direction).toBeUndefined()
      // The commit that finally observes the release is itself an arrival: y's own
      // mark is this commit's, never backdated past the lapsed deadline.
      const y = document.querySelector('[data-row-id="y"]') as HTMLElement
      expect(y).not.toBeNull()
      expect(y.dataset.direction).toBe("flat")
    } finally {
      vi.useRealTimers()
    }
  })

  it("lets no second hold revive the marks of the first", () => {
    // Two interactions with a lapse between them: the first hold's parked mark ages
    // from the first deadline, whatever hold is running when it is finally seen.
    vi.useFakeTimers()
    try {
      vi.setSystemTime(1_000_000)
      const store = createRowStore<Quote>({ getRowId: row => row.id })
      seed(40, store)
      render(<DataGrid store={store} columns={columns} label="Orders" preset="blotter" rowHeight={ROW_HEIGHT} initialRect={RECT} rowEnter={{ highlight: true }} />)
      const grid = screen.getByRole("grid")
      fireEvent.keyDown(grid, { key: "ArrowDown" })
      act(() => {
        store.applyDeltas({ upsert: [{ id: "x", sym: "X", px: 1, qty: 1 }] })
      })
      expect(document.querySelector('[data-row-id="x"]')).toBeNull()
      // Hold one lapses unobserved; a minute later a second hold starts, and the
      // next arrival lands while it is still running.
      act(() => { vi.advanceTimersByTime(60_000) })
      fireEvent.keyDown(grid, { key: "ArrowDown" })
      act(() => { vi.advanceTimersByTime(100) })
      act(() => {
        store.applyDeltas({ upsert: [{ id: "y", sym: "Y", px: 1, qty: 1 }] })
      })
      act(() => { vi.advanceTimersByTime(900) })
      const scroller = grid.querySelector<HTMLElement>(".overflow-auto")!
      scroller.scrollTop = 32 * ROW_HEIGHT
      fireEvent.scroll(scroller)
      const x = document.querySelector('[data-row-id="x"]') as HTMLElement
      expect(x).not.toBeNull()
      expect(x.dataset.direction).toBeUndefined()
      const y = document.querySelector('[data-row-id="y"]') as HTMLElement
      expect(y).not.toBeNull()
      expect(y.dataset.direction).toBe("flat")
    } finally {
      vi.useRealTimers()
    }
  })

  it("dismisses a pending with no live promise on reopen, as v1 did", () => {
    // A void onEdit can leave a pending only the store can clear; when the server
    // normalizes the value, nothing ever matches. Reopening dismisses it, so Escape
    // or an untouched close leaves a clean cell.
    const onEdit = vi.fn(() => undefined)
    const store = createRowStore<Quote>({ getRowId: row => row.id })
    seed(2, store)
    const cols: ColumnDef<Quote>[] = [{ key: "px", header: "Price", width: 80, accessor: row => row.px, edit: { parse: text => Number(text) } }]
    render(<DataGrid store={store} columns={cols} label="Quotes" preset="parameters" rowHeight={ROW_HEIGHT} initialRect={RECT} onEdit={onEdit} />)
    const grid = screen.getByRole("grid")
    fireEvent.keyDown(grid, { key: "ArrowDown" })
    fireEvent.keyDown(grid, { key: "ArrowRight" })
    fireEvent.keyDown(grid, { key: "F2" })
    const input = screen.getByRole("textbox") as HTMLInputElement
    fireEvent.change(input, { target: { value: "105.123" } })
    fireEvent.keyDown(input, { key: "Enter" })
    act(() => {
      store.applyDeltas({ patch: [{ id: "r0", fields: { px: 105.12 } }] })
    })
    const cell = () => document.querySelector('[data-row-id="r0"] [data-col="px"]')!
    expect(cell().hasAttribute("data-pending")).toBe(true)
    fireEvent.keyDown(grid, { key: "F2" })
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" })
    expect(cell().hasAttribute("data-pending")).toBe(false)
    expect(cell().textContent).toContain("105.12")
  })

  it("keeps the covered pending when an invalid draft blurs away", async () => {
    // Typing junk over a reopened pending and clicking away sends nothing: the
    // cover comes back, and the server's later rejection still lands.
    let reject!: (reason: unknown) => void
    const onEdit = vi.fn(() => new Promise((_, rej) => { reject = rej }))
    const store = createRowStore<Quote>({ getRowId: row => row.id })
    seed(2, store)
    const cols: ColumnDef<Quote>[] = [{ key: "px", header: "Price", width: 80, accessor: row => row.px, edit: { parse: text => { const n = Number(text); return Number.isFinite(n) ? n : { problem: "Not a number" } } } }]
    render(<DataGrid store={store} columns={cols} label="Quotes" preset="parameters" rowHeight={ROW_HEIGHT} initialRect={RECT} onEdit={onEdit} />)
    const grid = screen.getByRole("grid")
    fireEvent.keyDown(grid, { key: "ArrowDown" })
    fireEvent.keyDown(grid, { key: "ArrowRight" })
    fireEvent.keyDown(grid, { key: "F2" })
    const input = screen.getByRole("textbox") as HTMLInputElement
    fireEvent.change(input, { target: { value: "105" } })
    fireEvent.keyDown(input, { key: "Enter" })
    const cell = () => document.querySelector('[data-row-id="r0"] [data-col="px"]')!
    expect(cell().hasAttribute("data-pending")).toBe(true)
    fireEvent.keyDown(grid, { key: "F2" })
    const reopened = screen.getByRole("textbox") as HTMLInputElement
    fireEvent.change(reopened, { target: { value: "abc" } })
    fireEvent.blur(reopened)
    expect(onEdit).toHaveBeenCalledTimes(1)
    expect(cell().hasAttribute("data-pending")).toBe(true)
    await act(async () => {
      reject(new Error("too far"))
    })
    expect(cell().textContent).toContain("too far")
  })

  it("settles a covered pending when the store catches up during the reopen", async () => {
    const onEdit = vi.fn(() => new Promise(() => {}))
    const store = createRowStore<Quote>({ getRowId: row => row.id })
    seed(2, store)
    const cols: ColumnDef<Quote>[] = [{ key: "px", header: "Price", width: 80, accessor: row => row.px, edit: { parse: text => Number(text) } }]
    render(<DataGrid store={store} columns={cols} label="Quotes" preset="parameters" rowHeight={ROW_HEIGHT} initialRect={RECT} onEdit={onEdit} />)
    const grid = screen.getByRole("grid")
    fireEvent.keyDown(grid, { key: "ArrowDown" })
    fireEvent.keyDown(grid, { key: "ArrowRight" })
    fireEvent.keyDown(grid, { key: "F2" })
    const input = screen.getByRole("textbox") as HTMLInputElement
    fireEvent.change(input, { target: { value: "105" } })
    fireEvent.keyDown(input, { key: "Enter" })
    fireEvent.keyDown(grid, { key: "F2" })
    // The venue acknowledges while the untouched reopen is up, then moves on.
    act(() => {
      store.applyDeltas({ patch: [{ id: "r0", fields: { px: 105 } }] })
    })
    act(() => {
      store.applyDeltas({ patch: [{ id: "r0", fields: { px: 106 } }] })
    })
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" })
    const cell = document.querySelector('[data-row-id="r0"] [data-col="px"]')!
    expect(cell.hasAttribute("data-pending")).toBe(false)
    expect(cell.textContent).toContain("106")
  })

  it("closes an open editor when its row leaves the view, and the returning row steals nothing", async () => {
    const onEdit = vi.fn()
    const store = createRowStore<Quote>({ getRowId: row => row.id })
    seed(3, store)
    const cols: ColumnDef<Quote>[] = [{ key: "px", header: "Price", width: 80, accessor: row => row.px, edit: { parse: text => Number(text) } }]
    const ui = (filter?: (row: Quote) => boolean) => <DataGrid store={store} columns={cols} label="Quotes" preset="parameters" rowHeight={ROW_HEIGHT} initialRect={RECT} filter={filter} onEdit={onEdit} />
    const view = render(ui())
    const grid = screen.getByRole("grid")
    fireEvent.keyDown(grid, { key: "ArrowDown" })
    fireEvent.keyDown(grid, { key: "ArrowDown" })
    fireEvent.keyDown(grid, { key: "ArrowRight" })
    fireEvent.keyDown(grid, { key: "F2" })
    expect(screen.getByRole("textbox")).toBeInTheDocument()
    view.rerender(ui((row) => row.id !== "r1"))
    expect(screen.queryByRole("textbox")).toBeNull()
    const outside = document.createElement("button")
    document.body.appendChild(outside)
    outside.focus()
    view.rerender(ui())
    expect(screen.queryByRole("textbox")).toBeNull()
    expect(document.activeElement).toBe(outside)
    expect(onEdit).not.toHaveBeenCalled()
    outside.remove()
  })

  it("sends nothing from an editor opened and left unchanged, Tab chains included", () => {
    const onEdit = vi.fn()
    const store = createRowStore<Quote>({ getRowId: row => row.id })
    store.applyDeltas({ upsert: [{ id: "r0", sym: "S0", px: 0.123456, qty: 10 }] })
    // One row: a single ArrowDown lands on it.
    const rounding: ColumnDef<Quote>[] = [
      { key: "px", header: "Price", width: 80, accessor: row => row.px, format: v => (v as number).toFixed(2), edit: { parse: text => Number(text) } },
      { key: "qty", header: "Qty", width: 80, accessor: row => row.qty, edit: { parse: text => Number(text) } },
    ]
    render(<DataGrid store={store} columns={rounding} label="Quotes" preset="parameters" rowHeight={ROW_HEIGHT} initialRect={RECT} onEdit={onEdit} />)
    const grid = screen.getByRole("grid")
    fireEvent.keyDown(grid, { key: "ArrowDown" })
    fireEvent.keyDown(grid, { key: "ArrowRight" })
    fireEvent.keyDown(grid, { key: "F2" })
    const input = screen.getByRole("textbox") as HTMLInputElement
    expect(input.value).toBe("0.12")
    fireEvent.keyDown(input, { key: "Tab" })
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" })
    expect(onEdit).not.toHaveBeenCalled()
  })

  it("keeps a pending edit and its later rejection through an untouched reopen", async () => {
    // Reopening a pending cell shows the committed text; closing it untouched must
    // restore the pending mark, so the server's later rejection still lands.
    let reject!: (reason: unknown) => void
    const onEdit = vi.fn(() => new Promise((_, rej) => { reject = rej }))
    const store = createRowStore<Quote>({ getRowId: row => row.id })
    seed(2, store)
    const cols: ColumnDef<Quote>[] = [{ key: "px", header: "Price", width: 80, accessor: row => row.px, edit: { parse: text => Number(text) } }]
    render(<DataGrid store={store} columns={cols} label="Quotes" preset="parameters" rowHeight={ROW_HEIGHT} initialRect={RECT} onEdit={onEdit} />)
    const grid = screen.getByRole("grid")
    fireEvent.keyDown(grid, { key: "ArrowDown" })
    fireEvent.keyDown(grid, { key: "ArrowRight" })
    fireEvent.keyDown(grid, { key: "F2" })
    const input = screen.getByRole("textbox") as HTMLInputElement
    fireEvent.change(input, { target: { value: "105" } })
    fireEvent.keyDown(input, { key: "Enter" })
    expect(onEdit).toHaveBeenCalledTimes(1)
    const cell = () => document.querySelector('[data-row-id="r0"] [data-col="px"]')!
    expect(cell().hasAttribute("data-pending")).toBe(true)
    fireEvent.keyDown(grid, { key: "F2" })
    const reopened = screen.getByRole("textbox") as HTMLInputElement
    expect(reopened.value).toBe("105")
    fireEvent.keyDown(reopened, { key: "Enter" })
    expect(onEdit).toHaveBeenCalledTimes(1)
    expect(cell().hasAttribute("data-pending")).toBe(true)
    // Escape restores the covered state the same way the untouched close does.
    fireEvent.keyDown(grid, { key: "F2" })
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" })
    expect(cell().hasAttribute("data-pending")).toBe(true)
    await act(async () => {
      reject(new Error("too far"))
    })
    expect(cell().textContent).toContain("too far")
  })

  it("closes an untouched editor on blur without sending", () => {
    const onEdit = vi.fn()
    const store = createRowStore<Quote>({ getRowId: row => row.id })
    store.applyDeltas({ upsert: [{ id: "r0", sym: "S0", px: 0.123456, qty: 10 }] })
    const cols: ColumnDef<Quote>[] = [{ key: "px", header: "Price", width: 80, accessor: row => row.px, format: v => (v as number).toFixed(2), edit: { parse: text => Number(text) } }]
    render(<DataGrid store={store} columns={cols} label="Quotes" preset="parameters" rowHeight={ROW_HEIGHT} initialRect={RECT} onEdit={onEdit} />)
    const grid = screen.getByRole("grid")
    fireEvent.keyDown(grid, { key: "ArrowDown" })
    fireEvent.keyDown(grid, { key: "ArrowRight" })
    fireEvent.keyDown(grid, { key: "F2" })
    const input = screen.getByRole("textbox") as HTMLInputElement
    fireEvent.blur(input)
    expect(onEdit).not.toHaveBeenCalled()
    expect(screen.queryByRole("textbox")).toBeNull()
  })

  it("does not activate a hidden focused row through Enter on a non-editable grid", () => {
    const store = createRowStore<Quote>({ getRowId: row => row.id })
    seed(3, store)
    const activate = vi.fn()
    const ui = (filter?: (row: Quote) => boolean) => <DataGrid store={store} columns={columns} label="Quotes" initialRect={RECT} filter={filter} onRowActivate={activate} />
    const view = render(ui())
    const grid = screen.getByRole("grid")
    fireEvent.keyDown(grid, { key: "ArrowDown" })
    fireEvent.keyDown(grid, { key: "ArrowDown" })
    view.rerender(ui((row) => row.id !== "r1"))
    fireEvent.keyDown(grid, { key: "Enter" })
    expect(activate).not.toHaveBeenCalled()
    view.rerender(ui())
    fireEvent.keyDown(grid, { key: "Enter" })
    expect(activate).toHaveBeenCalledTimes(1)
  })

  it("lets no keyboard command act on a focused row the view no longer holds", () => {
    const store = createRowStore<Quote>({ getRowId: row => row.id })
    seed(3, store)
    const activate = vi.fn(), selection = vi.fn(), onEdit = vi.fn()
    const cols: ColumnDef<Quote>[] = [{ key: "px", header: "Price", width: 80, accessor: row => row.px, edit: { parse: text => Number(text) } }]
    const ui = (filter?: (row: Quote) => boolean) => <DataGrid store={store} columns={cols} label="Quotes" preset="parameters" rowHeight={ROW_HEIGHT} initialRect={RECT} filter={filter} onRowActivate={activate} onSelectionChange={selection} onEdit={onEdit} />
    const view = render(ui())
    const grid = screen.getByRole("grid")
    fireEvent.keyDown(grid, { key: "ArrowDown" })
    fireEvent.keyDown(grid, { key: "ArrowDown" })
    fireEvent.keyDown(grid, { key: "ArrowRight" })
    activate.mockClear()
    selection.mockClear()
    view.rerender(ui((row) => row.id !== "r1"))
    fireEvent.keyDown(grid, { key: "Enter" })
    fireEvent.keyDown(grid, { key: " " })
    fireEvent.keyDown(grid, { key: "5" })
    expect(activate).not.toHaveBeenCalled()
    expect(selection).not.toHaveBeenCalled()
    expect(screen.queryByRole("textbox")).toBeNull()
  })

  it("keeps the covered state when permission is revoked under an untouched reopen", () => {
    // A revocation mid-look refuses a real change; it must not erase the pending
    // state a merely-opened editor was covering.
    const onEdit = vi.fn(() => new Promise(() => {}))
    const store = createRowStore<{ id: string; px: number; locked: boolean }>({ getRowId: row => row.id })
    store.applyDeltas({ upsert: [{ id: "r0", px: 101, locked: false }, { id: "r1", px: 102, locked: false }] })
    const cols: ColumnDef<{ id: string; px: number; locked: boolean }>[] = [{ key: "px", header: "Price", width: 80, accessor: row => row.px, edit: { parse: text => Number(text), canEdit: row => !row.locked } }]
    render(<DataGrid store={store} columns={cols} label="Quotes" preset="parameters" rowHeight={ROW_HEIGHT} initialRect={RECT} onEdit={onEdit} />)
    const grid = screen.getByRole("grid")
    fireEvent.keyDown(grid, { key: "ArrowDown" })
    fireEvent.keyDown(grid, { key: "ArrowRight" })
    fireEvent.keyDown(grid, { key: "F2" })
    const input = screen.getByRole("textbox") as HTMLInputElement
    fireEvent.change(input, { target: { value: "105" } })
    fireEvent.keyDown(input, { key: "Enter" })
    const cell = () => document.querySelector('[data-row-id="r0"] [data-col="px"]')!
    expect(cell().hasAttribute("data-pending")).toBe(true)
    fireEvent.keyDown(grid, { key: "F2" })
    act(() => {
      store.applyDeltas({ patch: [{ id: "r0", fields: { locked: true } }] })
    })
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" })
    expect(cell().hasAttribute("data-pending")).toBe(true)
    expect(onEdit).toHaveBeenCalledTimes(1)
  })

  it("rewrites a covered pending when its promise settles under the reopened editor", async () => {
    // Reject while the untouched reopen is still up: the close must show the refusal,
    // never restore a pending with no live promise behind it.
    let reject!: (reason: unknown) => void
    const onEdit = vi.fn(() => new Promise((_, rej) => { reject = rej }))
    const store = createRowStore<Quote>({ getRowId: row => row.id })
    seed(2, store)
    const cols: ColumnDef<Quote>[] = [{ key: "px", header: "Price", width: 80, accessor: row => row.px, edit: { parse: text => Number(text) } }]
    render(<DataGrid store={store} columns={cols} label="Quotes" preset="parameters" rowHeight={ROW_HEIGHT} initialRect={RECT} onEdit={onEdit} />)
    const grid = screen.getByRole("grid")
    fireEvent.keyDown(grid, { key: "ArrowDown" })
    fireEvent.keyDown(grid, { key: "ArrowRight" })
    fireEvent.keyDown(grid, { key: "F2" })
    const input = screen.getByRole("textbox") as HTMLInputElement
    fireEvent.change(input, { target: { value: "105" } })
    fireEvent.keyDown(input, { key: "Enter" })
    fireEvent.keyDown(grid, { key: "F2" })
    await act(async () => {
      reject(new Error("too far"))
    })
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" })
    const cell = document.querySelector('[data-row-id="r0"] [data-col="px"]')!
    expect(cell.hasAttribute("data-pending")).toBe(false)
    expect(cell.textContent).toContain("too far")
    expect(onEdit).toHaveBeenCalledTimes(1)
  })

  it("clears a covered pending whose promise resolves under the reopen", async () => {
    let resolve!: () => void
    const onEdit = vi.fn(() => new Promise<void>(res => { resolve = res }))
    const store = createRowStore<Quote>({ getRowId: row => row.id })
    seed(2, store)
    const cols: ColumnDef<Quote>[] = [{ key: "px", header: "Price", width: 80, accessor: row => row.px, edit: { parse: text => Number(text) } }]
    render(<DataGrid store={store} columns={cols} label="Quotes" preset="parameters" rowHeight={ROW_HEIGHT} initialRect={RECT} onEdit={onEdit} />)
    const grid = screen.getByRole("grid")
    fireEvent.keyDown(grid, { key: "ArrowDown" })
    fireEvent.keyDown(grid, { key: "ArrowRight" })
    fireEvent.keyDown(grid, { key: "F2" })
    const input = screen.getByRole("textbox") as HTMLInputElement
    fireEvent.change(input, { target: { value: "105" } })
    fireEvent.keyDown(input, { key: "Enter" })
    fireEvent.keyDown(grid, { key: "F2" })
    await act(async () => {
      resolve()
    })
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" })
    const cell = document.querySelector('[data-row-id="r0"] [data-col="px"]')!
    expect(cell.hasAttribute("data-pending")).toBe(false)
    expect(cell.hasAttribute("data-rejected")).toBe(false)
  })

  it("ignores a retained open for a row the view no longer holds", async () => {
    // The delayed-open pattern, aimed at a filtered-out row: without the gate, the
    // editor state mounts and takes focus whenever the row next returns.
    const store = createRowStore<Quote>({ getRowId: row => row.id })
    seed(2, store)
    let handle: CellEditHandle | undefined
    const onEdit = vi.fn()
    const custom: ColumnDef<Quote>[] = [
      { key: "sym", header: "Symbol", width: 80, accessor: row => row.sym },
      { key: "px", header: "Price", width: 80, accessor: row => row.px, edit: { parse: text => Number(text) }, cell: ({ edit, value }) => { handle = edit; return String(value) } },
    ]
    const layout = (filter?: (row: Quote) => boolean) => <>
      <input aria-label="Outside" />
      <DataGrid store={store} columns={custom} label="Sheet" initialRect={RECT} filter={filter} onEdit={onEdit} />
    </>
    const { rerender } = render(layout())
    const retained = handle!
    // The custom cell runs per row; the retained handle is the last-rendered row's, r1.
    rerender(layout(row => row.id !== "r1"))
    act(() => retained.open())
    expect(screen.queryByRole("textbox", { name: "Price" })).toBeNull()
    const outside = screen.getByRole("textbox", { name: "Outside" })
    outside.focus()
    rerender(layout())
    expect(screen.queryByRole("textbox", { name: "Price" })).toBeNull()
    expect(outside).toHaveFocus()
    expect(onEdit).not.toHaveBeenCalled()
  })

  it("emits no selection change from Escape when nothing is selected", () => {
    const store = createRowStore<Quote>({ getRowId: row => row.id })
    seed(2, store)
    const selection = vi.fn()
    render(<DataGrid store={store} columns={columns} label="Quotes" initialRect={RECT} onSelectionChange={selection} />)
    fireEvent.keyDown(screen.getByRole("grid"), { key: "Escape" })
    expect(selection).not.toHaveBeenCalled()
  })

  it("neutralizes spreadsheet formulas in the export", () => {
    const store = createRowStore<{ id: string; note: string }>({ getRowId: row => row.id })
    store.applyDeltas({ upsert: [{ id: "a", note: "=SUM(A1:A9)" }, { id: "b", note: "@cmd" }, { id: "c", note: "-1200" }, { id: "d", note: "plain" }, { id: "e", note: "-cmd" }, { id: "f", note: "+1+SUM(A1:A9)" }, { id: "g", note: "-1.5e3" }] })
    const cols: ColumnDef<{ id: string; note: string }>[] = [{ key: "note", header: "Note", width: 120, accessor: row => row.note }]
    const csv = exportCsv(store, cols, ["a", "b", "c", "d", "e", "f", "g"])
    expect(csv).toContain("'=SUM(A1:A9)")
    expect(csv).toContain("'@cmd")
    // Signed numbers are data: no prefix, so numeric exports stay parseable.
    expect(csv.split("\r\n")[3]).toBe("-1200")
    expect(csv.split("\r\n")[4]).toBe("plain")
    expect(csv.split("\r\n")[5]).toBe("'-cmd")
    // A leading number does not stop a spreadsheet evaluating the rest: only a field
    // that is entirely a number stays raw.
    expect(csv.split("\r\n")[6]).toBe("'+1+SUM(A1:A9)")
    expect(csv.split("\r\n")[7]).toBe("-1.5e3")
    // A finite numeric accessor skips only the sign rule: its signed, grouped text
    // is data, but a formatter that emits a hard formula lead is still neutralized.
    const pnl = createRowStore<{ id: string; v: number }>({ getRowId: row => row.id })
    pnl.applyDeltas({ upsert: [{ id: "a", v: 1234.5 }] })
    const signed: ColumnDef<{ id: string; v: number }>[] = [{ key: "v", header: "P&L", width: 80, accessor: row => row.v, format: value => `+${(value as number).toLocaleString("en-US", { minimumFractionDigits: 2 })}` }]
    expect(exportCsv(pnl, signed, ["a"]).split("\r\n")[1]).toBe('"+1,234.50"')
    const linked: ColumnDef<{ id: string; v: number }>[] = [{ key: "v", header: "P&L", width: 80, numeric: true, accessor: row => row.v, format: value => `=HYPERLINK("https://example.com","${value as number}")` }]
    expect(exportCsv(pnl, linked, ["a"]).split("\r\n")[1]).toBe('"\'=HYPERLINK(""https://example.com"",""1234.5"")"')
    // Signed numeric text that does not read as one number is not data either.
    const payload: ColumnDef<{ id: string; v: number }>[] = [{ key: "v", header: "P&L", width: 80, numeric: true, accessor: row => row.v, format: () => "-2+3+cmd" }]
    expect(exportCsv(pnl, payload, ["a"]).split("\r\n")[1]).toBe("'-2+3+cmd")
  })
})

describe("row names", () => {
  const symbol = (row: Quote) => row.sym
  const reading = () => document.querySelector("[data-grid-row-reading]")!.textContent
  const row = (id: string) => document.querySelector<HTMLElement>(`[role='row'][data-row-id='${id}']`)!

  it("names each row by getRowLabel, and holds the name while its cells tick", () => {
    const store = createRowStore<Quote>({ getRowId: (r) => r.id })
    seed(3, store)
    render(<DataGrid store={store} columns={columns} label="Quotes" initialRect={RECT} getRowLabel={symbol} />)
    expect(row("r1")).toHaveAttribute("aria-label", "S0001")
    act(() => store.applyDeltas({ patch: [{ id: "r1", fields: { px: 250 } }] }))
    expect(row("r1")).toHaveTextContent("250.00")
    expect(row("r1")).toHaveAttribute("aria-label", "S0001")
  })

  it("leaves a row named by its cells, and reads nothing, without getRowLabel", () => {
    const store = createRowStore<Quote>({ getRowId: (r) => r.id })
    seed(3, store)
    render(<DataGrid store={store} columns={columns} label="Quotes" initialRect={RECT} />)
    expect(row("r1")).not.toHaveAttribute("aria-label")
    expect(document.querySelector("[data-grid-row-reading]")).toBeNull()
  })

  it("reads the focused row's cells once, when focus rests on it, and never for a tick", () => {
    vi.useFakeTimers()
    try {
      const store = createRowStore<Quote>({ getRowId: (r) => r.id })
      seed(3, store)
      render(<DataGrid store={store} columns={columns} label="Quotes" initialRect={RECT} getRowLabel={symbol} />)
      const grid = screen.getByRole("grid")
      act(() => grid.focus())
      // Passing a row on the way to another reads nothing for it.
      fireEvent.keyDown(grid, { key: "ArrowDown" })
      act(() => vi.advanceTimersByTime(200))
      fireEvent.keyDown(grid, { key: "ArrowDown" })
      act(() => vi.advanceTimersByTime(399))
      expect(reading()).toBe("")
      act(() => vi.advanceTimersByTime(1))
      expect(reading()).toBe("S0001, 101.00, 10")
      // A tick changes the cells and not the reading.
      act(() => store.applyDeltas({ patch: [{ id: "r1", fields: { px: 150 } }] }))
      act(() => vi.advanceTimersByTime(2000))
      expect(reading()).toBe("S0001, 101.00, 10")
      fireEvent.keyDown(grid, { key: "ArrowDown" })
      act(() => vi.advanceTimersByTime(400))
      expect(reading()).toBe("S0002, 102.00, 20")
      // Coming back reads the row as it is now.
      fireEvent.keyDown(grid, { key: "ArrowUp" })
      act(() => vi.advanceTimersByTime(400))
      expect(reading()).toBe("S0001, 150.00, 10")
      // The grid taking focus again reads its row again, the same words made new for the live region.
      act(() => grid.blur())
      act(() => grid.focus())
      act(() => vi.advanceTimersByTime(400))
      expect(reading()).toBe("S0001, 150.00, 10\u200b")
    } finally {
      vi.useRealTimers()
    }
  })

  it("takes null as no label: rows named by their cells, and nothing read", () => {
    const store = createRowStore<Quote>({ getRowId: (r) => r.id })
    seed(3, store)
    render(<DataGrid store={store} columns={columns} label="Quotes" initialRect={RECT} getRowLabel={null} />)
    expect(row("r1")).not.toHaveAttribute("aria-label")
    expect(document.querySelector("[data-grid-row-reading]")).toBeNull()
  })

  it("reads the row a pointer focuses", () => {
    vi.useFakeTimers()
    try {
      const store = createRowStore<Quote>({ getRowId: (r) => r.id })
      seed(3, store)
      render(<DataGrid store={store} columns={columns} label="Quotes" initialRect={RECT} getRowLabel={symbol} />)
      const grid = screen.getByRole("grid")
      // A press on a cell focuses the grid, the browser's default, and the row.
      act(() => grid.focus())
      fireEvent.pointerDown(row("r2").querySelector('[data-col="px"]')!, { button: 0, pointerType: "mouse" })
      act(() => vi.advanceTimersByTime(400))
      expect(reading()).toBe("S0002, 102.00, 20")
    } finally {
      vi.useRealTimers()
    }
  })

  it.each(["open", "closed"] as const)("reads the focused row inside a shadow root (%s)", (mode) => {
    vi.useFakeTimers()
    const host = document.createElement("div")
    document.body.append(host)
    const container = document.createElement("div")
    host.attachShadow({ mode }).append(container)
    try {
      const store = createRowStore<Quote>({ getRowId: (r) => r.id })
      seed(3, store)
      const { unmount } = render(<DataGrid store={store} columns={columns} label="Quotes" initialRect={RECT} getRowLabel={symbol} />, { container })
      const grid = container.querySelector<HTMLElement>('[role="grid"]')!
      act(() => grid.focus())
      fireEvent.keyDown(grid, { key: "ArrowDown" })
      fireEvent.keyDown(grid, { key: "ArrowDown" })
      act(() => vi.advanceTimersByTime(400))
      expect(container.querySelector("[data-grid-row-reading]")!.textContent).toBe("S0001, 101.00, 10")
      unmount()
    } finally {
      host.remove()
      vi.useRealTimers()
    }
  })

  it("reads nothing while the grid does not have focus", () => {
    vi.useFakeTimers()
    try {
      const store = createRowStore<Quote>({ getRowId: (r) => r.id })
      seed(3, store)
      const view = (focused: string) => <><button>Outside</button><DataGrid store={store} columns={columns} label="Quotes" initialRect={RECT} getRowLabel={symbol} focusedRowId={focused} /></>
      const { rerender } = render(view("r1"))
      act(() => screen.getByRole("button", { name: "Outside" }).focus())
      rerender(view("r2"))
      act(() => vi.advanceTimersByTime(1000))
      expect(reading()).toBe("")
    } finally {
      vi.useRealTimers()
    }
  })

  it("reads what a screen reader says in each cell, after the accessible-name rules, and no selection box", () => {
    vi.useFakeTimers()
    try {
      const store = createRowStore<Quote>({ getRowId: (r) => r.id })
      seed(3, store)
      const marked: ColumnDef<Quote>[] = [
        ...columns,
        // Hidden marks are left out, a labelled image reads its label, and a generic span's label is no name, by
        // `aria-label` or by `aria-labelledby`.
        { key: "dir", header: "Direction", width: 60, accessor: (r) => r.px, cell: ({ row }) => <><span aria-hidden="true">▲</span><span hidden>held</span><span role="img" aria-label="up">↑</span><span aria-label="not a name">on the day</span><span id={`why-${row.id}`} hidden>no name either</span><span aria-labelledby={`why-${row.id}`}>since the open</span></> },
        // A timer named by its hidden label and its digits, as Countdown is.
        { key: "left", header: "Left", width: 80, accessor: (r) => r.id, cell: ({ row }) => <span role="timer" aria-labelledby={`label-${row.id} digits-${row.id}`}><span id={`label-${row.id}`} hidden>Time left</span><span id={`digits-${row.id}`}>0:59</span></span> },
        // A field reads its value and a select its chosen option, labelled or not and whatever their role, a combobox built
        // on a button reads its label, and an image its alt.
        { key: "note", header: "Note", width: 120, accessor: () => "", cell: ({ row }) => <><span id={`cap-${row.id}`} hidden>Caption</span><input aria-label="Note" defaultValue={`note ${row.id}`} /><input aria-labelledby={`cap-${row.id}`} defaultValue="held" /><select aria-labelledby={`cap-${row.id}`} defaultValue="b"><option value="a">Alpha</option><option value="b">Beta</option></select><input role="combobox" aria-label="Venue" defaultValue="NYSE" /><button role="combobox" aria-label="Side">Buy</button><img alt="flag" src="" /></> },
      ]
      // A heading takes no name, a link and anything with a role that takes one do, and a target is read whole, its
      // hidden content included.
      marked.push({ key: "kinds", header: "Kinds", width: 120, accessor: () => "", cell: ({ row }) => <><h3 aria-label="no name">heading</h3><a aria-label="link name">link</a><span role="combobox" aria-label="span name">span</span><span id={`whole-${row.id}`}>Up<span aria-hidden="true"> ▲</span></span><button aria-labelledby={`whole-${row.id}`}>×</button></> })
      render(<DataGrid store={store} columns={marked} label="Quotes" initialRect={RECT} getRowLabel={symbol} selectionMode="multi" selectionColumn />)
      const grid = screen.getByRole("grid")
      act(() => grid.focus())
      fireEvent.keyDown(grid, { key: "ArrowDown" })
      fireEvent.keyDown(grid, { key: "ArrowDown" })
      act(() => vi.advanceTimersByTime(400))
      expect(reading()).toBe("S0001, 101.00, 10, up on the day since the open, Time left 0:59, note r1 held Beta NYSE Side flag, heading link name span name Up Up ▲")
    } finally {
      vi.useRealTimers()
    }
  })
})

describe("rules as data", () => {
  const thirtySeconds = { kind: "fraction", denominator: 32, half: "+" } as const
  const ruled: ColumnDef<Quote>[] = [
    { key: "sym", header: "Symbol", width: 80, frozen: "left", sortable: true, accessor: (r) => r.sym },
    { key: "px", header: "Price", width: 90, numeric: true, sortable: true, accessor: (r) => r.px, format: (v) => formatPrice(v as number, thirtySeconds), parse: (text) => parsePrice(text, thirtySeconds) },
    { key: "qty", header: "Qty", width: 70, numeric: true, sortable: true, accessor: (r) => r.qty },
  ]
  const rules: GridRules = {
    columns: [
      { id: "rich", column: "px", when: { op: "gte", value: "105-00" }, tone: "up", label: "Rich to the market" },
      { id: "cheap", column: "px", when: { op: "lt", value: "101-16" }, tone: "down" },
      { id: "big", column: "qty", when: { op: "gte", value: "70" }, tone: "primary", target: "row", label: "Large" },
    ],
    filter: [{ column: "qty", op: "notNull" }],
    sort: [{ key: "qty", dir: "desc" }],
  }
  const cell = (rowId: string, key: string) => document.querySelector<HTMLElement>(`[data-row-id="${rowId}"] [data-col="${key}"]`)!

  it("colors a cell by the first matching rule, in the column's own notation, and says the rule in words beside the color", () => {
    const store = createRowStore<Quote>({ getRowId: (r) => r.id })
    seed(10, store)
    render(<DataGrid store={store} columns={ruled} label="Quotes" rowHeight={ROW_HEIGHT} initialRect={RECT} rules={rules} />)
    // Prices run 100 + i: r9 at 109 is above 105-00, r1 at 101 is below 101-16, r3 at 103 is neither. r0 is filtered out (its qty is null).
    expect(cell("r9", "px")).toHaveAttribute("data-rule", "rich")
    expect(cell("r9", "px")).toHaveAttribute("data-tone", "up")
    expect(cell("r9", "px")).toHaveAttribute("aria-description", "Rich to the market")
    expect(cell("r9", "px").className).toContain("text-foreground")
    expect(cell("r1", "px")).toHaveAttribute("data-rule", "cheap")
    expect(cell("r1", "px")).toHaveAttribute("aria-description", "Price below 101-16")
    expect(cell("r3", "px")).not.toHaveAttribute("data-rule")
    expect(cell("r3", "px")).not.toHaveAttribute("aria-description")
    // The row rule marks the row, not the cell it read.
    const big = document.querySelector<HTMLElement>('[data-row-id="r9"]')!
    expect(big).toHaveAttribute("data-rule", "big")
    expect(big).toHaveAttribute("data-tone", "primary")
    expect(big).toHaveAttribute("aria-description", "Large")
    expect(big.className).toContain("text-foreground")
    expect(cell("r9", "qty")).not.toHaveAttribute("data-rule")
    expect(document.querySelector('[data-row-id="r2"]')).not.toHaveAttribute("data-rule")
    // The frozen cell keeps its opaque background and paints the row's tint over it, so the row's color has no gap; the other cells leave it to the row.
    expect(cell("r9", "sym").className).toContain("bg-background")
    expect(cell("r9", "sym").className).toContain("linear-gradient(color-mix(in_oklab,var(--primary)")
    expect(cell("r9", "qty").className).not.toContain("linear-gradient")
    expect(cell("r2", "sym").className).not.toContain("linear-gradient")
  })

  it("leaves the row rule's tint on a frozen cell whose own rule names a tone it cannot paint", () => {
    const store = createRowStore<Quote>({ getRowId: (r) => r.id })
    seed(10, store)
    const odd: GridRules = { columns: [{ id: "odd", column: "sym", when: { op: "notNull" }, tone: "warning" as never }, { id: "big", column: "qty", when: { op: "gte", value: "70" }, tone: "primary", target: "row" }] }
    render(<DataGrid store={store} columns={ruled} label="Quotes" rowHeight={ROW_HEIGHT} initialRect={RECT} rules={odd} />)
    expect(cell("r9", "sym")).toHaveAttribute("data-rule", "odd")
    expect(cell("r9", "sym").className).toContain("linear-gradient(color-mix(in_oklab,var(--primary)")
  })

  it("draws rules saved with objects where text belongs without throwing, with only text on the elements", () => {
    const store = createRowStore<Quote>({ getRowId: (r) => r.id })
    seed(10, store)
    const evil = { toString: 0 }
    const saved = { columns: [{ id: evil, column: "px", when: { op: "notNull" }, tone: evil }], filter: { column: "qty", op: "notNull" }, sort: [{ key: evil, dir: evil }] } as unknown as GridRules
    render(<DataGrid store={store} columns={ruled} label="Quotes" rowHeight={ROW_HEIGHT} initialRect={RECT} rules={saved} />)
    expect(cell("r9", "px")).toHaveAttribute("data-rule", '{"toString":0}')
    expect(cell("r9", "px")).toHaveAttribute("data-tone", '{"toString":0}')
    expect(cell("r9", "px").className).not.toContain("text-up")
    // A filter that is not a list holds nothing back.
    expect(document.querySelector('[data-row-id="r0"]')).not.toBeNull()
  })

  it("filters and orders by the rules, and a header sort comes first with the rules breaking its ties", () => {
    const store = createRowStore<Quote>({ getRowId: (r) => r.id })
    seed(10, store)
    const { rerender } = render(<DataGrid store={store} columns={ruled} label="Quotes" rowHeight={ROW_HEIGHT} initialRect={RECT} rules={rules} />)
    const grid = screen.getByRole("grid")
    // r0 and r7 have a null qty and are filtered out; the rest run by qty, largest first.
    expect(grid).toHaveAttribute("aria-rowcount", "9")
    expect(screen.getAllByRole("row").slice(1).map((row) => row.getAttribute("data-row-id"))).toEqual(["r9", "r8", "r6", "r5", "r4", "r3", "r2", "r1"])
    // A header sort by price ascending comes first; the rule's order would have reversed it.
    rerender(<DataGrid store={store} columns={ruled} label="Quotes" rowHeight={ROW_HEIGHT} initialRect={RECT} rules={rules} sort={{ key: "px", dir: "asc" }} />)
    expect(screen.getAllByRole("row").slice(1).map((row) => row.getAttribute("data-row-id"))).toEqual(["r1", "r2", "r3", "r4", "r5", "r6", "r8", "r9"])
    // Your own filter applies with the rules'.
    rerender(<DataGrid store={store} columns={ruled} label="Quotes" rowHeight={ROW_HEIGHT} initialRect={RECT} rules={rules} filter={(r) => r.px < 105} />)
    expect(grid).toHaveAttribute("aria-rowcount", "5")
  })

  it("ignores the rules' filter and sort on a view of yours, and still colors by them", () => {
    const store = createRowStore<Quote>({ getRowId: (r) => r.id })
    seed(10, store)
    const view = store.createView({ comparator: (a, b) => a.px - b.px })
    render(<DataGrid store={store} columns={ruled} label="Quotes" rowHeight={ROW_HEIGHT} initialRect={RECT} rules={rules} view={view} />)
    expect(screen.getByRole("grid")).toHaveAttribute("aria-rowcount", "11")
    expect(screen.getAllByRole("row")[1]).toHaveAttribute("data-row-id", "r0")
    expect(cell("r9", "px")).toHaveAttribute("data-rule", "rich")
    view.dispose()
  })

  it("puts a null last from the header whichever way the sort runs", () => {
    const store = createRowStore<Quote>({ getRowId: (r) => r.id })
    seed(10, store)
    render(<DataGrid store={store} columns={ruled} label="Quotes" rowHeight={ROW_HEIGHT} initialRect={RECT} sort={{ key: "qty", dir: "desc" }} />)
    const ids = screen.getAllByRole("row").slice(1).map((row) => row.getAttribute("data-row-id"))
    expect(ids.slice(0, 2)).toEqual(["r9", "r8"])
    expect(ids.slice(-2).sort()).toEqual(["r0", "r7"])
  })
})

describe("helpers", () => {
  it("compareForSort puts nulls last and sorts numbers numerically", () => {
    expect([3, null, 1, 20, undefined].sort(compareForSort)).toEqual([1, 3, 20, null, undefined])
    expect(["b", "a"].sort(compareForSort)).toEqual(["a", "b"])
  })
  it("resolveColumns orders, hides, sizes with minimums, and leads with frozen columns", () => {
    const r = resolveColumns(columns, { order: ["qty", "px", "sym"], widths: { px: 10 }, hidden: [] })
    expect(r.map((c) => c.key)).toEqual(["sym", "qty", "px"])
    expect(r.find((c) => c.key === "px")!.width).toBe(48)
    expect(resolveColumns(columns, { order: [], widths: {}, hidden: ["qty"] }).map((c) => c.key)).toEqual(["sym", "px"])
  })
  it("exportCsv quotes what needs quoting and formats through the column", () => {
    const store = createRowStore<Quote>({ getRowId: (r) => r.id })
    store.applyDeltas({ upsert: [{ id: "a", sym: 'A,"Q"', px: 1.5, qty: null }] })
    expect(exportCsv(store, columns, ["a", "missing"])).toBe('Symbol,Price,Qty\r\n"A,""Q""",1.50,\r\n')
  })
  it("presets are complete", () => {
    for (const p of Object.values(DATA_GRID_PRESETS)) expect(p.rowHeight).toBeGreaterThan(0)
  })
})

describe("under StrictMode", () => {
  it("keeps following the store after the mount rehearsal: rows that arrive later appear, in order", () => {
    const store = createRowStore<Quote>({ getRowId: (r) => r.id })
    seed(3, store)
    render(
      <StrictMode>
        <DataGrid store={store} columns={columns} label="Quotes" rowHeight={ROW_HEIGHT} initialRect={RECT} sort={{ key: "px", dir: "asc" }} />
      </StrictMode>,
    )
    expect(screen.getByRole("grid")).toHaveAttribute("aria-rowcount", "4")
    act(() => store.applyDeltas({ upsert: [{ id: "r9", sym: "S9", px: 50, qty: 1 }] }))
    expect(screen.getByRole("grid")).toHaveAttribute("aria-rowcount", "5")
    expect(screen.getAllByRole("row")[1]).toHaveAttribute("data-row-id", "r9")
  })
})

describe("footer totals and the tape", () => {
  it("totals the view's rows in a sticky row, in the column's figures, once per applied batch", () => {
    const store = createRowStore<Quote>({ getRowId: (r) => r.id })
    seed(10, store)
    const total = vi.fn((rows: Quote[]) => rows.reduce((s, r) => s + r.px, 0).toFixed(2))
    const footer = { px: total }
    render(<DataGrid store={store} columns={columns} label="Quotes" rowHeight={ROW_HEIGHT} initialRect={RECT} footer={footer} filter={(r) => r.px < 105} />)
    const grid = screen.getByRole("grid")
    // Five rows pass the filter, plus the header and the footer.
    expect(grid).toHaveAttribute("aria-rowcount", "7")
    const row = grid.querySelector("[data-grid-footer]")!
    expect(row).toHaveAttribute("role", "row")
    expect(row).toHaveAttribute("aria-rowindex", "7")
    const cell = row.querySelector("[data-col='px']")!
    expect(cell).toHaveTextContent("510.00")
    expect(cell).toHaveAttribute("data-numeric")
    expect(cell.className).toContain("justify-end")
    expect(row.querySelector("[data-col='sym']")).toHaveTextContent("")
    expect(total).toHaveBeenCalledTimes(1)
    // One batch touching three rows is one recompute, over the rows the view shows: r0 leaves the filter.
    act(() =>
      store.applyDeltas({
        patch: [
          { id: "r0", fields: { px: 200 } },
          { id: "r1", fields: { px: 101.5 } },
          { id: "r2", fields: { px: 102.5 } },
        ],
      }),
    )
    expect(total).toHaveBeenCalledTimes(2)
    expect(cell).toHaveTextContent("411.00")
    expect(grid).toHaveAttribute("aria-rowcount", "6")
  })

  it("a tape follows the tail and counts arrivals on a pill after a touch, and the pill returns to the tail", () => {
    const store = createRowStore<Quote>({ getRowId: (r) => r.id })
    seed(5, store)
    render(<DataGrid store={store} columns={columns} label="Tape" preset="tape" rowHeight={ROW_HEIGHT} initialRect={RECT} />)
    const grid = screen.getByRole("grid")
    expect(grid).toHaveAttribute("data-preset", "tape")
    expect(DATA_GRID_PRESETS.tape.rowEnter).toEqual({ highlight: true, pinViewport: false, followTail: true })
    // Rows arriving while following: no pill.
    act(() => store.applyDeltas({ upsert: [{ id: "r5", sym: "S0005", px: 105, qty: 50 }] }))
    expect(grid.querySelector("[data-grid-behind]")).toBeNull()
    // A pointer on a row stops the following; the arrivals from then on count.
    fireEvent.pointerDown(screen.getAllByRole("row")[1]!)
    act(() =>
      store.applyDeltas({
        upsert: [
          { id: "r6", sym: "S0006", px: 106, qty: 60 },
          { id: "r7", sym: "S0007", px: 107, qty: 70 },
        ],
      }),
    )
    const pill = grid.querySelector("[data-grid-behind]")!
    expect(pill).toHaveTextContent("2 new")
    expect(pill).toHaveAttribute("data-grid-behind", "2")
    fireEvent.click(pill)
    expect(grid.querySelector("[data-grid-behind]")).toBeNull()
    // A key stops it too.
    fireEvent.keyDown(grid, { key: "ArrowDown" })
    act(() => store.applyDeltas({ upsert: [{ id: "r8", sym: "S0008", px: 108, qty: 80 }] }))
    expect(grid.querySelector("[data-grid-behind]")).toHaveTextContent("1 new")
    // Another preset never shows it.
    const other = createRowStore<Quote>({ getRowId: (r) => r.id })
    seed(2, other)
    const { container } = render(<DataGrid store={other} columns={columns} label="Blotter" rowHeight={ROW_HEIGHT} initialRect={RECT} />)
    fireEvent.pointerDown(container.querySelector("[data-row-id='r0']")!)
    act(() => other.applyDeltas({ upsert: [{ id: "r9", sym: "S0009", px: 109, qty: 90 }] }))
    expect(container.querySelector("[data-grid-behind]")).toBeNull()
  })
})

describe("editing", () => {
  const price = (text: string) => {
    const n = Number(text.trim())
    return Number.isFinite(n) ? n : editProblem("Not a price.")
  }
  const editable: ColumnDef<Quote>[] = [
    { key: "sym", header: "Symbol", width: 80, frozen: "left", accessor: (r) => r.sym },
    { key: "px", header: "Price", width: 90, numeric: true, accessor: (r) => r.px, format: (v) => (v as number).toFixed(2), edit: { parse: price, validate: (v) => ((v as number) > 1000 ? editProblem("Above 1,000.") : null), step: (v, dir, big) => (v as number) + dir * (big ? 10 : 1) } },
    { key: "qty", header: "Qty", width: 70, numeric: true, accessor: (r) => r.qty, edit: { parse: (t) => (t.trim() === "" ? null : Number(t)), canEdit: (r) => r.id !== "r2" } },
  ]
  const setup = (onEdit?: (change: EditChange<Quote>) => void | Promise<unknown>, columns = editable) => {
    const store = createRowStore<Quote>({ getRowId: (r) => r.id })
    seed(5, store)
    const onActivate = vi.fn()
    const { rerender, unmount } = render(<DataGrid store={store} columns={columns} label="Sheet" preset="parameters" rowHeight={ROW_HEIGHT} initialRect={RECT} onEdit={onEdit} onRowActivate={onActivate} />)
    const grid = screen.getByRole("grid")
    const cell = (rowId: string, key: string) => document.querySelector<HTMLElement>(`[data-row-id="${rowId}"] [data-col="${key}"]`)!
    // Focus r1's price cell: down twice, right twice.
    fireEvent.keyDown(grid, { key: "ArrowDown" })
    fireEvent.keyDown(grid, { key: "ArrowDown" })
    fireEvent.keyDown(grid, { key: "ArrowRight" })
    fireEvent.keyDown(grid, { key: "ArrowRight" })
    return { store, grid, cell, onActivate, rerender, unmount }
  }
  const editor = () => screen.getByRole("textbox", { name: "Price" }) as HTMLInputElement

  it.each(["hidden", "removed", "all hidden", "hidden by definition", "no longer editable", "toggle"])("discards an uncommitted edit when its column is %s without reopening it on restore", disappearance => {
    const store = createRowStore<Quote>({ getRowId: row => row.id })
    seed(2, store)
    const onEdit = vi.fn()
    const layout = (missing: boolean) => {
      let definitions = editable
      if (missing && disappearance === "removed") definitions = editable.filter(column => column.key !== "px")
      if (missing && disappearance === "hidden by definition") definitions = editable.map(column => column.key === "px" ? { ...column, hidden: true } : column)
      if (missing && disappearance === "no longer editable") definitions = editable.map(column => column.key === "px" ? { ...column, edit: undefined } : column)
      if (missing && disappearance === "toggle") definitions = editable.map(column => column.key === "px" ? { ...column, edit: { parse: price, toggle: value => !value } } : column)
      const hidden = !missing ? [] : disappearance === "all hidden" ? editable.map(column => column.key) : disappearance === "hidden" ? ["px"] : []
      return <>
        <input aria-label="Outside" />
        <DataGrid store={store} columns={definitions} label="Sheet" initialRect={RECT} onEdit={onEdit} focusedRowId="r1" columnState={{ ...EMPTY_COLUMN_STATE, hidden }} />
      </>
    }
    const { rerender } = render(layout(false))
    const grid = screen.getByRole("grid")
    fireEvent.keyDown(grid, { key: "ArrowRight" })
    fireEvent.keyDown(grid, { key: "ArrowRight" })
    fireEvent.keyDown(grid, { key: "F2" })
    fireEvent.change(editor(), { target: { value: "105" } })
    expect(document.activeElement).toBe(editor())
    rerender(layout(true))
    expect(screen.queryByRole("textbox", { name: "Price" })).toBeNull()
    expect(onEdit).not.toHaveBeenCalled()
    const outside = screen.getByRole("textbox", { name: "Outside" })
    outside.focus()
    rerender(layout(false))
    expect(screen.queryByRole("textbox", { name: "Price" })).toBeNull()
    expect(document.activeElement).toBe(outside)
    expect(onEdit).not.toHaveBeenCalled()
    fireEvent.doubleClick(grid.querySelector('[data-row-id="r1"] [data-col="px"]')!)
    expect(editor()).toHaveValue("101.00")
  })

  it.each(["pending", "resolved", "rejected", "matched store"])("preserves a %s submitted edit through hidden columns", async result => {
    let resolve = () => {}
    let reject: (error: Error) => void = () => {}
    const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail })
    const onEdit = vi.fn(() => promise)
    const { store, grid, cell, rerender } = setup(onEdit)
    fireEvent.keyDown(grid, { key: "F2" })
    fireEvent.change(editor(), { target: { value: "108" } })
    fireEvent.keyDown(editor(), { key: "Enter" })
    expect(onEdit).toHaveBeenCalledTimes(1)
    const layout = (hidden: string[]) => <DataGrid store={store} columns={editable} label="Sheet" preset="parameters" rowHeight={ROW_HEIGHT} initialRect={RECT} onEdit={onEdit} columnState={{ ...EMPTY_COLUMN_STATE, hidden }} />
    rerender(layout(["px"]))
    if (result === "resolved") await act(async () => { resolve(); await promise })
    if (result === "rejected") await act(async () => { reject(new Error("Price refused")); await promise.catch(() => {}) })
    if (result === "matched store") act(() => store.applyDeltas({ patch: [{ id: "r1", fields: { px: 108 } }] }))
    rerender(layout([]))
    expect(screen.queryByRole("textbox", { name: "Price" })).toBeNull()
    if (result === "pending") {
      expect(cell("r1", "px")).toHaveAttribute("data-pending")
      expect(cell("r1", "px")).toHaveTextContent("108.00")
      await act(async () => { resolve(); await promise })
    } else if (result === "rejected") {
      expect(cell("r1", "px")).toHaveAttribute("data-rejected", "Price refused")
      expect(cell("r1", "px")).toHaveAttribute("aria-description", "Price refused")
    } else {
      expect(cell("r1", "px")).not.toHaveAttribute("data-pending")
      expect(cell("r1", "px")).toHaveTextContent(result === "matched store" ? "108.00" : "101.00")
    }
    expect(onEdit).toHaveBeenCalledTimes(1)
    if (result === "matched store") await act(async () => { resolve(); await promise })
  })

  it.each(["hidden", "removed", "disabled editing"])("recovers editor focus when %s is restored before cleanup settles", async disappearance => {
    const onEdit = vi.fn()
    const { store, grid, rerender } = setup(onEdit)
    fireEvent.keyDown(grid, { key: "F2" })
    fireEvent.change(editor(), { target: { value: "108" } })
    const layout = (missing: boolean) => <DataGrid store={store} columns={missing && disappearance === "removed" ? editable.filter(column => column.key !== "px") : editable} label="Sheet" initialRect={RECT} onEdit={missing && disappearance === "disabled editing" ? undefined : onEdit} columnState={{ ...EMPTY_COLUMN_STATE, hidden: missing && disappearance === "hidden" ? ["px"] : [] }} />
    rerender(layout(true))
    expect(screen.queryByRole("textbox", { name: "Price" })).toBeNull()
    rerender(layout(false))
    await act(async () => {})
    expect(grid).toHaveFocus()
    expect(screen.queryByRole("textbox", { name: "Price" })).toBeNull()
    expect(onEdit).not.toHaveBeenCalled()
    fireEvent.doubleClick(grid.querySelector('[data-row-id="r1"] [data-col="px"]')!)
    expect(editor()).toHaveValue("101.00")
  })

  it("keeps a surviving editor through other hidden columns, reordered widths, and unchanged controlled state", () => {
    const onEdit = vi.fn()
    const { store, grid, rerender } = setup(onEdit)
    fireEvent.keyDown(grid, { key: "F2" })
    const input = editor()
    fireEvent.change(input, { target: { value: "108" } })
    for (const state of [EMPTY_COLUMN_STATE, { ...EMPTY_COLUMN_STATE, hidden: ["qty"] }, { ...EMPTY_COLUMN_STATE, order: ["sym", "qty", "px"], widths: { px: 120 } }]) {
      rerender(<DataGrid store={store} columns={editable} label="Sheet" initialRect={RECT} onEdit={onEdit} columnState={state} />)
      expect(editor()).toBe(input)
      expect(input).toHaveFocus()
      expect(input).toHaveValue("108")
    }
    fireEvent.keyDown(input, { key: "Enter" })
    expect(onEdit).toHaveBeenCalledTimes(1)
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ key: "px", value: 108 }))
  })

  it("keeps a frozen cell in the focused column opaque, painting the column's tint as a background image", () => {
    const store = createRowStore<Quote>({ getRowId: row => row.id })
    seed(2, store)
    render(<DataGrid store={store} columns={editable} label="Sheet" initialRect={RECT} focusedRowId="r1" onEdit={vi.fn()} />)
    const grid = screen.getByRole("grid")
    fireEvent.keyDown(grid, { key: "ArrowRight" })
    const sym = grid.querySelector<HTMLElement>('[data-row-id="r0"] [data-col="sym"]')!
    expect(sym).toHaveAttribute("data-focused-col")
    expect(sym).toHaveClass("sticky", "bg-background")
    expect(sym.className).toContain("var(--muted)_50%")
    fireEvent.keyDown(grid, { key: "ArrowRight" })
    expect(grid.querySelector('[data-row-id="r0"] [data-col="px"]')).toHaveClass("bg-muted/50")
  })

  it("invalidates a custom-opened editor by its own column, independently of logical grid focus", () => {
    const store = createRowStore<Quote>({ getRowId: row => row.id })
    seed(2, store)
    const onEdit = vi.fn()
    const custom = editable.map<ColumnDef<Quote>>(column => column.key === "px" ? { ...column, cell: ({ edit }) => <button onClick={() => edit?.open()}>Open price</button> } : column)
    const layout = (hidden: string[]) => <DataGrid store={store} columns={custom} label="Sheet" initialRect={RECT} focusedRowId="r1" onEdit={onEdit} columnState={{ ...EMPTY_COLUMN_STATE, hidden }} />
    const { rerender } = render(layout([]))
    const grid = screen.getByRole("grid")
    fireEvent.keyDown(grid, { key: "ArrowRight" })
    fireEvent.click(grid.querySelector('[data-row-id="r0"] [data-col="px"] button')!)
    expect(editor()).toHaveValue("100.00")
    fireEvent.change(editor(), { target: { value: "108" } })
    rerender(layout(["px"]))
    rerender(layout([]))
    expect(screen.queryByRole("textbox", { name: "Price" })).toBeNull()
    expect(grid.querySelector('[data-row-id="r1"] [data-col="sym"]')).toHaveAttribute("data-focused-col")
    expect(onEdit).not.toHaveBeenCalled()
  })

  it.each(["grid", "outside", "unmounted", "unmounted alone", "replacement store", "disabled editing", "no longer editable", "toggle"])("recovers removed-editor focus with %s ownership", async destination => {
    const onEdit = vi.fn()
    const { store, grid, rerender, unmount } = setup(onEdit)
    fireEvent.keyDown(grid, { key: "F2" })
    fireEvent.change(editor(), { target: { value: "108" } })
    const replacement = createRowStore<Quote>({ getRowId: row => row.id })
    seed(2, replacement)
    rerender(<DataGrid store={destination === "replacement store" ? replacement : store} columns={destination === "no longer editable" ? editable.map(column => column.key === "px" ? { ...column, edit: undefined } : column) : destination === "toggle" ? editable.map(column => column.key === "px" ? { ...column, edit: { parse: price, toggle: value => !value } } : column) : editable.filter(column => column.key !== "px")} label="Sheet" initialRect={RECT} onEdit={destination === "disabled editing" ? undefined : onEdit} />)
    const outside = document.createElement("button")
    document.body.append(outside)
    try {
      if (destination === "unmounted" || destination === "unmounted alone") unmount()
      if (destination === "outside" || destination === "unmounted") outside.focus()
      await act(async () => {})
      expect(document.activeElement).toBe(destination === "unmounted alone" ? document.body : destination === "outside" || destination === "unmounted" ? outside : grid)
      expect(onEdit).not.toHaveBeenCalled()
    } finally {
      outside.remove()
    }
  })

  it.each(["hidden", "hidden by definition"])("ignores a delayed custom open while its column is %s", async disappearance => {
    const store = createRowStore<Quote>({ getRowId: row => row.id })
    seed(1, store)
    let handle: CellEditHandle | undefined
    const onEdit = vi.fn()
    const custom = editable.map<ColumnDef<Quote>>(column => column.key === "px" ? { ...column, cell: ({ edit, value }) => { handle = edit; return String(value) } } : column)
    const layout = (hidden: boolean) => <>
      <input aria-label="Outside" />
      <DataGrid store={store} columns={hidden && disappearance === "hidden by definition" ? custom.map(column => column.key === "px" ? { ...column, hidden: true } : column) : custom} columnState={{ ...EMPTY_COLUMN_STATE, hidden: hidden && disappearance === "hidden" ? ["px"] : [] }} label="Sheet" initialRect={RECT} onEdit={onEdit} />
    </>
    const { rerender } = render(layout(false))
    const retained = handle!
    let resume = () => {}
    const wait = new Promise<void>(resolve => { resume = resolve })
    const delayed = wait.then(() => retained.open())
    rerender(layout(true))
    await act(async () => { resume(); await delayed })
    const outside = screen.getByRole("textbox", { name: "Outside" })
    outside.focus()
    rerender(layout(false))
    expect(screen.queryByRole("textbox", { name: "Price" })).toBeNull()
    expect(outside).toHaveFocus()
    expect(onEdit).not.toHaveBeenCalled()
    act(() => retained.open())
    expect(editor()).toHaveFocus()
    fireEvent.change(editor(), { target: { value: "108" } })
    fireEvent.keyDown(editor(), { key: "Enter" })
    expect(onEdit).toHaveBeenCalledOnce()
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ key: "px", value: 108 }))
  })

  it("preserves another editor's draft when a delayed hidden-cell open completes", async () => {
    const store = createRowStore<Quote>({ getRowId: row => row.id })
    seed(1, store)
    let handle: CellEditHandle | undefined
    const onEdit = vi.fn()
    const custom = editable.map<ColumnDef<Quote>>(column => column.key === "px" ? { ...column, cell: ({ edit, value }) => { handle = edit; return String(value) } } : column)
    const layout = (hidden: boolean) => <DataGrid store={store} columns={custom} columnState={{ ...EMPTY_COLUMN_STATE, hidden: hidden ? ["px"] : [] }} focusedRowId="r0" label="Sheet" initialRect={RECT} onEdit={onEdit} />
    const { rerender } = render(layout(false))
    const retained = handle!
    let resume = () => {}
    const wait = new Promise<void>(resolve => { resume = resolve })
    const delayed = wait.then(() => retained.open())
    rerender(layout(true))
    const grid = screen.getByRole("grid")
    fireEvent.keyDown(grid, { key: "ArrowRight" })
    fireEvent.keyDown(grid, { key: "ArrowRight" })
    fireEvent.keyDown(grid, { key: "F2" })
    const quantity = screen.getByRole("textbox", { name: "Qty" })
    fireEvent.change(quantity, { target: { value: "222" } })
    await act(async () => { resume(); await delayed })
    expect(screen.getByRole("textbox", { name: "Qty" })).toBe(quantity)
    expect(quantity).toHaveValue("222")
    expect(quantity).toHaveFocus()
    rerender(layout(false))
    expect(screen.queryByRole("textbox", { name: "Price" })).toBeNull()
    expect(quantity).toHaveFocus()
    expect(onEdit).not.toHaveBeenCalled()
    fireEvent.keyDown(quantity, { key: "Enter" })
    expect(onEdit).toHaveBeenCalledOnce()
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ key: "qty", value: 222 }))
  })

  function OpenFromLayout({ edit, enabled, commit }: { edit: CellEditHandle | undefined; enabled: boolean; commit?: number }) {
    const opened = useRef(false)
    useLayoutEffect(() => {
      if (!enabled || opened.current || !edit) return
      opened.current = true
      if (commit === undefined) edit.open()
      else edit.commit(commit)
    }, [edit, enabled, commit])
    return <span>Value</span>
  }

  it.each(["initial", "restored", "strict"])("supports a custom cell opening in layout on %s mount", async mode => {
    const store = createRowStore<Quote>({ getRowId: row => row.id })
    seed(1, store)
    let enabled = mode !== "restored"
    const custom = editable.map<ColumnDef<Quote>>(column => column.key === "px" ? { ...column, cell: ({ edit }) => <OpenFromLayout edit={edit} enabled={enabled} /> } : column)
    const layout = (hidden: boolean) => {
      const grid = <DataGrid store={store} columns={custom} columnState={{ ...EMPTY_COLUMN_STATE, hidden: hidden ? ["px"] : [] }} label="Sheet" initialRect={RECT} onEdit={() => {}} />
      return mode === "strict" ? <StrictMode>{grid}</StrictMode> : grid
    }
    const { rerender } = render(layout(false))
    if (mode === "restored") {
      rerender(layout(true))
      enabled = true
      rerender(layout(false))
    }
    expect(editor()).toHaveFocus()
    fireEvent.change(editor(), { target: { value: "108" } })
    rerender(layout(true))
    rerender(layout(false))
    await act(async () => {})
    expect(editor()).toHaveValue("100.00")
    expect(editor()).toHaveFocus()
  })

  it.each(["removed", "hidden by definition", "not editable", "toggle"])("opens a restored custom editor from layout after its column was %s", disappearance => {
    const store = createRowStore<Quote>({ getRowId: row => row.id })
    seed(1, store)
    let enabled = false
    const custom = editable.map<ColumnDef<Quote>>(column => column.key === "px" ? { ...column, cell: ({ edit }) => <OpenFromLayout edit={edit} enabled={enabled} /> } : column)
    const layout = (missing: boolean) => {
      const definitions = !missing ? custom : disappearance === "removed" ? custom.filter(column => column.key !== "px") : custom.map(column => column.key !== "px" ? column : disappearance === "hidden by definition" ? { ...column, hidden: true } : disappearance === "not editable" ? { ...column, edit: undefined } : { ...column, edit: { parse: price, toggle: (value: unknown) => !value } })
      return <DataGrid store={store} columns={definitions} label="Sheet" initialRect={RECT} onEdit={() => {}} />
    }
    const { rerender } = render(layout(false))
    rerender(layout(true))
    enabled = true
    rerender(layout(false))
    expect(editor()).toHaveFocus()
    expect(editor()).toHaveValue("100.00")
  })

  it.each([true, false])("uses current edit permission %s for a custom layout open", allowed => {
    const store = createRowStore<Quote>({ getRowId: row => row.id })
    seed(1, store)
    let enabled = false
    const layout = (canEdit: boolean) => <DataGrid store={store} columns={editable.map<ColumnDef<Quote>>(column => column.key === "px" ? { ...column, edit: { parse: price, canEdit: () => canEdit }, cell: ({ edit }) => <OpenFromLayout edit={edit} enabled={enabled} /> } : column)} label="Sheet" initialRect={RECT} onEdit={() => {}} />
    const { rerender } = render(layout(!allowed))
    enabled = true
    rerender(layout(allowed))
    if (allowed) expect(editor()).toHaveFocus()
    else expect(screen.queryByRole("textbox", { name: "Price" })).toBeNull()
  })

  it("uses the current save callback for a custom layout commit", () => {
    const store = createRowStore<Quote>({ getRowId: row => row.id })
    seed(1, store)
    const before = vi.fn(), after = vi.fn()
    let enabled = false
    const custom = editable.map<ColumnDef<Quote>>(column => column.key === "px" ? { ...column, cell: ({ edit }) => <OpenFromLayout edit={edit} enabled={enabled} commit={108} /> } : column)
    const { rerender } = render(<DataGrid store={store} columns={custom} label="Sheet" initialRect={RECT} onEdit={before} />)
    enabled = true
    rerender(<DataGrid store={store} columns={[...custom]} label="Sheet" initialRect={RECT} onEdit={after} />)
    expect(before).not.toHaveBeenCalled()
    expect(after).toHaveBeenCalledOnce()
    expect(after).toHaveBeenCalledWith(expect.objectContaining({ key: "px", value: 108, previous: 100 }))
  })

  it("does not publish unavailable columns from a suspended and abandoned render", async () => {
    const store = createRowStore<Quote>({ getRowId: row => row.id })
    seed(1, store)
    let handle: CellEditHandle | undefined
    const custom = editable.map<ColumnDef<Quote>>(column => column.key === "px" ? { ...column, cell: ({ edit, value }) => { handle = edit; return String(value) } } : column)
    const blocker = new Promise<void>(() => {})
    function Wait({ blocked }: { blocked: boolean }) { if (blocked) throw blocker; return null }
    const layout = (hidden: boolean) => <Suspense fallback={<div>Loading</div>}><DataGrid store={store} columns={custom} columnState={{ ...EMPTY_COLUMN_STATE, hidden: hidden ? ["px"] : [] }} label="Sheet" initialRect={RECT} onEdit={() => {}} /><Wait blocked={hidden} /></Suspense>
    const { rerender } = render(layout(false))
    const retained = handle!
    await act(async () => { startTransition(() => rerender(layout(true))) })
    expect(screen.queryByText("Loading")).toBeNull()
    expect(screen.getByRole("grid")).toBeVisible()
    act(() => retained.open())
    expect(editor()).toHaveFocus()
    fireEvent.change(editor(), { target: { value: "108" } })
    rerender(layout(false))
    expect(editor()).toHaveValue("108")
  })

  it("opens on Enter with the text selected, commits on Enter as a change, shows the committed value as pending, and settles when the store agrees", () => {
    const onEdit = vi.fn()
    const { store, grid, cell } = setup(onEdit)
    expect(grid).toHaveAttribute("data-editable")
    expect(grid).toHaveAttribute("data-preset", "parameters")
    expect(cell("r1", "px")).toHaveAttribute("data-editable")
    expect(cell("r1", "px")).toHaveAttribute("aria-readonly", "false")
    expect(cell("r1", "sym")).not.toHaveAttribute("data-editable")
    fireEvent.keyDown(grid, { key: "Enter" })
    const input = editor()
    expect(cell("r1", "px")).toHaveAttribute("data-editing")
    expect(input.value).toBe("101.00")
    expect(input).toHaveAttribute("data-numeric")
    expect(document.activeElement).toBe(input)
    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe(6)
    fireEvent.change(input, { target: { value: "105.5" } })
    fireEvent.keyDown(input, { key: "Enter" })
    expect(onEdit).toHaveBeenCalledTimes(1)
    expect(onEdit).toHaveBeenCalledWith({ rowId: "r1", key: "px", value: 105.5, previous: 101, row: expect.objectContaining({ id: "r1" }) })
    // The editor is gone, the grid has the keyboard, the cell wears the committed value muted until the server agrees.
    expect(screen.queryByRole("textbox")).toBeNull()
    expect(document.activeElement).toBe(grid)
    expect(cell("r1", "px")).toHaveAttribute("data-pending")
    expect(cell("r1", "px")).toHaveTextContent("105.50")
    act(() => store.applyDeltas({ patch: [{ id: "r1", fields: { px: 105.5 } }] }))
    expect(cell("r1", "px")).not.toHaveAttribute("data-pending")
    expect(cell("r1", "px")).toHaveTextContent("105.50")
    // A patch to another value does not settle it.
    fireEvent.keyDown(grid, { key: "Enter" })
    fireEvent.change(editor(), { target: { value: "106" } })
    fireEvent.keyDown(editor(), { key: "Enter" })
    act(() => store.applyDeltas({ patch: [{ id: "r1", fields: { px: 107 } }] }))
    expect(cell("r1", "px")).toHaveAttribute("data-pending")
    expect(cell("r1", "px")).toHaveTextContent("106.00")
  })

  it("settles when the promise resolves, and a rejection keeps the previous value and prints the message in the cell", async () => {
    let settle: (v?: unknown) => void = () => {}
    let refuse: (e: unknown) => void = () => {}
    const onEdit = vi.fn(() => new Promise((resolve, reject) => ((settle = resolve), (refuse = reject))))
    const { grid, cell } = setup(onEdit)
    fireEvent.keyDown(grid, { key: "Enter" })
    fireEvent.change(editor(), { target: { value: "105.5" } })
    fireEvent.keyDown(editor(), { key: "Enter" })
    expect(cell("r1", "px")).toHaveAttribute("data-pending")
    await act(async () => {
      settle()
      await Promise.resolve()
    })
    expect(cell("r1", "px")).not.toHaveAttribute("data-pending")
    expect(cell("r1", "px")).toHaveTextContent("101.00")
    fireEvent.keyDown(grid, { key: "Enter" })
    fireEvent.change(editor(), { target: { value: "99" } })
    fireEvent.keyDown(editor(), { key: "Enter" })
    await act(async () => {
      refuse(new Error("Outside the desk's band"))
      await Promise.resolve()
    })
    const px = cell("r1", "px")
    expect(px).not.toHaveAttribute("data-pending")
    expect(px).toHaveAttribute("data-rejected", "Outside the desk's band")
    expect(px).toHaveAttribute("aria-description", "Outside the desk's band")
    expect(px.className).toContain("text-destructive")
    expect(px).toHaveTextContent("101.00Outside the desk's band")
    // The next edit of the cell clears the rejection.
    fireEvent.keyDown(grid, { key: "Enter" })
    expect(px).not.toHaveAttribute("data-rejected")
    fireEvent.keyDown(editor(), { key: "Escape" })
  })

  it("keeps the editor open with the problem said when the text does not parse or fails the check, and Escape reverts", () => {
    const onEdit = vi.fn()
    const { grid, cell } = setup(onEdit)
    fireEvent.keyDown(grid, { key: "Enter" })
    fireEvent.change(editor(), { target: { value: "abc" } })
    fireEvent.keyDown(editor(), { key: "Enter" })
    expect(editor()).toHaveAttribute("aria-invalid", "true")
    expect(editor()).toHaveAttribute("aria-description", "Not a price.")
    expect(onEdit).not.toHaveBeenCalled()
    fireEvent.change(editor(), { target: { value: "2000" } })
    expect(editor()).not.toHaveAttribute("aria-invalid")
    fireEvent.keyDown(editor(), { key: "Enter" })
    expect(editor()).toHaveAttribute("aria-description", "Above 1,000.")
    fireEvent.keyDown(editor(), { key: "Escape" })
    expect(screen.queryByRole("textbox")).toBeNull()
    expect(cell("r1", "px")).toHaveTextContent("101.00")
    expect(cell("r1", "px")).not.toHaveAttribute("data-pending")
    expect(onEdit).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(grid)
    // A blur with text that does not parse drops the edit; one that parses commits it.
    fireEvent.keyDown(grid, { key: "Enter" })
    fireEvent.change(editor(), { target: { value: "x" } })
    fireEvent.blur(editor())
    expect(onEdit).not.toHaveBeenCalled()
    fireEvent.keyDown(grid, { key: "Enter" })
    fireEvent.change(editor(), { target: { value: "102" } })
    fireEvent.blur(editor())
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ value: 102 }))
  })

  it("Tab commits and opens the next editable cell of the row, Shift+Tab the one before, and the row's end hands the keyboard back to the grid", () => {
    const onEdit = vi.fn()
    const { grid, cell } = setup(onEdit)
    fireEvent.keyDown(grid, { key: "Enter" })
    fireEvent.change(editor(), { target: { value: "103" } })
    fireEvent.keyDown(editor(), { key: "Tab" })
    expect(onEdit).toHaveBeenLastCalledWith(expect.objectContaining({ key: "px", value: 103 }))
    const qty = screen.getByRole("textbox", { name: "Qty" }) as HTMLInputElement
    expect(qty.value).toBe("10")
    expect(cell("r1", "qty")).toHaveAttribute("data-editing")
    fireEvent.keyDown(qty, { key: "Tab", shiftKey: true })
    // Nothing changed in qty, so nothing was sent; the price editor is open again.
    expect(onEdit).toHaveBeenCalledTimes(1)
    expect(editor().value).toBe("103.00")
    fireEvent.keyDown(editor(), { key: "Tab", shiftKey: true })
    // No editable column before the price: the keyboard is the grid's.
    expect(screen.queryByRole("textbox")).toBeNull()
    expect(document.activeElement).toBe(grid)
  })

  it("steps with the bare arrows when the column steps, ten with Shift, and leaves a modifier-held arrow to the listeners above", () => {
    const { grid } = setup(vi.fn())
    fireEvent.keyDown(grid, { key: "Enter" })
    fireEvent.keyDown(editor(), { key: "ArrowUp" })
    expect(editor().value).toBe("102.00")
    fireEvent.keyDown(editor(), { key: "ArrowDown", shiftKey: true })
    expect(editor().value).toBe("92.00")
    const held = fireEvent.keyDown(editor(), { key: "ArrowUp", metaKey: true })
    expect(held, "not prevented: the registry above may take it").toBe(true)
    expect(editor().value).toBe("92.00")
    // The grid's own arrows do not move focus while the editor is open.
    expect(grid.getAttribute("aria-activedescendant")).toContain("r1")
  })

  it("opens by typing, with the character typed, by F2, and by a double click on the cell; a cell that cannot be edited leaves Enter to the row", () => {
    const onEdit = vi.fn()
    const { grid, cell, onActivate } = setup(onEdit)
    fireEvent.keyDown(grid, { key: "9" })
    expect(editor().value).toBe("9")
    expect(editor().selectionStart).toBe(1)
    fireEvent.keyDown(editor(), { key: "Escape" })
    fireEvent.keyDown(grid, { key: "F2" })
    expect(editor().value).toBe("101.00")
    fireEvent.keyDown(editor(), { key: "Escape" })
    fireEvent.doubleClick(cell("r3", "px").firstElementChild!)
    expect(editor().value).toBe("103.00")
    expect(grid.getAttribute("aria-activedescendant")).toContain("r3")
    fireEvent.keyDown(editor(), { key: "Escape" })
    expect(onActivate).not.toHaveBeenCalled()
    // r2's quantity is read-only by canEdit: Enter activates the row, a double click too, and the cell says so.
    fireEvent.keyDown(grid, { key: "ArrowUp" })
    fireEvent.keyDown(grid, { key: "ArrowRight" })
    expect(cell("r2", "qty")).toHaveAttribute("aria-readonly", "true")
    expect(cell("r2", "qty")).not.toHaveAttribute("data-editable")
    fireEvent.keyDown(grid, { key: "Enter" })
    expect(screen.queryByRole("textbox")).toBeNull()
    expect(onActivate).toHaveBeenCalledWith(expect.objectContaining({ id: "r2" }), "r2")
    fireEvent.doubleClick(cell("r2", "qty").firstElementChild!)
    expect(onActivate).toHaveBeenCalledTimes(2)
    // A column with no edit: Enter activates as it always did.
    fireEvent.keyDown(grid, { key: "ArrowLeft" })
    fireEvent.keyDown(grid, { key: "ArrowLeft" })
    fireEvent.keyDown(grid, { key: "Enter" })
    expect(onActivate).toHaveBeenCalledTimes(3)
    expect(onEdit).not.toHaveBeenCalled()
  })

  it("a toggle column commits the toggled value from Enter or Space and never opens an editor, and a cell renderer commits through its handle", () => {
    const onEdit = vi.fn()
    const seen: (EditStatus | undefined)[] = []
    const columns: ColumnDef<Quote>[] = [
      { key: "sym", header: "Symbol", width: 80, accessor: (r) => r.sym },
      {
        key: "on",
        header: "On",
        width: 40,
        accessor: (r) => r.qty !== null,
        edit: { parse: (t) => t === "on", toggle: (v) => !v },
        cell: ({ value, edit }) => {
          seen.push(edit?.status)
          return (
            <button type="button" data-on={String(value)} onClick={() => edit?.commit(!value)}>
              {value ? "on" : "off"}
            </button>
          )
        },
      },
      { key: "px", header: "Price", width: 90, numeric: true, accessor: (r) => r.px, edit: { parse: price } },
    ]
    const { grid, cell } = setup(onEdit, columns)
    // Focus sits on r1's second column, the toggle.
    fireEvent.keyDown(grid, { key: "Enter" })
    expect(screen.queryByRole("textbox")).toBeNull()
    expect(onEdit).toHaveBeenLastCalledWith(expect.objectContaining({ rowId: "r1", key: "on", value: false, previous: true }))
    expect(cell("r1", "on")).toHaveAttribute("data-pending")
    expect(seen.at(-1)).toMatchObject({ kind: "pending", value: false })
    fireEvent.keyDown(grid, { key: "ArrowDown" })
    fireEvent.keyDown(grid, { key: " " })
    expect(onEdit).toHaveBeenLastCalledWith(expect.objectContaining({ rowId: "r2", key: "on", value: false }))
    fireEvent.keyDown(grid, { key: "9" })
    expect(screen.queryByRole("textbox")).toBeNull()
    fireEvent.click(cell("r3", "on").querySelector("button")!)
    expect(onEdit).toHaveBeenLastCalledWith(expect.objectContaining({ rowId: "r3", key: "on", value: false }))
    expect(onEdit).toHaveBeenCalledTimes(3)
  })

  it("tells validate how each commit came and which opening of the editor it belongs to", () => {
    const validate = vi.fn<(value: unknown, row: Quote, commit?: EditCommit) => null>(() => null)
    const columns: ColumnDef<Quote>[] = [
      ...editable.map((column) => (column.key === "px" ? { ...column, edit: { parse: price, validate } } : column)),
      { key: "on", header: "On", width: 40, accessor: (r) => r.qty !== null, edit: { parse: (t) => t === "on", toggle: (v) => !v, validate } },
    ]
    const { grid } = setup(vi.fn(), columns)
    const commit = () => validate.mock.lastCall?.[2]
    fireEvent.keyDown(grid, { key: "F2" })
    fireEvent.change(editor(), { target: { value: "5" } })
    fireEvent.keyDown(editor(), { key: "Enter" })
    const enter = commit()
    expect(enter).toMatchObject({ via: "enter", repeat: false })
    fireEvent.keyDown(grid, { key: "F2" })
    fireEvent.change(editor(), { target: { value: "6" } })
    fireEvent.keyDown(editor(), { key: "Enter", repeat: true })
    const held = commit()
    expect(held).toMatchObject({ via: "enter", repeat: true })
    fireEvent.keyDown(grid, { key: "F2" })
    fireEvent.change(editor(), { target: { value: "7" } })
    fireEvent.keyDown(editor(), { key: "Tab" })
    const tab = commit()
    expect(tab).toMatchObject({ via: "tab", repeat: false })
    // Tab opened the quantity; leave it and come back to the price.
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Qty" }), { key: "Escape" })
    fireEvent.keyDown(grid, { key: "ArrowLeft" })
    fireEvent.keyDown(grid, { key: "F2" })
    fireEvent.change(editor(), { target: { value: "8" } })
    fireEvent.blur(editor())
    const blur = commit()
    expect(blur).toMatchObject({ via: "blur", repeat: false })
    // Each opening is its own session; a toggle commits a value, outside any opening.
    const sessions = [enter, held, tab, blur].map((c) => c!.session)
    expect(new Set(sessions).size).toBe(4)
    expect(sessions.every((s) => s > 0)).toBe(true)
    fireEvent.keyDown(grid, { key: "ArrowRight" })
    fireEvent.keyDown(grid, { key: "ArrowRight" })
    fireEvent.keyDown(grid, { key: " " })
    expect(commit()).toEqual({ via: "value", repeat: false, session: 0 })
    // A held Space or Enter on a toggle commits once: its repeats send nothing, as a native checkbox's do, so a held key
    // can't flip the value the server just acknowledged back again.
    const calls = validate.mock.calls.length
    fireEvent.keyDown(grid, { key: " ", repeat: true })
    fireEvent.keyDown(grid, { key: "Enter", repeat: true })
    expect(validate.mock.calls.length).toBe(calls)
  })

  it("passes a held key's repeat from a cell control's commit to validate", () => {
    const validate = vi.fn<(value: unknown, row: Quote, commit?: EditCommit) => null>(() => null)
    const columns: ColumnDef<Quote>[] = [
      { key: "sym", header: "Symbol", width: 80, accessor: (r) => r.sym },
      { key: "px", header: "Price", width: 90, accessor: (r) => r.px, edit: { parse: price, validate }, cell: ({ edit }) => <button type="button" onKeyDown={(e) => edit?.commit(1, { repeat: e.repeat })}>Bump</button> },
    ]
    setup(vi.fn(), columns)
    const bump = screen.getAllByRole("button", { name: "Bump" })[0]!
    fireEvent.keyDown(bump, { key: "Enter" })
    expect(validate).toHaveBeenLastCalledWith(1, expect.anything(), { via: "value", repeat: false, session: 0 })
    fireEvent.keyDown(bump, { key: "Enter", repeat: true })
    expect(validate).toHaveBeenLastCalledWith(1, expect.anything(), { via: "value", repeat: true, session: 0 })
  })

  it("numbers editor openings across every grid, so two grids never share an opening", () => {
    const sessions: number[] = []
    const validate = vi.fn<(value: unknown, row: Quote, commit?: EditCommit) => null>((_, __, commit) => {
      sessions.push(commit!.session)
      return null
    })
    const columns = editable.map((column) => (column.key === "px" ? { ...column, edit: { parse: price, validate } } : column))
    for (const label of ["First", "Second"]) {
      const store = createRowStore<Quote>({ getRowId: (r) => r.id })
      seed(2, store)
      const { unmount } = render(<DataGrid store={store} columns={columns} label={label} preset="parameters" rowHeight={ROW_HEIGHT} initialRect={RECT} onEdit={vi.fn()} />)
      const grid = screen.getByRole("grid", { name: label })
      fireEvent.keyDown(grid, { key: "ArrowDown" })
      fireEvent.keyDown(grid, { key: "ArrowRight" })
      fireEvent.keyDown(grid, { key: "ArrowRight" })
      fireEvent.keyDown(grid, { key: "F2" })
      fireEvent.change(screen.getByRole("textbox", { name: "Price" }), { target: { value: "5" } })
      fireEvent.keyDown(screen.getByRole("textbox", { name: "Price" }), { key: "Enter" })
      unmount()
    }
    expect(sessions).toHaveLength(2)
    expect(sessions[1]).not.toBe(sessions[0])
  })

  it("opens nothing without onEdit", () => {
    const { grid, cell } = setup(undefined)
    expect(grid).not.toHaveAttribute("data-editable")
    expect(cell("r1", "px")).not.toHaveAttribute("data-editable")
    fireEvent.keyDown(grid, { key: "Enter" })
    fireEvent.keyDown(grid, { key: "9" })
    expect(screen.queryByRole("textbox")).toBeNull()
  })
})

it("leaves portaled controls' keys out of grid navigation and activation", () => {
  const store = createRowStore<Quote>({ getRowId: row => row.id })
  seed(2, store)
  const onActivate = vi.fn()
  const onFocus = vi.fn()
  const portalKeys = vi.fn()
  const portalColumns: ColumnDef<Quote>[] = [...columns, {
    key: "action", header: "Action", width: 80, accessor: () => null,
    cell: ({ row }) => row.id === "r0" ? createPortal(<button onKeyDown={portalKeys}>Portaled action</button>, document.body) : null,
  }]
  render(<DataGrid store={store} columns={portalColumns} label="Quotes" initialRect={RECT} focusedRowId="r0" onFocusedRowChange={onFocus} onRowActivate={onActivate} />)
  const button = screen.getByRole("button", { name: "Portaled action" })
  fireEvent.keyDown(button, { key: "ArrowDown" })
  fireEvent.keyDown(button, { key: "Enter" })
  expect(portalKeys).toHaveBeenCalledTimes(2)
  expect(onFocus).not.toHaveBeenCalled()
  expect(onActivate).not.toHaveBeenCalled()
  fireEvent.keyDown(screen.getByRole("grid"), { key: "ArrowDown" })
  expect(onFocus).toHaveBeenCalledWith("r1")
})
