import { createRef, Profiler, StrictMode, useState } from "react"
import { createPortal } from "react-dom"
import { renderToString } from "react-dom/server"
import { Button } from "@/components/ui/button"
import { ColumnSettingsPanel, ColumnSettingsDialog } from "@/demos/column-chooser"
import ColumnChooserInlineDemo from "@/demos/column-chooser-inline"
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { ColumnRule } from "@/registry/tradecn/lib/grid-rules"
import {
  ColumnChooser,
  ColumnChooserItem,
  ColumnChooserSearch,
  ColumnChooserVisibility,
  ColumnChooserMove,
  ColumnChooserName,
  ColumnChooserWidth,
  ColumnChooserResetAll,
  ColumnChooserResetWidth,
  useColumnChooser,
  useColumnChooserCommand,
  useColumnChooserItem,
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

describe("ColumnSettingsPanel", () => {
  const listed = () => [...document.querySelectorAll<HTMLElement>("[data-column]")].map((li) => li.dataset.column)

  it("lists every column with its checkbox, marks the frozen ones, prints the width, and says a rule in words beside its column", () => {
    render(<ColumnSettingsPanel columns={columns} columnState={{ order: [], widths: { px: 140 }, hidden: ["status"] }} onColumnStateChange={() => {}} rules={rules} />)
    const panel = screen.getByRole("group", { name: "Columns" })
    expect(panel.dataset.slot).toBe("tradecn-column-chooser")
    expect(panel.dataset.hidden).toBe("1")
    expect(listed()).toEqual(["id", "client", "px", "size", "status"])
    expect(screen.getByRole("checkbox", { name: "Show Price" })).toBeChecked()
    expect(screen.getByRole("checkbox", { name: "Show status" })).not.toBeChecked()
    expect(document.querySelectorAll("[data-column-frozen]")).toHaveLength(2)
    expect(within(document.querySelector('[data-column="px"]')!).getByText("140 px")).toBeInTheDocument()
    expect(document.querySelector('[data-column="px"] [data-column-rule="rich"]')).toHaveTextContent("Rich to the market")
    expect(document.querySelector('[data-column="size"] [data-column-rule="big"]')).toHaveTextContent("Size at or above 10,000,000")
    expect(screen.getByText("1 hidden")).toBeInTheDocument()
    // The width reset shows only where the state holds a width.
    expect(screen.getByRole("button", { name: "Reset width: Price" })).toBeVisible()
    expect(document.querySelector('[data-column="size"] button[aria-label="Reset width: Size"]')).toHaveAttribute("aria-hidden", "true")
    // A column hidden in its definition is not the trader's to show.
    expect(screen.queryByRole("checkbox", { name: "Show Internal" })).toBeNull()
  })

  it("writes every change through onColumnStateChange and keeps nothing: hide, show, move, reset a width, reset all", () => {
    const onChange = vi.fn()
    const state: ColumnState = { order: [], widths: { px: 140 }, hidden: [] }
    render(<ColumnSettingsPanel columns={columns} columnState={state} onColumnStateChange={onChange} />)
    fireEvent.click(screen.getByRole("checkbox", { name: "Show Price" }))
    expect(onChange).toHaveBeenLastCalledWith({ ...state, hidden: ["px"] })
    fireEvent.click(screen.getByRole("button", { name: "Move down: Price" }))
    expect(onChange).toHaveBeenLastCalledWith({ ...state, order: ["id", "client", "size", "px", "status", "internal"] })
    fireEvent.click(screen.getByRole("button", { name: "Move up: Client" }))
    expect(onChange).toHaveBeenLastCalledWith({ ...state, order: ["client", "id", "px", "size", "status", "internal"] })
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
    render(<ColumnSettingsPanel columns={columns} columnState={EMPTY_COLUMN_STATE} onColumnStateChange={onChange} />)
    const px = document.querySelector<HTMLElement>('[data-column="px"]')!
    fireEvent.keyDown(px, { key: "ArrowDown", altKey: true })
    expect(onChange).toHaveBeenLastCalledWith({ ...EMPTY_COLUMN_STATE, order: ["id", "client", "size", "px", "status", "internal"] })
    fireEvent.keyDown(px, { key: "ArrowDown" })
    expect(onChange).toHaveBeenCalledTimes(1)
    const status = document.querySelector<HTMLElement>('[data-column="status"]')!
    const dataTransfer = transfer()
    fireEvent.dragStart(status, { dataTransfer })
    expect(status.dataset.dragging).toBe("true")
    const over = fireEvent.dragOver(px, { dataTransfer })
    expect(over, "a drop on the same side is allowed").toBe(false)
    const id = document.querySelector<HTMLElement>('[data-column="id"]')!
    expect(fireEvent.dragOver(id, { dataTransfer }), "a drop across the frozen line is not").toBe(true)
    fireEvent.drop(px, { dataTransfer })
    expect(onChange).toHaveBeenLastCalledWith({ ...EMPTY_COLUMN_STATE, order: ["id", "client", "status", "px", "size", "internal"] })
    expect(status.dataset.dragging).toBeUndefined()
  })

  it("finds a column by its name or its key, and says when nothing matches", () => {
    render(<ColumnSettingsPanel columns={columns} columnState={EMPTY_COLUMN_STATE} onColumnStateChange={() => {}} />)
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
    render(<ColumnSettingsPanel columns={columns} columnState={EMPTY_COLUMN_STATE} onColumnStateChange={() => {}} labels={{ title: "Spalten", show: "Zeige", search: "Spalte finden" }} />)
    expect(screen.getByRole("group", { name: "Spalten" })).toBeInTheDocument()
    expect(screen.getByRole("checkbox", { name: "Zeige Price" })).toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: "Spalte finden" })).toBeInTheDocument()
  })
})

describe("ColumnChooser", () => {
  it("is the panel in the consumer's dialog, named by the title, closed on Escape through onOpenChange, and nothing when closed", () => {
    const onOpenChange = vi.fn()
    const { rerender } = render(<ColumnSettingsDialog children={null} open={false} onOpenChange={onOpenChange} columns={columns} columnState={EMPTY_COLUMN_STATE} onColumnStateChange={() => {}} />)
    expect(screen.queryByRole("dialog")).toBeNull()
    rerender(<ColumnSettingsDialog children={null} open onOpenChange={onOpenChange} columns={columns} columnState={EMPTY_COLUMN_STATE} onColumnStateChange={() => {}} />)
    const dialog = screen.getByRole("dialog", { name: "Columns" })
    expect(within(dialog).getByRole("group", { name: "Columns" }).dataset.slot).toBe("tradecn-column-chooser")
    expect(within(dialog).getByText(DEFAULT_COLUMN_CHOOSER_LABELS.description)).toBeInTheDocument()
    expect(within(dialog).getAllByRole("checkbox")).toHaveLength(5)
    fireEvent.keyDown(dialog, { key: "Escape" })
    expect(onOpenChange).toHaveBeenCalledWith(false, expect.anything())
  })
})

function transfer() {
  const data = new Map<string, string>()
  return { setData: (type: string, value: string) => data.set(type, value), getData: (type: string) => data.get(type) ?? "", get types() { return [...data.keys()] }, effectAllowed: "", dropEffect: "" }
}

function Controlled({ definitions = columns }: { definitions?: ColumnDef<Rfq>[] }) {
  const [state, setState] = useState<ColumnState>({ ...EMPTY_COLUMN_STATE, widths: { px: 140 }, hidden: ["size"] })
  return <ColumnSettingsPanel columns={definitions} columnState={state} onColumnStateChange={setState} />
}

describe("public composition", () => {
  it("supports another collection and native visibility control through shared behavior", () => {
    render(<ColumnChooserInlineDemo />)
    expect(screen.queryByRole("list")).toBeNull()
    expect(screen.queryByRole("contentinfo")).toBeNull()
    expect(screen.getByText("Counterparty name")).toBeVisible()
    expect(screen.getByRole("group", { name: "Client" })).toBeVisible()
    const toggle = screen.getByRole("checkbox", { name: "Show Client" })
    expect(toggle.tagName).toBe("INPUT")
    expect(toggle).not.toBeChecked()
    fireEvent.click(toggle)
    expect(toggle).toBeChecked()
    // The native checkbox stays out of the Tab order, and its declared command keeps Space live.
    expect(toggle).toHaveAttribute("tabindex", "-1")
    const card = screen.getByRole("group", { name: "Client" })
    act(() => card.focus())
    fireEvent.keyDown(card, { key: " " })
    expect(toggle).not.toBeChecked()
    fireEvent.keyDown(card, { key: " " })
    expect(toggle).toBeChecked()
    expect(screen.getByRole("button", { name: "Earlier: Client" })).toHaveTextContent("Earlier")
    fireEvent.click(screen.getByRole("button", { name: "Later: Client" }))
    expect([...document.querySelectorAll<HTMLElement>("[data-column]")].map(n => n.dataset.column)).toEqual(["id", "price", "client"])
    expect(screen.getByText("0 hidden")).toBeInTheDocument()
  })

  it("disables moves without a presented neighbor, keeps full hidden counts, and leaves search unchanged on reset", () => {
    render(<Controlled />)
    const search = screen.getByRole("textbox")
    fireEvent.change(search, { target: { value: "  PRICE  " } })
    expect(screen.getAllByRole("listitem")).toHaveLength(1)
    expect(screen.getByText("1 hidden")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Move down: Price" })).toBeDisabled()
    fireEvent.click(screen.getByRole("button", { name: "Move down: Price" }))
    fireEvent.change(search, { target: { value: "" } })
    expect([...document.querySelectorAll<HTMLElement>("[data-column]")].map(n => n.dataset.column)).toEqual(["id", "client", "px", "size", "status"])
    fireEvent.change(search, { target: { value: "price" } })
    fireEvent.click(screen.getByRole("button", { name: "Reset all" }))
    expect(search).toHaveValue("price")
    expect(screen.getByText("0 hidden")).toBeInTheDocument()
  })

  it("forwards native refs, names and events and lets callers cancel edit commands", () => {
    const root = createRef<HTMLDivElement>(), item = createRef<HTMLDivElement>(), input = createRef<HTMLInputElement>(), name = createRef<HTMLSpanElement>(), width = createRef<HTMLSpanElement>(), button = createRef<HTMLButtonElement>()
    const change = vi.fn(), click = vi.fn(), key = vi.fn()
    render(<ColumnChooser columns={columns} columnState={{ ...EMPTY_COLUMN_STATE, widths: { px: 140 } }} onColumnStateChange={change} ref={root} id="columns" role="region" tabIndex={0} title="settings" aria-labelledby="heading" onClick={click}>
      <h2 id="heading">Quote fields</h2>
      <ColumnChooserSearch ref={input} onChange={event => event.preventDefault()} />
      <ColumnChooserItem columnKey="px" ref={item} id="price" role="article" tabIndex={-1} draggable={false} aria-label="Order price" onKeyDown={event => { key(); event.preventDefault() }}>
        <ColumnChooserName ref={name} title="Current price" />
        <ColumnChooserWidth ref={width} />
        <ColumnChooserVisibility onClick={event => event.preventDefault()} />
        <ColumnChooserMove direction="down" ref={button} onClick={event => event.preventDefault()}>Later</ColumnChooserMove>
        <ColumnChooserResetWidth onClick={event => event.preventDefault()}>Reset width</ColumnChooserResetWidth>
      </ColumnChooserItem>
      <ColumnChooserResetAll onClick={event => event.preventDefault()}>Reset all</ColumnChooserResetAll>
    </ColumnChooser>)
    expect(root.current).toBe(screen.getByRole("region", { name: "Quote fields" }))
    expect(root.current).toHaveAttribute("tabindex", "0")
    expect(root.current).toHaveAttribute("title", "settings")
    expect(item.current).toBe(screen.getByRole("article", { name: "Order price" }))
    expect(item.current).toHaveAttribute("tabindex", "-1")
    expect(item.current).toHaveAttribute("draggable", "false")
    expect(name.current).toHaveAttribute("title", "Current price")
    expect(width.current).toHaveTextContent("140 px")
    fireEvent.change(input.current!, { target: { value: "ignored" } })
    expect(input.current).toHaveValue("")
    fireEvent.keyDown(item.current!, { key: "ArrowDown", altKey: true })
    fireEvent.click(button.current!)
    fireEvent.click(screen.getByRole("button", { name: "Reset width: Price" }))
    fireEvent.click(screen.getByRole("button", { name: "Reset all" }))
    fireEvent.click(screen.getByRole("checkbox"))
    expect(key).toHaveBeenCalledTimes(1)
    expect(click).toHaveBeenCalled()
    expect(change).not.toHaveBeenCalled()
  })

  it("recovers focus after reset controls disappear or disable, and after a focused column is removed", () => {
    const { rerender } = render(<Controlled />)
    const reset = screen.getByRole("button", { name: "Reset width: Price" })
    reset.focus()
    fireEvent.click(reset)
    expect(screen.getByRole("group", { name: "Price" })).toHaveFocus()
    const all = screen.getByRole("button", { name: "Reset all" })
    all.focus()
    fireEvent.click(all)
    expect(screen.getByRole("textbox")).toHaveFocus()
    screen.getByRole("checkbox", { name: "Show Price" }).focus()
    rerender(<Controlled definitions={columns.filter(column => column.key !== "px")} />)
    expect(screen.getByRole("textbox")).toHaveFocus()
  })

  it("keeps the root focus fallback and name when optional native props are undefined", () => {
    const optional = { role: undefined, tabIndex: undefined, "aria-label": undefined }
    const view = (definitions: ColumnDef<Rfq>[]) => <ColumnChooser {...optional} columns={definitions} columnState={EMPTY_COLUMN_STATE} onColumnStateChange={() => {}}>
      <ColumnChooserItem columnKey="px"><ColumnChooserVisibility /></ColumnChooserItem>
    </ColumnChooser>
    const { rerender } = render(view(columns))
    const root = screen.getByRole("group", { name: "Columns" })
    screen.getByRole("checkbox", { name: "Show Price" }).focus()
    rerender(view(columns.filter(column => column.key !== "px")))
    expect(root).toHaveFocus()
  })

  it("keeps item behavior and public reading names when optional native props are undefined", () => {
    const optional = { role: undefined, tabIndex: undefined, draggable: undefined, "aria-label": undefined }
    function Settings() {
      const [state, setState] = useState<ColumnState>({ ...EMPTY_COLUMN_STATE, widths: { px: 140 } })
      return <ColumnChooser columns={columns} columnState={state} onColumnStateChange={setState}>
        <ColumnChooserSearch aria-label={undefined} />
        <ColumnChooserItem {...optional} columnKey="px">
          <ColumnChooserVisibility aria-label={undefined} />
          <ColumnChooserWidth aria-label={undefined} />
          <ColumnChooserResetWidth aria-label={undefined}>Reset width</ColumnChooserResetWidth>
          <ColumnChooserMove direction="down" aria-label={undefined}>Later</ColumnChooserMove>
        </ColumnChooserItem>
      </ColumnChooser>
    }
    render(<Settings />)
    expect(screen.getByRole("group", { name: "Price" })).toHaveAttribute("draggable", "true")
    expect(screen.getByRole("textbox", { name: "Find a column" })).toBeVisible()
    expect(screen.getByRole("checkbox", { name: "Show Price" })).toBeVisible()
    expect(screen.getByLabelText("Width 140")).toHaveTextContent("140 px")
    expect(screen.getByRole("button", { name: "Move down: Price" })).toBeEnabled()
    const reset = screen.getByRole("button", { name: "Reset width: Price" })
    reset.focus()
    fireEvent.click(reset)
    expect(screen.getByRole("group", { name: "Price" })).toHaveFocus()
  })

  it("uses current rows and rules after replacement, and safely omits missing items", () => {
    const change = vi.fn()
    const view = (definitions: ColumnDef<Rfq>[], activeRules: ColumnRule[]) => <ColumnSettingsPanel columns={definitions} rules={activeRules} columnState={EMPTY_COLUMN_STATE} onColumnStateChange={change} />
    const { rerender } = render(view(columns, rules))
    rerender(view(columns.map(column => column.key === "px" ? { ...column, header: "Offer", width: 110 } : column), [{ ...rules[0]!, label: "   " }]))
    expect(screen.queryByRole("checkbox", { name: "Show Price" })).toBeNull()
    expect(screen.getByRole("checkbox", { name: "Show Offer" })).toBeInTheDocument()
    expect(screen.getByText("110 px")).toBeInTheDocument()
    expect(document.querySelector('[data-column-rule="rich"]')).toHaveTextContent("Offer above 100-00")
    rerender(view([], []))
    expect(screen.getByText(DEFAULT_COLUMN_CHOOSER_LABELS.empty)).toBeInTheDocument()
    expect(screen.queryByRole("checkbox")).toBeNull()
  })

  it("preserves distinct rule readings when rule IDs repeat within a column", () => {
    const repeated: ColumnRule[] = [
      { id: "same", column: "px", when: { op: "gte", value: "100" }, tone: "up", label: "High" },
      { id: "same", column: "px", when: { op: "lt", value: "90" }, tone: "down", label: "Low" },
    ]
    render(<ColumnSettingsPanel columns={columns} columnState={EMPTY_COLUMN_STATE} onColumnStateChange={() => {}} rules={repeated} />)
    const readings = document.querySelectorAll('[data-column-rule="same"]')
    expect([...readings].map(node => [node.textContent, node.getAttribute("title")])).toEqual([["High", "Price at or above 100"], ["Low", "Price below 90"]])
  })

  it("keeps drag sessions local and rejects foreign payloads", () => {
    const left = vi.fn(), right = vi.fn()
    render(<><ColumnSettingsPanel columns={columns} columnState={EMPTY_COLUMN_STATE} onColumnStateChange={left} aria-label="Left" /><ColumnSettingsPanel columns={columns} columnState={EMPTY_COLUMN_STATE} onColumnStateChange={right} aria-label="Right" /></>)
    const a = within(screen.getByRole("group", { name: "Left" })), b = within(screen.getByRole("group", { name: "Right" }))
    const dataTransfer = transfer()
    dataTransfer.setData("text/plain", "status")
    fireEvent.drop(a.getByRole("group", { name: "Price" }), { dataTransfer })
    expect(left).not.toHaveBeenCalled()
    fireEvent.dragStart(a.getByRole("group", { name: "status" }), { dataTransfer })
    expect(fireEvent.dragOver(b.getByRole("group", { name: "Price" }), { dataTransfer })).toBe(true)
    fireEvent.drop(b.getByRole("group", { name: "Price" }), { dataTransfer })
    expect(right).not.toHaveBeenCalled()
    fireEvent.drop(a.getByRole("group", { name: "Price" }), { dataTransfer })
    expect(left).toHaveBeenCalledTimes(1)
  })

  it("supports empty column keys and clears a drag when its source disappears", () => {
    const definitions = columns.map(column => column.key === "status" ? { ...column, key: "", header: "Empty key" } : column)
    const change = vi.fn()
    const { rerender } = render(<ColumnSettingsPanel columns={definitions} columnState={EMPTY_COLUMN_STATE} onColumnStateChange={change} />)
    const dataTransfer = transfer()
    fireEvent.dragStart(screen.getByRole("group", { name: "Empty key" }), { dataTransfer })
    fireEvent.drop(screen.getByRole("group", { name: "Price" }), { dataTransfer })
    expect(change).toHaveBeenLastCalledWith({ ...EMPTY_COLUMN_STATE, order: ["id", "client", "", "px", "size", "internal"] })
    change.mockClear()
    fireEvent.dragStart(screen.getByRole("group", { name: "Empty key" }), { dataTransfer })
    rerender(<ColumnSettingsPanel columns={definitions.filter(column => column.key !== "")} columnState={EMPTY_COLUMN_STATE} onColumnStateChange={change} />)
    rerender(<ColumnSettingsPanel columns={definitions} columnState={EMPTY_COLUMN_STATE} onColumnStateChange={change} />)
    expect(screen.getByRole("group", { name: "Empty key" })).not.toHaveAttribute("data-dragging")
    fireEvent.drop(screen.getByRole("group", { name: "Price" }), { dataTransfer })
    expect(change).not.toHaveBeenCalled()
  })

  it("keeps item keyboard and drag ownership when callers supply a slot marker", () => {
    const change = vi.fn()
    render(<ColumnChooser columns={columns} columnState={EMPTY_COLUMN_STATE} onColumnStateChange={change}>
      <ColumnChooserItem columnKey="px" data-slot="application-column"><ColumnChooserName /></ColumnChooserItem>
      <ColumnChooserItem columnKey="size"><ColumnChooserName /></ColumnChooserItem>
    </ColumnChooser>)
    const price = screen.getByRole("group", { name: "Price" })
    const size = screen.getByRole("group", { name: "Size" })
    fireEvent.keyDown(price, { key: "ArrowDown", altKey: true })
    expect(change).toHaveBeenLastCalledWith({ ...EMPTY_COLUMN_STATE, order: ["id", "client", "size", "px", "status", "internal"] })
    change.mockClear()
    const dataTransfer = transfer()
    fireEvent.dragStart(price, { dataTransfer })
    fireEvent.drop(size, { dataTransfer })
    expect(change).toHaveBeenLastCalledWith({ ...EMPTY_COLUMN_STATE, order: ["id", "client", "size", "px", "status", "internal"] })
  })

  it("keeps search focus fallback when callers supply a root slot marker", () => {
    const view = (definitions: ColumnDef<Rfq>[]) => <ColumnChooser columns={definitions} columnState={EMPTY_COLUMN_STATE} onColumnStateChange={() => {}} data-slot="application-settings">
      <ColumnChooserSearch />
      <ColumnChooserItem columnKey="px"><ColumnChooserVisibility /></ColumnChooserItem>
    </ColumnChooser>
    const { rerender } = render(view(columns))
    screen.getByRole("checkbox", { name: "Show Price" }).focus()
    rerender(view([]))
    expect(screen.getByRole("textbox", { name: "Find a column" })).toHaveFocus()
  })

  it("allows dragging rendered full rows that do not match the search query", () => {
    function FullRows() {
      const { rows } = useColumnChooser()
      return rows.map(row => <ColumnChooserItem key={row.key} columnKey={row.key}><ColumnChooserName /></ColumnChooserItem>)
    }
    const change = vi.fn()
    render(<ColumnChooser columns={columns} columnState={EMPTY_COLUMN_STATE} onColumnStateChange={change}><ColumnChooserSearch /><FullRows /></ColumnChooser>)
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Size" } })
    const dataTransfer = transfer()
    fireEvent.dragStart(screen.getByRole("group", { name: "Price" }), { dataTransfer })
    fireEvent.drop(screen.getByRole("group", { name: "Size" }), { dataTransfer })
    expect(change).toHaveBeenLastCalledWith({ ...EMPTY_COLUMN_STATE, order: ["id", "client", "size", "px", "status", "internal"] })
  })

  it("recovers focus when a custom control becomes inert during a chooser update", () => {
    function Settings() {
      const [inert, setInert] = useState(false)
      return <ColumnChooser columns={columns} columnState={EMPTY_COLUMN_STATE} onColumnStateChange={() => {}}>
        <ColumnChooserItem columnKey="px"><div inert={inert}><input aria-label="Price draft" onKeyDown={() => setInert(true)} /></div></ColumnChooserItem>
      </ColumnChooser>
    }
    render(<Settings />)
    const input = screen.getByRole("textbox", { name: "Price draft" })
    input.focus()
    fireEvent.keyDown(input, { key: "Enter" })
    expect(screen.getByRole("group", { name: "Price" })).toHaveFocus()
  })

  it("retains focus on a disabled control that explicitly stays in the tab order", () => {
    function Settings() {
      const [disabled, setDisabled] = useState(false)
      return <ColumnChooser columns={columns} columnState={EMPTY_COLUMN_STATE} onColumnStateChange={() => {}}>
        <ColumnChooserItem columnKey="px"><button type="button" aria-disabled={disabled} onClick={() => setDisabled(true)}>Keep available for focus</button></ColumnChooserItem>
      </ColumnChooser>
    }
    render(<Settings />)
    const button = screen.getByRole("button", { name: "Keep available for focus" })
    button.focus()
    fireEvent.click(button)
    expect(button).toHaveFocus()
  })

  it("preserves autofocus during StrictMode replay and hands off only real item removal", async () => {
    function Items() {
      const [shown, setShown] = useState(false)
      return <>
        <button type="button" onClick={() => setShown(true)}>Add draft</button>
        {shown && <ColumnChooserItem columnKey="px"><input autoFocus aria-label="Price draft" onKeyDown={(event) => {
          if (event.key === "Escape") setShown(false)
        }} /></ColumnChooserItem>}
      </>
    }
    render(<StrictMode>
      <button type="button">Outside</button>
      <ColumnChooser columns={columns} columnState={EMPTY_COLUMN_STATE} onColumnStateChange={() => {}}><ColumnChooserSearch /><Items /></ColumnChooser>
    </StrictMode>)
    const add = screen.getByRole("button", { name: "Add draft" })
    fireEvent.click(add)
    const draft = screen.getByRole("textbox", { name: "Price draft" })
    expect(draft).toHaveFocus()
    fireEvent.keyDown(draft, { key: "Escape" })
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Find a column" })).toHaveFocus())
    fireEvent.click(add)
    const next = screen.getByRole("textbox", { name: "Price draft" })
    expect(next).toHaveFocus()
    fireEvent.keyDown(next, { key: "Escape" })
    const outside = screen.getByRole("button", { name: "Outside" })
    outside.focus()
    await Promise.resolve()
    expect(outside).toHaveFocus()
  })

  it("preserves explicit installed Button sizes for all actions", () => {
    const { container } = render(<>
      <Button size="lg" variant="ghost">Reference</Button>
      <ColumnChooser columns={columns} columnState={{ ...EMPTY_COLUMN_STATE, widths: { px: 140 } }} onColumnStateChange={() => {}}>
        <ColumnChooserResetAll type={undefined} size="lg" variant="ghost">Reset all</ColumnChooserResetAll>
        <ColumnChooserItem columnKey="px">
          <ColumnChooserResetWidth type={undefined} size="lg" variant={undefined}>Reset width</ColumnChooserResetWidth>
          <ColumnChooserMove type={undefined} direction="down" size="lg" variant={undefined}>Later</ColumnChooserMove>
        </ColumnChooserItem>
      </ColumnChooser>
    </>)
    const reference = screen.getByRole("button", { name: "Reference" })
    for (const button of container.querySelectorAll("button")) {
      expect(button.className).toBe(reference.className)
      expect(button.type).toBe("button")
    }
  })

  it.each(["display", "visibility"] as const)("recovers focus when a custom control hides through CSS %s", (property) => {
    function Control() {
      const { row, setVisible } = useColumnChooserItem()
      return <button type="button" style={row.visible ? undefined : property === "display" ? { display: "none" } : { visibility: "hidden" }} onClick={() => setVisible(false)}>Hide price</button>
    }
    function Settings() {
      const [columnState, setColumnState] = useState(EMPTY_COLUMN_STATE)
      return <ColumnChooser columns={columns} columnState={columnState} onColumnStateChange={setColumnState}><ColumnChooserItem columnKey="px"><ColumnChooserName /><Control /></ColumnChooserItem></ColumnChooser>
    }
    render(<Settings />)
    const hide = screen.getByRole("button", { name: "Hide price" })
    hide.focus()
    fireEvent.click(hide)
    expect(screen.getByRole("group", { name: "Price" })).toHaveFocus()
  })

  it("does not reclaim focus after an intentional blur", () => {
    const { rerender } = render(<Controlled />)
    const checkbox = screen.getByRole("checkbox", { name: "Show Price" })
    checkbox.focus()
    checkbox.blur()
    expect(document.body).toHaveFocus()
    rerender(<Controlled definitions={[...columns]} />)
    expect(document.body).toHaveFocus()
  })

  it("keeps nested chooser drags and keyboard events inside their owner", () => {
    const outerChange = vi.fn(), innerChange = vi.fn()
    const { container } = render(<ColumnChooser columns={columns} columnState={EMPTY_COLUMN_STATE} onColumnStateChange={outerChange}>
      <ColumnChooserItem columnKey="px" id="outer-price">
        <ColumnChooserName />
        <ColumnChooser columns={columns} columnState={EMPTY_COLUMN_STATE} onColumnStateChange={innerChange}>
          <ColumnChooserSearch />
          <ColumnChooserItem columnKey="px" id="inner-price"><ColumnChooserName /></ColumnChooserItem>
          <ColumnChooserItem columnKey="size" id="inner-size"><ColumnChooserName /></ColumnChooserItem>
        </ColumnChooser>
      </ColumnChooserItem>
      <ColumnChooserItem columnKey="size" id="outer-size"><ColumnChooserName /></ColumnChooserItem>
    </ColumnChooser>)
    const dataTransfer = transfer()
    fireEvent.dragStart(container.querySelector("#inner-price")!, { dataTransfer })
    expect(container.querySelector("#outer-price")).not.toHaveAttribute("data-dragging")
    fireEvent.drop(container.querySelector("#outer-size")!, { dataTransfer })
    expect(outerChange).not.toHaveBeenCalled()
    fireEvent.drop(container.querySelector("#inner-size")!, { dataTransfer })
    expect(innerChange).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "ArrowDown", altKey: true })
    expect(outerChange).not.toHaveBeenCalled()
  })

  it("does not treat portaled controls as item reorder controls", () => {
    const change = vi.fn()
    render(<ColumnChooser columns={columns} columnState={EMPTY_COLUMN_STATE} onColumnStateChange={change}>
      <ColumnChooserItem columnKey="px"><ColumnChooserName />{createPortal(<input aria-label="Separate editor" />, document.body)}</ColumnChooserItem>
    </ColumnChooser>)
    const input = screen.getByRole("textbox", { name: "Separate editor" })
    input.focus()
    fireEvent.keyDown(input, { key: "ArrowDown", altKey: true })
    expect(change).not.toHaveBeenCalled()
    expect(input).toHaveFocus()
  })

  it("fails clearly when a behavior hook is outside its owner", () => {
    function OutsideRoot() { useColumnChooser(); return null }
    function OutsideItem() { useColumnChooserItem(); return null }
    vi.spyOn(console, "error").mockImplementation(() => {})
    expect(() => render(<OutsideRoot />)).toThrow("inside ColumnChooser")
    expect(() => render(<OutsideItem />)).toThrow("inside ColumnChooserItem")
  })
})

describe("the keyboard model scales to wide grids", () => {
  const many: ColumnDef<Rfq>[] = Array.from({ length: 100 }, (_, i) => ({ key: `c${i}`, header: `Column ${i}`, width: 80, accessor: (r) => r.id }))
  const tabStops = (root: HTMLElement) => root.querySelectorAll('input:not([disabled]):not([tabindex="-1"]), button:not([disabled]):not([tabindex="-1"]), [tabindex="0"]').length

  function Controlled({ cols = many, initial = EMPTY_COLUMN_STATE, onChange }: { cols?: ColumnDef<Rfq>[]; initial?: ColumnState; onChange?: (state: ColumnState) => void }) {
    const [state, setState] = useState(initial)
    return <ColumnSettingsPanel columns={cols} columnState={state} onColumnStateChange={(next) => { setState(next); onChange?.(next) }} />
  }

  it("keeps one tab stop in the collection for 100 columns", () => {
    render(<Controlled />)
    expect(tabStops(screen.getByRole("group", { name: "Columns" }))).toBeLessThanOrEqual(3)
    const items = screen.getAllByRole("group", { name: /^Column / })
    expect(items.filter((item) => item.getAttribute("tabindex") === "0")).toEqual([items[0]])
    expect(items.filter((item) => item.getAttribute("tabindex") === "-1")).toHaveLength(99)
  })

  it("moves focus between columns with the arrows, and to the edges with Home and End", () => {
    render(<Controlled />)
    const first = screen.getByRole("group", { name: "Column 0" })
    first.focus()
    fireEvent.keyDown(first, { key: "ArrowDown" })
    const second = screen.getByRole("group", { name: "Column 1" })
    expect(document.activeElement).toBe(second)
    expect(second.getAttribute("tabindex")).toBe("0")
    expect(first.getAttribute("tabindex")).toBe("-1")
    fireEvent.keyDown(second, { key: "End" })
    expect(document.activeElement).toBe(screen.getByRole("group", { name: "Column 99" }))
    fireEvent.keyDown(screen.getByRole("group", { name: "Column 99" }), { key: "Home" })
    expect(document.activeElement).toBe(first)
    fireEvent.keyDown(first, { key: "ArrowUp" })
    expect(document.activeElement).toBe(first)
  })

  it("moves a column to the edge of its side in one step with Alt+Home and Alt+End", () => {
    let saved = EMPTY_COLUMN_STATE
    render(<Controlled onChange={(next) => { saved = next }} />)
    fireEvent.keyDown(screen.getByRole("group", { name: "Column 90" }), { key: "Home", altKey: true })
    expect(saved.order[0]).toBe("c90")
    fireEvent.keyDown(screen.getByRole("group", { name: "Column 90" }), { key: "End", altKey: true })
    expect(saved.order[saved.order.length - 1]).toBe("c90")
  })

  it("keeps an edge move on its own side of the frozen line", () => {
    let saved = EMPTY_COLUMN_STATE
    render(<Controlled cols={columns} onChange={(next) => { saved = next }} />)
    fireEvent.keyDown(screen.getByRole("group", { name: "RFQ" }), { key: "End", altKey: true })
    expect(saved.order.slice(0, 2)).toEqual(["client", "id"])
    fireEvent.keyDown(screen.getByRole("group", { name: "status" }), { key: "Home", altKey: true })
    expect(saved.order).toEqual(["client", "id", "status", "px", "size", "internal"])
    saved = EMPTY_COLUMN_STATE
    fireEvent.keyDown(screen.getByRole("group", { name: "status" }), { key: "Home", altKey: true })
    expect(saved).toBe(EMPTY_COLUMN_STATE)
  })

  it("shows or hides the focused column with Space, only from the item itself", () => {
    let saved: ColumnState | null = null
    render(<Controlled cols={columns} initial={{ ...EMPTY_COLUMN_STATE, widths: { px: 140 } }} onChange={(next) => { saved = next }} />)
    const item = screen.getByRole("group", { name: "Price" })
    item.focus()
    fireEvent.keyDown(item, { key: " " })
    expect(saved!.hidden).toEqual(["px"])
    expect(item).toHaveAttribute("aria-description", "hidden")
    expect(item).toHaveAttribute("aria-keyshortcuts", "Space Alt+ArrowUp Alt+ArrowDown Alt+Home Alt+End Delete Backspace")
    fireEvent.keyDown(item, { key: " " })
    expect(saved!.hidden).toEqual([])
    expect(item).not.toHaveAttribute("aria-description")
    saved = null
    fireEvent.keyDown(screen.getByRole("checkbox", { name: "Show Price" }), { key: " " })
    expect(saved).toBeNull()
  })

  it("resets a resized column's width with Delete from the item itself", () => {
    let saved: ColumnState | null = null
    render(<Controlled cols={columns} initial={{ ...EMPTY_COLUMN_STATE, widths: { px: 200 } }} onChange={(next) => { saved = next }} />)
    const item = screen.getByRole("group", { name: "Size" })
    item.focus()
    fireEvent.keyDown(item, { key: "Delete" })
    expect(saved).toBeNull()
    const resized = screen.getByRole("group", { name: "Price" })
    resized.focus()
    expect(resized).toHaveAttribute("aria-keyshortcuts", "Space Alt+ArrowUp Alt+ArrowDown Alt+Home Alt+End Delete Backspace")
    fireEvent.keyDown(resized, { key: "Delete" })
    expect(saved!.widths).toEqual({})
    // The reset consumed the only resized width, so the shortcut leaves the metadata with it.
    expect(resized).toHaveAttribute("aria-keyshortcuts", "Space Alt+ArrowUp Alt+ArrowDown Alt+Home Alt+End")
  })

  it("moves the tab stop with pointer focus and keeps it valid when search filters the active column out", () => {
    render(<Controlled cols={columns} />)
    const size = screen.getByRole("group", { name: "Size" })
    fireEvent.focus(size)
    expect(size.getAttribute("tabindex")).toBe("0")
    expect(screen.getByRole("group", { name: "RFQ" }).getAttribute("tabindex")).toBe("-1")
    const search = screen.getByRole("textbox", { name: "Find a column" })
    search.focus()
    fireEvent.change(search, { target: { value: "price" } })
    expect(document.activeElement).toBe(search)
    expect(screen.getByRole("group", { name: "Price" }).getAttribute("tabindex")).toBe("0")
  })

  it("navigates from a pointer-focused inner control and keeps arrows native inside caller text fields", () => {
    render(<Controlled cols={columns} />)
    const move = screen.getByRole("button", { name: "Move down: RFQ" })
    expect(move.getAttribute("tabindex")).toBe("-1")
    move.focus()
    fireEvent.keyDown(move, { key: "ArrowDown" })
    expect(document.activeElement).toBe(screen.getByRole("group", { name: "Client" }))
    const onChange = vi.fn()
    render(<ColumnChooser columns={columns} columnState={EMPTY_COLUMN_STATE} onColumnStateChange={onChange}>
      <ColumnChooserItem columnKey="px"><input aria-label="Note" /></ColumnChooserItem>
      <ColumnChooserItem columnKey="size"><ColumnChooserName /></ColumnChooserItem>
    </ColumnChooser>)
    const note = screen.getByRole("textbox", { name: "Note" })
    note.focus()
    fireEvent.keyDown(note, { key: "ArrowDown" })
    expect(document.activeElement).toBe(note)
  })

  it("leaves every arrow chord to a caller ARIA widget that owns its arrows", () => {
    const onChange = vi.fn()
    render(<ColumnChooser columns={columns} columnState={EMPTY_COLUMN_STATE} onColumnStateChange={onChange}>
      <ColumnChooserItem columnKey="px">
        <div role="slider" aria-label="Spread" aria-valuenow={1} aria-valuemin={0} aria-valuemax={9} tabIndex={-1} />
        <button type="button" role="combobox" aria-label="Venue" aria-expanded={false} />
        <span role="unsupported slider" data-testid="fallback-widget">1</span>
        <div role="separator" aria-orientation="vertical" aria-valuenow={40} tabIndex={-1} data-testid="splitter" />
        <div role="toolbar" aria-label="Column tools" aria-orientation="vertical"><button type="button" tabIndex={-1}>Pin</button></div>
      </ColumnChooserItem>
      <ColumnChooserItem columnKey="size"><ColumnChooserName /></ColumnChooserItem>
    </ColumnChooser>)
    const slider = screen.getByRole("slider", { name: "Spread" })
    slider.focus()
    expect(fireEvent.keyDown(slider, { key: "ArrowDown" })).toBe(true)
    expect(document.activeElement).toBe(slider)
    const venue = screen.getByRole("combobox", { name: "Venue" })
    expect(fireEvent.keyDown(venue, { key: "ArrowDown", altKey: true })).toBe(true)
    expect(fireEvent.keyDown(venue, { key: "End" })).toBe(true)
    expect(fireEvent.keyDown(screen.getByTestId("fallback-widget"), { key: "ArrowUp" })).toBe(true)
    expect(fireEvent.keyDown(screen.getByTestId("splitter"), { key: "ArrowDown" })).toBe(true)
    const toolbarButton = within(screen.getByRole("toolbar", { name: "Column tools" })).getByRole("button", { name: "Pin" })
    toolbarButton.focus()
    expect(fireEvent.keyDown(toolbarButton, { key: "ArrowDown" })).toBe(true)
    expect(fireEvent.keyDown(toolbarButton, { key: "Home" })).toBe(true)
    expect(document.activeElement).toBe(toolbarButton)
    expect(onChange).not.toHaveBeenCalled()
    const item = screen.getByRole("group", { name: "Price" })
    item.focus()
    expect(fireEvent.keyDown(item, { key: "ArrowDown" })).toBe(false)
    expect(document.activeElement).toBe(screen.getByRole("group", { name: "Size" }))
  })

  it("keeps the tab stop with a coordinated item when another opts out", () => {
    render(<ColumnChooser columns={columns} columnState={EMPTY_COLUMN_STATE} onColumnStateChange={() => {}}>
      <ColumnChooserItem columnKey="id" tabIndex={-1} aria-label="RFQ card"><ColumnChooserName /></ColumnChooserItem>
      <ColumnChooserItem columnKey="client"><ColumnChooserName /></ColumnChooserItem>
    </ColumnChooser>)
    const optedOut = screen.getByLabelText("RFQ card")
    const sibling = screen.getByRole("group", { name: "Client" })
    expect(optedOut).toHaveAttribute("tabindex", "-1")
    expect(sibling).toHaveAttribute("tabindex", "0")
    fireEvent.focus(optedOut)
    expect(sibling).toHaveAttribute("tabindex", "0")
    expect(optedOut).toHaveAttribute("tabindex", "-1")
  })

  it("leaves an editable item every key", () => {
    const onChange = vi.fn()
    render(<ColumnChooser columns={columns} columnState={EMPTY_COLUMN_STATE} onColumnStateChange={onChange}>
      <ColumnChooserItem columnKey="id" contentEditable suppressContentEditableWarning aria-label="RFQ note"><ColumnChooserName /></ColumnChooserItem>
      <ColumnChooserItem columnKey="client"><ColumnChooserName /></ColumnChooserItem>
    </ColumnChooser>)
    const note = screen.getByLabelText("RFQ note")
    note.focus()
    expect(fireEvent.keyDown(note, { key: "ArrowDown" })).toBe(true)
    expect(fireEvent.keyDown(note, { key: "Home" })).toBe(true)
    expect(fireEvent.keyDown(note, { key: " " })).toBe(true)
    expect(fireEvent.keyDown(note, { key: "Delete" })).toBe(true)
    expect(fireEvent.keyDown(note, { key: "ArrowDown", altKey: true })).toBe(true)
    expect(document.activeElement).toBe(note)
    expect(onChange).not.toHaveBeenCalled()
  })

  it("settles with inline callback refs on a subscribed collection", () => {
    // A collection reading useColumnChooser re-renders with the chooser, so inline refs change
    // identity every pass; registration must not re-run on ref identity or the two loop.
    function Cards() {
      useColumnChooser()
      return (
        <>
          <ColumnChooserItem columnKey="id" ref={() => {}} aria-label="RFQ card"><ColumnChooserName /></ColumnChooserItem>
          <ColumnChooserItem columnKey="client" ref={() => {}}><ColumnChooserName /></ColumnChooserItem>
        </>
      )
    }
    render(<ColumnChooser columns={columns} columnState={EMPTY_COLUMN_STATE} onColumnStateChange={() => {}}><Cards /></ColumnChooser>)
    expect(screen.getByLabelText("RFQ card")).toHaveAttribute("tabindex", "0")
    expect(screen.getByRole("group", { name: "Client" })).toHaveAttribute("tabindex", "-1")
  })

  it("hands the stop to a coordinated item at hydration when the first opts out", () => {
    const ui = (
      <ColumnChooser columns={columns} columnState={EMPTY_COLUMN_STATE} onColumnStateChange={() => {}}>
        <ColumnChooserItem columnKey="id" tabIndex={-1} aria-label="RFQ card"><ColumnChooserName /></ColumnChooserItem>
        <ColumnChooserItem columnKey="client"><ColumnChooserName /></ColumnChooserItem>
      </ColumnChooser>
    )
    const container = document.createElement("div")
    document.body.append(container)
    container.innerHTML = renderToString(ui)
    // Static markup carries no stop; no handler is attached before hydration either.
    expect(container.querySelectorAll("[data-slot='tradecn-column-chooser-item'][tabindex='0']")).toHaveLength(0)
    render(ui, { container, hydrate: true })
    expect(screen.getByRole("group", { name: "Client" })).toHaveAttribute("tabindex", "0")
    expect(screen.getByLabelText("RFQ card")).toHaveAttribute("tabindex", "-1")
  })

  it("runs Space and Delete only where the matching control is rendered, and once per press", () => {
    const onChange = vi.fn()
    render(<ColumnChooser columns={columns} columnState={{ ...EMPTY_COLUMN_STATE, widths: { client: 140 } }} onColumnStateChange={onChange}>
      <ColumnChooserItem columnKey="id" aria-label="Bare card"><ColumnChooserName /></ColumnChooserItem>
      <ColumnChooserItem columnKey="client" aria-label="Full card"><ColumnChooserName /><ColumnChooserVisibility /><ColumnChooserResetWidth>Reset</ColumnChooserResetWidth></ColumnChooserItem>
    </ColumnChooser>)
    const bare = screen.getByLabelText("Bare card")
    const full = screen.getByLabelText("Full card")
    // A visible-only layout renders no visibility control, so Space passes through untouched.
    act(() => bare.focus())
    expect(fireEvent.keyDown(bare, { key: " " })).toBe(true)
    expect(fireEvent.keyDown(bare, { key: "Delete" })).toBe(true)
    expect(onChange).not.toHaveBeenCalled()
    expect(bare).toHaveAttribute("aria-keyshortcuts", "Alt+ArrowUp Alt+ArrowDown Alt+Home Alt+End")
    expect(full).toHaveAttribute("aria-keyshortcuts", "Space Alt+ArrowUp Alt+ArrowDown Alt+Home Alt+End Delete Backspace")
    // A held Space toggles once but every handled press cancels, or repeats scroll the page.
    act(() => full.focus())
    expect(fireEvent.keyDown(full, { key: " ", repeat: true })).toBe(false)
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.keyDown(full, { key: " " })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.lastCall![0].hidden).toEqual(["client"])
  })

  it("keeps the command when one of two bare declarations leaves", () => {
    const onChange = vi.fn()
    function Extra({ on }: { on: boolean }) {
      return on ? <ExtraCommand /> : null
    }
    function ExtraCommand() {
      useColumnChooserCommand("visibility")
      return null
    }
    function BaseCommand() {
      useColumnChooserCommand("visibility")
      return null
    }
    const ui = (on: boolean) => (
      <ColumnChooser columns={columns} columnState={EMPTY_COLUMN_STATE} onColumnStateChange={onChange}>
        <ColumnChooserItem columnKey="px" aria-label="Price card"><ColumnChooserName /><BaseCommand /><Extra on={on} /></ColumnChooserItem>
      </ColumnChooser>
    )
    const view = render(ui(true))
    const card = screen.getByLabelText("Price card")
    view.rerender(ui(false))
    act(() => card.focus())
    fireEvent.keyDown(card, { key: " " })
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it("treats a read-only visibility control as keyless", () => {
    const onChange = vi.fn()
    render(
      <ColumnChooser columns={columns} columnState={EMPTY_COLUMN_STATE} onColumnStateChange={onChange}>
        <ColumnChooserItem columnKey="px" aria-label="Price card"><ColumnChooserName /><ColumnChooserVisibility readOnly /></ColumnChooserItem>
      </ColumnChooser>,
    )
    const card = screen.getByLabelText("Price card")
    act(() => card.focus())
    expect(fireEvent.keyDown(card, { key: " " })).toBe(true)
    expect(onChange).not.toHaveBeenCalled()
    expect(card).toHaveAttribute("aria-keyshortcuts", "Alt+ArrowUp Alt+ArrowDown Alt+Home Alt+End")
  })

  it("advertises nothing on an item that keeps its native keys", () => {
    render(
      <ColumnChooser columns={columns} columnState={{ ...EMPTY_COLUMN_STATE, widths: { px: 140 } }} onColumnStateChange={() => {}}>
        <ColumnChooserItem columnKey="px" role="option" aria-label="Option card"><ColumnChooserName /><ColumnChooserVisibility /><ColumnChooserResetWidth>Reset</ColumnChooserResetWidth></ColumnChooserItem>
        <ColumnChooserItem columnKey="client" contentEditable suppressContentEditableWarning aria-label="Editable card"><ColumnChooserName /></ColumnChooserItem>
      </ColumnChooser>,
    )
    expect(screen.getByLabelText("Option card")).not.toHaveAttribute("aria-keyshortcuts")
    expect(screen.getByLabelText("Editable card")).not.toHaveAttribute("aria-keyshortcuts")
  })

  it("suspends a command while its control sits in a disabled fieldset", () => {
    const onChange = vi.fn()
    function Card({ off }: { off: boolean }) {
      return (
        <ColumnChooser columns={columns} columnState={{ ...EMPTY_COLUMN_STATE, widths: { px: 140 } }} onColumnStateChange={onChange}>
          <ColumnChooserItem columnKey="px" aria-label="Price card">
            <ColumnChooserName />
            <fieldset disabled={off || undefined}><ColumnChooserVisibility /><ColumnChooserResetWidth>Reset</ColumnChooserResetWidth></fieldset>
          </ColumnChooserItem>
        </ColumnChooser>
      )
    }
    const { rerender } = render(<Card off />)
    const card = screen.getByLabelText("Price card")
    act(() => card.focus())
    // Not claimed: the key passes through exactly like a declared-disabled control's.
    expect(fireEvent.keyDown(card, { key: "Delete" })).toBe(true)
    expect(fireEvent.keyDown(card, { key: " " })).toBe(true)
    expect(onChange).not.toHaveBeenCalled()
    rerender(<Card off={false} />)
    expect(fireEvent.keyDown(card, { key: "Delete" })).toBe(false)
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it("lets a disabled control's key pass through until it enables", () => {
    const onChange = vi.fn()
    function Card({ off }: { off: boolean }) {
      return (
        <ColumnChooser columns={columns} columnState={{ ...EMPTY_COLUMN_STATE, widths: { px: 140 } }} onColumnStateChange={onChange}>
          <ColumnChooserItem columnKey="px" aria-label="Price card"><ColumnChooserName /><ColumnChooserVisibility disabled={off} /><ColumnChooserResetWidth disabled={off}>Reset</ColumnChooserResetWidth></ColumnChooserItem>
        </ColumnChooser>
      )
    }
    const { rerender } = render(<Card off />)
    const card = screen.getByLabelText("Price card")
    act(() => card.focus())
    expect(fireEvent.keyDown(card, { key: " " })).toBe(true)
    expect(fireEvent.keyDown(card, { key: "Delete" })).toBe(true)
    expect(onChange).not.toHaveBeenCalled()
    expect(card).toHaveAttribute("aria-keyshortcuts", "Alt+ArrowUp Alt+ArrowDown Alt+Home Alt+End")
    rerender(<Card off={false} />)
    fireEvent.keyDown(card, { key: " " })
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it("hands the stop to a usable sibling when only the owner's item re-renders hidden", () => {
    function MaybeHidden() {
      const [hidden, setHidden] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setHidden((value) => !value)}>Toggle client</button>
          <ColumnChooserItem columnKey="client" aria-label="Client card" hidden={hidden || undefined}><ColumnChooserName /></ColumnChooserItem>
        </>
      )
    }
    render(
      <ColumnChooser columns={columns} columnState={EMPTY_COLUMN_STATE} onColumnStateChange={() => {}}>
        <MaybeHidden />
        <ColumnChooserItem columnKey="px" aria-label="Price card"><ColumnChooserName /></ColumnChooserItem>
      </ColumnChooser>,
    )
    const price = screen.getByLabelText("Price card")
    const client = screen.getByLabelText("Client card")
    const toggle = screen.getByRole("button", { name: "Toggle client" })
    expect(client).toHaveAttribute("tabindex", "0")
    expect(price).toHaveAttribute("tabindex", "-1")
    fireEvent.click(toggle)
    expect(price).toHaveAttribute("tabindex", "0")
    fireEvent.click(toggle)
    expect(client).toHaveAttribute("tabindex", "0")
    expect(price).toHaveAttribute("tabindex", "-1")
  })

  it("regains the stop when an external mask lifts without any chooser render", async () => {
    render(
      <div aria-hidden="true" data-testid="mask">
        <ColumnChooser columns={columns} columnState={EMPTY_COLUMN_STATE} onColumnStateChange={() => {}}>
          <ColumnChooserItem columnKey="client" aria-label="Client card"><ColumnChooserName /></ColumnChooserItem>
          <ColumnChooserItem columnKey="px" aria-label="Price card"><ColumnChooserName /></ColumnChooserItem>
        </ColumnChooser>
      </div>,
    )
    const client = screen.getByLabelText("Client card")
    expect(client).toHaveAttribute("tabindex", "-1")
    // The modal closes by plain DOM mutation: no chooser state changes, no react render.
    screen.getByTestId("mask").removeAttribute("aria-hidden")
    await waitFor(() => expect(client).toHaveAttribute("tabindex", "0"))
  })

  it("hands the stop onward when only the owner's item re-renders aria-hidden", () => {
    function MaybeHidden() {
      const [hidden, setHidden] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setHidden((value) => !value)}>Veil client</button>
          <ColumnChooserItem columnKey="client" aria-label="Client card" aria-hidden={hidden || undefined}><ColumnChooserName /></ColumnChooserItem>
        </>
      )
    }
    render(
      <ColumnChooser columns={columns} columnState={EMPTY_COLUMN_STATE} onColumnStateChange={() => {}}>
        <MaybeHidden />
        <ColumnChooserItem columnKey="px" aria-label="Price card"><ColumnChooserName /></ColumnChooserItem>
      </ColumnChooser>,
    )
    const price = screen.getByLabelText("Price card")
    const client = screen.getByLabelText("Client card")
    expect(client).toHaveAttribute("tabindex", "0")
    fireEvent.click(screen.getByRole("button", { name: "Veil client" }))
    expect(price).toHaveAttribute("tabindex", "0")
    expect(client).toHaveAttribute("tabindex", "-1")
  })

  it("hands the stop onward when only the owner's item re-renders styled away", () => {
    function MaybeStyled() {
      const [gone, setGone] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setGone((value) => !value)}>Collapse client</button>
          <ColumnChooserItem columnKey="client" aria-label="Client card" style={gone ? { display: "none" } : undefined}><ColumnChooserName /></ColumnChooserItem>
        </>
      )
    }
    render(
      <ColumnChooser columns={columns} columnState={EMPTY_COLUMN_STATE} onColumnStateChange={() => {}}>
        <MaybeStyled />
        <ColumnChooserItem columnKey="px" aria-label="Price card"><ColumnChooserName /></ColumnChooserItem>
      </ColumnChooser>,
    )
    const price = screen.getByLabelText("Price card")
    const client = screen.getByLabelText("Client card")
    const toggle = screen.getByRole("button", { name: "Collapse client" })
    expect(client).toHaveAttribute("tabindex", "0")
    fireEvent.click(toggle)
    expect(price).toHaveAttribute("tabindex", "0")
    expect(client).toHaveAttribute("tabindex", "-1")
    fireEvent.click(toggle)
    expect(client).toHaveAttribute("tabindex", "0")
  })

  it("scans arrows and edges past unavailable and unregistered items", () => {
    render(
      <ColumnChooser columns={columns} columnState={EMPTY_COLUMN_STATE} onColumnStateChange={() => {}}>
        <ColumnChooserItem columnKey="client" aria-label="Client card"><ColumnChooserName /></ColumnChooserItem>
        <ColumnChooserItem columnKey="px" aria-label="Price card" hidden><ColumnChooserName /></ColumnChooserItem>
        <ColumnChooserItem columnKey="size" aria-label="Size card"><ColumnChooserName /></ColumnChooserItem>
      </ColumnChooser>,
    )
    const client = screen.getByLabelText("Client card")
    const size = screen.getByLabelText("Size card")
    // Down from Client skips the hidden Price card; id has no item, so End walks back to Size.
    act(() => client.focus())
    fireEvent.keyDown(client, { key: "ArrowDown" })
    expect(size).toHaveFocus()
    fireEvent.keyDown(size, { key: "ArrowUp" })
    expect(client).toHaveFocus()
    fireEvent.keyDown(client, { key: "End" })
    expect(size).toHaveFocus()
    fireEvent.keyDown(size, { key: "Home" })
    expect(client).toHaveFocus()
  })

  it("re-renders only the items a focus move touches", () => {
    const renders = vi.fn()
    function Harness() {
      const [state, setState] = useState<ColumnState>(EMPTY_COLUMN_STATE)
      return (
        <ColumnChooser columns={columns} columnState={state} onColumnStateChange={setState}>
          <ColumnChooserSearch />
          {columns.filter((column) => !column.hidden).map((column) => (
            <Profiler key={column.key} id={column.key} onRender={(id) => renders(id)}>
              <ColumnChooserItem columnKey={column.key}><ColumnChooserName /></ColumnChooserItem>
            </Profiler>
          ))}
        </ColumnChooser>
      )
    }
    render(<Harness />)
    const counts = () => renders.mock.calls.reduce<Record<string, number>>((all, [key]) => ({ ...all, [key]: (all[key] ?? 0) + 1 }), {})
    // Mount renders each item once, plus one ownership settle for the first coordinated item:
    // the provider does not subscribe to registrations, so there is no collection pass.
    expect(counts()).toEqual({ id: 2, client: 1, px: 1, size: 1, status: 1 })
    renders.mockClear()
    const first = screen.getByRole("group", { name: "RFQ" })
    act(() => first.focus())
    renders.mockClear()
    fireEvent.keyDown(first, { key: "ArrowDown" })
    // The step re-renders the two items whose ownership changed, and nothing else.
    expect(counts()).toEqual({ id: 1, client: 1 })
  })

  it("keeps the roving owner when arrows visit an opted-out item", () => {
    render(<ColumnChooser columns={columns} columnState={EMPTY_COLUMN_STATE} onColumnStateChange={() => {}}>
      <ColumnChooserItem columnKey="id"><ColumnChooserName /></ColumnChooserItem>
      <ColumnChooserItem columnKey="client" tabIndex={-1} aria-label="Client card"><ColumnChooserName /></ColumnChooserItem>
      <ColumnChooserItem columnKey="px"><ColumnChooserName /></ColumnChooserItem>
    </ColumnChooser>)
    const price = screen.getByRole("group", { name: "Price" })
    act(() => price.focus())
    expect(price).toHaveAttribute("tabindex", "0")
    fireEvent.keyDown(price, { key: "ArrowUp" })
    expect(document.activeElement).toBe(screen.getByLabelText("Client card"))
    expect(price).toHaveAttribute("tabindex", "0")
    expect(screen.getByLabelText("Client card")).toHaveAttribute("tabindex", "-1")
  })
})

// Compiled by the real project TypeScript check. Conditional composition is legitimate.
export function columnChooserMigrationTypes() {
  const base = { columns, columnState: EMPTY_COLUMN_STATE, onColumnStateChange: () => {} }
  const empty: boolean = false
  const positive = <ColumnChooser {...base}>{empty ? null : <ColumnChooserItem columnKey="px"><ColumnChooserName /></ColumnChooserItem>}</ColumnChooser>
  // @ts-expect-error Required composition: the old minimal inline call must not render silently empty.
  const noChildren = <ColumnChooser {...base} />
  // @ts-expect-error Dialog state belongs to the consumer's primitive, even when children are supplied.
  const oldOpen = <ColumnChooser {...base} open><span /></ColumnChooser>
  // @ts-expect-error Dialog callbacks belong to the consumer, independently of open.
  const oldOpenChange = <ColumnChooser {...base} onOpenChange={() => {}}><span /></ColumnChooser>
  // @ts-expect-error Item content belongs to the caller.
  const emptyItem = <ColumnChooserItem columnKey="px" />
  // @ts-expect-error Action content is caller-owned.
  const emptyMove = <ColumnChooserMove direction="up" />
  // @ts-expect-error The root owns the query; replace the input with the root hook to control another input.
  const inputValue = <ColumnChooserSearch value="price" />
  // @ts-expect-error The item owns visibility.
  const checked = <ColumnChooserVisibility checked />
  // @ts-expect-error Initial query also belongs to the root.
  const inputDefault = <ColumnChooserSearch defaultValue="price" />
  // @ts-expect-error Initial visibility belongs to the controlled column state.
  const defaultChecked = <ColumnChooserVisibility defaultChecked />
  // @ts-expect-error A column has visible or hidden state, not an indeterminate state.
  const indeterminate = <ColumnChooserVisibility indeterminate />
  return [positive, noChildren, oldOpen, oldOpenChange, emptyItem, emptyMove, inputValue, checked, inputDefault, defaultChecked, indeterminate]
}
