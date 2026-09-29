import { createRef, StrictMode, useLayoutEffect, useState } from "react"
import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ColumnSettingsDialog, ColumnSettingsPanel } from "@/demos/column-chooser"
import { ColumnChooser, ColumnChooserAnnouncer, ColumnChooserItem, ColumnChooserMove, ColumnChooserName, ColumnChooserResetAll, chooserRows, useColumnChooser, useColumnChooserItem } from "@/registry/tradecn/ui/column-chooser"
import { EMPTY_COLUMN_STATE, type ColumnDef, type ColumnState } from "@/registry/tradecn/ui/data-grid"

type Row = Record<string, unknown>
const column = (key: string, header: string, extra: Partial<ColumnDef<Row>> = {}): ColumnDef<Row> => ({ key, header, width: 80, accessor: (row) => row[key], ...extra })
const columns = [column("id", "RFQ", { frozen: "left" }), column("px", "Price"), column("spread", "Spread"), column("size", "Size")]
const base: ColumnState = { order: [], widths: { px: 120 }, hidden: ["spread"] }
const order = () => [...document.querySelectorAll<HTMLElement>("[data-column]")].map((item) => item.dataset.column)

function Panel({ initial = EMPTY_COLUMN_STATE, baseline = EMPTY_COLUMN_STATE, definitions = columns, onChange }: { initial?: ColumnState; baseline?: ColumnState; definitions?: ColumnDef<Row>[]; onChange?: (next: ColumnState) => void }) {
  const [state, setState] = useState(initial)
  return <ColumnSettingsPanel columns={definitions} columnState={state} baseState={baseline} onColumnStateChange={(next) => { onChange?.(next); setState(next) }} />
}

function Collection() {
  const { presented } = useColumnChooser()
  return <ul aria-label="Chosen columns">{presented.map((row) => <li key={row.key}><ColumnChooserItem columnKey={row.key}><ColumnChooserName /><ColumnChooserMove direction="up">Up</ColumnChooserMove><ColumnChooserMove direction="down">Down</ColumnChooserMove></ColumnChooserItem></li>)}</ul>
}

describe("presented column movement", () => {
  it("moves between search results and announces the committed displayed position", () => {
    const definitions = [column("id", "RFQ", { frozen: "left" }), column("bid", "Bid Yield"), column("offer", "Offer"), column("ask", "Ask Yield")]
    const change = vi.fn()
    render(<Panel definitions={definitions} onChange={change} />)
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "yield" } })
    expect(order()).toEqual(["bid", "ask"])
    fireEvent.keyDown(screen.getByRole("group", { name: "Bid Yield" }), { key: "ArrowDown", altKey: true })
    expect(order()).toEqual(["ask", "bid"])
    expect(change).toHaveBeenLastCalledWith({ ...EMPTY_COLUMN_STATE, order: ["id", "offer", "ask", "bid"] })
    expect(screen.getByRole("status")).toHaveTextContent("Bid Yield moved to 2 of 2.")
    expect(screen.getByRole("button", { name: "Move down: Bid Yield" })).toBeDisabled()
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Bid" } })
    expect(screen.getByRole("button", { name: "Move up: Bid Yield" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Move down: Bid Yield" })).toBeDisabled()
  })

  it.each([false, true])("uses the accepted visible-only sequence, reversed=%s", (reverse) => {
    function Selected() {
      const [state, setState] = useState(base)
      const presented = chooserRows(columns, state).filter((row) => row.visible).map((row) => row.key)
      if (reverse) presented.reverse()
      return <ColumnChooser columns={columns} columnState={state} onColumnStateChange={setState} presented={presented}><Collection /><ColumnChooserAnnouncer /></ColumnChooser>
    }
    render(<Selected />)
    expect(order()).toEqual(reverse ? ["size", "px", "id"] : ["id", "px", "size"])
    fireEvent.click(screen.getByRole("button", { name: `Move down: ${reverse ? "Size" : "Price"}` }))
    expect(order()).toEqual(reverse ? ["px", "size", "id"] : ["id", "size", "px"])
  })

  it("ignores unknown and duplicate keys, skips the opposite frozen partition and supports empty keys", () => {
    const change = vi.fn()
    const definitions = [column("", "Unnamed"), ...columns]
    render(<ColumnChooser columns={definitions} columnState={EMPTY_COLUMN_STATE} onColumnStateChange={change} presented={["", "id", "missing", "px", "", "px"]}><Collection /></ColumnChooser>)
    expect(order()).toEqual(["", "id", "px"])
    expect(screen.getByRole("button", { name: "Move up: Unnamed" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Move up: RFQ" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Move down: RFQ" })).toBeDisabled()
    fireEvent.click(screen.getByRole("button", { name: "Move down: Unnamed" }))
    expect(change).toHaveBeenLastCalledWith({ ...EMPTY_COLUMN_STATE, order: ["id", "px", "", "spread", "size"] })
    fireEvent.click(screen.getByRole("button", { name: "Move up: Price" }))
    expect(change).toHaveBeenLastCalledWith({ ...EMPTY_COLUMN_STATE, order: ["id", "px", "", "spread", "size"] })
  })
})

describe("shared column defaults", () => {
  it("disables resets at the baseline and restores its visibility and width", () => {
    const change = vi.fn()
    render(<Panel initial={base} baseline={base} onChange={change} />)
    expect(screen.getByRole("button", { name: "Reset all" })).toBeDisabled()
    expect(screen.queryByRole("button", { name: "Reset width: Price" })).toBeNull()
    fireEvent.click(screen.getByRole("checkbox", { name: "Show Spread" }))
    expect(screen.getByRole("status")).toHaveTextContent("Spread shown.")
    fireEvent.click(screen.getByRole("button", { name: "Reset all" }))
    expect(change).toHaveBeenLastCalledWith(base)
    expect(screen.getByRole("checkbox", { name: "Show Spread" })).not.toBeChecked()
    expect(screen.getByRole("status")).toHaveTextContent("Column settings reset.")
  })

  it("restores one width to the baseline without resetting other settings", () => {
    const change = vi.fn()
    render(<Panel initial={{ ...base, widths: { px: 160, size: 100 }, hidden: [] }} baseline={base} onChange={change} />)
    fireEvent.click(screen.getByRole("button", { name: "Reset width: Price" }))
    expect(change).toHaveBeenLastCalledWith({ ...base, widths: { px: 120, size: 100 }, hidden: [] })
    expect(screen.queryByRole("button", { name: "Reset width: Price" })).toBeNull()
    expect(screen.getByRole("status")).toHaveTextContent("Price width reset.")
  })

  it("normalizes a move round trip to the supplied partial order", () => {
    const baseline = { ...base, order: ["size"] }
    const change = vi.fn()
    render(<Panel initial={baseline} baseline={baseline} onChange={change} />)
    fireEvent.keyDown(screen.getByRole("group", { name: "Price" }), { key: "ArrowDown", altKey: true })
    fireEvent.keyDown(screen.getByRole("group", { name: "Price" }), { key: "ArrowUp", altKey: true })
    expect(change).toHaveBeenLastCalledWith(baseline)
    expect(screen.getByRole("button", { name: "Reset all" })).toBeDisabled()
  })

  it("ignores retired keys and equivalent representations, pruning them on an actual edit", () => {
    const change = vi.fn()
    render(<Panel initial={{ order: ["gone", "px", "id", "spread", "size"], widths: { px: 80, gone: 200 }, hidden: ["gone"] }} onChange={change} />)
    expect(screen.getByRole("button", { name: "Reset all" })).toBeDisabled()
    expect(change).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("checkbox", { name: "Show Size" }))
    expect(change).toHaveBeenLastCalledWith({ ...EMPTY_COLUMN_STATE, hidden: ["size"] })
  })

  it("preserves definition-hidden settings during edits and counts them against the baseline", () => {
    const definitions = [...columns, column("private", "Private", { hidden: true })]
    const initial = { ...EMPTY_COLUMN_STATE, widths: { private: 140 }, hidden: ["private"] }
    const change = vi.fn()
    render(<Panel definitions={definitions} initial={initial} onChange={change} />)
    expect(screen.queryByRole("group", { name: "Private" })).toBeNull()
    expect(screen.getByRole("button", { name: "Reset all" })).toBeEnabled()
    fireEvent.click(screen.getByRole("checkbox", { name: "Show Price" }))
    expect(change).toHaveBeenLastCalledWith({ ...initial, hidden: ["private", "px"] })
    fireEvent.click(screen.getByRole("button", { name: "Move down: Price" }))
    expect(change.mock.lastCall?.[0]).toMatchObject({ widths: { private: 140 }, hidden: ["private", "px"] })
  })

  it("uses the last duplicate order occurrence and prunes retired baseline keys on reset", () => {
    const baseline = { order: ["px", "size", "px", "gone"], widths: { px: 0, gone: 200 }, hidden: ["spread", "spread", "gone"] }
    const change = vi.fn()
    render(<Panel baseline={baseline} onChange={change} />)
    fireEvent.click(screen.getByRole("button", { name: "Reset all" }))
    expect(change).toHaveBeenLastCalledWith({ order: ["size", "px"], widths: { px: 0 }, hidden: ["spread"] })
    expect(order()).toEqual(["id", "size", "px", "spread"])
    expect(screen.getByRole("button", { name: "Reset all" })).toBeDisabled()
    expect(document.querySelector('[data-column="px"] [data-column-width]')).toHaveTextContent("0 px")
  })

  it("does not apply a new baseline until an edit requests it", () => {
    const change = vi.fn()
    const { rerender } = render(<ColumnSettingsPanel columns={columns} columnState={EMPTY_COLUMN_STATE} onColumnStateChange={change} />)
    rerender(<ColumnSettingsPanel columns={columns} columnState={EMPTY_COLUMN_STATE} baseState={base} onColumnStateChange={change} />)
    expect(change).not.toHaveBeenCalled()
    expect(screen.getByRole("checkbox", { name: "Show Spread" })).toBeChecked()
    expect(document.querySelector('[data-column="px"] [data-column-width]')).toHaveTextContent("80 px")
    expect(screen.getByRole("button", { name: "Reset all" })).toBeEnabled()
    fireEvent.click(screen.getByRole("button", { name: "Reset width: Price" }))
    expect(change).toHaveBeenLastCalledWith({ ...EMPTY_COLUMN_STATE, widths: { px: 120 } })
  })
})

describe("accepted edit announcements", () => {
  it("retains an accepted command issued by a child while an external update commits", () => {
    function HideWithPrice({ hidden }: { hidden: boolean }) {
      const { row, setVisible } = useColumnChooserItem()
      useLayoutEffect(() => { if (hidden) setVisible(false) }, [hidden, setVisible])
      return <span>{row.visible ? "Size is visible" : "Size is hidden"}</span>
    }
    function Coordinated() {
      const [state, setState] = useState(EMPTY_COLUMN_STATE)
      return <>
        <button onClick={() => setState({ ...EMPTY_COLUMN_STATE, hidden: ["px"] })}>Apply shared visibility</button>
        <ColumnChooser columns={columns} columnState={state} onColumnStateChange={setState}>
          <ColumnChooserItem columnKey="size"><HideWithPrice hidden={state.hidden.includes("px")} /></ColumnChooserItem>
          <ColumnChooserAnnouncer />
        </ColumnChooser>
      </>
    }
    render(<Coordinated />)
    fireEvent.click(screen.getByRole("button", { name: "Apply shared visibility" }))
    expect(screen.getByText("Size is hidden")).toBeInTheDocument()
    expect(screen.getByRole("status")).toHaveTextContent("Size hidden.")
  })

  it("stays silent on mount, no-op, refused edits and unrelated external updates", () => {
    function Commands() {
      const item = useColumnChooserItem()
      return <button onClick={() => item.setVisible(true)}>Show again</button>
    }
    const change = vi.fn()
    const chooser = (state: ColumnState) => <ColumnChooser columns={columns} columnState={state} onColumnStateChange={change}><ColumnChooserItem columnKey="px"><Commands /><ColumnChooserMove direction="down">Down</ColumnChooserMove></ColumnChooserItem><ColumnChooserResetAll>Reset</ColumnChooserResetAll><ColumnChooserAnnouncer /></ColumnChooser>
    const { rerender } = render(chooser(EMPTY_COLUMN_STATE))
    const status = screen.getByRole("status")
    expect(status).toBeEmptyDOMElement()
    fireEvent.click(screen.getByRole("button", { name: "Show again" }))
    expect(change).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Move down: Price" }))
    expect(change).toHaveBeenCalledOnce()
    expect(status).toBeEmptyDOMElement()
    rerender(chooser({ ...EMPTY_COLUMN_STATE, hidden: ["size"] }))
    expect(status).toBeEmptyDOMElement()
    rerender(chooser(change.mock.lastCall![0]))
    expect(status).toBeEmptyDOMElement()
  })

  it("announces delayed accepted state, including an equivalent server representation", () => {
    let accept = () => {}
    function Async() {
      const [state, setState] = useState(EMPTY_COLUMN_STATE)
      return <ColumnSettingsPanel columns={columns} columnState={state} onColumnStateChange={(next) => { accept = () => setState({ ...next, widths: { px: 80 } }) }} labels={{ announceHide: "Hidden: {name}" }} />
    }
    render(<Async />)
    fireEvent.click(screen.getByRole("checkbox", { name: "Show Price" }))
    expect(screen.getByRole("status")).toBeEmptyDOMElement()
    act(() => accept())
    expect(screen.getByRole("status")).toHaveTextContent("Hidden: Price")
    expect(screen.getByRole("checkbox", { name: "Show Price" })).not.toBeChecked()
  })

  it("replaces the message child for repeated accepted edits without duplicating live regions", () => {
    render(<Panel />)
    const checkbox = screen.getByRole("checkbox", { name: "Show Price" })
    fireEvent.click(checkbox)
    const status = screen.getByRole("status")
    const message = status.firstChild
    fireEvent.click(checkbox)
    fireEvent.click(checkbox)
    expect(status).toHaveTextContent("Price hidden.")
    expect(status.firstChild).not.toBe(message)
    expect(screen.getAllByRole("status")).toHaveLength(1)
    expect(within(status).queryByRole("button")).toBeNull()
  })

  it("does not confirm a pending edit from a definition-only change", () => {
    const state = EMPTY_COLUMN_STATE
    const change = vi.fn()
    const { rerender } = render(<ColumnSettingsPanel columns={columns} columnState={state} onColumnStateChange={change} />)
    fireEvent.click(screen.getByRole("button", { name: "Move down: Price" }))
    const definitions = [columns[0]!, columns[2]!, columns[1]!, columns[3]!]
    rerender(<ColumnSettingsPanel columns={definitions} columnState={state} onColumnStateChange={change} />)
    expect(order()).toEqual(["id", "spread", "px", "size"])
    expect(screen.getByRole("status")).toBeEmptyDOMElement()
  })

  it("keeps the announcement subscription local and cleans it up through StrictMode and optional mounting", () => {
    let rootRenders = 0
    function Optional() {
      rootRenders++
      const [state, setState] = useState(EMPTY_COLUMN_STATE)
      const [announce, setAnnounce] = useState(false)
      return <ColumnChooser columns={columns} columnState={state} onColumnStateChange={setState}><button onClick={() => setAnnounce(!announce)}>Announcements</button><Collection />{announce && <ColumnChooserAnnouncer />}</ColumnChooser>
    }
    render(<StrictMode><Optional /></StrictMode>)
    expect(screen.queryByRole("status")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Move down: Price" }))
    fireEvent.click(screen.getByRole("button", { name: "Announcements" }))
    expect(screen.getByRole("status")).toBeEmptyDOMElement()
    const before = rootRenders
    fireEvent.click(screen.getByRole("button", { name: "Move up: Price" }))
    expect(screen.getByRole("status")).toHaveTextContent("Price moved to 2 of 4.")
    expect(rootRenders - before).toBe(2)
    fireEvent.click(screen.getByRole("button", { name: "Announcements" }))
    fireEvent.click(screen.getByRole("button", { name: "Announcements" }))
    expect(screen.getByRole("status")).toBeEmptyDOMElement()
  })
})

it("forwards dialog content refs and native props while retaining undefined layout defaults", () => {
  const ref = createRef<HTMLDivElement>()
  const contentProps = { ref, className: undefined, "aria-label": "Team columns", "data-content-probe": "present" }
  render(<ColumnSettingsDialog open onOpenChange={() => {}} columns={columns} columnState={EMPTY_COLUMN_STATE} onColumnStateChange={() => {}} contentProps={contentProps} children={null} />)
  const dialog = screen.getByRole("dialog", { name: "Columns" })
  expect(ref.current).toBe(dialog)
  expect(dialog).toHaveAttribute("aria-label", "Team columns")
  expect(dialog).toHaveAttribute("data-content-probe", "present")
  expect(dialog).toHaveClass("overflow-auto", "max-h-[calc(100%-2rem)]")
})

// Compiled against the installed primitive. The shared recipe owns its content children.
export function columnSettingsTypes() {
  const props = { columns, columnState: base, baseState: base, onColumnStateChange: () => {} }
  const presented: readonly string[] = ["id", "px"]
  const root = <ColumnChooser {...props} presented={presented}><Collection /><ColumnChooserAnnouncer /></ColumnChooser>
  const dialog = <ColumnSettingsDialog {...props} open onOpenChange={() => {}} contentProps={{ finalFocus: false, className: undefined }} children={null} />
  // @ts-expect-error DialogContent children are supplied by the shared recipe.
  const contentChildren = <ColumnSettingsDialog {...props} open onOpenChange={() => {}} contentProps={{ children: <p>Discarded</p> }} children={null} />
  // @ts-expect-error The announcer owns its message content.
  const announcementChildren = <ColumnChooserAnnouncer>Discarded</ColumnChooserAnnouncer>
  return [root, dialog, contentChildren, announcementChildren]
}
