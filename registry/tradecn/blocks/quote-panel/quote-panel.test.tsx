import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_QUOTE_PANEL_LABELS, QuotePanel, allowsQuoteAction, quoteEdit, quotePanelColumns, type QuoteAction, type QuotePanelProps, type QuoteRow } from "@/registry/tradecn/blocks/quote-panel/quote-panel"
import { NULL_TOKEN, type InstrumentConvention } from "@/registry/tradecn/lib/format"
import type { Limits } from "@/registry/tradecn/lib/limits"
import { createRowStore } from "@/registry/tradecn/lib/row-store"

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

  it("checks the limits as a value is committed: a block refuses it, a confirm asks once and lets the same value through next time", () => {
    const asked = new Set<string>()
    const bid = quoteEdit<QuoteRow>("bid", { convention: T32, limits: LIMITS, asked })
    const row = ROWS[0]!
    expect(bid.validate?.(100.125, row)).toEqual({ problem: "The bid is 7 ticks from the market, past 4 ticks. Send it anyway? Enter again sends it." })
    expect(bid.validate?.(100.125, row)).toBeNull()
    // Asked and answered: the next commit of the same value asks again.
    expect(bid.validate?.(100.125, row)).toEqual({ problem: "The bid is 7 ticks from the market, past 4 ticks. Send it anyway? Enter again sends it." })
    // A different value is a different question.
    expect(bid.validate?.(100.109375, row)).toEqual({ problem: "The bid is 8 ticks from the market, past 4 ticks. Send it anyway? Enter again sends it." })
    const size = quoteEdit<QuoteRow>("bidSize", { convention: T32, limits: LIMITS, asked })
    expect(size.validate?.(150_000_000, row)).toEqual({ problem: "150,000,000 is above the size limit of 100,000,000." })
    expect(size.validate?.(150_000_000, row)).toEqual({ problem: "150,000,000 is above the size limit of 100,000,000." })
    expect(size.validate?.(60_000_000, row)).toEqual({ problem: "60,000,000 is above 50,000,000. Send it anyway? Enter again sends it." })
    expect(size.validate?.(60_000_000, row)).toBeNull()
    expect(size.validate?.(10_000_000, row)).toBeNull()
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
    expect(bid).toHaveAttribute("aria-description", "The bid is 7 ticks from the market, past 4 ticks. Send it anyway? Enter again sends it.")
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
    expect(size).toHaveAttribute("aria-description", "60,000,000 is above 50,000,000. Send it anyway? Enter again sends it.")
    fireEvent.keyDown(size, { key: "Enter" })
    expect(onEdit).toHaveBeenLastCalledWith(expect.objectContaining({ key: "bidSize", value: 60_000_000 }))
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
