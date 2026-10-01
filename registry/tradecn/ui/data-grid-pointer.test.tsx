import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { type ReactNode } from "react"
import { createPortal } from "react-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import { DataGrid, type ColumnDef } from "@/registry/tradecn/ui/data-grid"

interface Quote { id: string; px: number }
const rect = { width: 600, height: 200 }
const columns: ColumnDef<Quote>[] = [{ key: "px", header: "Price", width: 300, accessor: row => row.px }]
const pointer = { pointerId: 1, pointerType: "mouse", isPrimary: true, button: 0, buttons: 1 }

function setup(ids = ["a", "b", "c"]) {
  const store = createRowStore<Quote>({ getRowId: row => row.id })
  store.applyDeltas({ upsert: ids.map((id, px) => ({ id, px })) })
  return { store, columns, label: "Quotes", initialRect: rect, onSelectionChange: vi.fn(), onFocusedRowChange: vi.fn(), onRowActivate: vi.fn() }
}

function cell(grid: HTMLElement, id: string) {
  return grid.querySelector<HTMLElement>(`[data-row-id="${id}"] [data-col="px"]`)!
}

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "animate").mockImplementation(() => ({ cancel() {}, currentTime: 0, onfinish: null }) as unknown as Animation)
  for (const [property, size] of [["offsetWidth", rect.width], ["offsetHeight", rect.height]] as const) {
    vi.spyOn(HTMLElement.prototype, property, "get").mockImplementation(function (this: HTMLElement) {
      return this.classList.contains("overflow-auto") ? size : 0
    })
  }
})
afterEach(() => vi.restoreAllMocks())

describe("DataGrid pointer ownership", () => {
  it("keeps plain-row range, toggle, secondary focus and activation behavior", () => {
    const props = setup()
    render(<DataGrid {...props} />)
    const grid = screen.getByRole("grid")
    fireEvent.pointerDown(cell(grid, "a"), pointer)
    expect(props.onSelectionChange).toHaveBeenLastCalledWith(new Set(["a"]))
    fireEvent.pointerDown(cell(grid, "c"), { ...pointer, shiftKey: true })
    expect(props.onSelectionChange).toHaveBeenLastCalledWith(new Set(["a", "b", "c"]))
    fireEvent.pointerDown(cell(grid, "b"), { ...pointer, ctrlKey: true })
    expect(props.onSelectionChange).toHaveBeenLastCalledWith(new Set(["a", "c"]))
    fireEvent.pointerDown(cell(grid, "a"), { ...pointer, metaKey: true })
    expect(props.onSelectionChange).toHaveBeenLastCalledWith(new Set(["c"]))
    props.onSelectionChange.mockClear()
    fireEvent.pointerDown(cell(grid, "b"), { ...pointer, button: 2, buttons: 2 })
    expect(props.onFocusedRowChange).toHaveBeenLastCalledWith("b")
    expect(props.onSelectionChange).not.toHaveBeenCalled()
    fireEvent.doubleClick(cell(grid, "b"))
    expect(props.onRowActivate).toHaveBeenCalledExactlyOnceWith(props.store.getRow("b"), "b")
  })

  it.each([
    ["button", <button type="button">Inspect</button>],
    ["button icon", <button type="button" aria-label="Inspect"><svg><path data-testid="target" /></svg></button>],
    ["link", <a href="#quote">Inspect</a>],
    ["input", <input aria-label="Note" />],
    ["textarea", <textarea aria-label="Note" />],
    ["select", <select aria-label="Route"><option>Primary</option></select>],
    ["editable", <span contentEditable suppressContentEditableWarning>Note</span>],
    ["focusable", <span tabIndex={0}>Custom</span>],
    ["programmatic focus", <span tabIndex={-1}>Custom</span>],
    ["ARIA control", <span role="button">Custom</span>],
    ["ARIA composite", <span role="toolbar" aria-label="Quote actions"><span data-testid="target">Actions</span><button type="button">Inspect</button></span>],
    ["label", <label>Accept<input type="checkbox" /></label>],
  ] satisfies [string, ReactNode][])("leaves the %s and its double-click to the consumer", (name, control) => {
    const props = setup(["a"])
    const click = vi.fn(), doubleClick = vi.fn(), bubble = vi.fn()
    render(<div onPointerDown={bubble}><DataGrid {...props} columns={[{ ...columns[0]!, cell: () => <span onClick={click} onDoubleClick={doubleClick}>{control}</span> }]} /></div>)
    const target = screen.queryByTestId("target") ?? cell(screen.getByRole("grid"), "a").firstElementChild!.firstElementChild!.firstElementChild!
    expect(fireEvent.pointerDown(target, pointer)).toBe(true)
    fireEvent.click(target)
    expect(fireEvent.doubleClick(target)).toBe(true)
    expect(click).toHaveBeenCalledTimes(name === "label" ? 2 : 1)
    expect(doubleClick).toHaveBeenCalledTimes(1)
    expect(bubble).toHaveBeenCalledTimes(1)
    expect(props.onSelectionChange).not.toHaveBeenCalled()
    expect(props.onFocusedRowChange).not.toHaveBeenCalled()
    expect(props.onRowActivate).not.toHaveBeenCalled()
  })

  it.each(["prevent", "stop"])("honors a cell handler that chooses to %s pointer and double-click propagation", method => {
    const props = setup(["a"])
    const handle = (event: { preventDefault(): void; stopPropagation(): void }) => method === "prevent" ? event.preventDefault() : event.stopPropagation()
    render(<DataGrid {...props} columns={[{ ...columns[0]!, cell: () => <span onPointerDown={handle} onDoubleClick={handle}>Claimed</span> }]} />)
    fireEvent.pointerDown(screen.getByText("Claimed"), pointer)
    fireEvent.doubleClick(screen.getByText("Claimed"))
    expect(props.onSelectionChange).not.toHaveBeenCalled()
    expect(props.onFocusedRowChange).not.toHaveBeenCalled()
    expect(props.onRowActivate).not.toHaveBeenCalled()
  })

  it("honors cancellation from an application capture handler", () => {
    const props = setup(["a"])
    render(<div onPointerDownCapture={event => event.preventDefault()} onDoubleClickCapture={event => event.preventDefault()}><DataGrid {...props} /></div>)
    const target = cell(screen.getByRole("grid"), "a")
    fireEvent.pointerDown(target, pointer)
    fireEvent.doubleClick(target)
    expect(props.onSelectionChange).not.toHaveBeenCalled()
    expect(props.onFocusedRowChange).not.toHaveBeenCalled()
    expect(props.onRowActivate).not.toHaveBeenCalled()
  })

  it.each(["nested", "portaled"])("keeps a %s grid's row actions within that grid even with overlapping row ids", placement => {
    const outer = setup(["a", "b"]), inner = setup(["b"])
    const content = <DataGrid {...inner} label="Detail" />
    const portal = document.createElement("div")
    document.body.append(portal)
    try {
      render(<DataGrid {...outer} columns={[{ ...columns[0]!, cell: ({ rowId }) => rowId === "a" ? placement === "nested" ? content : createPortal(content, portal) : rowId }]} />)
      const target = cell(screen.getByRole("grid", { name: "Detail" }), "b")
      fireEvent.pointerDown(target, pointer)
      fireEvent.doubleClick(target)
      expect(inner.onSelectionChange).toHaveBeenCalledExactlyOnceWith(new Set(["b"]))
      expect(inner.onRowActivate).toHaveBeenCalledExactlyOnceWith(inner.store.getRow("b"), "b")
      expect(outer.onSelectionChange).not.toHaveBeenCalled()
      expect(outer.onFocusedRowChange).not.toHaveBeenCalled()
      expect(outer.onRowActivate).not.toHaveBeenCalled()
    } finally {
      portal.remove()
    }
  })

  it("preserves a text editor's draft on double-click without reopening it", () => {
    const props = setup(["a"])
    render(<DataGrid {...props} columns={[{ ...columns[0]!, edit: { parse: text => Number(text) } }]} onEdit={vi.fn()} />)
    fireEvent.doubleClick(cell(screen.getByRole("grid"), "a"))
    const input = screen.getByRole("textbox", { name: "Price" })
    fireEvent.change(input, { target: { value: "123" } })
    props.onFocusedRowChange.mockClear()
    fireEvent.pointerDown(input, pointer)
    fireEvent.doubleClick(input)
    expect(input).toHaveValue("123")
    expect(props.onFocusedRowChange).not.toHaveBeenCalled()
    expect(props.onSelectionChange).not.toHaveBeenCalled()
    expect(props.onRowActivate).not.toHaveBeenCalled()
  })

  it("lets the selection checkbox toggle once without activating its row", () => {
    const props = setup(["a"])
    render(<DataGrid {...props} selectionColumn />)
    const checkbox = screen.getByRole("checkbox", { name: "Select row" })
    fireEvent.pointerDown(checkbox, pointer)
    fireEvent.click(checkbox)
    expect(props.onSelectionChange).toHaveBeenCalledExactlyOnceWith(new Set(["a"]))
    fireEvent.doubleClick(checkbox)
    expect(props.onRowActivate).not.toHaveBeenCalled()
    expect(props.onFocusedRowChange).not.toHaveBeenCalled()
  })

  it("accepts the empty string as a row identity", () => {
    const props = setup([""])
    render(<DataGrid {...props} renderContextMenu={(_rows, ids) => <span>Targets: {JSON.stringify(ids)}</span>} />)
    const target = cell(screen.getByRole("grid"), "")
    fireEvent.pointerDown(target, pointer)
    expect(props.onSelectionChange).toHaveBeenCalledExactlyOnceWith(new Set([""]))
    fireEvent.contextMenu(target)
    expect(props.onFocusedRowChange).toHaveBeenLastCalledWith("")
  })

  it.each(["input", "handled text", "nested grid", "portaled text", "header control"])("keeps the %s context menu out of the enclosing row menu", targetKind => {
    const props = setup(["a"]), inner = setup(["a"])
    const childMenu = vi.fn(), parentCapture = vi.fn(), parentBubble = vi.fn()
    const portal = document.createElement("div")
    document.body.append(portal)
    const content = targetKind === "nested grid" ? <DataGrid {...inner} label="Detail" />
      : targetKind === "portaled text" ? createPortal(<span data-testid="menu-target" onContextMenu={childMenu}>Portaled</span>, portal)
        : targetKind === "handled text" ? <span data-testid="menu-target" onContextMenu={event => { childMenu(); event.preventDefault() }}>Handled</span>
          : <input data-testid="menu-target" aria-label="Note" onContextMenu={childMenu} />
    try {
      render(<div onContextMenuCapture={parentCapture} onContextMenu={parentBubble}><DataGrid {...props} columns={[{ ...columns[0]!, cell: () => content }]} renderContextMenu={() => <span>Outer action</span>} /></div>)
      const target = targetKind === "nested grid" ? cell(screen.getByRole("grid", { name: "Detail" }), "a")
        : targetKind === "header control" ? screen.getByRole("button", { name: "Price column menu" })
          : screen.getByTestId("menu-target")
      expect(fireEvent.contextMenu(target)).toBe(targetKind !== "handled text")
      expect(parentCapture).toHaveBeenCalledTimes(1)
      expect(parentBubble).not.toHaveBeenCalled()
      if (targetKind !== "nested grid" && targetKind !== "header control") expect(childMenu).toHaveBeenCalledTimes(1)
      expect(screen.queryByText("Outer action")).toBeNull()
      expect(props.onSelectionChange).not.toHaveBeenCalled()
      expect(props.onFocusedRowChange).not.toHaveBeenCalled()
    } finally {
      portal.remove()
    }
  })

  it("targets the owned row when opening a keyboard menu beside a nested duplicate id", () => {
    const outer = setup(["a", "b"]), inner = setup(["b"])
    render(<DataGrid {...outer} focusedRowId="b" columns={[{ ...columns[0]!, cell: ({ rowId }) => rowId === "a" ? <DataGrid {...inner} label="Detail" renderContextMenu={() => <span>Inner action</span>} /> : rowId }]} renderContextMenu={(_rows, ids) => <span>Outer: {ids.join(",")}</span>} />)
    fireEvent.keyDown(screen.getByRole("grid", { name: "Quotes" }), { key: "F10", shiftKey: true })
    expect(screen.getByText("Outer: b")).toBeInTheDocument()
    expect(screen.queryByText("Inner action")).toBeNull()
  })

  it("lets a second touch cancel the menu's pending long press", () => {
    vi.useFakeTimers()
    const props = setup(["a"])
    try {
      render(<DataGrid {...props} columns={[columns[0]!, { key: "note", header: "Note", width: 100, accessor: () => "", cell: () => <input aria-label="Note" /> }]} renderContextMenu={() => <span>Long press action</span>} />)
      const first = { identifier: 1, clientX: 20, clientY: 20 }
      const second = { identifier: 2, clientX: 100, clientY: 20 }
      fireEvent.touchStart(cell(screen.getByRole("grid"), "a"), { touches: [first], changedTouches: [first] })
      act(() => vi.advanceTimersByTime(100))
      fireEvent.touchStart(screen.getByRole("textbox", { name: "Note" }), { touches: [first, second], changedTouches: [second] })
      act(() => vi.advanceTimersByTime(1000))
      expect(screen.queryByText("Long press action")).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it.each(["nested", "portaled"])("isolates a %s grid's reorder hold and tail pause", placement => {
    const outer = setup(["a", "b"]), inner = setup(["b"])
    const outerView = outer.store.createView(), innerView = inner.store.createView()
    const outerTouch = vi.spyOn(outerView, "touch"), innerTouch = vi.spyOn(innerView, "touch")
    const portal = document.createElement("div")
    document.body.append(portal)
    try {
      const detail = <DataGrid {...inner} view={innerView} label="Detail" />
      render(<DataGrid {...outer} view={outerView} preset="tape" columns={[{ ...columns[0]!, cell: ({ rowId }) => rowId === "a" ? placement === "nested" ? detail : createPortal(detail, portal) : rowId }]} />)
      const innerGrid = screen.getByRole("grid", { name: "Detail" })
      fireEvent.pointerDown(cell(innerGrid, "b"), pointer)
      fireEvent.keyDown(innerGrid, { key: "Home" })
      expect(innerTouch).toHaveBeenCalledTimes(2)
      expect(outerTouch).not.toHaveBeenCalled()
      act(() => outer.store.applyDeltas({ upsert: [{ id: "c", px: 3 }] }))
      expect(screen.getByRole("grid", { name: "Quotes" }).querySelector("[data-grid-behind]")).toBeNull()
    } finally {
      outerView.dispose()
      innerView.dispose()
      portal.remove()
    }
  })

  it.each(["control", "prevented", "stopped"])("retains the reorder hold and tail pause for a contained %s press", kind => {
    vi.useFakeTimers()
    const props = setup(["a", "b"])
    const view = props.store.createView({ comparator: (a, b) => b.px - a.px, reorderHoldMs: 1000 })
    try {
      render(<DataGrid {...props} view={view} preset="tape" columns={[{ ...columns[0]!, cell: ({ rowId }) => <button onPointerDown={event => { if (kind === "prevented") event.preventDefault(); if (kind === "stopped") event.stopPropagation() }}>Inspect {rowId}</button> }]} />)
      fireEvent.pointerDown(screen.getByRole("button", { name: "Inspect a" }), pointer)
      act(() => props.store.applyDeltas({ patch: [{ id: "a", fields: { px: 9 } }], upsert: [{ id: "c", px: 3 }] }))
      expect(view.getIds()).toEqual(["b", "a", "c"])
      expect(screen.getByRole("grid").querySelector("[data-grid-behind]")).toHaveTextContent("1 new")
      expect(props.onSelectionChange).not.toHaveBeenCalled()
      act(() => vi.advanceTimersByTime(1000))
      expect(view.getIds()).toEqual(["a", "c", "b"])
    } finally {
      view.dispose()
      vi.useRealTimers()
    }
  })

  it.each(["removed", "filtered"])("ignores a row that was %s during application capture", disappearance => {
    const props = setup(["a", "b"])
    const view = props.store.createView({ filter: row => row.px > 0 })
    try {
      render(<div onPointerDownCapture={() => props.store.applyDeltas(disappearance === "removed" ? { remove: ["b"] } : { patch: [{ id: "b", fields: { px: 0 } }] })}><DataGrid {...props} view={view} /></div>)
      fireEvent.pointerDown(cell(screen.getByRole("grid"), "b"), pointer)
      expect(view.getIds()).toEqual([])
      expect(props.onSelectionChange).not.toHaveBeenCalled()
      expect(props.onFocusedRowChange).not.toHaveBeenCalled()
    } finally {
      view.dispose()
    }
  })

  it.each(["single", "none"] as const)("keeps ordinary %s selection behavior", selectionMode => {
    const props = setup()
    render(<DataGrid {...props} selectionMode={selectionMode} />)
    const grid = screen.getByRole("grid")
    fireEvent.pointerDown(cell(grid, "a"), pointer)
    fireEvent.pointerDown(cell(grid, "c"), { ...pointer, shiftKey: true })
    expect(props.onFocusedRowChange).toHaveBeenLastCalledWith("c")
    if (selectionMode === "single") expect(props.onSelectionChange).toHaveBeenLastCalledWith(new Set(["c"]))
    else expect(props.onSelectionChange).not.toHaveBeenCalled()
  })

  it("keeps a selected row's menu targets and honors controlled selection refusal", () => {
    const props = setup()
    const selection = new Set(["a", "c"])
    const menu = vi.fn((_rows: Quote[], ids: string[]) => <span>Targets: {ids.join(",")}</span>)
    const { rerender } = render(<DataGrid {...props} selection={selection} renderContextMenu={menu} />)
    const grid = screen.getByRole("grid")
    fireEvent.pointerDown(cell(grid, "c"), { ...pointer, button: 2, buttons: 2 })
    fireEvent.contextMenu(cell(grid, "c"))
    expect(menu).toHaveBeenLastCalledWith([props.store.getRow("a"), props.store.getRow("c")], ["a", "c"])
    expect(props.onSelectionChange).not.toHaveBeenCalled()
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" })
    fireEvent.pointerDown(cell(grid, "b"), pointer)
    expect(props.onSelectionChange).toHaveBeenCalledExactlyOnceWith(new Set(["b"]))
    expect(cell(grid, "a").parentElement).toHaveAttribute("aria-selected", "true")
    expect(cell(grid, "b").parentElement).not.toHaveAttribute("aria-selected")
    rerender(<DataGrid {...props} selection={new Set(["b"])} renderContextMenu={menu} />)
    expect(cell(grid, "a").parentElement).not.toHaveAttribute("aria-selected")
    expect(cell(grid, "b").parentElement).toHaveAttribute("aria-selected", "true")
  })

  it("keeps row subscriptions local after pointer interaction", () => {
    const props = setup()
    const renderCell = vi.fn(({ row }: { row: Quote }) => <span>{row.px}</span>)
    render(<DataGrid {...props} columns={[{ ...columns[0]!, cell: renderCell }]} />)
    fireEvent.pointerDown(cell(screen.getByRole("grid"), "a"), pointer)
    renderCell.mockClear()
    act(() => props.store.applyDeltas({ patch: [{ id: "b", fields: { px: 7 } }] }))
    expect(renderCell).toHaveBeenCalledTimes(1)
    expect(renderCell.mock.calls[0]![0].row.id).toBe("b")
    expect(within(cell(screen.getByRole("grid"), "b")).getByText("7")).toBeInTheDocument()
  })
})
