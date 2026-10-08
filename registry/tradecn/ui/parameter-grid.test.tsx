import { act, fireEvent, render, screen } from "@testing-library/react"
import { useLayoutEffect, useState } from "react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import { editProblem, type ColumnDef, type EditChange } from "@/registry/tradecn/ui/data-grid"
import { DEFAULT_PARAMETER_GRID_LABELS, ParameterGrid, allowsAction, parameterColumns, parameterEdit, type ParameterDef, type ParameterRow } from "@/registry/tradecn/ui/parameter-grid"

// getRowProps feeds memoized rows, so the docs say to memoize it and the counting
// test uses a module-level one. onEdit is deliberately inline there: the grid reads
// it current internally, so the Usage example's inline handler costs nothing.
const moduleRowProps = () => undefined

interface Sheet extends ParameterRow {
  skew: number | null
  width: number
  maxSize: number
  note: string
}

const PARAMETERS: ParameterDef<Sheet>[] = [
  { key: "skew", header: "Skew", accessor: (r) => r.skew, step: 0.25, decimals: 2, min: -5, max: 5 },
  { key: "width", header: "Width", accessor: (r) => r.width, step: 0.5, min: 0 },
  { key: "maxSize", header: "Max size", accessor: (r) => r.maxSize, decimals: 0, readOnly: true },
  { key: "note", header: "Note", accessor: (r) => r.note, numeric: false, parse: (t) => t.trim() },
]

const ROWS: Sheet[] = [
  { id: "zn", name: "ZN", enabled: true, allowedActions: ["toggle", "edit"], skew: 0.5, width: 2, maxSize: 50, note: "", updatedAt: 1_700_000_000_000, updatedBy: "desk" },
  { id: "zb", name: "ZB", enabled: false, allowedActions: ["edit"], skew: null, width: 3, maxSize: 20, note: "wide", updatedAt: 1_700_000_100_000 },
  { id: "tu", name: "TU", enabled: true, allowedActions: [], skew: 0, width: 1, maxSize: 200, note: "", updatedAt: null },
]

const RECT = { width: 900, height: 200 }
// Radix renders a disabled checkbox as a disabled button, Base UI as a span with aria-disabled; the playground is one of them.
const disabled = (el: HTMLElement) => el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true"

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

function setup(onEdit: (change: EditChange<Sheet>) => void | Promise<unknown> = vi.fn(), changedSince: number | null = null) {
  const store = createRowStore<Sheet>({ getRowId: (r) => r.id })
  store.applyDeltas({ upsert: ROWS, meta: { producedAt: 1_700_000_200_000 } })
  render(<ParameterGrid store={store} parameters={PARAMETERS} onEdit={onEdit} initialRect={RECT} changedSince={changedSince} time={(ms) => `t${ms}`} />)
  const grid = screen.getByRole("grid", { name: "Parameters" })
  const cell = (rowId: string, key: string) => document.querySelector<HTMLElement>(`[data-row-id="${rowId}"] [data-col="${key}"]`)!
  return { store, grid, cell }
}

describe("parameterColumns and parameterEdit", () => {
  it("does not re-render rows when the parent re-renders with a memoized getRowProps", async () => {
    const user = userEvent.setup()
    let cellRenders = 0
    const store = createRowStore<Sheet>({ getRowId: (r) => r.id })
    store.applyDeltas({ upsert: ROWS, meta: { producedAt: 1_700_000_200_000 } })
    const probe: ColumnDef<Sheet>[] = [
      { key: "name", header: "Parameter", width: 160, accessor: (r) => r.name },
      { key: "probe", header: "Probe", width: 40, accessor: () => 0, cell: () => ((cellRenders += 1), (<i>p</i>)) },
    ]
    function Parent() {
      const [n, setN] = useState(0)
      return (
        <>
          <button onClick={() => setN(n + 1)}>parent {n}</button>
          <ParameterGrid store={store} parameters={PARAMETERS} columns={probe} onEdit={() => undefined} initialRect={RECT} time={(ms) => `t${ms}`} getRowProps={moduleRowProps} />
        </>
      )
    }
    render(<Parent />)
    const before = cellRenders
    expect(before).toBeGreaterThan(0)
    await user.click(screen.getByRole("button", { name: /parent/ }))
    expect(cellRenders).toBe(before)
  })

  it("withdrawing the action while pending refuses the keyboard retry that a disabled checkbox lets through", () => {
    // The docs' one-in-flight recipe, both halves: the grid's Space still sends
    // while the cell is pending — disabling the checkbox blocks only the pointer —
    // and withdrawing the permission refuses keyboard and pointer alike.
    const onEdit = vi.fn(() => new Promise(() => {}))
    const { store, grid } = setup(onEdit)
    fireEvent.keyDown(grid, { key: "ArrowDown" })
    fireEvent.keyDown(grid, { key: "ArrowRight" })
    fireEvent.keyDown(grid, { key: "ArrowRight" })
    fireEvent.keyDown(grid, { key: " " })
    expect(onEdit).toHaveBeenCalledTimes(1)
    // Still pending, permission still granted: the keyboard path sends again.
    fireEvent.keyDown(grid, { key: " " })
    expect(onEdit).toHaveBeenCalledTimes(2)
    // The server demo's mechanism: withdraw the action while a reply is pending.
    act(() => {
      store.applyDeltas({ patch: [{ id: "zn", fields: { allowedActions: ["edit"] } }] })
    })
    fireEvent.keyDown(grid, { key: " " })
    expect(onEdit).toHaveBeenCalledTimes(2)
  })

  it("hands the grid the current onEdit and getRowProps, not the first render's", () => {
    const first = vi.fn()
    const second = vi.fn()
    const store = createRowStore<Sheet>({ getRowId: (r) => r.id })
    store.applyDeltas({ upsert: ROWS, meta: { producedAt: 1_700_000_200_000 } })
    // A custom cell that commits the moment it mounts: its layout effect runs
    // before any passive effect, where a ref published by useEffect still holds
    // the previous render's handler.
    function CommitOnMount({ edit }: { edit?: { commit: (value: unknown) => void } }) {
      useLayoutEffect(() => {
        edit?.commit(42)
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])
      return <span>probe</span>
    }
    const probeColumns: ColumnDef<Sheet>[] = [
      { key: "name", header: "Parameter", width: 160, accessor: (r) => r.name },
      { key: "width", header: "Width", width: 100, accessor: (r) => r.width, edit: { parse: (text) => Number(text) }, cell: ({ edit }) => <CommitOnMount edit={edit} /> },
    ]
    const base: ColumnDef<Sheet>[] = [probeColumns[0]!]
    const { rerender } = render(<ParameterGrid store={store} parameters={PARAMETERS} columns={base} onEdit={first} initialRect={RECT} time={(ms) => `t${ms}`} />)
    rerender(<ParameterGrid store={store} parameters={PARAMETERS} columns={probeColumns} onEdit={second} initialRect={RECT} time={(ms) => `t${ms}`} getRowProps={(r) => (r.id === ROWS[0]!.id ? { "data-rule": "review" } : undefined)} />)
    // The decoration from the second render's getRowProps is on screen already.
    expect(document.querySelector<HTMLElement>(`[data-row-id="${ROWS[0]!.id}"]`)!).toHaveAttribute("data-rule", "review")
    // Every mount-time commit landed in the second handler, never the first.
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalled()
    expect(second.mock.calls.every(([change]) => change.value === 42)).toBe(true)
  })

  it("lays out name, the enable box, one column per parameter, and the updated time, with numeric defaults", () => {
    const columns = parameterColumns({ parameters: PARAMETERS })
    expect(columns.map((c) => c.key)).toEqual(["name", "enabled", "skew", "width", "maxSize", "note", "updated"])
    expect(columns[0]).toMatchObject({ frozen: "left" })
    expect(columns.find((c) => c.key === "skew")).toMatchObject({ numeric: true, width: 96 })
    expect(columns.find((c) => c.key === "note")).toMatchObject({ numeric: false })
    expect(columns.find((c) => c.key === "maxSize")?.edit).toBeUndefined()
    expect(columns.find((c) => c.key === "enabled")?.edit?.toggle?.(true, ROWS[0]!)).toBe(false)
  })

  it("parses a number with separators, blank as null, and says what is not one; the range check names the line in the column's own format", () => {
    const edit = parameterEdit(PARAMETERS[0]!, "edit")
    expect(edit.parse("1,250.5", ROWS[0]!)).toBe(1250.5)
    expect(edit.parse("  ", ROWS[0]!)).toBeNull()
    expect(edit.parse("−0.25", ROWS[0]!)).toBe(-0.25)
    expect(edit.parse("abc", ROWS[0]!)).toEqual(editProblem("Not a number."))
    expect(edit.validate?.(6, ROWS[0]!)).toEqual(editProblem("6.00 is above the maximum of 5.00."))
    expect(edit.validate?.(-6, ROWS[0]!)).toEqual(editProblem("−6.00 is below the minimum of −5.00."))
    expect(edit.validate?.(2, ROWS[0]!)).toBeNull()
    expect(edit.format?.(0.5, ROWS[0]!)).toBe("0.50")
    expect(edit.format?.(null, ROWS[0]!)).toBe("–")
    // A number steps by itself, ten with Shift, with the float noise cleaned off.
    expect(edit.step?.(0.1, 1, false, ROWS[0]!)).toBe(0.35)
    expect(edit.step?.(0.5, -1, true, ROWS[0]!)).toBe(-2)
    expect(edit.step?.(null, 1, false, ROWS[0]!)).toBe(0.25)
    // Editable only where the server allows it and the parameter is not read-only.
    expect(edit.canEdit?.(ROWS[0]!)).toBe(true)
    expect(edit.canEdit?.(ROWS[2]!)).toBe(false)
    expect(parameterEdit(PARAMETERS[2]!, "edit").canEdit?.(ROWS[0]!)).toBe(false)
    expect(allowsAction(ROWS[1]!, "toggle")).toBe(false)
    expect(allowsAction({ id: "x", name: "x" }, "edit")).toBe(false)
  })
})

describe("ParameterGrid", () => {
  it("renders the sheet in the parameters preset with the as-of line, the box as the server's word, and the read-only column read-only", () => {
    const { grid, cell } = setup()
    expect(document.querySelector("[data-slot='tradecn-parameter-grid']")).toBeInTheDocument()
    expect(grid).toHaveAttribute("data-preset", "parameters")
    expect(document.querySelector("[data-parameter-asof]")).toHaveTextContent("As of t1700000200000")
    expect(cell("zn", "skew")).toHaveTextContent("0.50")
    expect(cell("zb", "skew")).toHaveTextContent("–")
    expect(cell("zn", "maxSize")).toHaveTextContent("50")
    expect(cell("zn", "maxSize")).not.toHaveAttribute("data-editable")
    expect(cell("zn", "skew")).toHaveAttribute("data-editable")
    expect(cell("tu", "skew")).not.toHaveAttribute("data-editable")
    expect(cell("zn", "updated")).toHaveTextContent("t1700000000000desk")
    expect(cell("tu", "updated")).toHaveTextContent("–")
    // The box: checked as the row says, named for what a press asks, disabled where the server allows no toggle.
    const zn = screen.getByRole("checkbox", { name: "Disable ZN" })
    expect(zn).toHaveAttribute("data-parameter-enabled", "true")
    expect(disabled(zn)).toBe(false)
    expect(disabled(screen.getByRole("checkbox", { name: "Enable ZB" }))).toBe(true)
    expect(disabled(screen.getByRole("checkbox", { name: "Disable TU" }))).toBe(true)
  })

  it("prints the null token for an updated or as-of time that is not an instant, and never hands one to a formatter", () => {
    const time = vi.fn((ms: number) => `t${ms}`)
    const store = createRowStore<Sheet>({ getRowId: (r) => r.id })
    store.applyDeltas({ upsert: ROWS.map((row) => (row.id === "zn" ? { ...row, updatedAt: Number.NaN } : row)), meta: { producedAt: Infinity } })
    render(<ParameterGrid store={store} parameters={PARAMETERS} onEdit={vi.fn()} initialRect={RECT} time={time} />)
    const cell = (rowId: string, key: string) => document.querySelector<HTMLElement>(`[data-row-id="${rowId}"] [data-col="${key}"]`)!
    expect(cell("zn", "updated")).toHaveTextContent(/^–desk$/)
    expect(document.querySelector("[data-parameter-asof]")).toHaveTextContent(/^As of –$/)
    expect(time.mock.calls.flat().every((ms) => Number.isFinite(ms) && Math.abs(ms) <= 8.64e15)).toBe(true)
  })

  it("draws a sheet whose times are not instants with its default clock, one null token for each", () => {
    const store = createRowStore<Sheet>({ getRowId: (r) => r.id })
    store.applyDeltas({ upsert: ROWS.map((row) => (row.id === "zn" ? { ...row, updatedAt: 8.64e15 + 1 } : row)), meta: { producedAt: Number.NaN } })
    render(<ParameterGrid store={store} parameters={PARAMETERS} onEdit={vi.fn()} initialRect={RECT} />)
    expect(document.querySelector('[data-row-id="zn"] [data-col="updated"]')).toHaveTextContent(/^–desk$/)
    expect(document.querySelector("[data-parameter-asof]")).toHaveTextContent(/^As of –$/)
  })

  it("types a value in place, sends it as a change, holds it pending until the server's row agrees, and prints a rejection", async () => {
    let refuse: (e: unknown) => void = () => {}
    const onEdit = vi.fn((change: EditChange<Sheet>) => (change.value === 4 ? new Promise((_, reject) => (refuse = reject)) : undefined))
    const { store, grid, cell } = setup(onEdit)
    fireEvent.doubleClick(cell("zn", "skew").firstElementChild!)
    const input = screen.getByRole("textbox", { name: "Skew" }) as HTMLInputElement
    expect(input.value).toBe("0.50")
    fireEvent.keyDown(input, { key: "ArrowUp" })
    expect(input.value).toBe("0.75")
    fireEvent.change(input, { target: { value: "1.25" } })
    fireEvent.keyDown(input, { key: "Enter" })
    expect(onEdit).toHaveBeenCalledWith({ rowId: "zn", key: "skew", value: 1.25, previous: 0.5, row: expect.objectContaining({ id: "zn" }) })
    expect(cell("zn", "skew")).toHaveAttribute("data-pending")
    expect(cell("zn", "skew")).toHaveTextContent("1.25")
    act(() => store.applyDeltas({ patch: [{ id: "zn", fields: { skew: 1.25, updatedAt: 1_700_000_300_000 } }] }))
    expect(cell("zn", "skew")).not.toHaveAttribute("data-pending")
    // Past the line: the editor stays open and says so.
    fireEvent.doubleClick(cell("zn", "skew").firstElementChild!)
    fireEvent.change(screen.getByRole("textbox", { name: "Skew" }), { target: { value: "7" } })
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Skew" }), { key: "Enter" })
    expect(screen.getByRole("textbox", { name: "Skew" })).toHaveAttribute("aria-description", "7.00 is above the maximum of 5.00.")
    fireEvent.change(screen.getByRole("textbox", { name: "Skew" }), { target: { value: "4" } })
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Skew" }), { key: "Enter" })
    await act(async () => {
      refuse(new Error("Risk declined"))
      await Promise.resolve()
    })
    expect(cell("zn", "skew")).toHaveAttribute("data-rejected", "Risk declined")
    expect(cell("zn", "skew")).toHaveTextContent("1.25Risk declined")
    expect(grid).toHaveAttribute("data-editable")
  })

  it("the box asks the server and never flips itself; a text parameter takes its text", () => {
    const onEdit = vi.fn()
    const { store, cell } = setup(onEdit)
    const box = screen.getByRole("checkbox", { name: "Disable ZN" })
    fireEvent.click(box)
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ rowId: "zn", key: "enabled", value: false, previous: true }))
    // Still the server's word, now pending and disabled until the row comes back.
    expect(box).toHaveAttribute("data-parameter-enabled", "true")
    expect(cell("zn", "enabled")).toHaveAttribute("data-pending")
    expect(disabled(screen.getByRole("checkbox", { name: "Disable ZN" }))).toBe(true)
    act(() => store.applyDeltas({ patch: [{ id: "zn", fields: { enabled: false } }] }))
    expect(cell("zn", "enabled")).not.toHaveAttribute("data-pending")
    expect(screen.getByRole("checkbox", { name: "Enable ZN" })).toHaveAttribute("data-parameter-enabled", "false")
    // A text parameter.
    fireEvent.doubleClick(cell("zb", "note").firstElementChild!)
    const note = screen.getByRole("textbox", { name: "Note" })
    expect(note).not.toHaveAttribute("data-numeric")
    fireEvent.change(note, { target: { value: " tighter " } })
    fireEvent.keyDown(note, { key: "Enter" })
    expect(onEdit).toHaveBeenLastCalledWith(expect.objectContaining({ rowId: "zb", key: "note", value: "tighter", previous: "wide" }))
  })

  it("marks the rows changed since a moment, in a dot and in words", () => {
    const { cell } = setup(vi.fn(), 1_700_000_050_000)
    expect(cell("zb", "name").querySelector("[data-parameter-changed]")).not.toBeNull()
    expect(document.querySelector("[data-row-id='zb']")).toHaveAttribute("aria-description", DEFAULT_PARAMETER_GRID_LABELS.changed)
    expect(cell("zn", "name").querySelector("[data-parameter-changed]")).toBeNull()
    expect(document.querySelector("[data-row-id='zn']")).not.toHaveAttribute("aria-description")
    expect(cell("tu", "name").querySelector("[data-parameter-changed]")).toBeNull()
  })
})
