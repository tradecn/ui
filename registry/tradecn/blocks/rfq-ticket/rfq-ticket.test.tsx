import { fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { RFQ_TICKET_BINDINGS, RfqTicket, checkQuote, describeQuote, formatSize, quoteDistance, quotedSides, type RfqAction, type RfqInquiry, type RfqQuoteDraft, type RfqTicketProps } from "@/registry/tradecn/blocks/rfq-ticket/rfq-ticket"
import { HotkeysProvider } from "@/registry/tradecn/hooks/use-hotkeys"
import { createHotkeyRegistry, type HotkeyRegistry } from "@/registry/tradecn/lib/hotkeys"
import type { InstrumentConvention } from "@/registry/tradecn/lib/format"

const T32: InstrumentConvention = { price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 }
const BILL: InstrumentConvention = { price: { kind: "decimal", decimals: 3 }, tick: 0.0005, quoteBasis: "discount" }
const CREDIT: InstrumentConvention = { price: { kind: "decimal", decimals: 3 }, tick: 0.001, quoteBasis: "spread" }
const NOTE = { symbol: "T10", description: "T 4 1/8 05/15/34", convention: T32 }
const NOW = Date.now()

const inquiry = (over: Partial<RfqInquiry> = {}): RfqInquiry => ({
  id: "Q-1",
  instrument: NOTE,
  side: "buy",
  quantity: 5_000_000,
  client: { name: "Client A", tier: "Tier 1", trader: "J. Doe", salesperson: "K. Roe" },
  tags: ["RFQ", "3 dealers"],
  settlement: "T+1",
  receivedAt: NOW,
  expiresAt: NOW + 60_000,
  market: { label: "Composite", bid: 99.5, ask: 99.515625 },
  status: "Open",
  allowedActions: ["quote", "pass"],
  ...over,
})
const draftOf = (over: Partial<RfqQuoteDraft> = {}): RfqQuoteDraft => ({ inquiryId: "Q-1", bid: null, ask: null, ...over })

function mount(props: Partial<RfqTicketProps> = {}, registry: HotkeyRegistry | null = createHotkeyRegistry({ platform: "other" })) {
  const quote = vi.fn()
  const pass = vi.fn()
  const onDraftChange = vi.fn()
  const actions: RfqAction[] = [
    { id: "quote", label: "Quote", run: quote, primary: true },
    { id: "pass", label: "Pass", run: pass, needsQuote: false, destructive: true },
  ]
  const base = { inquiry: inquiry(), actions, onDraftChange }
  const ui = <RfqTicket {...base} {...props} />
  const view = render(registry ? <HotkeysProvider registry={registry}>{ui}</HotkeysProvider> : ui)
  const rerender = (next: Partial<RfqTicketProps>) => {
    const again = <RfqTicket {...base} {...props} {...next} />
    view.rerender(registry ? <HotkeysProvider registry={registry}>{again}</HotkeysProvider> : again)
  }
  return { quote, pass, onDraftChange, view, rerender, registry }
}
const field = (name: string) => screen.getByLabelText(name) as HTMLInputElement
const type = (input: HTMLInputElement, value: string) => fireEvent.change(input, { target: { value } })
const lastDraft = (fn: ReturnType<typeof vi.fn>) => fn.mock.calls.at(-1)?.[0] as RfqQuoteDraft

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "animate").mockImplementation(() => ({ cancel() {}, finish() {}, currentTime: 0, onfinish: null }) as unknown as Animation)
})
afterEach(() => vi.restoreAllMocks())

describe("the pure parts", () => {
  it("quotes the side the client did not take, and both for a market", () => {
    expect(quotedSides("buy")).toEqual(["ask"])
    expect(quotedSides("sell")).toEqual(["bid"])
    expect(quotedSides("two-way")).toEqual(["bid", "ask"])
  })
  it("says the size the way the desk does", () => {
    expect(formatSize(5_000_000, T32)).toBe("5mm")
    expect(formatSize(250, { ...T32, quantityUnit: "contracts" })).toBe("250")
  })
  it("names what stops a quote", () => {
    expect(checkQuote(draftOf({ ask: 99.5 }), inquiry())).toEqual({})
    expect(checkQuote(draftOf(), inquiry())).toEqual({ ask: "An offer is needed." })
    expect(checkQuote(draftOf(), inquiry({ side: "sell" }))).toEqual({ bid: "A bid is needed." })
    expect(checkQuote(draftOf({ bid: 99.5 }), inquiry({ side: "two-way" }))).toEqual({ ask: "An offer is needed." })
    expect(checkQuote(draftOf({ bid: 99.53125, ask: 99.5 }), inquiry({ side: "two-way" }))).toEqual({ ask: "The bid is above the offer." })
    expect(checkQuote(draftOf({ bid: 99.5, ask: 99.5 }), inquiry({ side: "two-way" }))).toEqual({})
  })
  it("says a quote in words", () => {
    expect(describeQuote(draftOf({ ask: 99.515625 }), inquiry())).toBe("Offer 5mm T 4 1/8 05/15/34 @ 99-16+")
    expect(describeQuote(draftOf(), inquiry())).toBe("Offer 5mm T 4 1/8 05/15/34")
    expect(describeQuote(draftOf({ bid: 99.5 }), inquiry({ side: "sell" }))).toBe("Bid 5mm T 4 1/8 05/15/34 @ 99-16")
    expect(describeQuote(draftOf({ bid: 99.5, ask: 99.515625 }), inquiry({ side: "two-way" }))).toBe("99-16 / 99-16+ for 5mm T 4 1/8 05/15/34")
  })
  it("measures a level against the market in the instrument's own steps", () => {
    expect(quoteDistance(99.53125, 99.515625, T32)).toEqual({ value: 1, text: "+1" })
    expect(quoteDistance(99.5, 99.515625, T32)).toEqual({ value: -1, text: "−1" })
    expect(quoteDistance(4.26, 4.25, BILL)).toEqual({ value: 1, text: "+1.0 bp" })
    expect(quoteDistance(112.5, 113, CREDIT)).toEqual({ value: -0.5, text: "−0.5 bp" })
    expect(quoteDistance(null, 99.5, T32)).toBeNull()
    expect(quoteDistance(99.5, undefined, T32)).toBeNull()
  })
})

describe("RfqTicket", () => {
  it("is a group named for the inquiry, an editing scope, the block's slot, and shows the inquiry as it came", () => {
    mount()
    const ticket = screen.getByRole("group", { name: "Inquiry Q-1" })
    expect(ticket).toHaveAttribute("data-slot", "tradecn-rfq-ticket")
    expect(ticket).toHaveAttribute("data-hotkey-scope", "editing")
    expect(ticket).toHaveAttribute("data-side", "buy")
    expect(ticket).toHaveAttribute("data-status", "Open")
    expect(ticket.querySelector("[data-rfq-headline]")).toHaveTextContent("Client A buys 5mm T 4 1/8 05/15/34")
    expect(ticket.querySelector("[data-rfq-tier]")).toHaveTextContent("Tier 1")
    expect(ticket.querySelectorAll("[data-rfq-tag]")).toHaveLength(2)
    expect(ticket).toHaveTextContent("J. Doe")
    expect(ticket).toHaveTextContent("Settles T+1")
    expect(ticket.querySelector("[data-rfq-status]")).toHaveTextContent("Open")
    expect(screen.getByRole("timer", { name: "Inquiry Q-1" })).toBeInTheDocument()
    // The client buys, so the dealer offers: one field, and the market's offer beside it.
    expect(screen.getByLabelText("Offer")).toBeInTheDocument()
    expect(screen.queryByLabelText("Bid")).toBeNull()
    expect(ticket.querySelector("[data-rfq-market-level='ask']")).toHaveTextContent("99-16+")
  })

  it("draws a bid for a seller, both for a market, the quoted levels, the context, and the message as given", () => {
    const { rerender } = mount({ inquiry: inquiry({ side: "sell", quoted: { bid: 99.484375 }, context: [{ label: "Position", value: "−12mm", tone: "down" }], message: "Cover 99-15" }) })
    expect(screen.getByLabelText("Bid")).toBeInTheDocument()
    expect(screen.queryByLabelText("Offer")).toBeNull()
    expect(document.querySelector("[data-rfq-quoted='bid']")).toHaveTextContent("99-15+")
    expect(document.querySelector("[data-rfq-context]")).toHaveTextContent("Position−12mm")
    expect(document.querySelector("[data-rfq-context] dd")?.className).toContain("text-down")
    expect(document.querySelector("[data-rfq-message]")).toHaveTextContent("Cover 99-15")
    rerender({ inquiry: inquiry({ side: "two-way" }) })
    expect(screen.getByLabelText("Bid")).toBeInTheDocument()
    expect(screen.getByLabelText("Offer")).toBeInTheDocument()
    expect(screen.getByRole("group", { name: "Inquiry Q-1" })).toHaveTextContent("asks a market in")
  })

  it("types a level in the notation, tells the draft, and says how far it sits from the market", () => {
    const { onDraftChange } = mount()
    type(field("Offer"), "99-17")
    expect(lastDraft(onDraftChange)).toEqual(draftOf({ ask: 99.53125 }))
    expect(document.querySelector("[data-rfq-distance='ask']")).toHaveTextContent("+1 vs market")
    type(field("Offer"), "99-16")
    expect(document.querySelector("[data-rfq-distance='ask']")).toHaveTextContent("−1 vs market")
    type(field("Offer"), "")
    expect(document.querySelector("[data-rfq-distance='ask']")?.textContent?.trim()).toBe("")
  })

  it("steps a blank level from the market's same side, then the suggested level, then the mid", () => {
    const { onDraftChange, rerender } = mount()
    fireEvent.keyDown(field("Offer"), { key: "ArrowUp" })
    expect(lastDraft(onDraftChange).ask).toBe(99.53125)
    rerender({ inquiry: inquiry({ market: undefined, suggested: { ask: 99.5 } }) })
    type(field("Offer"), "")
    fireEvent.keyDown(field("Offer"), { key: "ArrowDown" })
    expect(lastDraft(onDraftChange).ask).toBe(99.484375)
    rerender({ inquiry: inquiry({ market: { bid: 99.5, ask: 99.53125 }, side: "sell" }) })
    type(field("Bid"), "")
    fireEvent.keyDown(field("Bid"), { key: "ArrowUp" })
    expect(lastDraft(onDraftChange).bid).toBe(99.515625)
  })

  it("offers the suggested levels as one click, and fills the fields with them", () => {
    const { onDraftChange } = mount({ inquiry: inquiry({ side: "two-way", suggested: { bid: 99.5, ask: 99.515625 } }) })
    const button = screen.getByRole("button", { name: "Take the suggested levels: 99-16 / 99-16+" })
    expect(button).toHaveTextContent("Auto")
    fireEvent.click(button)
    expect(lastDraft(onDraftChange)).toEqual(draftOf({ bid: 99.5, ask: 99.515625 }))
    expect(field("Bid").value).toBe("99-16")
    expect(field("Offer").value).toBe("99-16+")
  })

  it("renders only the actions the server allowed, checks a quote before it goes, and lets a pass go without one", () => {
    const { quote, pass, rerender } = mount()
    expect(screen.getAllByRole("button").filter((b) => b.hasAttribute("data-action")).map((b) => b.getAttribute("data-action"))).toEqual(["quote", "pass"])
    fireEvent.click(screen.getByRole("button", { name: /^Quote/ }))
    expect(quote).not.toHaveBeenCalled()
    expect(screen.getByText("An offer is needed.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Pass" }))
    expect(pass).toHaveBeenCalledWith(draftOf(), inquiry())
    type(field("Offer"), "99-16+")
    expect(screen.queryByText("An offer is needed.")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: /^Quote/ }))
    expect(quote).toHaveBeenCalledWith(draftOf({ ask: 99.515625 }), inquiry())
    // The server allows nothing: no buttons, a line that says so, and the field is not live.
    rerender({ inquiry: inquiry({ allowedActions: [], status: "Done away" }) })
    expect(screen.queryByRole("button", { name: /^Quote/ })).toBeNull()
    expect(screen.getByText("Nothing can be done with this inquiry right now.")).toBeInTheDocument()
    expect(field("Offer")).toBeDisabled()
    expect(screen.getByRole("group", { name: "Inquiry Q-1" })).toHaveAttribute("data-status", "Done away")
    // Only a pass allowed: the field is not live either, since nothing would send what is in it.
    rerender({ inquiry: inquiry({ allowedActions: ["pass"] }) })
    expect(field("Offer")).toBeDisabled()
    expect(screen.getByRole("button", { name: "Pass" })).toBeEnabled()
  })

  it("rings once in primary when acknowledged, and never sets a status of its own", () => {
    const { rerender } = mount()
    // The countdown's bar is an animation of its own; the ring is the one after it.
    const animate = HTMLElement.prototype.animate as unknown as ReturnType<typeof vi.fn>
    const before = animate.mock.calls.length
    rerender({ acknowledged: "QT-1", inquiry: inquiry({ status: "Quoted" }) })
    expect(animate.mock.calls.length).toBe(before + 1)
    const [frames] = animate.mock.calls.at(-1)!
    expect(JSON.stringify(frames)).toContain("var(--primary)")
    expect(document.querySelector("[data-rfq-status]")).toHaveTextContent("Quoted")
    rerender({ acknowledged: "QT-1" })
    expect(animate.mock.calls.length).toBe(before + 1)
  })

  it("tells the draft after it changed, not on the first render, and starts where it is told", () => {
    const { onDraftChange } = mount({ defaultDraft: { ask: 99.5 } })
    expect(onDraftChange).not.toHaveBeenCalled()
    expect(field("Offer").value).toBe("99-16")
    fireEvent.keyDown(field("Offer"), { key: "ArrowUp" })
    expect(onDraftChange).toHaveBeenCalledTimes(1)
  })

  it("puts the keyboard in the first field only when asked", () => {
    mount()
    expect(document.activeElement).not.toBe(field("Offer"))
    mount({ autoFocus: true, inquiry: inquiry({ id: "Q-2", side: "two-way" }) })
    expect(document.activeElement).toBe(screen.getAllByLabelText("Bid")[0])
  })

  it("counts down from when it arrived to when it ends", () => {
    mount({ inquiry: inquiry({ receivedAt: Date.now(), expiresAt: Date.now() + 30_000 }) })
    const timer = screen.getByRole("timer", { name: "Inquiry Q-1" })
    expect(timer).toHaveTextContent(/0:(29|30)/)
    expect(timer).toHaveAttribute("data-tier", "plenty")
  })
})

describe("RfqTicket keys", () => {
  it("sends, steps the field the keyboard is in, and takes the suggested levels, all from inside the fields", () => {
    const { quote, registry, onDraftChange } = mount({ inquiry: inquiry({ side: "two-way", suggested: { bid: 99.5, ask: 99.515625 } }) })
    expect(registry!.list().map((e) => e.id)).toEqual(expect.arrayContaining(RFQ_TICKET_BINDINGS.map((b) => b.id)))
    expect(registry!.list().find((e) => e.id === "rfq.send")?.scope).toBe("editing")
    field("Offer").focus()
    fireEvent.keyDown(field("Offer"), { key: "ArrowUp", ctrlKey: true })
    expect(lastDraft(onDraftChange)).toEqual(draftOf({ ask: 99.53125 }))
    field("Bid").focus()
    fireEvent.keyDown(field("Bid"), { key: "ArrowDown", ctrlKey: true })
    expect(lastDraft(onDraftChange)).toEqual(draftOf({ bid: 99.484375, ask: 99.53125 }))
    fireEvent.keyDown(field("Bid"), { key: "a", ctrlKey: true, shiftKey: true })
    expect(lastDraft(onDraftChange)).toEqual(draftOf({ bid: 99.5, ask: 99.515625 }))
    fireEvent.keyDown(field("Bid"), { key: "Enter", ctrlKey: true })
    expect(quote).toHaveBeenCalledTimes(1)
    expect(quote).toHaveBeenCalledWith(draftOf({ bid: 99.5, ask: 99.515625 }), expect.objectContaining({ id: "Q-1" }))
    // Plain Enter sends nothing.
    fireEvent.keyDown(field("Bid"), { key: "Enter" })
    expect(quote).toHaveBeenCalledTimes(1)
  })

  it("does nothing from the key when the server allows nothing", () => {
    const { quote, rerender } = mount({ defaultDraft: { ask: 99.5 } })
    rerender({ inquiry: inquiry({ allowedActions: [] }) })
    fireEvent.keyDown(field("Offer"), { key: "Enter", ctrlKey: true })
    expect(quote).not.toHaveBeenCalled()
  })

  it("keeps two tickets' keys apart, declares the bindings once, and takes them back with the last ticket", () => {
    const registry = createHotkeyRegistry({ platform: "other" })
    const a = vi.fn()
    const b = vi.fn()
    const view = render(
      <HotkeysProvider registry={registry}>
        <RfqTicket inquiry={inquiry({ id: "Q-1" })} actions={[{ id: "quote", label: "Quote", run: a }]} defaultDraft={{ ask: 99.5 }} />
        <RfqTicket inquiry={inquiry({ id: "Q-2" })} actions={[{ id: "quote", label: "Quote", run: b }]} defaultDraft={{ ask: 99.5 }} />
      </HotkeysProvider>,
    )
    const fields = screen.getAllByLabelText("Offer")
    fireEvent.keyDown(fields[1]!, { key: "Enter", ctrlKey: true })
    expect(a).not.toHaveBeenCalled()
    expect(b).toHaveBeenCalledTimes(1)
    expect(registry.list().filter((e) => e.id === "rfq.send")).toHaveLength(1)
    view.unmount()
    expect(registry.list().some((e) => e.id === "rfq.send")).toBe(false)
  })

  it("renders without a HotkeysProvider and shows no keys", () => {
    mount({}, null)
    expect(screen.getByRole("button", { name: "Quote" }).querySelectorAll("kbd")).toHaveLength(0)
  })
})

describe("limits", () => {
  it("asks again when a level is past a confirm line, sends on the second click, and withdraws the question when the level changes", () => {
    const { quote } = mount({ limits: { maxDistance: { ticks: 4, level: "confirm" } } })
    // Seven 64ths over the offer of 99-16+.
    type(field("Offer"), "99-20")
    const button = screen.getByRole("button", { name: /^Quote/ })
    fireEvent.click(button)
    expect(quote).not.toHaveBeenCalled()
    expect(button).toHaveTextContent("Quote anyway?")
    expect(document.querySelector("[data-rfq-limits='confirm']")).toHaveTextContent("The ask is 7 ticks from the market, past 4 ticks. Send it anyway?")
    type(field("Offer"), "99-19")
    expect(button).toHaveTextContent("Quote")
    expect(document.querySelector("[data-rfq-limits]")).toBeNull()
    fireEvent.click(button)
    fireEvent.click(button)
    expect(quote).toHaveBeenCalledTimes(1)
    expect(lastDraft(quote)).toMatchObject({ ask: 99.59375 })
  })

  it("blocks under the field and holds the actions that send a quote, while a pass still runs", () => {
    const { quote, pass } = mount({ limits: { maxDistance: { ticks: 4 } } })
    type(field("Offer"), "99-20")
    expect(screen.getByText("The ask is 7 ticks from the market; the limit is 4 ticks.")).toBeInTheDocument()
    const button = screen.getByRole("button", { name: /^Quote/ })
    expect(button).toBeDisabled()
    expect(screen.getByRole("button", { name: "Pass" })).not.toBeDisabled()
    fireEvent.click(screen.getByRole("button", { name: "Pass" }))
    expect(pass).toHaveBeenCalledTimes(1)
    fireEvent.click(button)
    expect(quote).not.toHaveBeenCalled()
    type(field("Offer"), "99-17")
    expect(button).not.toBeDisabled()
    fireEvent.click(button)
    expect(quote).toHaveBeenCalledTimes(1)
  })

  it("refuses a side the book does not take: a client who buys wants an offer, and an offer is a sell", () => {
    const { quote } = mount({ limits: { sides: ["buy"] } })
    type(field("Offer"), "99-17")
    expect(screen.getByText("The book does not take a sell.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /^Quote/ })).toBeDisabled()
    fireEvent.click(screen.getByRole("button", { name: /^Quote/ }))
    expect(quote).not.toHaveBeenCalled()
  })

  it("does nothing different without limits", () => {
    const { quote } = mount()
    type(field("Offer"), "99-20")
    fireEvent.click(screen.getByRole("button", { name: /^Quote/ }))
    expect(quote).toHaveBeenCalledTimes(1)
    expect(document.querySelector("[data-rfq-limits]")).toBeNull()
  })
})
