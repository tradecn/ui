import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { Activity, StrictMode } from "react"
import { createPortal } from "react-dom"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import { DataGrid, EMPTY_COLUMN_STATE, type ColumnDef, type ColumnState } from "@/registry/tradecn/ui/data-grid"

interface Quote { id: string; px: number }
const columns: ColumnDef<Quote>[] = [
  { key: "id", header: "Quote", width: 100, accessor: row => row.id },
  { key: "px", header: "Price", width: 90, minWidth: 60, accessor: row => row.px },
]
const pointer = { pointerId: 7, pointerType: "mouse", isPrimary: true, button: 0, buttons: 1, clientX: 100 }

function setup() {
  const store = createRowStore<Quote>({ getRowId: row => row.id })
  const change = vi.fn()
  return { store, columns, label: "Quotes", onColumnStateChange: change }
}

function handle() { return screen.getByRole("separator", { name: "Resize Price" }) }

afterEach(() => {
  // Also release the old implementation's listeners when running the regression against it.
  fireEvent.pointerUp(window, pointer)
  vi.restoreAllMocks()
})

describe("DataGrid resizing", () => {
  it("resizes from the initial width, rounds and clamps, and stops on release", () => {
    const props = setup()
    render(<DataGrid {...props} />)
    fireEvent.pointerDown(handle(), pointer)
    fireEvent.pointerMove(window, { ...pointer, clientX: 112.6 })
    expect(props.onColumnStateChange).toHaveBeenLastCalledWith({ ...EMPTY_COLUMN_STATE, widths: { px: 103 } })
    fireEvent.pointerMove(window, { ...pointer, clientX: 0 })
    expect(props.onColumnStateChange).toHaveBeenLastCalledWith({ ...EMPTY_COLUMN_STATE, widths: { px: 60 } })
    fireEvent.pointerUp(window, { ...pointer, buttons: 0 })
    props.onColumnStateChange.mockClear()
    fireEvent.pointerMove(window, { ...pointer, clientX: 200 })
    expect(props.onColumnStateChange).not.toHaveBeenCalled()
  })

  it.each(["cancel", "capture loss", "blur", "unmount", "hidden column", "Activity hide"])("ends a gesture on %s without reverting accepted widths", end => {
    const props = setup()
    const layout = (hidden: boolean) => <StrictMode><Activity mode={hidden && end === "Activity hide" ? "hidden" : "visible"}><DataGrid {...props} columns={hidden && end === "hidden column" ? columns.slice(0, 1) : columns} /></Activity></StrictMode>
    const { rerender, unmount } = render(layout(false))
    const target = handle()
    fireEvent.pointerDown(target, pointer)
    fireEvent.pointerMove(window, { ...pointer, clientX: 120 })
    expect(props.onColumnStateChange).toHaveBeenLastCalledWith({ ...EMPTY_COLUMN_STATE, widths: { px: 110 } })
    props.onColumnStateChange.mockClear()
    if (end === "cancel") fireEvent.pointerCancel(window, pointer)
    else if (end === "capture loss") fireEvent.lostPointerCapture(target, pointer)
    else if (end === "blur") fireEvent(window, new Event("blur"))
    else if (end === "unmount") unmount()
    else rerender(layout(true))
    fireEvent.pointerMove(window, { ...pointer, clientX: 150 })
    expect(props.onColumnStateChange).not.toHaveBeenCalled()
    if (end !== "unmount" && end !== "hidden column") {
      if (end === "Activity hide") rerender(layout(false))
      expect(screen.getAllByRole("columnheader")[1]!.parentElement?.style.gridTemplateColumns).toBe("100px 110px")
    }
  })

  it.each([
    { name: "secondary button", event: { button: 2, buttons: 2 } },
    { name: "secondary touch", event: { pointerType: "touch", isPrimary: false } },
  ])("ignores $name presses", ({ event }) => {
    const props = setup()
    render(<DataGrid {...props} />)
    fireEvent.pointerDown(handle(), { ...pointer, ...event })
    fireEvent.pointerMove(window, { ...pointer, ...event, clientX: 150 })
    expect(props.onColumnStateChange).not.toHaveBeenCalled()
  })

  it("honors an application capture handler that cancels the press", () => {
    const props = setup()
    render(<div onPointerDownCapture={event => event.preventDefault()}><DataGrid {...props} /></div>)
    fireEvent.pointerDown(handle(), pointer)
    fireEvent.pointerMove(window, { ...pointer, clientX: 150 })
    expect(props.onColumnStateChange).not.toHaveBeenCalled()
  })

  it("ignores another pointer's movement, cancellation and release", () => {
    const props = setup()
    render(<DataGrid {...props} />)
    fireEvent.pointerDown(handle(), pointer)
    const other = { ...pointer, pointerId: 8, pointerType: "touch", isPrimary: false, clientX: 300 }
    fireEvent.pointerMove(window, other)
    expect(props.onColumnStateChange).not.toHaveBeenCalled()
    fireEvent.pointerCancel(window, other)
    fireEvent.pointerUp(window, other)
    fireEvent.pointerMove(window, { ...pointer, clientX: 125 })
    expect(props.onColumnStateChange).toHaveBeenCalledExactlyOnceWith({ ...EMPTY_COLUMN_STATE, widths: { px: 115 } })
  })

  it("ends when the primary button is no longer held", () => {
    const props = setup()
    render(<DataGrid {...props} />)
    fireEvent.pointerDown(handle(), pointer)
    fireEvent.pointerMove(window, { ...pointer, buttons: 2, clientX: 150 })
    fireEvent.pointerMove(window, { ...pointer, clientX: 160 })
    expect(props.onColumnStateChange).not.toHaveBeenCalled()
  })

  it("replaces a previous gesture instead of keeping both listeners", () => {
    const props = setup()
    render(<DataGrid {...props} />)
    fireEvent.pointerDown(handle(), pointer)
    fireEvent.pointerDown(handle(), { ...pointer, clientX: 110 })
    fireEvent.pointerMove(window, { ...pointer, clientX: 130 })
    expect(props.onColumnStateChange).toHaveBeenCalledExactlyOnceWith({ ...EMPTY_COLUMN_STATE, widths: { px: 110 } })
    fireEvent.pointerUp(window, pointer)
  })

  it("keeps the original pointer when a second input device presses the same handle", () => {
    const props = setup()
    render(<DataGrid {...props} />)
    fireEvent.pointerDown(handle(), pointer)
    const touch = { ...pointer, pointerId: 8, pointerType: "touch", clientX: 110 }
    fireEvent.pointerDown(handle(), touch)
    fireEvent.pointerMove(window, { ...touch, clientX: 200 })
    fireEvent.pointerUp(window, touch)
    expect(props.onColumnStateChange).not.toHaveBeenCalled()
    fireEvent.pointerMove(window, { ...pointer, clientX: 130 })
    expect(props.onColumnStateChange).toHaveBeenCalledExactlyOnceWith({ ...EMPTY_COLUMN_STATE, widths: { px: 120 } })
  })

  it("uses the latest committed snapshot, callback and minimum width during a drag", () => {
    const props = setup()
    const updated = vi.fn()
    const { rerender } = render(<DataGrid {...props} columnState={EMPTY_COLUMN_STATE} />)
    fireEvent.pointerDown(handle(), pointer)
    const next: ColumnState = { order: ["px", "id"], hidden: ["id"], widths: { id: 160, px: 120 } }
    rerender(<DataGrid {...props} columns={columns.map(col => ({ ...col, minWidth: 105 }))} columnState={next} onColumnStateChange={updated} />)
    fireEvent.pointerMove(window, { ...pointer, clientX: 110 })
    expect(props.onColumnStateChange).not.toHaveBeenCalled()
    expect(updated).toHaveBeenCalledExactlyOnceWith({ ...next, widths: { id: 160, px: 105 } })
  })

  it("uses the handle's window when rendered into another document", () => {
    const props = setup()
    const frame = document.createElement("iframe")
    document.body.append(frame)
    const owner = frame.contentWindow!
    const { unmount } = render(createPortal(<DataGrid {...props} />, frame.contentDocument!.body))
    try {
      const target = within(frame.contentDocument!.body).getByRole("separator", { name: "Resize Price" })
      fireEvent.pointerDown(target, pointer)
      fireEvent.pointerMove(owner, { ...pointer, clientX: 125 })
      expect(props.onColumnStateChange).toHaveBeenCalledExactlyOnceWith({ ...EMPTY_COLUMN_STATE, widths: { px: 115 } })
      props.onColumnStateChange.mockClear()
      fireEvent.pointerMove(window, { ...pointer, clientX: 150 })
      expect(props.onColumnStateChange).not.toHaveBeenCalled()
      unmount()
      fireEvent.pointerMove(owner, { ...pointer, clientX: 175 })
      expect(props.onColumnStateChange).not.toHaveBeenCalled()
    } finally {
      unmount()
      fireEvent.pointerUp(owner, pointer)
      frame.remove()
    }
  })

  it("keeps the keyboard resize command at eight pixels without a pointer gesture", () => {
    const props = setup()
    render(<DataGrid {...props} />)
    const grid = screen.getByRole("grid")
    act(() => grid.focus())
    fireEvent.keyDown(grid, { key: "ArrowRight" })
    fireEvent.keyDown(grid, { key: "ArrowRight" })
    fireEvent.keyDown(grid, { key: "ArrowRight", altKey: true, shiftKey: true })
    expect(props.onColumnStateChange).toHaveBeenLastCalledWith({ ...EMPTY_COLUMN_STATE, widths: { px: 98 } })
    fireEvent.keyDown(grid, { key: "ArrowLeft", altKey: true, shiftKey: true })
    expect(props.onColumnStateChange).toHaveBeenLastCalledWith({ ...EMPTY_COLUMN_STATE, widths: { px: 90 } })
  })

  it("releases listeners in the old document when an adopted handle loses capture", () => {
    const props = setup()
    const frame = document.createElement("iframe")
    const host = document.createElement("div")
    document.body.append(frame, host)
    const { unmount } = render(createPortal(<DataGrid {...props} />, host))
    try {
      const target = handle()
      const add = vi.spyOn(window, "addEventListener")
      const remove = vi.spyOn(window, "removeEventListener")
      fireEvent.pointerDown(target, pointer)
      const registered = add.mock.calls.filter(([type]) => ["pointermove", "pointerup", "pointercancel", "lostpointercapture", "blur"].includes(type))
      expect(registered.length).toBeGreaterThan(0)
      frame.contentDocument!.body.append(host)
      fireEvent.lostPointerCapture(target, pointer)
      for (const args of registered) expect(remove).toHaveBeenCalledWith(...args)
      expect(props.onColumnStateChange).not.toHaveBeenCalled()
    } finally {
      unmount()
      host.remove()
      frame.remove()
    }
  })

  it("ends pending capture on adoption even when the browser emits no capture loss", async () => {
    const props = setup()
    const frame = document.createElement("iframe")
    const host = document.createElement("div")
    document.body.append(frame, host)
    const { unmount } = render(createPortal(<DataGrid {...props} />, host))
    try {
      const target = handle()
      const add = vi.spyOn(window, "addEventListener")
      const remove = vi.spyOn(window, "removeEventListener")
      fireEvent.pointerDown(target, pointer)
      const registered = add.mock.calls.filter(([type]) => ["pointermove", "pointerup", "pointercancel", "lostpointercapture", "blur"].includes(type))
      expect(registered.length).toBeGreaterThan(0)
      await act(async () => { frame.contentDocument!.body.append(host) })
      for (const args of registered) expect(remove).toHaveBeenCalledWith(...args)
      const pen = { ...pointer, pointerId: 9, pointerType: "pen" }
      fireEvent.pointerDown(target, pen)
      fireEvent.pointerMove(frame.contentWindow!, { ...pen, clientX: 120 })
      expect(props.onColumnStateChange).toHaveBeenCalledExactlyOnceWith({ ...EMPTY_COLUMN_STATE, widths: { px: 110 } })
    } finally {
      unmount()
      host.remove()
      frame.remove()
    }
  })

  it("keeps observing the current ancestors after a move within the document", async () => {
    const props = setup()
    const host = document.createElement("div")
    const destination = document.createElement("section")
    const nested = document.createElement("div")
    destination.append(nested)
    document.body.append(host, destination)
    const { unmount } = render(createPortal(<DataGrid {...props} />, host))
    try {
      const target = handle()
      const add = vi.spyOn(window, "addEventListener")
      const remove = vi.spyOn(window, "removeEventListener")
      fireEvent.pointerDown(target, pointer)
      const registered = add.mock.calls.filter(([type]) => ["pointermove", "pointerup", "pointercancel", "lostpointercapture", "blur"].includes(type))
      expect(registered.length).toBeGreaterThan(0)
      await act(async () => { nested.append(host) })
      fireEvent.pointerMove(window, { ...pointer, clientX: 135 })
      expect(props.onColumnStateChange).toHaveBeenCalledExactlyOnceWith({ ...EMPTY_COLUMN_STATE, widths: { px: 125 } })
      await act(async () => { nested.remove() })
      for (const args of registered) expect(remove).toHaveBeenCalledWith(...args)
      fireEvent.pointerMove(window, { ...pointer, clientX: 180 })
      expect(props.onColumnStateChange).toHaveBeenCalledTimes(1)
    } finally {
      unmount()
      host.remove()
      destination.remove()
    }
  })
})
