import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { useLayoutEffect } from "react"
import { createPortal } from "react-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_QUOTE_PANEL_LABELS, QuotePanel, allowsQuoteAction, quoteEdit, quotePanelColumns, type QuoteAction, type QuotePanelProps, type QuoteRow } from "@/registry/tradecn/blocks/quote-panel/quote-panel"
import { NULL_TOKEN, type InstrumentConvention } from "@/registry/tradecn/lib/format"
import type { Limits } from "@/registry/tradecn/lib/limits"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import { DataGrid, type CellEditHandle, type ColumnDef } from "@/registry/tradecn/ui/data-grid"

const T32: InstrumentConvention = { price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 }
const DECIMAL: InstrumentConvention = { price: { kind: "decimal", decimals: 3 }, tick: 0.001 }
const LIMITS: Limits = { maxDistance: { ticks: 4, level: "confirm" }, maxQuantity: { confirm: 50_000_000, block: 100_000_000 } }
const RECT = { width: 1200, height: 200 }

// 2Y quoting 100-07 / 100-08+ around a 100-07+ / 100-08 market, 10Y paused with no levels up, 30Y pulled and not editable.
const ROWS: QuoteRow[] = [
  { id: "2Y", instrument: "2Y", status: "Quoting", marketBid: 100.234375, marketAsk: 100.25, bid: 100.21875, ask: 100.265625, skew: 0, width: 3, bidSize: 25_000_000, askSize: 25_000_000, allowedActions: ["edit", "pause", "pull"] },
  { id: "10Y", instrument: "10Y", status: "Paused", marketBid: 99.5, marketAsk: 99.515625, bid: null, ask: null, skew: 0, width: 4, bidSize: 10_000_000, askSize: 10_000_000, allowedActions: ["edit", "resume", "pull"] },
  { id: "30Y", instrument: "30Y", status: "Pulled", marketBid: 98.671875, marketAsk: 98.6875, bid: null, ask: null, skew: -1, width: 8, bidSize: null, askSize: null, allowedActions: ["resume"] },
]

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

function setup(props: Partial<QuotePanelProps> = {}) {
  const store = createRowStore<QuoteRow>({ getRowId: (q) => q.id })
  store.applyDeltas({ upsert: ROWS })
  const onEdit = vi.fn()
  const onPullAll = vi.fn()
  const actions: QuoteAction[] = [
    { id: "pause", label: "Pause", run: vi.fn() },
    { id: "resume", label: "Resume", run: vi.fn() },
    { id: "pull", label: "Pull", destructive: true, run: vi.fn() },
  ]
  render(<QuotePanel store={store} convention={T32} actions={actions} limits={LIMITS} onEdit={onEdit} onPullAll={onPullAll} initialRect={RECT} {...props} />)
  const grid = screen.getByRole("grid", { name: "Quotes" })
  const cell = (rowId: string, key: string) => document.querySelector<HTMLElement>(`[data-row-id="${rowId}"] [data-col="${key}"]`)!
  const open = (rowId: string, key: string, name: string) => {
    fireEvent.doubleClick(cell(rowId, key).firstElementChild!)
    return screen.getByRole("textbox", { name }) as HTMLInputElement
  }
  const type = (input: HTMLElement, value: string) => {
    fireEvent.change(input, { target: { value } })
    fireEvent.keyDown(input, { key: "Enter" })
  }
  return { store, grid, cell, open, type, onEdit, onPullAll, actions }
}

describe("quotePanelColumns and quoteEdit", () => {
  it("lays out the instrument, the status, both two-ways, skew, width, the sizes, and the actions, in the convention's family", () => {
    const columns = quotePanelColumns({ convention: T32, actions: [{ id: "a", label: "A", run: () => {} }] })
    expect(columns.map((c) => c.key)).toEqual(["instrument", "status", "marketBid", "marketAsk", "bid", "ask", "skew", "width", "bidSize", "askSize", "actions"])
    expect(columns[0]).toMatchObject({ frozen: "left", flash: false })
    expect(columns.find((c) => c.key === "marketBid")).toMatchObject({ numeric: true, font: "mono", flash: "fill" })
    expect(columns.find((c) => c.key === "bid")?.edit).toBeDefined()
    expect(columns.find((c) => c.key === "marketBid")?.edit).toBeUndefined()
    expect(columns.find((c) => c.key === "actions")).toMatchObject({ width: 104 })
    expect(quotePanelColumns({ convention: DECIMAL }).find((c) => c.key === "bid")).toMatchObject({ font: "numeric" })
    expect(quotePanelColumns({ convention: () => T32 }).find((c) => c.key === "bid")).toMatchObject({ font: "numeric" })
    expect(quotePanelColumns({ convention: () => T32, font: "mono" }).find((c) => c.key === "bid")).toMatchObject({ font: "mono" })
  })

  it("reads a level in the instrument's notation, steps it by a quote step from the market when the side is empty, and refuses a crossed one", () => {
    const edit = quoteEdit<QuoteRow>("bid", { convention: T32 })
    const row = ROWS[0]!
    expect(edit.parse("100-06+", row)).toBe(100.203125)
    expect(edit.parse("  ", row)).toBeNull()
    expect(edit.parse("abc", row)).toEqual({ problem: DEFAULT_QUOTE_PANEL_LABELS.notAQuote })
    expect(edit.format?.(100.203125, row)).toBe("100-06+")
    expect(edit.format?.(null, row)).toBe("")
    expect(edit.step?.(100.21875, 1, false, row)).toBe(100.234375)
    expect(edit.step?.(100.21875, -1, true, row)).toBe(100.0625)
    expect(edit.step?.(null, 1, false, ROWS[1]!)).toBe(99.515625)
    expect(edit.validate?.(100.265625, row)).toEqual({ problem: DEFAULT_QUOTE_PANEL_LABELS.bidCrosses })
    expect(edit.validate?.(100.21875, row)).toBeNull()
    expect(quoteEdit<QuoteRow>("ask", { convention: T32 }).validate?.(100.21875, row)).toEqual({ problem: DEFAULT_QUOTE_PANEL_LABELS.askCrosses })
    expect(edit.canEdit?.(row)).toBe(true)
    expect(edit.canEdit?.(ROWS[2]!)).toBe(false)
    // Crossing follows the quote direction: a declared inverted instrument — cash credit —
    // quotes the bid above the offer, so the refusals flip.
    const CASH = { price: { kind: "decimal" as const, decimals: 3 }, tick: 0.001, quoteBasis: "spread" as const, quoteInverted: true }
    const cashBid = quoteEdit<QuoteRow>("bid", { convention: CASH })
    expect(cashBid.validate?.(row.ask! - 0.5, row)).toEqual({ problem: DEFAULT_QUOTE_PANEL_LABELS.bidCrosses })
    expect(cashBid.validate?.(row.ask! + 0.5, row)).toBeNull()
    // An undeclared yield basis inverts by default — the migration names the flip — and
    // quoteInverted: false keeps the plain reading.
    const YIELDED = { price: { kind: "decimal" as const, decimals: 3 }, tick: 0.001, quoteBasis: "yield" as const }
    const yieldBid = quoteEdit<QuoteRow>("bid", { convention: YIELDED })
    expect(yieldBid.validate?.(row.ask! - 0.5, row)).toEqual({ problem: DEFAULT_QUOTE_PANEL_LABELS.bidCrosses })
    const plain = quoteEdit<QuoteRow>("bid", { convention: { ...YIELDED, quoteInverted: false } })
    expect(plain.validate?.(row.ask! + 0.5, row)).toEqual({ problem: DEFAULT_QUOTE_PANEL_LABELS.bidCrosses })
    expect(plain.validate?.(row.ask! - 0.5, row)).toBeNull()
    // The ask side flips with the bid, and an equal pair is refused in both directions.
    const cashAsk = quoteEdit<QuoteRow>("ask", { convention: CASH })
    expect(cashAsk.validate?.(row.bid! + 0.5, row)).toEqual({ problem: DEFAULT_QUOTE_PANEL_LABELS.askCrosses })
    expect(cashAsk.validate?.(row.bid! - 0.5, row)).toBeNull()
    expect(cashBid.validate?.(row.ask!, row)).toEqual({ problem: DEFAULT_QUOTE_PANEL_LABELS.bidCrosses })
    expect(cashAsk.validate?.(row.bid!, row)).toEqual({ problem: DEFAULT_QUOTE_PANEL_LABELS.askCrosses })
  })

  it("reads a size as a whole number, zero or more, and a skew or width as a number of steps", () => {
    const size = quoteEdit<QuoteRow>("bidSize", { convention: T32 })
    expect(size.parse("25,000,000", ROWS[0]!)).toBe(25_000_000)
    expect(size.parse("", ROWS[0]!)).toBeNull()
    expect(size.parse("-5", ROWS[0]!)).toEqual({ problem: DEFAULT_QUOTE_PANEL_LABELS.notASize })
    expect(size.parse("1.5", ROWS[0]!)).toEqual({ problem: DEFAULT_QUOTE_PANEL_LABELS.notASize })
    expect(size.parse("x", ROWS[0]!)).toEqual({ problem: DEFAULT_QUOTE_PANEL_LABELS.notANumber })
    expect(size.step?.(0, -1, false, ROWS[0]!)).toBe(0)
    expect(size.step?.(5, 1, true, ROWS[0]!)).toBe(15)
    const skew = quoteEdit<QuoteRow>("skew", { convention: T32 })
    expect(skew.parse("−1.5", ROWS[0]!)).toBe(-1.5)
    expect(skew.format?.(1.5, ROWS[0]!)).toBe("+1.5")
    expect(quoteEdit<QuoteRow>("width", { convention: T32 }).format?.(3, ROWS[0]!)).toBe("3")
    expect(skew.step?.(0.5, 1, false, ROWS[0]!)).toBe(1.5)
    expect(skew.validate).toBeUndefined()
  })

  it("reads plain decimals only, and never a negative width", () => {
    const width = quoteEdit<QuoteRow>("width", { convention: T32 })
    const size = quoteEdit<QuoteRow>("bidSize", { convention: T32 })
    expect(width.parse("-1", ROWS[0]!)).toEqual({ problem: "A width is zero or more." })
    expect(width.parse("0x10", ROWS[0]!)).toEqual({ problem: "Not a number." })
    expect(width.parse("2.5", ROWS[0]!)).toBe(2.5)
    expect(size.parse("1e3", ROWS[0]!)).toEqual({ problem: "Not a number." })
    expect(quoteEdit<QuoteRow>("skew", { convention: T32 }).parse("-1.5", ROWS[0]!)).toBe(-1.5)
  })

  it("checks the limits as a value is committed: a block refuses it, a confirm asks and a fresh Enter in the same opening answers", () => {
    const asked = new Set<string>()
    const onQuestion = vi.fn()
    const bid = quoteEdit<QuoteRow>("bid", { convention: T32, limits: LIMITS, asked, onQuestion })
    const row = ROWS[0]!
    const enter = { via: "enter", repeat: false, session: 1 } as const
    const question = "The bid is 7 ticks from the market, past 4 ticks. Send it anyway? Press Enter again to send it, or Escape to discard it."
    expect(bid.validate?.(100.125, row, enter)).toEqual({ problem: question })
    expect(onQuestion).toHaveBeenLastCalledWith(question)
    expect(bid.validate?.(100.125, row, enter)).toBeNull()
    expect(onQuestion).toHaveBeenLastCalledWith(null)
    // Asked and answered: the next commit of the same value asks again.
    expect(bid.validate?.(100.125, row, enter)).toEqual({ problem: question })
    // A held Enter's repeat, Tab, and leaving the editor ask again rather than answer.
    expect(bid.validate?.(100.125, row, { ...enter, repeat: true })).toEqual({ problem: question })
    expect(bid.validate?.(100.125, row, { ...enter, via: "tab" })).toEqual({ problem: question })
    expect(bid.validate?.(100.125, row, { ...enter, via: "blur" })).toEqual({ problem: question })
    // Another opening of the editor never inherits the question.
    expect(bid.validate?.(100.125, row, { ...enter, session: 2 })).toEqual({ problem: question })
    expect(bid.validate?.(100.125, row, enter)).toBeNull()
    // Without the grid's commit, nothing answers: a wrapper that drops it fails closed.
    expect(bid.validate?.(100.125, row)).toEqual({ problem: question })
    expect(bid.validate?.(100.125, row)).toEqual({ problem: question })
    // A control answers by committing the same value again, and is asked in its own words.
    const control = { via: "value", repeat: false, session: 0 } as const
    expect(bid.validate?.(100.109375, row, control)).toEqual({ problem: "The bid is 8 ticks from the market, past 4 ticks. Send it anyway? Do it again to send it." })
    expect(bid.validate?.(100.109375, row, control)).toBeNull()
    // A crossed value, a block, and a value inside the limits each withdraw a standing question.
    const third = { ...enter, session: 3 }
    bid.validate?.(100.125, row, third)
    expect(onQuestion).toHaveBeenLastCalledWith(question)
    expect(bid.validate?.(100.265625, row, third)).toEqual({ problem: "The bid would cross the ask." })
    expect(onQuestion).toHaveBeenLastCalledWith(null)
    const fourth = { ...enter, session: 4 }
    expect(bid.validate?.(100.125, row, fourth)).toEqual({ problem: question })
    expect(onQuestion).toHaveBeenLastCalledWith(question)
    expect(bid.validate?.(100.21875, row, fourth)).toBeNull()
    expect(onQuestion).toHaveBeenLastCalledWith(null)
    const size = quoteEdit<QuoteRow>("bidSize", { convention: T32, limits: LIMITS, asked, onQuestion })
    expect(size.validate?.(60_000_000, row, enter)).toEqual({ problem: "60,000,000 is above 50,000,000. Send it anyway? Press Enter again to send it, or Escape to discard it." })
    expect(onQuestion).toHaveBeenLastCalledWith("60,000,000 is above 50,000,000. Send it anyway? Press Enter again to send it, or Escape to discard it.")
    expect(size.validate?.(150_000_000, row, enter)).toEqual({ problem: "150,000,000 is above the size limit of 100,000,000." })
    expect(onQuestion).toHaveBeenLastCalledWith(null)
    expect(size.validate?.(150_000_000, row, enter)).toEqual({ problem: "150,000,000 is above the size limit of 100,000,000." })
    expect(size.validate?.(60_000_000, row, enter)).toBeNull()
    expect(size.validate?.(10_000_000, row, enter)).toBeNull()
    // No limits for the row: nothing to ask, and any standing question is withdrawn.
    const unlimited = quoteEdit<QuoteRow>("bidSize", { convention: T32, limits: () => undefined, asked, onQuestion })
    size.validate?.(60_000_000, row, third)
    expect(onQuestion).toHaveBeenLastCalledWith(expect.stringContaining("Send it anyway?"))
    expect(unlimited.validate?.(60_000_000, row, third)).toBeNull()
    expect(onQuestion).toHaveBeenLastCalledWith(null)
    // Limits per row.
    const perRow = quoteEdit<QuoteRow>("bidSize", { convention: T32, limits: (r) => (r.id === "2Y" ? { maxQuantity: 1 } : undefined) })
    expect(perRow.validate?.(5, ROWS[0]!)).toEqual({ problem: "5 is above the size limit of 1." })
    expect(perRow.validate?.(5, ROWS[1]!)).toBeNull()
  })

  it("answers whether the server's list names an action", () => {
    expect(allowsQuoteAction(ROWS[0]!, "pause")).toBe(true)
    expect(allowsQuoteAction(ROWS[0]!, "resume")).toBe(false)
    expect(allowsQuoteAction({ id: "x", instrument: "x", status: "s" }, "edit")).toBe(false)
  })
})

describe("the panel", () => {
  it("prints the server's rows: both two-ways in 32nds, the status word, the steps, the sizes, and each row's allowed actions", () => {
    const { store, grid, cell } = setup()
    expect(grid.closest("[data-slot='tradecn-quote-panel']")).not.toBeNull()
    expect(within(grid).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Instrument", "Status", "Mkt bid", "Mkt ask", "Bid", "Ask", "Skew", "Width", "Bid size", "Ask size", "Actions"])
    expect(cell("2Y", "status").querySelector("[data-quote-status]")).toHaveAttribute("data-quote-status", "Quoting")
    expect(cell("2Y", "status")).toHaveTextContent("Quoting")
    expect(cell("2Y", "marketBid")).toHaveTextContent("100-07+")
    expect(cell("2Y", "marketAsk")).toHaveTextContent("100-08")
    expect(cell("2Y", "bid")).toHaveTextContent("100-07")
    expect(cell("2Y", "ask")).toHaveTextContent("100-08+")
    expect(cell("2Y", "skew")).toHaveTextContent("0")
    expect(cell("30Y", "skew")).toHaveTextContent("−1")
    expect(cell("2Y", "width")).toHaveTextContent("3")
    expect(cell("2Y", "bidSize")).toHaveTextContent("25,000,000")
    expect(cell("10Y", "bid")).toHaveTextContent(NULL_TOKEN)
    expect(cell("30Y", "bidSize")).toHaveTextContent(NULL_TOKEN)
    expect(within(cell("2Y", "actions")).getAllByRole("button").map((b) => b.textContent)).toEqual(["Pause", "Pull"])
    expect(within(cell("10Y", "actions")).getAllByRole("button").map((b) => b.textContent)).toEqual(["Resume", "Pull"])
    expect(within(cell("30Y", "actions")).getAllByRole("button").map((b) => b.textContent)).toEqual(["Resume"])
    expect(cell("2Y", "actions").querySelector("[data-quote-actions]")).toHaveAttribute("data-quote-actions", "2")
    // No edit in the list: the level cells are read-only. No actions at all: the null token.
    expect(cell("30Y", "bid")).toHaveAttribute("aria-readonly", "true")
    expect(cell("2Y", "bid")).toHaveAttribute("aria-readonly", "false")
    act(() => store.applyDeltas({ upsert: [{ id: "7Y", instrument: "7Y", status: "Pulled", allowedActions: [] }] }))
    expect(cell("7Y", "actions")).toHaveTextContent(NULL_TOKEN)
    expect(cell("7Y", "actions").querySelector("button")).toBeNull()
  })

  it("types a level in the notation, sends it as a change, and holds it pending until the server's row agrees; a blank side is null", () => {
    const { store, cell, open, type, onEdit } = setup()
    const input = open("2Y", "bid", "Bid")
    expect(input.value).toBe("100-07")
    fireEvent.keyDown(input, { key: "ArrowUp" })
    expect(input.value).toBe("100-07+")
    type(input, "100-06+")
    expect(onEdit).toHaveBeenCalledWith({ rowId: "2Y", key: "bid", value: 100.203125, previous: 100.21875, row: expect.objectContaining({ id: "2Y" }) })
    expect(cell("2Y", "bid")).toHaveAttribute("data-pending")
    expect(cell("2Y", "bid")).toHaveTextContent("100-06+")
    act(() => store.applyDeltas({ patch: [{ id: "2Y", fields: { bid: 100.203125 } }] }))
    expect(cell("2Y", "bid")).not.toHaveAttribute("data-pending")
    type(open("2Y", "ask", "Ask"), "")
    expect(onEdit).toHaveBeenLastCalledWith(expect.objectContaining({ key: "ask", value: null, previous: 100.265625 }))
  })

  it("refuses what is not a quote, and a level that would cross the desk's other side, before anything is sent", () => {
    const { open, type, onEdit } = setup()
    const bid = open("2Y", "bid", "Bid")
    type(bid, "abc")
    expect(bid).toHaveAttribute("aria-description", DEFAULT_QUOTE_PANEL_LABELS.notAQuote)
    type(bid, "100-09")
    expect(bid).toHaveAttribute("aria-description", DEFAULT_QUOTE_PANEL_LABELS.bidCrosses)
    fireEvent.keyDown(bid, { key: "Escape" })
    const ask = open("2Y", "ask", "Ask")
    type(ask, "100-06")
    expect(ask).toHaveAttribute("aria-description", DEFAULT_QUOTE_PANEL_LABELS.askCrosses)
    expect(onEdit).not.toHaveBeenCalled()
  })

  it("asks once about a level past the limit and sends it on the second Enter; a size over the line is refused outright", () => {
    const { open, type, onEdit } = setup()
    const bid = open("2Y", "bid", "Bid")
    type(bid, "100-04")
    expect(bid).toHaveAttribute("aria-description", "The bid is 7 ticks from the market, past 4 ticks. Send it anyway? Press Enter again to send it, or Escape to discard it.")
    expect(onEdit).not.toHaveBeenCalled()
    fireEvent.keyDown(bid, { key: "Enter" })
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ key: "bid", value: 100.125 }))
    const size = open("2Y", "bidSize", "Bid size")
    type(size, "150000000")
    expect(size).toHaveAttribute("aria-description", "150,000,000 is above the size limit of 100,000,000.")
    fireEvent.keyDown(size, { key: "Enter" })
    expect(size).toHaveAttribute("aria-description", "150,000,000 is above the size limit of 100,000,000.")
    expect(onEdit).toHaveBeenCalledTimes(1)
    type(size, "60000000")
    expect(size).toHaveAttribute("aria-description", "60,000,000 is above 50,000,000. Send it anyway? Press Enter again to send it, or Escape to discard it.")
    fireEvent.keyDown(size, { key: "Enter" })
    expect(onEdit).toHaveBeenLastCalledWith(expect.objectContaining({ key: "bidSize", value: 60_000_000 }))
  })

  it("shows a limit question over the grid, and sends only on a fresh Enter: a held Enter and Tab ask again", () => {
    const { open, type, onEdit } = setup()
    const bid = open("2Y", "bid", "Bid")
    type(bid, "100-04")
    const question = "The bid is 7 ticks from the market, past 4 ticks. Send it anyway? Press Enter again to send it, or Escape to discard it."
    expect(document.querySelector("[data-quote-question]")).toHaveTextContent(question)
    expect(document.querySelector("[data-quote-question]")).toHaveAttribute("role", "status")
    fireEvent.keyDown(bid, { key: "Enter", repeat: true })
    expect(onEdit).not.toHaveBeenCalled()
    fireEvent.keyDown(bid, { key: "Tab" })
    expect(onEdit).not.toHaveBeenCalled()
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Bid" }), { key: "Enter" })
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ key: "bid", value: 100.125 }))
    expect(document.querySelector("[data-quote-question]")).toBeNull()
  })

  it("discards a limit question when the editor is left or escaped, so the same value is asked about again", () => {
    const { open, type, onEdit } = setup()
    const bid = open("2Y", "bid", "Bid")
    type(bid, "100-04")
    fireEvent.blur(bid)
    expect(onEdit).not.toHaveBeenCalled()
    expect(document.querySelector("[data-quote-question]")).toBeNull()
    const again = open("2Y", "bid", "Bid")
    type(again, "100-04")
    expect(onEdit).not.toHaveBeenCalled()
    fireEvent.keyDown(again, { key: "Escape" })
    expect(document.querySelector("[data-quote-question]")).toBeNull()
    const third = open("2Y", "bid", "Bid")
    type(third, "100-04")
    expect(onEdit).not.toHaveBeenCalled()
    fireEvent.keyDown(third, { key: "Enter" })
    expect(onEdit).toHaveBeenCalledTimes(1)
  })

  it("withdraws a limit question as its text changes, so a value typed away and back, or Tab away and back, is asked about again", () => {
    const { open, type, onEdit } = setup()
    const question = () => document.querySelector("[data-quote-question]")
    const bid = open("2Y", "bid", "Bid")
    type(bid, "100-04")
    expect(question()).not.toBeNull()
    fireEvent.change(bid, { target: { value: "100-05" } })
    expect(question()).toBeNull()
    type(bid, "100-04")
    expect(onEdit).not.toHaveBeenCalled()
    expect(question()).not.toBeNull()
    // Back to the bid as it stands, and Tab: nothing to send, so the ask opens.
    fireEvent.change(bid, { target: { value: "100-07" } })
    fireEvent.keyDown(bid, { key: "Tab" })
    const ask = screen.getByRole("textbox", { name: "Ask" })
    expect(question()).toBeNull()
    fireEvent.keyDown(ask, { key: "Tab", shiftKey: true })
    const back = screen.getByRole("textbox", { name: "Bid" })
    type(back, "100-04")
    expect(onEdit).not.toHaveBeenCalled()
    fireEvent.keyDown(back, { key: "Enter" })
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ key: "bid", value: 100.125 }))
  })

  it("withdraws a limit question when its row leaves the view and the grid takes focus", () => {
    const { store, grid, open, type, onEdit } = setup()
    const bid = open("2Y", "bid", "Bid")
    expect(document.activeElement).toBe(bid)
    type(bid, "100-04")
    expect(document.querySelector("[data-quote-question]")).not.toBeNull()
    act(() => store.applyDeltas({ remove: ["2Y"] }))
    expect(document.activeElement).toBe(grid)
    expect(document.querySelector("[data-quote-question]")).toBeNull()
    expect(onEdit).not.toHaveBeenCalled()
  })

  it("puts the actions of the row the menu opened on in it, named, whatever else is selected, and runs one on Enter", async () => {
    const { cell, actions } = setup({ selectionMode: "multi" })
    fireEvent.pointerDown(cell("2Y", "instrument").firstElementChild!, { button: 0 })
    fireEvent.pointerDown(cell("10Y", "instrument").firstElementChild!, { button: 0, ctrlKey: true })
    fireEvent.contextMenu(cell("10Y", "instrument").firstElementChild!)
    const resume = await screen.findByRole("menuitem", { name: "Resume" })
    expect(document.querySelector("[data-slot='context-menu-label']")?.textContent).toBe("10Y")
    expect(screen.getAllByRole("menuitem").map((m) => m.textContent)).toEqual(["Resume", "Pull"])
    act(() => resume.focus())
    fireEvent.keyDown(resume, { key: "Enter" })
    expect(actions[1]!.run).toHaveBeenCalledWith(expect.objectContaining({ id: "10Y" }))
    expect(actions[0]!.run).not.toHaveBeenCalled()
  })

  it("keeps an open row menu in step with the row's next batch", async () => {
    const { store, cell } = setup()
    fireEvent.contextMenu(cell("2Y", "instrument").firstElementChild!)
    await screen.findByRole("menuitem", { name: "Pause" })
    act(() => store.applyDeltas({ patch: [{ id: "2Y", fields: { allowedActions: ["edit", "resume", "pull"] } }] }))
    expect(screen.getAllByRole("menuitem").map((m) => m.textContent)).toEqual(["Resume", "Pull"])
  })

  it("holds the row menu's items while a run the row's button started is out", async () => {
    const { cell, actions } = setup()
    const pause = actions[0]!.run as ReturnType<typeof vi.fn>
    pause.mockImplementation(() => new Promise<void>(() => {}))
    fireEvent.click(within(cell("2Y", "actions")).getByRole("button", { name: "Pause" }))
    fireEvent.contextMenu(cell("2Y", "instrument").firstElementChild!)
    const pull = await screen.findByRole("menuitem", { name: "Pull" })
    expect(pull).toHaveAttribute("aria-disabled", "true")
    fireEvent.click(pull)
    expect(actions[2]!.run).not.toHaveBeenCalled()
  })

  it("keeps a row's hold while its row scrolls out of the view and back", () => {
    const { store, cell, actions } = setup()
    act(() => store.applyDeltas({ upsert: Array.from({ length: 80 }, (_, i) => ({ id: `F${i}`, instrument: `F${i}`, status: "Quoting", allowedActions: ["pause"] })) }))
    const pause = actions[0]!.run as ReturnType<typeof vi.fn>
    pause.mockImplementation(() => new Promise<void>(() => {}))
    fireEvent.click(within(cell("2Y", "actions")).getByRole("button", { name: "Pause" }))
    const scroller = document.querySelector<HTMLElement>(".overflow-auto")!
    act(() => {
      scroller.scrollTop = 1800
      fireEvent.scroll(scroller)
    })
    expect(document.querySelector('[data-row-id="2Y"]')).toBeNull()
    act(() => {
      scroller.scrollTop = 0
      fireEvent.scroll(scroller)
    })
    expect(within(cell("2Y", "actions")).getByRole("button", { name: "Pause" })).toBeDisabled()
  })

  it("puts each row's allowed actions on the row menu, sharing the row's hold with its buttons", async () => {
    const { cell, actions } = setup()
    const pause = actions[0]!.run as ReturnType<typeof vi.fn>
    pause.mockImplementation(() => new Promise<void>(() => {}))
    fireEvent.contextMenu(cell("2Y", "instrument").firstElementChild!)
    const item = await screen.findByRole("menuitem", { name: "Pause" })
    expect(screen.getAllByRole("menuitem").map((m) => m.textContent)).toEqual(["Pause", "Pull"])
    fireEvent.click(item)
    expect(pause).toHaveBeenCalledWith(expect.objectContaining({ id: "2Y" }))
    // The run the menu started holds the row's buttons too: one hold per row, kept by the panel.
    expect(within(cell("2Y", "actions")).getByRole("button", { name: "Pause" })).toBeDisabled()
  })

  it("moves focus to the grid when the row button under it leaves with the server's reply", () => {
    const { store, cell, grid } = setup()
    const pause = within(cell("2Y", "actions")).getByRole("button", { name: "Pause" })
    act(() => pause.focus())
    act(() => store.applyDeltas({ patch: [{ id: "2Y", fields: { allowedActions: ["edit", "resume", "pull"] } }] }))
    expect(document.activeElement).toBe(grid)
  })

  it("moves focus to the grid when the row under a focused button leaves the view", () => {
    const { store, cell, grid } = setup()
    const pause = within(cell("2Y", "actions")).getByRole("button", { name: "Pause" })
    act(() => pause.focus())
    act(() => store.applyDeltas({ remove: ["2Y"] }))
    expect(document.querySelector('[data-row-id="2Y"]')).toBeNull()
    expect(document.activeElement).toBe(grid)
  })

  it("moves focus to the grid when a focused row button scrolls out of the view, with no batch to prompt it", () => {
    const { store, cell, grid } = setup()
    act(() => store.applyDeltas({ upsert: Array.from({ length: 80 }, (_, i) => ({ id: `F${i}`, instrument: `F${i}`, status: "Quoting", allowedActions: ["pause"] })) }))
    act(() => within(cell("2Y", "actions")).getByRole("button", { name: "Pause" }).focus())
    const scroller = document.querySelector<HTMLElement>(".overflow-auto")!
    act(() => {
      scroller.scrollTop = 1800
      fireEvent.scroll(scroller)
    })
    expect(document.querySelector('[data-row-id="2Y"]')).toBeNull()
    expect(document.activeElement).toBe(grid)
  })

  it("moves focus to the grid when Pull all disables under it, and withdraws its question when focus leaves the panel", () => {
    const { grid, onPullAll } = setup()
    onPullAll.mockImplementation(() => new Promise(() => {}))
    const pull = screen.getByRole("button", { name: "Pull all" })
    fireEvent.click(pull)
    expect(pull).toHaveTextContent("Pull all anyway?")
    fireEvent.blur(pull)
    expect(pull.textContent).toBe("Pull all")
    act(() => pull.focus())
    fireEvent.click(pull)
    fireEvent.click(pull)
    expect(pull).toBeDisabled()
    expect(document.activeElement).toBe(grid)
  })

  it("moves focus to the grid from a departing row button in custom columns, without the panel", () => {
    // quotePanelColumns in a plain DataGrid: the row's own recovery, with no panel to fall back on.
    const store = createRowStore<QuoteRow>({ getRowId: (q) => q.id })
    store.applyDeltas({ upsert: ROWS })
    const columns = quotePanelColumns<QuoteRow>({ convention: T32, actions: [{ id: "pause", label: "Pause", run: vi.fn() }, { id: "resume", label: "Resume", run: vi.fn() }] })
    render(<DataGrid store={store} columns={columns} label="Custom" preset="parameters" initialRect={RECT} onEdit={vi.fn()} />)
    const grid = screen.getByRole("grid", { name: "Custom" })
    const pause = within(document.querySelector<HTMLElement>('[data-row-id="2Y"] [data-col="actions"]')!).getByRole("button", { name: "Pause" })
    act(() => pause.focus())
    act(() => store.applyDeltas({ patch: [{ id: "2Y", fields: { allowedActions: ["edit", "resume"] } }] }))
    expect(document.activeElement).toBe(grid)
  })

  it("withdraws its question and moves focus the same way in another document, as a popout renders it", () => {
    // happy-dom shares its element classes across windows, so this holds the panel to its own document; the
    // browser smoke holds it to another realm's classes.
    const frame = document.createElement("iframe")
    document.body.append(frame)
    const doc = frame.contentDocument!
    const store = createRowStore<QuoteRow>({ getRowId: (q) => q.id })
    store.applyDeltas({ upsert: ROWS })
    const onEdit = vi.fn()
    const onPullAll = vi.fn(() => new Promise<void>(() => {}))
    const { unmount } = render(createPortal(<QuotePanel store={store} convention={T32} limits={LIMITS} onEdit={onEdit} onPullAll={onPullAll} initialRect={RECT} />, doc.body))
    try {
      const view = within(doc.body)
      const grid = view.getByRole("grid", { name: "Quotes" })
      fireEvent.doubleClick(doc.querySelector('[data-row-id="2Y"] [data-col="bid"]')!.firstElementChild!)
      const bid = view.getByRole("textbox", { name: "Bid" })
      fireEvent.change(bid, { target: { value: "100-04" } })
      fireEvent.keyDown(bid, { key: "Enter" })
      expect(doc.querySelector("[data-quote-question]")).not.toBeNull()
      fireEvent.keyDown(bid, { key: "Escape" })
      expect(doc.querySelector("[data-quote-question]")).toBeNull()
      expect(onEdit).not.toHaveBeenCalled()
      const pull = view.getByRole("button", { name: "Pull all" })
      act(() => pull.focus())
      fireEvent.click(pull)
      fireEvent.click(pull)
      expect(pull).toBeDisabled()
      expect(doc.activeElement).toBe(grid)
    } finally {
      unmount()
      frame.remove()
    }
  })

  it("hands a commit from a mount-time layout effect to this render's onEdit", () => {
    const store = createRowStore<QuoteRow>({ getRowId: (q) => q.id })
    store.applyDeltas({ upsert: ROWS })
    const first = vi.fn()
    const second = vi.fn()
    function CommitOnMount({ edit }: { edit?: CellEditHandle }) {
      useLayoutEffect(() => {
        edit?.commit(5)
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])
      return <span>probe</span>
    }
    const base = quotePanelColumns<QuoteRow>({ convention: T32 })
    const probe: ColumnDef<QuoteRow> = { key: "width", header: "Width", width: 60, accessor: (r) => r.width, edit: { parse: (text) => Number(text) }, cell: ({ edit }) => <CommitOnMount edit={edit} /> }
    const { rerender } = render(<QuotePanel store={store} convention={T32} columns={base} onEdit={first} initialRect={RECT} />)
    rerender(<QuotePanel store={store} convention={T32} columns={[...base.filter((c) => c.key !== "width"), probe]} onEdit={second} initialRect={RECT} />)
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalled()
  })

  it("steps an empty side from the market, and steps skew and width by one", () => {
    const { open, type, onEdit } = setup()
    const bid = open("10Y", "bid", "Bid")
    expect(bid.value).toBe("")
    fireEvent.keyDown(bid, { key: "ArrowUp" })
    expect(bid.value).toBe("99-16+")
    fireEvent.keyDown(bid, { key: "Escape" })
    const skew = open("2Y", "skew", "Skew")
    expect(skew.value).toBe("0")
    fireEvent.keyDown(skew, { key: "ArrowUp" })
    fireEvent.keyDown(skew, { key: "ArrowUp" })
    expect(skew.value).toBe("+2")
    fireEvent.keyDown(skew, { key: "Enter" })
    expect(onEdit).toHaveBeenLastCalledWith(expect.objectContaining({ key: "skew", value: 2, previous: 0 }))
    type(open("2Y", "width", "Width"), "4.5")
    expect(onEdit).toHaveBeenLastCalledWith(expect.objectContaining({ key: "width", value: 4.5, previous: 3 }))
  })

  it("runs a row's action against the row as the click lands, holds the button while the promise is out, and moves nothing itself", async () => {
    let settle: () => void = () => {}
    const { store, cell, actions } = setup()
    const pause = actions[0]!.run as ReturnType<typeof vi.fn>
    pause.mockImplementation(() => new Promise<void>((resolve) => (settle = resolve)))
    const button = within(cell("2Y", "actions")).getByRole("button", { name: "Pause" })
    fireEvent.click(button)
    expect(pause).toHaveBeenCalledWith(expect.objectContaining({ id: "2Y", status: "Quoting" }))
    expect(button).toHaveAttribute("data-pending", "true")
    expect(button).toBeDisabled()
    expect(cell("2Y", "status")).toHaveTextContent("Quoting")
    await act(async () => {
      settle()
      await Promise.resolve()
    })
    expect(button).not.toHaveAttribute("data-pending")
    // The server's word, when it comes: Paused, and the buttons follow the list.
    act(() => store.applyDeltas({ patch: [{ id: "2Y", fields: { status: "Paused", allowedActions: ["edit", "resume", "pull"] } }] }))
    expect(cell("2Y", "status")).toHaveTextContent("Paused")
    expect(within(cell("2Y", "actions")).getAllByRole("button").map((b) => b.textContent)).toEqual(["Resume", "Pull"])
  })

  it("asks again before pulling all, withdraws the question on any other press or Escape, and hands over every row the server allows the pull on", () => {
    const { store, cell, onPullAll } = setup()
    const button = screen.getByRole("button", { name: "Pull all" })
    expect(button).toHaveAttribute("data-quote-pull-all", "2")
    fireEvent.click(button)
    expect(button).toHaveTextContent("Pull all anyway?")
    expect(button).toHaveAttribute("data-confirming", "true")
    // Another press in the panel withdraws it.
    fireEvent.click(cell("2Y", "status"))
    expect(button).toHaveTextContent("Pull all")
    expect(button).not.toHaveAttribute("data-confirming")
    fireEvent.click(button)
    fireEvent.keyDown(button, { key: "Escape" })
    expect(button).toHaveTextContent("Pull all")
    expect(onPullAll).not.toHaveBeenCalled()
    fireEvent.click(button)
    fireEvent.click(button)
    expect(onPullAll).toHaveBeenCalledTimes(1)
    expect((onPullAll.mock.calls[0]![0] as QuoteRow[]).map((r) => r.id)).toEqual(["2Y", "10Y"])
    expect(button).toHaveTextContent("Pull all")
    act(() => store.applyDeltas({ patch: [{ id: "2Y", fields: { status: "Pulled", allowedActions: ["resume"], bid: null, ask: null } }, { id: "10Y", fields: { status: "Pulled", allowedActions: ["resume"] } }] }))
    expect(button).toHaveAttribute("data-quote-pull-all", "0")
    expect(button).toBeDisabled()
  })

  it("shows no Pull all without a handler, and takes its words from labels", () => {
    setup({ onPullAll: undefined, labels: { pullAll: "Pull the lot", status: "State" } })
    expect(screen.queryByRole("button", { name: "Pull all" })).toBeNull()
    expect(document.querySelector("[data-quote-pull-all]")).toBeNull()
    expect(screen.getAllByRole("columnheader")[1]).toHaveTextContent("State")
  })
})
