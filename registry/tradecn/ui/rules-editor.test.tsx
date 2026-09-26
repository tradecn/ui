import { StrictMode, createRef, useState } from "react"
import { TabbedRulesEditor as RulesEditor } from "@/demos/rules-editor-tabs"
import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { parsePrice } from "@/registry/tradecn/lib/format"
import type { GridRules } from "@/registry/tradecn/lib/grid-rules"
import { createRowStore, type RowStore } from "@/registry/tradecn/lib/row-store"
import type { ColumnDef, ColumnState } from "@/registry/tradecn/ui/data-grid"
import { RulesEditor as ComposableRulesEditor, RulesEditorAdd, RulesEditorColumn, RulesEditorFilterCount, RulesEditorItem, RulesEditorMatchCount, RulesEditorMove, RulesEditorOperator, RulesEditorPanel, RulesEditorProblem, RulesEditorRemove, RulesEditorTab, RulesEditorTabList, RulesEditorValue, useRulesEditor, useRulesEditorItem, DEFAULT_RULES_EDITOR_LABELS, moveItem, newFilter, newHighlight, newSort, parseValues, valueShape, valuesText, withColumn, withOp } from "@/registry/tradecn/ui/rules-editor"

interface Rfq {
  id: string
  client: string
  px: number | null
  size: number
  status: string
}

const thirtySeconds = { kind: "fraction", denominator: 32, half: "+" } as const

const columns: ColumnDef<Rfq>[] = [
  { key: "id", header: "RFQ", width: 80, frozen: "left", accessor: (r) => r.id },
  { key: "client", header: "Client", width: 100, accessor: (r) => r.client },
  { key: "px", header: "Price", width: 90, numeric: true, accessor: (r) => r.px, parse: (text) => parsePrice(text, thirtySeconds) },
  { key: "size", header: "Size", width: 90, numeric: true, accessor: (r) => r.size },
  { key: "status", header: "Status", width: 100, accessor: (r) => r.status },
]

const rows: Rfq[] = [
  { id: "a", client: "ALPHA", px: 99.5, size: 5_000_000, status: "Open" },
  { id: "b", client: "BETA", px: 100.25, size: 25_000_000, status: "Quoted" },
  { id: "c", client: "GAMMA", px: null, size: 2_000_000, status: "Open" },
  { id: "d", client: "DELTA", px: 100.5, size: 10_000_000, status: "Done away" },
]

const RULES: GridRules = {
  columns: [
    { id: "rich", column: "px", when: { op: "gte", value: "100-00" }, tone: "up", label: "Rich to the market" },
    { id: "big", column: "size", when: { op: "gte", value: "10,000,000" }, tone: "primary", target: "row" },
  ],
  filter: [{ column: "status", op: "ne", value: "Done away" }],
  sort: [
    { key: "size", dir: "desc" },
    { key: "px", dir: "asc" },
  ],
}

function seeded(): RowStore<Rfq> {
  const store = createRowStore<Rfq>({ getRowId: (r) => r.id })
  store.applyDeltas({ upsert: rows })
  return store
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const tab = (name: string) => screen.getByRole("tab", { name: new RegExp(`^${name}`) })

describe("the helpers", () => {
  it("knows what each op wants typed, and reads and writes the comma field", () => {
    expect(valueShape("gt")).toBe("one")
    expect(valueShape("between")).toBe("two")
    expect(valueShape("in")).toBe("many")
    expect(valueShape("isNull")).toBe("none")
    expect(parseValues(" a, b ,, c ")).toEqual(["a", "b", "c"])
    expect(valuesText(["a", 5, null])).toBe("a, 5, ")
    expect(valuesText(undefined)).toBe("")
  })

  it("keeps a typed value across ops of the same shape and drops it otherwise, and follows a column to an op it offers", () => {
    expect(withOp({ op: "gt", value: "5" }, "lt")).toEqual({ op: "lt", value: "5" })
    expect(withOp({ op: "gt", value: "5" }, "between")).toEqual({ op: "between" })
    expect(withOp({ op: "in", values: ["a"] }, "isNull")).toEqual({ op: "isNull" })
    expect(withColumn({ op: "between", values: ["1", "2"] }, columns[1])).toEqual({ op: "eq" })
    expect(withColumn({ op: "contains", value: "a" }, columns[2])).toEqual({ op: "eq" })
    expect(withColumn({ op: "eq", value: "a" }, columns[2])).toEqual({ op: "eq", value: "a" })
  })

  it("moves an item, and makes a new highlight, filter, and sort key on the first column that fits", () => {
    expect(moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"])
    expect(moveItem(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"])
    expect(moveItem(["a", "b"], 0, 5)).toEqual(["a", "b"])
    const highlight = newHighlight(columns)
    expect(highlight).toMatchObject({ column: "id", when: { op: "eq" }, tone: "up" })
    expect(newHighlight(columns).id).not.toBe(highlight.id)
    expect(newFilter(columns)).toEqual({ column: "id", op: "eq" })
    expect(newSort(columns, [{ key: "id", dir: "asc" }])).toEqual({ key: "client", dir: "asc" })
  })
})

describe("RulesEditor", () => {
  it("lists the highlights with their column, op, value, tone, target, and label, says a rule's problem, and counts the rows each matches", () => {
    render(<RulesEditor columns={columns} rules={RULES} onRulesChange={() => {}} store={seeded()} />)
    const editor = screen.getByRole("region", { name: "Rules" })
    expect(editor.dataset.slot).toBe("tradecn-rules-editor")
    expect(editor.dataset.tab).toBe("highlights")
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Highlights2", "Filters1", "Sort2"])
    const rich = document.querySelector<HTMLElement>('[data-rule-id="rich"]')!
    expect(within(rich).getByLabelText("Column: Rich to the market")).toHaveValue("px")
    expect(within(rich).getByLabelText("Condition: Rich to the market")).toHaveValue("gte")
    expect(within(rich).getByLabelText("Value: Rich to the market")).toHaveValue("100-00")
    expect(within(rich).getByLabelText("Tone: Rich to the market")).toHaveValue("up")
    expect(within(rich).getByLabelText("Paints: Rich to the market")).toHaveValue("cell")
    expect(within(rich).getByLabelText("Label: Rich to the market")).toHaveValue("Rich to the market")
    expect(rich.querySelector("[data-rule-swatch='up']")).toBeInTheDocument()
    // A numeric column offers comparisons and ranges, not text matching.
    const ops = [...within(rich).getByLabelText("Condition: Rich to the market").querySelectorAll("option")].map((o) => o.value)
    expect(ops).toContain("between")
    expect(ops).not.toContain("contains")
    // Two rows are at or above 100-00; two are at or above 10,000,000.
    expect(rich.querySelector("[data-rule-count]")).toHaveAttribute("data-rule-count", "2")
    expect(document.querySelector('[data-rule-id="big"] [data-rule-count]')).toHaveTextContent("2 rows match")
    expect(document.querySelector("[data-rule-problem]")).toBeNull()
  })

  it("writes every edit through onRulesChange and keeps nothing: value, op, column, tone, target, label, add, move, remove", () => {
    const onChange = vi.fn()
    render(<RulesEditor columns={columns} rules={RULES} onRulesChange={onChange} />)
    const last = () => onChange.mock.lastCall?.[0] as GridRules
    fireEvent.change(screen.getByLabelText("Value: Rich to the market"), { target: { value: "101-00" } })
    expect(last().columns?.[0]?.when).toEqual({ op: "gte", value: "101-00" })
    expect(last().filter).toBe(RULES.filter)
    fireEvent.change(screen.getByLabelText("Condition: Rich to the market"), { target: { value: "between" } })
    expect(last().columns?.[0]?.when).toEqual({ op: "between" })
    fireEvent.change(screen.getByLabelText("Column: Rich to the market"), { target: { value: "client" } })
    expect(last().columns?.[0]).toMatchObject({ column: "client", when: { op: "eq" } })
    fireEvent.change(screen.getByLabelText("Tone: Rich to the market"), { target: { value: "down" } })
    expect(last().columns?.[0]?.tone).toBe("down")
    fireEvent.change(screen.getByLabelText("Paints: Rich to the market"), { target: { value: "row" } })
    expect(last().columns?.[0]?.target).toBe("row")
    fireEvent.change(screen.getByLabelText("Label: Rich to the market"), { target: { value: "Dear" } })
    expect(last().columns?.[0]?.label).toBe("Dear")
    fireEvent.click(screen.getByRole("button", { name: "Add highlight" }))
    expect(last().columns).toHaveLength(3)
    expect(last().columns?.[2]).toMatchObject({ column: "id", tone: "up" })
    fireEvent.click(screen.getByRole("button", { name: "Move down: Rich to the market" }))
    expect(last().columns?.map((r) => r.id)).toEqual(["big", "rich"])
    fireEvent.click(screen.getByRole("button", { name: "Remove: Rich to the market" }))
    expect(last().columns?.map((r) => r.id)).toEqual(["big"])
    // Still what it was handed.
    expect(screen.getByLabelText("Value: Rich to the market")).toHaveValue("100-00")
  })

  it("shows two fields for a range and one comma field for a set, and says why a rule cannot apply", () => {
    const rules: GridRules = {
      columns: [
        { id: "mid", column: "px", when: { op: "between", values: ["99-16", "100-00"] }, tone: "flat" },
        { id: "names", column: "client", when: { op: "in", values: ["ALPHA", "BETA"] }, tone: "stale" },
        { id: "broken", column: "px", when: { op: "gt", value: "abc" }, tone: "down" },
      ],
    }
    const onChange = vi.fn()
    render(<RulesEditor columns={columns} rules={rules} onRulesChange={onChange} />)
    expect(screen.getByLabelText("Low: Highlights 1")).toHaveValue("99-16")
    expect(screen.getByLabelText("High: Highlights 1")).toHaveValue("100-00")
    fireEvent.change(screen.getByLabelText("High: Highlights 1"), { target: { value: "100-16" } })
    expect((onChange.mock.lastCall?.[0] as GridRules).columns?.[0]?.when.values).toEqual(["99-16", "100-16"])
    const set = screen.getByLabelText("Values, comma separated: Highlights 2")
    expect(set).toHaveValue("ALPHA, BETA")
    fireEvent.change(set, { target: { value: "ALPHA, BETA, GAMMA," } })
    expect((onChange.mock.lastCall?.[0] as GridRules).columns?.[1]?.when.values).toEqual(["ALPHA", "BETA", "GAMMA"])
    expect(set).toHaveValue("ALPHA, BETA, GAMMA,")
    expect(document.querySelector('[data-rule-id="broken"] [data-rule-problem]')).toHaveTextContent('"abc" is not a value Price reads.')
  })

  it("has a filters tab with the same fields, a count per rule, and how many rows show under them all", () => {
    const onChange = vi.fn()
    render(<RulesEditor columns={columns} rules={RULES} onRulesChange={onChange} store={seeded()} defaultTab="filters" />)
    expect(screen.getByRole("region", { name: "Rules" }).dataset.tab).toBe("filters")
    expect(screen.getByLabelText("Column: Filters 1")).toHaveValue("status")
    expect(screen.getByLabelText("Condition: Filters 1")).toHaveValue("ne")
    expect(screen.getByLabelText("Value: Filters 1")).toHaveValue("Done away")
    expect(document.querySelector("[data-filter-index='0'] [data-rule-count]")).toHaveAttribute("data-rule-count", "3")
    expect(document.querySelector("[data-rules-shown]")).toHaveTextContent("3 of 4 rows show")
    fireEvent.click(screen.getByRole("button", { name: "Add filter" }))
    expect((onChange.mock.lastCall?.[0] as GridRules).filter).toHaveLength(2)
    fireEvent.change(screen.getByLabelText("Value: Filters 1"), { target: { value: "open" } })
    expect((onChange.mock.lastCall?.[0] as GridRules).filter?.[0]).toEqual({ column: "status", op: "ne", value: "open" })
    fireEvent.click(screen.getByRole("button", { name: "Remove: Filters 1" }))
    expect((onChange.mock.lastCall?.[0] as GridRules).filter).toEqual([])
  })

  it("has a sort tab of keys with a direction each, in a drag-ordered stack", () => {
    const onChange = vi.fn()
    render(<RulesEditor columns={columns} rules={RULES} onRulesChange={onChange} defaultTab="sort" />)
    const last = () => onChange.mock.lastCall?.[0] as GridRules
    expect(screen.getByLabelText("Column: Sort 1")).toHaveValue("size")
    expect(screen.getByLabelText("Direction: Sort 1")).toHaveValue("desc")
    expect(screen.getByLabelText("Column: Sort 2")).toHaveValue("px")
    fireEvent.change(screen.getByLabelText("Direction: Sort 2"), { target: { value: "desc" } })
    expect(last().sort?.[1]).toEqual({ key: "px", dir: "desc" })
    fireEvent.click(screen.getByRole("button", { name: "Add sort key" }))
    expect(last().sort?.[2]).toEqual({ key: "id", dir: "asc" })
    const first = document.querySelector<HTMLElement>("[data-rule-row='0']")!
    const second = document.querySelector<HTMLElement>("[data-rule-row='1']")!
    fireEvent.keyDown(first, { key: "ArrowDown", altKey: true })
    expect(last().sort?.map((s) => s.key)).toEqual(["px", "size"])
    const dataTransfer = { setData: vi.fn(), getData: vi.fn(() => "1"), effectAllowed: "", dropEffect: "" }
    fireEvent.dragStart(second, { dataTransfer })
    expect(second.dataset.dragging).toBe("true")
    fireEvent.dragOver(first, { dataTransfer })
    fireEvent.drop(first, { dataTransfer })
    expect(last().sort?.map((s) => s.key)).toEqual(["px", "size"])
    expect(second.dataset.dragging).toBeUndefined()
  })

  it("switches tabs by click and by arrow keys, and shows the Columns tab with the chooser only when the grid's column state is given", () => {
    const onColumnStateChange = vi.fn()
    const columnState: ColumnState = { order: [], widths: {}, hidden: ["status"] }
    const { rerender } = render(<RulesEditor columns={columns} rules={RULES} onRulesChange={() => {}} />)
    expect(screen.queryByRole("tab", { name: /^Columns/ })).toBeNull()
    rerender(<RulesEditor columns={columns} rules={RULES} onRulesChange={() => {}} columnState={columnState} onColumnStateChange={onColumnStateChange} />)
    expect(screen.getAllByRole("tab")).toHaveLength(4)
    fireEvent.click(tab("Columns"))
    expect(screen.getByRole("region", { name: "Rules" }).dataset.tab).toBe("columns")
    const chooser = screen.getByRole("group", { name: "Columns" })
    expect(chooser.dataset.slot).toBe("tradecn-column-chooser")
    // The chooser says the highlights beside their columns.
    expect(chooser.querySelector('[data-column-rule="rich"]')).toHaveTextContent("Rich to the market")
    fireEvent.click(within(chooser).getByRole("checkbox", { name: "Show Status" }))
    expect(onColumnStateChange).toHaveBeenCalledWith({ ...columnState, hidden: [] })
    fireEvent.keyDown(tab("Columns"), { key: "ArrowRight" })
    expect(screen.getByRole("region", { name: "Rules" }).dataset.tab).toBe("highlights")
    fireEvent.keyDown(tab("Highlights"), { key: "End" })
    expect(screen.getByRole("region", { name: "Rules" }).dataset.tab).toBe("columns")
    fireEvent.keyDown(tab("Columns"), { key: "Home" })
    expect(screen.getByRole("region", { name: "Rules" }).dataset.tab).toBe("highlights")
    expect(tab("Highlights")).toHaveAttribute("aria-selected", "true")
    expect(tab("Filters")).toHaveAttribute("tabindex", "-1")
  })

  it("recounts on the store's beat, at most every 250 ms, and not on every batch", () => {
    const store = seeded()
    render(<RulesEditor columns={columns} rules={RULES} onRulesChange={() => {}} store={store} />)
    const count = () => document.querySelector('[data-rule-id="rich"] [data-rule-count]')!.getAttribute("data-rule-count")
    expect(count()).toBe("2")
    act(() => store.applyDeltas({ patch: [{ id: "a", fields: { px: 100.75 } }] }))
    expect(count()).toBe("2")
    act(() => vi.advanceTimersByTime(249))
    expect(count()).toBe("2")
    act(() => {
      store.applyDeltas({ patch: [{ id: "c", fields: { px: 101 } }] })
      vi.advanceTimersByTime(1)
    })
    expect(count()).toBe("4")
  })

  it("takes its words from labels and says when a list is empty", () => {
    render(<RulesEditor columns={columns} rules={{}} onRulesChange={() => {}} labels={{ title: "Regeln", highlights: "Farben", noHighlights: "Keine." }} />)
    expect(screen.getByRole("region", { name: "Regeln" })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "Farben" })).toBeInTheDocument()
    expect(screen.getByText("Keine.")).toBeInTheDocument()
    fireEvent.click(tab("Filters"))
    expect(screen.getByText(DEFAULT_RULES_EDITOR_LABELS.noFilters)).toBeInTheDocument()
  })
})


describe("RulesEditor composition", () => {
  it("requires composition for all released call shapes", () => {
    // @ts-expect-error The minimal v1 call must migrate to explicit children.
    const minimal = <ComposableRulesEditor columns={columns} rules={RULES} onRulesChange={() => {}} />
    // @ts-expect-error Retained options do not supply a composition.
    const configured = <ComposableRulesEditor columns={columns} rules={RULES} onRulesChange={() => {}} store={seeded()} defaultTab="sort" labels={{ title: "Desk" }} className="border" />
    // @ts-expect-error Column chooser state now belongs to caller-owned ColumnChooserPanel.
    const chooser = <ComposableRulesEditor columns={columns} rules={RULES} onRulesChange={() => {}} columnState={{ order: [], widths: {}, hidden: [] }} onColumnStateChange={() => {}}>{null}</ComposableRulesEditor>
    const supported = [null, false, undefined, RULES.columns && <p key="empty">No rules</p>].map((children, index) => <ComposableRulesEditor key={index} columns={columns} rules={RULES} onRulesChange={() => {}}>{children}</ComposableRulesEditor>)
    expect([minimal, configured, chooser, ...supported]).toHaveLength(7)
  })

  it("supports caller order, custom controls and application content without tabs", () => {
    function Custom() {
      const { rules } = useRulesEditor()
      const { name, condition, setCondition } = useRulesEditorItem()
      return <button onClick={() => setCondition({ ...condition!, value: "101-00" })}>{name}: {rules.columns?.length}</button>
    }
    const change = vi.fn()
    render(<ComposableRulesEditor columns={columns} rules={RULES} onRulesChange={change}>
      <h2>Desk limits</h2>
      <RulesEditorItem kind="highlights" index={1}><RulesEditorProblem /><RulesEditorColumn /></RulesEditorItem>
      <RulesEditorItem kind="highlights" index={0}><Custom /><RulesEditorValue /><RulesEditorRemove>Delete limit</RulesEditorRemove></RulesEditorItem>
      <RulesEditorAdd kind="filters">Include another account</RulesEditorAdd>
    </ComposableRulesEditor>)
    expect(screen.queryByRole("tablist")).toBeNull()
    expect(screen.getAllByRole("group").map((item) => item.getAttribute("data-rule-row"))).toEqual(["1", "0"])
    fireEvent.click(screen.getByRole("button", { name: "Rich to the market: 2" }))
    expect(change.mock.lastCall?.[0].columns[0].when.value).toBe("101-00")
    fireEvent.click(screen.getByRole("button", { name: "Include another account" }))
    expect(change.mock.lastCall?.[0].filter).toHaveLength(2)
  })

  it("forwards native refs, classes, names and events and permits cancelling edits", () => {
    const root = createRef<HTMLDivElement>()
    const item = createRef<HTMLDivElement>()
    const input = createRef<HTMLInputElement>()
    const select = createRef<HTMLSelectElement>()
    const button = createRef<HTMLButtonElement>()
    const change = vi.fn()
    const click = vi.fn((event) => event.preventDefault())
    render(<ComposableRulesEditor ref={root} title="Limits" aria-label="Desk" columns={columns} rules={RULES} onRulesChange={change}>
      <RulesEditorItem kind="highlights" index={0} ref={item} className="custom-row">
        <RulesEditorColumn ref={select} aria-label="Instrument field" onChange={(event) => event.preventDefault()} />
        <RulesEditorValue ref={input} className="custom-field" onChange={(event) => event.preventDefault()} />
        <RulesEditorRemove ref={button} onClick={click}>Delete</RulesEditorRemove>
      </RulesEditorItem>
    </ComposableRulesEditor>)
    expect(root.current).toBe(screen.getByRole("region", { name: "Desk" }))
    expect(item.current).toHaveClass("custom-row")
    expect(input.current).toHaveClass("custom-field")
    expect(select.current).toBe(screen.getByLabelText("Instrument field"))
    fireEvent.change(input.current!, { target: { value: "104" } })
    fireEvent.change(select.current!, { target: { value: "client" } })
    fireEvent.click(button.current!)
    expect(click).toHaveBeenCalledOnce()
    expect(change).not.toHaveBeenCalled()
  })

  it("retains field focus through edits and moves, then finds a useful target after removal", () => {
    function Controlled() {
      const [rules, setRules] = useState(RULES)
      return <RulesEditor columns={columns} rules={rules} onRulesChange={setRules} />
    }
    render(<Controlled />)
    const value = screen.getByLabelText("Value: Rich to the market")
    value.focus()
    fireEvent.change(value, { target: { value: "101-00" } })
    expect(value).toHaveFocus()
    fireEvent.keyDown(value, { key: "ArrowDown", altKey: true })
    expect(screen.getByLabelText("Value: Rich to the market")).toHaveFocus()
    expect(document.querySelectorAll("[data-rule-id]")[1]).toHaveAttribute("data-rule-id", "rich")
    const remove = screen.getByRole("button", { name: "Remove: Rich to the market" })
    remove.focus()
    fireEvent.click(remove)
    expect(screen.getByRole("button", { name: "Remove: Highlights 1" })).toHaveFocus()
    fireEvent.click(screen.getByRole("button", { name: "Remove: Highlights 1" }))
    expect(screen.getByRole("button", { name: "Add highlight" })).toHaveFocus()
  })

  it("retains controlled comma drafts, replaces external values, and clears drafts when shape changes", () => {
    const initial: GridRules = { filter: [{ column: "client", op: "in", values: ["ALPHA"] }] }
    const view = (rules: GridRules) => <RulesEditor columns={columns} rules={rules} onRulesChange={() => {}} defaultTab="filters" />
    const { rerender } = render(view(initial))
    const field = screen.getByLabelText("Values, comma separated: Filters 1")
    fireEvent.change(field, { target: { value: "ALPHA, " } })
    rerender(view({ filter: [{ column: "client", op: "in", values: ["ALPHA"] }] }))
    expect(field).toHaveValue("ALPHA, ")
    rerender(view({ filter: [{ column: "client", op: "in", values: ["BETA"] }] }))
    expect(field).toHaveValue("BETA")
    rerender(view({ filter: [{ column: "client", op: "isNull" }] }))
    expect(screen.queryByRole("textbox")).toBeNull()
    rerender(view(initial))
    expect(screen.getByLabelText("Values, comma separated: Filters 1")).toHaveValue("ALPHA")
  })

  it("keeps tabs in caller order with unique ids and falls back when a selected tab disappears", () => {
    const view = (showColumns: boolean) => <>
      <ComposableRulesEditor columns={columns} rules={RULES} onRulesChange={() => {}}>
        <RulesEditorTabList><RulesEditorTab value="sort">Priority</RulesEditorTab><RulesEditorTab value="highlights">Paint</RulesEditorTab>{showColumns && <RulesEditorTab value="columns">Columns</RulesEditorTab>}</RulesEditorTabList>
        <RulesEditorPanel value="sort">Sort panel</RulesEditorPanel><RulesEditorPanel value="highlights">Paint panel</RulesEditorPanel>{showColumns && <RulesEditorPanel value="columns">Column panel</RulesEditorPanel>}
      </ComposableRulesEditor>
      <RulesEditor columns={columns} rules={RULES} onRulesChange={() => {}} />
    </>
    const { rerender } = render(view(true))
    const tabs = screen.getAllByRole("tab")
    expect(new Set(tabs.map((tab) => tab.id)).size).toBe(tabs.length)
    fireEvent.keyDown(screen.getByRole("tab", { name: "Paint" }), { key: "Home" })
    expect(screen.getByRole("tab", { name: "Priority" })).toHaveFocus()
    fireEvent.keyDown(screen.getByRole("tab", { name: "Priority" }), { key: "ArrowLeft" })
    expect(screen.getByRole("tab", { name: "Columns" })).toHaveFocus()
    rerender(view(false))
    expect(screen.getByRole("tab", { name: "Priority" })).toHaveAttribute("aria-selected", "true")
    expect(screen.getByRole("tab", { name: "Priority" })).toHaveFocus()
    rerender(view(true))
    expect(screen.getByRole("tab", { name: "Columns" })).toHaveAttribute("aria-selected", "true")
  })

  it("recounts only readings on a feed beat and shares one subscription across repeated counts", () => {
    const store = seeded()
    const subscribe = vi.spyOn(store, "subscribeMeta")
    const fields = vi.fn()
    function Fields() { fields(); return <RulesEditorColumn /> }
    render(<ComposableRulesEditor columns={columns} rules={RULES} onRulesChange={() => {}} store={store}>
      <RulesEditorItem kind="highlights" index={0}><Fields /><RulesEditorMatchCount /><RulesEditorMatchCount /></RulesEditorItem>
      <RulesEditorFilterCount />
    </ComposableRulesEditor>)
    expect(fields).toHaveBeenCalledOnce()
    expect(subscribe).toHaveBeenCalledOnce()
    act(() => { store.applyDeltas({ patch: [{ id: "a", fields: { px: 101 } }] }); vi.advanceTimersByTime(250) })
    expect(screen.getAllByText("3 rows match")).toHaveLength(2)
    expect(fields).toHaveBeenCalledOnce()
  })

  it("cancels pending counts and unsubscribes on store replacement and unmount", () => {
    const first = seeded()
    const second = seeded()
    second.applyDeltas({ remove: ["a", "b", "c"] })
    const stop = vi.fn()
    const subscribe = first.subscribeMeta
    vi.spyOn(first, "subscribeMeta").mockImplementation((callback) => { const unsubscribe = subscribe(callback); return () => { stop(); unsubscribe() } })
    const view = (store?: RowStore<Rfq>) => <RulesEditor columns={columns} rules={RULES} onRulesChange={() => {}} store={store} />
    const { rerender, unmount } = render(view(first))
    act(() => first.applyDeltas({ patch: [{ id: "a", fields: { px: 101 } }] }))
    expect(vi.getTimerCount()).toBe(1)
    rerender(view(second))
    expect(stop).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
    expect(document.querySelector('[data-rule-id="rich"] [data-rule-count]')).toHaveTextContent("1 rows match")
    rerender(view())
    expect(document.querySelector("[data-rule-count]")).toBeNull()
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it("recounts edits immediately and follows store updates under StrictMode", () => {
    const store = seeded()
    const { rerender } = render(<StrictMode><RulesEditor columns={columns} rules={RULES} onRulesChange={() => {}} store={store} /></StrictMode>)
    const edited = { ...RULES, columns: [{ ...RULES.columns![0]!, when: { op: "gte" as const, value: "99-00" } }] }
    rerender(<StrictMode><RulesEditor columns={columns} rules={edited} onRulesChange={() => {}} store={store} /></StrictMode>)
    expect(document.querySelector("[data-rule-count]")).toHaveAttribute("data-rule-count", "3")
    act(() => { store.applyDeltas({ patch: [{ id: "c", fields: { px: 101 } }] }); vi.advanceTimersByTime(250) })
    expect(document.querySelector("[data-rule-count]")).toHaveAttribute("data-rule-count", "4")
  })

  it("keeps validation editable and reports missing columns with zero individual matches", () => {
    const rules: GridRules = { filter: [{ column: "gone", op: "eq", value: "a" }] }
    render(<RulesEditor columns={columns} rules={rules} onRulesChange={() => {}} store={seeded()} defaultTab="filters" />)
    expect(screen.getByLabelText("Column: Filters 1")).toHaveValue("gone")
    expect(document.querySelector("[data-rule-problem]")).toHaveTextContent('No column is named "gone".')
    expect(document.querySelector("[data-rule-count]")).toHaveAttribute("data-rule-count", "0")
    expect(document.querySelector("[data-rules-shown]")).toHaveTextContent("4 of 4 rows show")
    expect(screen.getByLabelText("Value: Filters 1")).not.toBeDisabled()
  })

  it("ignores cross-kind and external drops and honors cancelled keyboard moves", () => {
    const change = vi.fn()
    render(<ComposableRulesEditor columns={columns} rules={RULES} onRulesChange={change}>
      <RulesEditorItem kind="highlights" index={0} onKeyDown={(event) => event.preventDefault()}><RulesEditorOperator /><RulesEditorMove direction="up">Earlier</RulesEditorMove></RulesEditorItem>
      <RulesEditorItem kind="filters" index={0}><RulesEditorValue /></RulesEditorItem>
      <RulesEditorItem kind="highlights" index={1}><RulesEditorRemove>Delete</RulesEditorRemove></RulesEditorItem>
    </ComposableRulesEditor>)
    const groups = screen.getAllByRole("group")
    const dataTransfer = { setData: vi.fn(), getData: () => "0", effectAllowed: "", dropEffect: "" }
    fireEvent.drop(groups[2]!, { dataTransfer })
    fireEvent.dragStart(groups[0]!, { dataTransfer })
    fireEvent.drop(groups[1]!, { dataTransfer })
    fireEvent.keyDown(groups[0]!, { altKey: true, key: "ArrowDown" })
    expect(change).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Move up: Rich to the market" })).toBeDisabled()
    fireEvent.dragEnd(groups[0]!)
  })

  it("reports misplaced behavior parts", () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    expect(() => render(<RulesEditorColumn />)).toThrow("inside RulesEditor")
    expect(() => render(<ComposableRulesEditor columns={columns} rules={RULES} onRulesChange={() => {}}><RulesEditorValue /></ComposableRulesEditor>)).toThrow("inside RulesEditorItem")
  })
})


it("keeps root and tab-list callback refs attached across edits and respects cleanup", () => {
  const rootCleanup = vi.fn()
  const listCleanup = vi.fn()
  const rootRef = vi.fn(() => rootCleanup)
  const listRef = vi.fn(() => listCleanup)
  const view = (rules: GridRules) => <ComposableRulesEditor ref={rootRef} columns={columns} rules={rules} onRulesChange={() => {}}>
    <RulesEditorTabList ref={listRef}><RulesEditorTab value="highlights">Highlights</RulesEditorTab><RulesEditorTab value="filters">Filters</RulesEditorTab></RulesEditorTabList>
    <RulesEditorPanel value="highlights"><RulesEditorItem kind="highlights" index={0}><RulesEditorValue /></RulesEditorItem></RulesEditorPanel>
  </ComposableRulesEditor>
  const { rerender, unmount } = render(view(RULES))
  rerender(view({ ...RULES, sort: [] }))
  fireEvent.click(screen.getByRole("tab", { name: "Filters" }))
  expect(rootRef).toHaveBeenCalledOnce()
  expect(listRef).toHaveBeenCalledOnce()
  expect(rootCleanup).not.toHaveBeenCalled()
  expect(listCleanup).not.toHaveBeenCalled()
  unmount()
  expect(rootCleanup).toHaveBeenCalledOnce()
  expect(listCleanup).toHaveBeenCalledOnce()
})


it("moves focus to an enabled tab when the focused tab becomes disabled", () => {
  const view = (disabled: boolean) => <>
    <button>Outside</button>
    <ComposableRulesEditor columns={columns} rules={RULES} onRulesChange={() => {}}>
      <RulesEditorTabList><RulesEditorTab value="highlights">Highlights</RulesEditorTab><RulesEditorTab value="filters" disabled={disabled}>Filters</RulesEditorTab></RulesEditorTabList>
      <RulesEditorPanel value="highlights">Highlights panel</RulesEditorPanel><RulesEditorPanel value="filters">Filters panel</RulesEditorPanel>
    </ComposableRulesEditor>
  </>
  const { rerender } = render(view(false))
  screen.getByRole("tab", { name: "Filters" }).focus()
  fireEvent.click(screen.getByRole("tab", { name: "Filters" }))
  rerender(view(true))
  expect(screen.getByRole("tab", { name: "Highlights" })).toHaveFocus()
  expect(screen.getByRole("tab", { name: "Highlights" })).toHaveAttribute("aria-selected", "true")
  rerender(view(false))
  screen.getByRole("button", { name: "Outside" }).focus()
  rerender(view(true))
  expect(screen.getByRole("button", { name: "Outside" })).toHaveFocus()
})

it("keeps moved field focus when the caller accepts copied rules with reordered properties", () => {
  function Controlled() {
    const [rules, setRules] = useState(RULES)
    return <RulesEditor columns={columns} rules={rules} defaultTab="sort" onRulesChange={(next) => setRules({ ...structuredClone(next), sort: next.sort?.map(({ key, dir }) => ({ dir, key })) })} />
  }
  render(<Controlled />)
  screen.getByLabelText("Column: Sort 1").focus()
  fireEvent.keyDown(screen.getByLabelText("Column: Sort 1"), { key: "ArrowDown", altKey: true })
  expect(screen.getByLabelText("Column: Sort 2")).toHaveValue("size")
  expect(screen.getByLabelText("Column: Sort 2")).toHaveFocus()
})

it("does not restore an ignored move's focus during a later unrelated edit", () => {
  const view = (rules: GridRules) => <RulesEditor columns={columns} rules={rules} defaultTab="sort" onRulesChange={() => {}} />
  const { rerender } = render(view(RULES))
  screen.getByLabelText("Column: Sort 1").focus()
  fireEvent.keyDown(screen.getByLabelText("Column: Sort 1"), { key: "ArrowDown", altKey: true })
  screen.getByLabelText("Direction: Sort 1").focus()
  rerender(view({ ...RULES, filter: [] }))
  expect(screen.getByLabelText("Direction: Sort 1")).toHaveFocus()
})


it("does not mistake an ignored duplicate-key move for a later accepted change", () => {
  const rules: GridRules = { sort: [{ key: "size", dir: "asc" }, { key: "size", dir: "asc" }] }
  const view = (value: GridRules) => <RulesEditor columns={columns} rules={value} defaultTab="sort" onRulesChange={() => {}} />
  const { rerender } = render(view(rules))
  screen.getByLabelText("Column: Sort 1").focus()
  fireEvent.keyDown(screen.getByLabelText("Column: Sort 1"), { key: "ArrowDown", altKey: true })
  screen.getByLabelText("Direction: Sort 1").focus()
  rerender(view({ ...rules, filter: [] }))
  expect(screen.getByLabelText("Direction: Sort 1")).toHaveFocus()
})

it("preserves focus chosen after a move while controlled acceptance is delayed", () => {
  let pending: GridRules | undefined
  const view = (rules: GridRules) => <><button>Outside</button><RulesEditor columns={columns} rules={rules} defaultTab="sort" onRulesChange={(next) => { pending = next }} /></>
  const { rerender } = render(view(RULES))
  screen.getByLabelText("Column: Sort 1").focus()
  fireEvent.keyDown(screen.getByLabelText("Column: Sort 1"), { key: "ArrowDown", altKey: true })
  screen.getByRole("button", { name: "Outside" }).focus()
  rerender(view(pending!))
  expect(screen.getByRole("button", { name: "Outside" })).toHaveFocus()
})
