import { fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { ColumnRule } from "@/registry/tradecn/lib/grid-rules"
import {
  ColumnChooser,
  ColumnChooserPanel,
  DEFAULT_COLUMN_CHOOSER_LABELS,
  chooserRows,
  isDefaultColumnState,
  moveColumnBy,
  moveColumnTo,
  resetColumnWidth,
  setColumnVisible,
} from "@/registry/tradecn/ui/column-chooser"
import { EMPTY_COLUMN_STATE, type ColumnDef, type ColumnState } from "@/registry/tradecn/ui/data-grid"

interface Rfq {
  id: string
  client: string
  px: number
  size: number
  status: string
  internal: string
}

const columns: ColumnDef<Rfq>[] = [
  { key: "id", header: "RFQ", width: 80, frozen: "left", accessor: (r) => r.id },
  { key: "client", header: "Client", width: 100, frozen: "left", accessor: (r) => r.client },
  { key: "px", header: "Price", width: 90, numeric: true, accessor: (r) => r.px },
  { key: "size", header: "Size", width: 90, numeric: true, accessor: (r) => r.size },
  { key: "status", header: <span>Status</span>, width: 100, accessor: (r) => r.status },
  { key: "internal", header: "Internal", width: 60, hidden: true, accessor: (r) => r.internal },
]

const rules: ColumnRule[] = [
  { id: "rich", column: "px", when: { op: "gt", value: "100-00" }, tone: "up", label: "Rich to the market" },
  { id: "big", column: "size", when: { op: "gte", value: "10,000,000" }, tone: "primary", target: "row" },
]

afterEach(() => vi.restoreAllMocks())

describe("chooserRows and the state helpers", () => {
  it("lists the columns in the grid's order, frozen first, hidden ones in their place, with the width in force and the rules that name them", () => {
    const state: ColumnState = { order: ["status", "size", "px"], widths: { px: 140 }, hidden: ["size"] }
    const rows = chooserRows(columns, state, rules)
    expect(rows.map((row) => row.key)).toEqual(["id", "client", "status", "size", "px"])
    expect(rows.map((row) => row.name)).toEqual(["RFQ", "Client", "status", "Size", "Price"])
    expect(rows.map((row) => row.visible)).toEqual([true, true, true, false, true])
    expect(rows.map((row) => row.frozen)).toEqual([true, true, false, false, false])
    expect(rows.find((row) => row.key === "px")).toMatchObject({ width: 140, resized: true })
    expect(rows.find((row) => row.key === "size")).toMatchObject({ width: 90, resized: false })
    expect(rows.find((row) => row.key === "px")?.rules.map((rule) => rule.id)).toEqual(["rich"])
    expect(rows.find((row) => row.key === "status")?.rules).toEqual([])
  })

  it("moves a column to another's place on its own side of the frozen line, and refuses a move across it", () => {
    const rows = chooserRows(columns, EMPTY_COLUMN_STATE)
    expect(moveColumnTo(rows, EMPTY_COLUMN_STATE, "status", "px").order).toEqual(["id", "client", "status", "px", "size"])
    expect(moveColumnTo(rows, EMPTY_COLUMN_STATE, "px", "status").order).toEqual(["id", "client", "size", "status", "px"])
    expect(moveColumnTo(rows, EMPTY_COLUMN_STATE, "client", "id").order).toEqual(["client", "id", "px", "size", "status"])
    expect(moveColumnTo(rows, EMPTY_COLUMN_STATE, "px", "id")).toBe(EMPTY_COLUMN_STATE)
    expect(moveColumnTo(rows, EMPTY_COLUMN_STATE, "px", "px")).toBe(EMPTY_COLUMN_STATE)
    expect(moveColumnTo(rows, EMPTY_COLUMN_STATE, "nothing", "px")).toBe(EMPTY_COLUMN_STATE)
    expect(moveColumnBy(rows, EMPTY_COLUMN_STATE, "px", 1).order).toEqual(["id", "client", "size", "px", "status"])
    expect(moveColumnBy(rows, EMPTY_COLUMN_STATE, "px", -1)).toBe(EMPTY_COLUMN_STATE)
    expect(moveColumnBy(rows, EMPTY_COLUMN_STATE, "status", 1)).toBe(EMPTY_COLUMN_STATE)
    // A hidden column keeps its place in the order it is written into.
    const state: ColumnState = { ...EMPTY_COLUMN_STATE, hidden: ["size"] }
    expect(moveColumnBy(chooserRows(columns, state), state, "status", -1)).toEqual({ ...state, order: ["id", "client", "px", "status", "size"] })
  })

  it("shows, hides, forgets a width, and knows the default state", () => {
    expect(setColumnVisible(EMPTY_COLUMN_STATE, "px", false).hidden).toEqual(["px"])
    expect(setColumnVisible({ ...EMPTY_COLUMN_STATE, hidden: ["px", "size"] }, "px", true).hidden).toEqual(["size"])
    expect(setColumnVisible({ ...EMPTY_COLUMN_STATE, hidden: ["px"] }, "px", false).hidden).toEqual(["px"])
    const resized: ColumnState = { ...EMPTY_COLUMN_STATE, widths: { px: 140, size: 120 } }
    expect(resetColumnWidth(resized, "px").widths).toEqual({ size: 120 })
    expect(resetColumnWidth(resized, "status")).toBe(resized)
    expect(isDefaultColumnState(EMPTY_COLUMN_STATE)).toBe(true)
    expect(isDefaultColumnState({ order: [], widths: {}, hidden: [] })).toBe(true)
    expect(isDefaultColumnState(resized)).toBe(false)
  })
})

describe("ColumnChooserPanel", () => {
  const listed = () => [...document.querySelectorAll<HTMLElement>("li[data-column]")].map((li) => li.dataset.column)

  it("lists every column with its checkbox, marks the frozen ones, prints the width, and says a rule in words beside its column", () => {
    render(<ColumnChooserPanel columns={columns} columnState={{ order: [], widths: { px: 140 }, hidden: ["status"] }} onColumnStateChange={() => {}} rules={rules} />)
    const panel = screen.getByRole("group", { name: "Columns" })
    expect(panel.dataset.slot).toBe("tradecn-column-chooser")
    expect(panel.dataset.hidden).toBe("1")
    expect(listed()).toEqual(["id", "client", "px", "size", "status"])
    expect(screen.getByRole("checkbox", { name: "Show Price" })).toBeChecked()
    expect(screen.getByRole("checkbox", { name: "Show status" })).not.toBeChecked()
    expect(document.querySelectorAll("[data-column-frozen]")).toHaveLength(2)
    expect(within(document.querySelector('li[data-column="px"]')!).getByText("140 px")).toBeInTheDocument()
    expect(document.querySelector('li[data-column="px"] [data-column-rule="rich"]')).toHaveTextContent("Rich to the market")
    expect(document.querySelector('li[data-column="size"] [data-column-rule="big"]')).toHaveTextContent("Size at or above 10,000,000")
    expect(screen.getByText("1 hidden")).toBeInTheDocument()
    // The width reset shows only where the state holds a width.
    expect(screen.getByRole("button", { name: "Reset width: Price" })).toBeVisible()
    expect(document.querySelector('li[data-column="size"] button[aria-label="Reset width: Size"]')).toHaveAttribute("aria-hidden", "true")
    // A column hidden in its definition is not the trader's to show.
    expect(screen.queryByRole("checkbox", { name: "Show Internal" })).toBeNull()
  })

  it("writes every change through onColumnStateChange and keeps nothing: hide, show, move, reset a width, reset all", () => {
    const onChange = vi.fn()
    const state: ColumnState = { order: [], widths: { px: 140 }, hidden: [] }
    render(<ColumnChooserPanel columns={columns} columnState={state} onColumnStateChange={onChange} />)
    fireEvent.click(screen.getByRole("checkbox", { name: "Show Price" }))
    expect(onChange).toHaveBeenLastCalledWith({ ...state, hidden: ["px"] })
    fireEvent.click(screen.getByRole("button", { name: "Move down: Price" }))
    expect(onChange).toHaveBeenLastCalledWith({ ...state, order: ["id", "client", "size", "px", "status"] })
    fireEvent.click(screen.getByRole("button", { name: "Move up: Client" }))
    expect(onChange).toHaveBeenLastCalledWith({ ...state, order: ["client", "id", "px", "size", "status"] })
    fireEvent.click(screen.getByRole("button", { name: "Reset width: Price" }))
    expect(onChange).toHaveBeenLastCalledWith({ ...state, widths: {} })
    fireEvent.click(screen.getByRole("button", { name: "Reset all" }))
    expect(onChange).toHaveBeenLastCalledWith(EMPTY_COLUMN_STATE)
    // Still what it was handed: the panel keeps no state of its own.
    expect(screen.getByRole("checkbox", { name: "Show Price" })).toBeChecked()
    // The ends of a side cannot move past it.
    expect(screen.getByRole("button", { name: "Move up: RFQ" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Move down: Client" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Move up: Price" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Move down: status" })).toBeDisabled()
  })

  it("reorders from the keyboard with Alt and an arrow, and by dragging one row onto another", () => {
    const onChange = vi.fn()
    render(<ColumnChooserPanel columns={columns} columnState={EMPTY_COLUMN_STATE} onColumnStateChange={onChange} />)
    const px = document.querySelector<HTMLElement>('li[data-column="px"]')!
    fireEvent.keyDown(px, { key: "ArrowDown", altKey: true })
    expect(onChange).toHaveBeenLastCalledWith({ ...EMPTY_COLUMN_STATE, order: ["id", "client", "size", "px", "status"] })
    fireEvent.keyDown(px, { key: "ArrowDown" })
    expect(onChange).toHaveBeenCalledTimes(1)
    const status = document.querySelector<HTMLElement>('li[data-column="status"]')!
    const dataTransfer = { setData: vi.fn(), getData: vi.fn(() => "status"), effectAllowed: "", dropEffect: "" }
    fireEvent.dragStart(status, { dataTransfer })
    expect(status.dataset.dragging).toBe("true")
    const over = fireEvent.dragOver(px, { dataTransfer })
    expect(over, "a drop on the same side is allowed").toBe(false)
    const id = document.querySelector<HTMLElement>('li[data-column="id"]')!
    expect(fireEvent.dragOver(id, { dataTransfer }), "a drop across the frozen line is not").toBe(true)
    fireEvent.drop(px, { dataTransfer })
    expect(onChange).toHaveBeenLastCalledWith({ ...EMPTY_COLUMN_STATE, order: ["id", "client", "status", "px", "size"] })
    expect(status.dataset.dragging).toBeUndefined()
  })

  it("finds a column by its name or its key, and says when nothing matches", () => {
    render(<ColumnChooserPanel columns={columns} columnState={EMPTY_COLUMN_STATE} onColumnStateChange={() => {}} />)
    const search = screen.getByRole("textbox", { name: "Find a column" })
    fireEvent.change(search, { target: { value: "pri" } })
    expect(listed()).toEqual(["px"])
    fireEvent.change(search, { target: { value: "STATUS" } })
    expect(listed()).toEqual(["status"])
    fireEvent.change(search, { target: { value: "zzz" } })
    expect(listed()).toEqual([])
    expect(screen.getByText(DEFAULT_COLUMN_CHOOSER_LABELS.empty)).toBeInTheDocument()
    fireEvent.change(search, { target: { value: "" } })
    expect(listed()).toHaveLength(5)
    expect(screen.getByRole("button", { name: "Reset all" })).toBeDisabled()
  })

  it("takes its words from labels", () => {
    render(<ColumnChooserPanel columns={columns} columnState={EMPTY_COLUMN_STATE} onColumnStateChange={() => {}} labels={{ title: "Spalten", show: "Zeige", search: "Spalte finden" }} />)
    expect(screen.getByRole("group", { name: "Spalten" })).toBeInTheDocument()
    expect(screen.getByRole("checkbox", { name: "Zeige Price" })).toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: "Spalte finden" })).toBeInTheDocument()
  })
})

describe("ColumnChooser", () => {
  it("is the panel in the consumer's dialog, named by the title, closed on Escape through onOpenChange, and nothing when closed", () => {
    const onOpenChange = vi.fn()
    const { rerender } = render(<ColumnChooser open={false} onOpenChange={onOpenChange} columns={columns} columnState={EMPTY_COLUMN_STATE} onColumnStateChange={() => {}} />)
    expect(screen.queryByRole("dialog")).toBeNull()
    rerender(<ColumnChooser open onOpenChange={onOpenChange} columns={columns} columnState={EMPTY_COLUMN_STATE} onColumnStateChange={() => {}} />)
    const dialog = screen.getByRole("dialog", { name: "Columns" })
    expect(within(dialog).getByRole("group", { name: "Columns" }).dataset.slot).toBe("tradecn-column-chooser")
    expect(within(dialog).getByText(DEFAULT_COLUMN_CHOOSER_LABELS.description)).toBeInTheDocument()
    expect(within(dialog).getAllByRole("checkbox")).toHaveLength(5)
    fireEvent.keyDown(dialog, { key: "Escape" })
    expect(onOpenChange).toHaveBeenCalledWith(false, expect.anything())
  })
})
