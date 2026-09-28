import { createRef, useState } from "react"
import { createPortal } from "react-dom"
import { Button } from "@/components/ui/button"
import { ColumnSettingsPanel, ColumnSettingsDialog } from "@/demos/column-chooser"
import ColumnChooserInlineDemo from "@/demos/column-chooser-inline"
import { fireEvent, render, screen, within } from "@testing-library/react"
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
    render(<ColumnSettingsPanel columns={columns} columnState={EMPTY_COLUMN_STATE} onColumnStateChange={onChange} />)
    const px = document.querySelector<HTMLElement>('[data-column="px"]')!
    fireEvent.keyDown(px, { key: "ArrowDown", altKey: true })
    expect(onChange).toHaveBeenLastCalledWith({ ...EMPTY_COLUMN_STATE, order: ["id", "client", "size", "px", "status"] })
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
    expect(onChange).toHaveBeenLastCalledWith({ ...EMPTY_COLUMN_STATE, order: ["id", "client", "status", "px", "size"] })
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
    expect(screen.getByRole("button", { name: "Earlier: Client" })).toHaveTextContent("Earlier")
    fireEvent.click(screen.getByRole("button", { name: "Later: Client" }))
    expect([...document.querySelectorAll<HTMLElement>("[data-column]")].map(n => n.dataset.column)).toEqual(["id", "price", "client"])
    expect(screen.getByText("0 hidden")).toBeInTheDocument()
  })

  it("keeps full-order moves and hidden counts while filtered, and leaves search unchanged on reset", () => {
    render(<Controlled />)
    const search = screen.getByRole("textbox")
    fireEvent.change(search, { target: { value: "  PRICE  " } })
    expect(screen.getAllByRole("listitem")).toHaveLength(1)
    expect(screen.getByText("1 hidden")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Move down: Price" }))
    fireEvent.change(search, { target: { value: "" } })
    expect([...document.querySelectorAll<HTMLElement>("[data-column]")].map(n => n.dataset.column)).toEqual(["id", "client", "size", "px", "status"])
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
      <ColumnChooserItem columnKey="px" ref={item} id="price" role="article" tabIndex={-1} aria-label="Order price" onKeyDown={event => { key(); event.preventDefault() }}>
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

  it("keeps item focus recovery and public reading names when optional names are undefined", () => {
    const optional = { role: undefined, tabIndex: undefined, "aria-label": undefined }
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
    expect(change).toHaveBeenLastCalledWith({ ...EMPTY_COLUMN_STATE, order: ["id", "client", "", "px", "size"] })
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
    expect(change).toHaveBeenLastCalledWith({ ...EMPTY_COLUMN_STATE, order: ["id", "client", "size", "px", "status"] })
    change.mockClear()
    const dataTransfer = transfer()
    fireEvent.dragStart(price, { dataTransfer })
    fireEvent.drop(size, { dataTransfer })
    expect(change).toHaveBeenLastCalledWith({ ...EMPTY_COLUMN_STATE, order: ["id", "client", "size", "px", "status"] })
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
    expect(change).toHaveBeenLastCalledWith({ ...EMPTY_COLUMN_STATE, order: ["id", "client", "size", "px", "status"] })
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
