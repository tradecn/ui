import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { StrictMode, useLayoutEffect } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { RFQ_TICKET_BINDINGS, RfqTicket, checkQuote, describeQuote, formatSize, quoteDistance, quotedSides, type RfqAction, type RfqInquiry, type RfqQuoteDraft, type RfqTicketProps } from "@/registry/tradecn/blocks/rfq-ticket/rfq-ticket"
import { HotkeysProvider } from "@/registry/tradecn/hooks/use-hotkeys"
import { type HotkeyBinding, createHotkeyRegistry, type HotkeyRegistry } from "@/registry/tradecn/lib/hotkeys"
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
const draftOf = (over: Partial<RfqQuoteDraft> = {}): RfqQuoteDraft => ({ inquiryId: "Q-1", bid: null, ask: null, quantity: 5_000_000, ...over })

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
    expect(formatSize(2_500_000, T32, " Mio.")).toBe("2.5 Mio.")
  })
  it("names what stops a quote", () => {
    expect(checkQuote(draftOf({ ask: 99.5 }), inquiry())).toEqual({})
    expect(checkQuote(draftOf(), inquiry())).toEqual({ ask: "An offer is needed." })
    expect(checkQuote(draftOf(), inquiry({ side: "sell" }))).toEqual({ bid: "A bid is needed." })
    expect(checkQuote(draftOf({ bid: 99.5 }), inquiry({ side: "two-way" }))).toEqual({ ask: "An offer is needed." })
    expect(checkQuote(draftOf({ bid: 99.53125, ask: 99.5 }), inquiry({ side: "two-way" }))).toEqual({ ask: "The quote is crossed." })
    expect(checkQuote(draftOf({ bid: 99.5, ask: 99.5 }), inquiry({ side: "two-way" }))).toEqual({})
    // A side the client did not ask for is never checked, so it can never cross the one that is.
    expect(checkQuote(draftOf({ bid: 99.5, ask: 99.484375 }), inquiry({ side: "sell" }))).toEqual({})
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
    expect(quoteDistance(4.26, 4.25, BILL, "Bp.")).toEqual({ value: 1, text: "+1.0 Bp." })
  })
})

describe("RfqTicket", () => {
  it.each(["deskPolicy", "constructor", "toString", "__proto__"])("holds quote actions for the custom field %s and releases them when its block is removed", (name) => {
    const { quote, pass, rerender } = mount({
      defaultDraft: { ask: 99.515625 },
      limits: { custom: () => [{ field: name, level: "block", rule: "desk-policy", message: "Desk policy blocks this quote." }] },
    })
    expect(document.querySelector("[data-rfq-limits='block']")).toHaveTextContent("Desk policy blocks this quote.")
    const button = screen.getByRole("button", { name: /^Quote/ })
    // Held, not taken away: it stays in reach, and a press on it is refused and says why.
    expect(button).toHaveAttribute("aria-disabled", "true")
    expect(button).toBeEnabled()
    fireEvent.click(button)
    expect(quote).not.toHaveBeenCalled()
    expect(document.querySelector("[data-rfq-announcer]")).toHaveTextContent("Desk policy blocks this quote.")
    fireEvent.click(screen.getByRole("button", { name: "Pass" }))
    expect(pass).toHaveBeenCalledTimes(1)
    rerender({ limits: undefined })
    expect(button).not.toHaveAttribute("aria-disabled")
    expect(document.querySelector("[data-rfq-limits='block']")).toBeNull()
    fireEvent.click(button)
    expect(quote).toHaveBeenCalledTimes(1)
  })

  it.each(["deskPolicy", "constructor", "toString", "__proto__"])("rechecks a custom %s block when the quote key is pressed", (name) => {
    let deny = false
    const { quote } = mount({
      defaultDraft: { ask: 99.515625 },
      limits: { custom: () => deny ? [{ field: name, level: "block", rule: "desk-policy", message: "Desk policy blocks this quote." }] : [] },
    })
    expect(screen.getByRole("button", { name: /^Quote/ })).not.toHaveAttribute("aria-disabled")
    deny = true
    fireEvent.keyDown(field("Offer"), { key: "Enter", ctrlKey: true })
    expect(quote).not.toHaveBeenCalled()
  })

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
    expect(screen.getByRole("timer", { name: /^Inquiry Q-1 \d+:\d\d$/ })).toBeInTheDocument()
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

  it("steps a blank level from the same side, the suggestion, the other side, then the mid", () => {
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
    // Only the other side quoted: the bid starts from the ask.
    rerender({ inquiry: inquiry({ market: { ask: 99.53125 }, side: "sell" }) })
    type(field("Bid"), "")
    fireEvent.keyDown(field("Bid"), { key: "ArrowUp" })
    expect(lastDraft(onDraftChange).bid).toBe(99.546875)
    // Only a mid: it is the last fallback.
    rerender({ inquiry: inquiry({ market: { mid: 99.5 }, side: "sell" }) })
    type(field("Bid"), "")
    fireEvent.keyDown(field("Bid"), { key: "ArrowUp" })
    expect(lastDraft(onDraftChange).bid).toBe(99.515625)
  })

  it("snaps off-grid suggested levels to the quote grid, so Auto sends what it shows", () => {
    const { quote, onDraftChange } = mount({ inquiry: inquiry({ side: "two-way", suggested: { bid: 99.51, ask: 99.54 } }) })
    fireEvent.click(screen.getByRole("button", { name: "Take the suggested levels: 99-16+ / 99-17+" }))
    expect(lastDraft(onDraftChange)).toEqual(draftOf({ bid: 99.515625, ask: 99.546875 }))
    fireEvent.click(screen.getByRole("button", { name: /^Quote/ }))
    expect(quote).toHaveBeenCalledWith(draftOf({ bid: 99.515625, ask: 99.546875 }), expect.objectContaining({ id: "Q-1" }))
  })

  it("snaps off-grid default levels to the quote grid at mount", () => {
    const { quote } = mount({ inquiry: inquiry({ side: "two-way" }), defaultDraft: { bid: 99.49, ask: 99.54 } })
    expect(field("Bid").value).toBe("99-15+")
    expect(field("Offer").value).toBe("99-17+")
    fireEvent.click(screen.getByRole("button", { name: /^Quote/ }))
    expect(quote).toHaveBeenCalledWith(draftOf({ bid: 99.484375, ask: 99.546875 }), expect.objectContaining({ id: "Q-1" }))
  })

  it("never runs a destructive action on the send key, even one that sends a quote", () => {
    const pull = vi.fn()
    mount({ actions: [{ id: "pull", label: "Pull", run: pull, destructive: true }], inquiry: inquiry({ allowedActions: ["pull"] }), defaultDraft: { ask: 99.515625 } })
    fireEvent.keyDown(field("Offer"), { key: "Enter", ctrlKey: true })
    expect(pull).not.toHaveBeenCalled()
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
    const timer = screen.getByRole("timer", { name: /^Inquiry Q-1 / })
    expect(timer).toHaveTextContent(/0:(29|30)/)
    expect(timer).toHaveAttribute("data-tier", "plenty")
  })
})

describe("RfqTicket keys", () => {
  it("sends, steps the field the keyboard is in, and takes the suggested levels, all from inside the fields", () => {
    const { quote, registry, onDraftChange } = mount({ inquiry: inquiry({ side: "two-way", suggested: { bid: 99.5, ask: 99.515625 } }), quickSizes: [1, 2, 3, 4, 5, 6, 7, 8, 9] })
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
    expect(registry.list().find((e) => e.id === "rfq.send")?.keys).toBe("ctrl+enter")
    view.unmount()
    expect(registry.list().some((e) => e.id === "rfq.send")).toBe(false)
  })

  it("reads crossing in the instrument's quote basis", () => {
    const bill = inquiry({ instrument: { symbol: "B912", convention: BILL }, side: "two-way", market: { bid: 4.255, ask: 4.25 } })
    // A normal discount market quotes the bid above the offer; crossing runs the other way.
    expect(checkQuote(draftOf({ bid: 4.255, ask: 4.25 }), bill).ask).toBeUndefined()
    expect(checkQuote(draftOf({ bid: 4.25, ask: 4.255 }), bill).ask).toBe("The quote is crossed.")
    const note = inquiry({ side: "two-way" })
    expect(checkQuote(draftOf({ bid: 99.5, ask: 99.515625 }), note).ask).toBeUndefined()
    expect(checkQuote(draftOf({ bid: 99.515625, ask: 99.5 }), note).ask).toBeTruthy()
  })

  it("steps the side the key came from, step buttons included", () => {
    const { onDraftChange } = mount({ inquiry: inquiry({ side: "two-way" }) })
    const offer = screen.getByLabelText("Offer")
    const offerField = offer.closest("[data-slot='tradecn-quote-field']") as HTMLElement
    const up = within(offerField).getByRole("button", { name: /up one step/ })
    act(() => up.focus())
    fireEvent.keyDown(up, { key: "ArrowUp", ctrlKey: true })
    // The offer moves from the market's own side; the bid stands untouched.
    const last = onDraftChange.mock.calls.at(-1)?.[0]
    expect(last.ask).not.toBeNull()
    expect(last.bid).toBeNull()
    // The event's own target outranks whatever holds focus: with the Bid focused, a key
    // dispatched on the Offer still steps the offer — dropping the target preference would
    // step the bid here.
    act(() => screen.getByLabelText("Bid").focus())
    fireEvent.keyDown(offer, { key: "ArrowUp", ctrlKey: true })
    const after = onDraftChange.mock.calls.at(-1)?.[0]
    expect(after.ask).not.toBeNull()
    expect(after.bid).toBeNull()
  })

  it("treats a non-finite level as no level", () => {
    const { onDraftChange } = mount({ inquiry: inquiry({ side: "two-way", market: { bid: Number.NaN, ask: Number.NaN }, suggested: { bid: Number.NaN } }), defaultDraft: { bid: Number.NaN } })
    expect((screen.getByLabelText("Bid") as HTMLInputElement).value).toBe("")
    expect(screen.queryByRole("button", { name: /Auto/ })).toBeNull()
    const group = document.querySelector<HTMLElement>("[data-slot='tradecn-rfq-ticket']")!
    act(() => group.focus())
    fireEvent.keyDown(screen.getByLabelText("Bid"), { key: "ArrowUp", ctrlKey: true })
    expect(onDraftChange).not.toHaveBeenCalled()
  })

  it("checks a send against the commit the dealer sees", () => {
    const quote = vi.fn()
    const registry = createHotkeyRegistry({ platform: "other" })
    function Probe({ fire }: { fire: boolean }) {
      // Fires in the layout phase of the same commit that withdrew the action: the moment a
      // real keydown can land before passive effects run.
      useLayoutEffect(() => {
        if (fire) screen.getByLabelText("Offer").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true, cancelable: true }))
      }, [fire])
      return null
    }
    const actions: RfqAction[] = [{ id: "quote", label: "Quote", run: quote, primary: true }]
    const ui = (allowed: string[], fire: boolean) => (
      <HotkeysProvider registry={registry}>
        <RfqTicket inquiry={inquiry({ allowedActions: allowed })} actions={actions} defaultDraft={{ ask: 99.515625 }} />
        <Probe fire={fire} />
      </HotkeysProvider>
    )
    const view = render(ui(["quote"], false))
    view.rerender(ui([], true))
    expect(quote).not.toHaveBeenCalled()
  })

  it("reads crossing and need through finiteness, in any basis", () => {
    const sell = inquiry({ side: "sell" })
    // A non-finite level is absent to the helper too: a needed NaN is a missing side, and a
    // NaN pair cannot cross.
    expect(checkQuote(draftOf({ bid: Number.NaN }), sell).bid).toBeTruthy()
    expect(checkQuote(draftOf({ bid: Number.NaN, ask: Number.NaN }), inquiry({ side: "two-way" })).ask).toBeTruthy()
    // A CDS index quotes the bid below the offer — the spread default — while cash credit
    // declares quoteInverted and reads the other way.
    const cdx = inquiry({ instrument: { symbol: "CDX", convention: CREDIT }, side: "two-way" })
    expect(checkQuote(draftOf({ bid: 52.5, ask: 53 }), cdx).ask).toBeUndefined()
    expect(checkQuote(draftOf({ bid: 53, ask: 52.5 }), cdx).ask).toBe("The quote is crossed.")
    const cash = inquiry({ instrument: { symbol: "GE 4.25 2034", convention: { ...CREDIT, quoteInverted: true } }, side: "two-way" })
    expect(checkQuote(draftOf({ bid: 105.5, ask: 103 }), cash).ask).toBeUndefined()
    expect(checkQuote(draftOf({ bid: 103, ask: 105.5 }), cash).ask).toBe("The quote is crossed.")
  })

  it("forgets a deliberate leave, and parks the ticket the user was in", () => {
    const registry = createHotkeyRegistry({ platform: "other" })
    const actions: RfqAction[] = [{ id: "quote", label: "Quote", run: vi.fn(), primary: true }]
    const ui = (allowed: string[]) => (
      <>
        <button type="button">Elsewhere</button>
        <HotkeysProvider registry={registry}>
          <RfqTicket inquiry={inquiry({ id: "Q-1", allowedActions: allowed })} actions={actions} defaultDraft={{ ask: 99.515625 }} />
          <RfqTicket inquiry={inquiry({ id: "Q-2", allowedActions: allowed })} actions={actions} defaultDraft={{ ask: 99.515625 }} />
        </HotkeysProvider>
      </>
    )
    const view = render(ui(["quote"]))
    const buttons = screen.getAllByRole("button", { name: "Quote" })
    const elsewhere = screen.getByRole("button", { name: "Elsewhere" })
    // A deliberate leave clears the record: withdrawing the action later must not steal
    // focus from the page. The leave lands on BODY — a focusable destination would block
    // the park by itself, proving nothing about the clear.
    act(() => buttons[0]!.focus())
    act(() => {
      buttons[0]!.blur()
    })
    expect(document.activeElement).toBe(document.body)
    view.rerender(ui([]))
    expect(document.activeElement).toBe(document.body)
    void elsewhere
    // The ticket the user was last in takes the park; a sibling's stale record cannot,
    // since focusing the second ticket's control blurred the first's record away.
    view.rerender(ui(["quote"]))
    const again = screen.getAllByRole("button", { name: "Quote" })
    act(() => again[0]!.focus())
    act(() => again[1]!.focus())
    view.rerender(ui([]))
    const groups = document.querySelectorAll<HTMLElement>("[data-slot='tradecn-rfq-ticket']")
    expect(groups[1]!.contains(document.activeElement)).toBe(true)
    expect(groups[0]!.contains(document.activeElement)).toBe(false)
  })

  it("keeps the record through a window switch, and parks on return", () => {
    const { rerender } = mount({ defaultDraft: { ask: 99.515625 } })
    const button = screen.getByRole("button", { name: "Quote" })
    act(() => button.focus())
    const away = vi.spyOn(document, "hasFocus").mockReturnValue(false)
    fireEvent.blur(button, { relatedTarget: null })
    away.mockRestore()
    rerender({ inquiry: inquiry({ allowedActions: ["pass"] }) })
    const group = document.querySelector<HTMLElement>("[data-slot='tradecn-rfq-ticket']")!
    expect(group.contains(document.activeElement)).toBe(true)
    expect(document.activeElement).not.toBe(document.body)
  })

  it("parks without scrolling when the ticket disables under focus", () => {
    const { rerender } = mount({ defaultDraft: { ask: 99.515625 } })
    const button = screen.getByRole("button", { name: "Quote" })
    act(() => button.focus())
    const focusSpy = vi.spyOn(HTMLElement.prototype, "focus")
    rerender({ disabled: true })
    const group = document.querySelector<HTMLElement>("[data-slot='tradecn-rfq-ticket']")!
    expect(document.activeElement).toBe(group)
    expect(focusSpy.mock.calls.at(-1)?.[0]).toMatchObject({ preventScroll: true })
    focusSpy.mockRestore()
  })

  it("spends the record when it parks, at feed frequency", () => {
    const { rerender } = mount({ defaultDraft: { ask: 99.515625 } })
    const button = screen.getByRole("button", { name: "Quote" })
    act(() => button.focus())
    rerender({ inquiry: inquiry({ allowedActions: ["pass"] }) })
    const group = document.querySelector<HTMLElement>("[data-slot='tradecn-rfq-ticket']")!
    expect(group.contains(document.activeElement)).toBe(true)
    // The dealer clicks the page background; the root's blur never crosses the box's
    // capture, so only the spent record keeps the next market tick from parking again.
    act(() => (document.activeElement as HTMLElement).blur())
    expect(document.activeElement).toBe(document.body)
    rerender({ inquiry: inquiry({ allowedActions: ["pass"], market: { label: "Composite", bid: 99.5, ask: 99.53125 } }) })
    expect(document.activeElement).toBe(document.body)
  })

  it("keeps focus in the ticket when the focused action leaves", () => {
    const { rerender } = mount({ defaultDraft: { ask: 99.515625 } })
    const button = screen.getByRole("button", { name: "Quote" })
    act(() => button.focus())
    rerender({ inquiry: inquiry({ allowedActions: ["pass"] }) })
    const group = document.querySelector<HTMLElement>("[data-slot='tradecn-rfq-ticket']")!
    expect(document.activeElement).not.toBe(document.body)
    expect(group.contains(document.activeElement)).toBe(true)
  })

  it("cedes to a nested provider that declares while tickets come and go", () => {
    const registry = createHotkeyRegistry({ platform: "other" })
    const one = <RfqTicket inquiry={inquiry()} actions={[{ id: "quote", label: "Quote", run: vi.fn() }]} defaultDraft={{ ask: 99.5 }} />
    const ui = (tickets: boolean) => (
      <HotkeysProvider registry={registry}>
        {tickets && one}
        <HotkeysProvider registry={registry} bindings={RFQ_TICKET_BINDINGS}>{tickets && one}</HotkeysProvider>
      </HotkeysProvider>
    )
    const view = render(ui(true))
    // Both tickets leave; the nested provider stays, and its declaration must survive.
    view.rerender(ui(false))
    expect(registry.list().some((e) => e.id === "rfq.send")).toBe(true)
    view.unmount()
  })

  it("leaves a replacement that changed only a behavior field", () => {
    const registry = createHotkeyRegistry({ platform: "other" })
    const { view } = mount({}, registry)
    const own = registry.list().find((e) => e.id === "rfq.send")!
    // Same keys and wording, a `when` guard added: a real replacement the cleanup must keep.
    act(() => void registry.register({ id: "rfq.send", keys: own.declaredKeys, scope: own.scope, description: own.description, group: own.group, when: () => false }))
    view.unmount()
    expect(registry.list().some((e) => e.id === "rfq.send")).toBe(true)
  })

  it("installs its defaults again when the provider stops declaring them", () => {
    const registry = createHotkeyRegistry({ platform: "other" })
    const consumers: HotkeyBinding[] = [{ id: "rfq.send", keys: "mod+s", scope: "editing", description: "Ship the quote" }]
    const ui = (bindings: readonly HotkeyBinding[]) => (
      <HotkeysProvider registry={registry} bindings={bindings}>
        <RfqTicket inquiry={inquiry()} actions={[{ id: "quote", label: "Quote", run: vi.fn() }]} defaultDraft={{ ask: 99.5 }} />
      </HotkeysProvider>
    )
    const view = render(ui(consumers))
    expect(registry.list().find((e) => e.id === "rfq.send")?.description).toBe("Ship the quote")
    view.rerender(ui([]))
    expect(registry.list().find((e) => e.id === "rfq.send")?.description).toBe("Send the quote")
  })

  it("keeps a remaining ticket's declarations when a nested declaring provider leaves", () => {
    const registry = createHotkeyRegistry({ platform: "other" })
    const one = <RfqTicket inquiry={inquiry()} actions={[{ id: "quote", label: "Quote", run: vi.fn() }]} defaultDraft={{ ask: 99.5 }} />
    const ui = (nested: boolean) => (
      <HotkeysProvider registry={registry}>
        {one}
        {nested && <HotkeysProvider registry={registry} bindings={RFQ_TICKET_BINDINGS}>{one}</HotkeysProvider>}
      </HotkeysProvider>
    )
    const view = render(ui(true))
    // The nested provider and its ticket leave together; the outer ticket still needs its keys.
    view.rerender(ui(false))
    expect(registry.list().some((e) => e.id === "rfq.send")).toBe(true)
    view.unmount()
    expect(registry.list().some((e) => e.id === "rfq.send")).toBe(false)
  })

  it("leaves a pre-mount consumer binding alone, shows its keys, and runs it from the group", () => {
    const registry = createHotkeyRegistry({ platform: "other" })
    registry.register({ id: "rfq.send", keys: "mod+s", scope: "editing", description: "Ship it" })
    const quote = vi.fn()
    mount({ actions: [{ id: "quote", label: "Quote", run: quote, primary: true }], defaultDraft: draftOf({ ask: 99.515625 }) }, registry)
    expect(registry.list().find((e) => e.id === "rfq.send")?.description).toBe("Ship it")
    const button = screen.getByRole("button", { name: /Quote/ })
    expect(button.textContent).toContain("S")
    const group = document.querySelector<HTMLElement>("[data-slot='tradecn-rfq-ticket']")!
    group.focus()
    fireEvent.keyDown(group, { key: "s", ctrlKey: true })
    expect(quote).toHaveBeenCalledTimes(1)
  })

  it("holds its default against unregister while a ticket stands", () => {
    const registry = createHotkeyRegistry({ platform: "other" })
    const { view } = mount({}, registry)
    registry.unregister("rfq.send")
    expect(registry.list().some((e) => e.id === "rfq.send")).toBe(true)
    view.unmount()
    expect(registry.list().some((e) => e.id === "rfq.send")).toBe(false)
  })

  it("keeps the defaults when a ticketless declaring provider leaves", () => {
    const registry = createHotkeyRegistry({ platform: "other" })
    const one = <RfqTicket inquiry={inquiry()} actions={[{ id: "quote", label: "Quote", run: vi.fn() }]} defaultDraft={{ ask: 99.5 }} />
    const ui = (nested: boolean) => (
      <HotkeysProvider registry={registry}>
        {one}
        {nested && <HotkeysProvider registry={registry} bindings={RFQ_TICKET_BINDINGS}>{null}</HotkeysProvider>}
      </HotkeysProvider>
    )
    const view = render(ui(true))
    view.rerender(ui(false))
    expect(registry.list().find((e) => e.id === "rfq.send")?.declaredKeys).toBe("mod+enter")
    view.unmount()
  })

  it("moves no draft and sends nothing while no allowed action needs a quote", () => {
    const registry = createHotkeyRegistry({ platform: "other" })
    const pass = vi.fn()
    // A buy inquiry quotes the ask, so the suggestion targets the quoted side: removing the
    // quoting gate would move the draft from mod+shift+a here.
    const { onDraftChange } = mount({ inquiry: inquiry({ side: "buy", allowedActions: ["pass"], suggested: { ask: 99.53125 } }), actions: [{ id: "pass", label: "Pass", run: pass, needsQuote: false }], quickSizes: [1, 5] }, registry)
    const group = document.querySelector<HTMLElement>("[data-slot='tradecn-rfq-ticket']")!
    group.focus()
    fireEvent.keyDown(group, { key: "ArrowUp", ctrlKey: true })
    fireEvent.keyDown(group, { key: "a", ctrlKey: true, shiftKey: true })
    fireEvent.keyDown(group, { key: "1", ctrlKey: true })
    expect(onDraftChange).not.toHaveBeenCalled()
    // The send key runs only quote-sending actions, so it cannot fall back to a pass — and the
    // hint follows the key: no quote-sending action, no key caps on any button.
    fireEvent.keyDown(group, { key: "Enter", ctrlKey: true })
    expect(pass).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Pass" }).querySelectorAll("kbd")).toHaveLength(0)
  })

  it("shows the send caps on the action the key runs, not the primary", () => {
    const auto = vi.fn()
    const quote = vi.fn()
    const registry = createHotkeyRegistry({ platform: "other" })
    mount({
      inquiry: inquiry({ allowedActions: ["auto", "quote"] }),
      actions: [{ id: "auto", label: "Quote auto", needsQuote: false, primary: true, run: auto }, { id: "quote", label: "Quote", run: quote }],
      defaultDraft: draftOf({ ask: 99.515625 }),
    }, registry)
    expect(screen.getByRole("button", { name: /Quote auto/ }).querySelectorAll("kbd")).toHaveLength(0)
    expect(screen.getByRole("button", { name: "Quote" }).querySelectorAll("kbd").length).toBeGreaterThan(0)
    const group = document.querySelector<HTMLElement>("[data-slot='tradecn-rfq-ticket']")!
    group.focus()
    fireEvent.keyDown(group, { key: "Enter", ctrlKey: true })
    expect(quote).toHaveBeenCalledTimes(1)
    expect(auto).not.toHaveBeenCalled()
  })

  it("declares only the sizes passed in the registry's list", () => {
    const registry = createHotkeyRegistry({ platform: "other" })
    mount({ quickSizes: [1, 5] }, registry)
    expect(registry.list().some((e) => e.id === "rfq.size-2")).toBe(true)
    expect(registry.list().some((e) => e.id === "rfq.size-9")).toBe(false)
  })

  it("locks every shortcut while disabled", () => {
    const registry = createHotkeyRegistry({ platform: "other" })
    const quote = vi.fn()
    const { onDraftChange } = mount({ disabled: true, actions: [{ id: "quote", label: "Quote", run: quote, primary: true }], inquiry: inquiry({ suggested: { bid: 99.5 } }), quickSizes: [1, 5] }, registry)
    const group = document.querySelector<HTMLElement>("[data-slot='tradecn-rfq-ticket']")!
    group.focus()
    fireEvent.keyDown(group, { key: "Enter", ctrlKey: true })
    fireEvent.keyDown(group, { key: "ArrowUp", ctrlKey: true })
    fireEvent.keyDown(group, { key: "a", ctrlKey: true, shiftKey: true })
    fireEvent.keyDown(group, { key: "1", ctrlKey: true })
    expect(quote).not.toHaveBeenCalled()
    expect(onDraftChange).not.toHaveBeenCalled()
  })

  it("turns a binding off the documented way", () => {
    const registry = createHotkeyRegistry({ platform: "other" })
    const quote = vi.fn()
    mount({ actions: [{ id: "quote", label: "Quote", run: quote, primary: true }], defaultDraft: draftOf({ ask: 99.515625 }) }, registry)
    act(() => void registry.register({ id: "rfq.send", keys: "", scope: "editing", description: "Send the quote" }))
    const group = document.querySelector<HTMLElement>("[data-slot='tradecn-rfq-ticket']")!
    group.focus()
    fireEvent.keyDown(group, { key: "Enter", ctrlKey: true })
    expect(quote).not.toHaveBeenCalled()
  })

  it("keeps a desk conflict-free when the consumer spreads all nine size bindings", () => {
    const registry = createHotkeyRegistry({ platform: "other" })
    render(
      <HotkeysProvider registry={registry} bindings={RFQ_TICKET_BINDINGS}>
        <RfqTicket inquiry={inquiry()} actions={[{ id: "quote", label: "Quote", run: vi.fn() }]} defaultDraft={{ ask: 99.5 }} quickSizes={[1, 5]} />
      </HotkeysProvider>,
    )
    const el = document.body.appendChild(document.createElement("div"))
    const detach = registry.bind("desk.nine", () => {}, { scope: "editing", element: () => el })
    act(() => void registry.register({ id: "desk.nine", keys: "mod+9", scope: "editing", description: "Ninth desk thing" }))
    expect(registry.conflicts()).toEqual([])
    detach()
    el.remove()
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
    expect(document.querySelector("[data-rfq-limits='confirm']")).toHaveTextContent("The offer is 7 ticks from the market, past 4 ticks. Send it anyway?")
    type(field("Offer"), "99-19")
    expect(button).toHaveTextContent("Quote")
    expect(document.querySelector("[data-rfq-limits]")).toBeNull()
    fireEvent.click(button)
    fireEvent.click(button)
    expect(quote).toHaveBeenCalledTimes(1)
    expect(lastDraft(quote)).toMatchObject({ ask: 99.59375 })
  })

  it("counts a press once: a double-click's second click and a held Enter's repeats neither answer the question nor quote again", () => {
    const { quote, pass } = mount({ limits: { maxDistance: { ticks: 4, level: "confirm" } } })
    type(field("Offer"), "99-20")
    const button = screen.getByRole("button", { name: /^Quote/ })
    fireEvent.click(button, { detail: 1 })
    fireEvent.click(button, { detail: 2 })
    expect(quote).not.toHaveBeenCalled()
    expect(button).toHaveTextContent("Quote anyway?")
    fireEvent.keyDown(button, { key: "Enter", repeat: true })
    fireEvent.click(button, { detail: 0 })
    expect(quote).not.toHaveBeenCalled()
    fireEvent.keyDown(button, { key: "Enter" })
    fireEvent.click(button, { detail: 0 })
    expect(quote).toHaveBeenCalledTimes(1)
    // With nothing to ask, a double-click still quotes once.
    type(field("Offer"), "99-17")
    fireEvent.click(button, { detail: 1 })
    fireEvent.click(button, { detail: 2 })
    expect(quote).toHaveBeenCalledTimes(2)
    // Letting a held Enter go ends the hold: a click with no key behind it quotes again.
    fireEvent.keyDown(button, { key: "Enter", repeat: true })
    fireEvent.keyUp(button, { key: "Enter" })
    fireEvent.click(button, { detail: 0 })
    expect(quote).toHaveBeenCalledTimes(3)
    // So does focus leaving the button mid-hold; and the hold is that button's alone.
    fireEvent.keyDown(button, { key: "Enter", repeat: true })
    fireEvent.blur(button)
    fireEvent.click(button, { detail: 0 })
    expect(quote).toHaveBeenCalledTimes(4)
    fireEvent.keyDown(button, { key: "Enter", repeat: true })
    fireEvent.click(screen.getByRole("button", { name: "Pass" }), { detail: 0 })
    expect(pass).toHaveBeenCalledTimes(1)
  })

  it("says the limits' question once, as the press asks it, not again as the market moves, and announces the inquiry's status", () => {
    const { rerender } = mount({ limits: { maxDistance: { ticks: 4, level: "confirm" } } })
    const announcer = document.querySelector<HTMLElement>("[data-rfq-announcer]")!
    expect(announcer).toHaveAttribute("aria-live", "polite")
    expect(announcer).toBeEmptyDOMElement()
    type(field("Offer"), "99-20")
    fireEvent.click(screen.getByRole("button", { name: /^Quote/ }))
    expect(announcer).toHaveTextContent("The offer is 7 ticks from the market, past 4 ticks. Send it anyway?")
    const said = announcer.firstElementChild
    rerender({ inquiry: inquiry({ market: { label: "Composite", bid: 99.5, ask: 99.53125 } }) })
    expect(document.querySelector("[data-rfq-limits='confirm']")).toHaveTextContent("6 ticks")
    expect(announcer.firstElementChild).toBe(said)
    expect(announcer).toHaveTextContent("7 ticks")
    expect(document.querySelector("[data-rfq-status]")).toHaveAttribute("role", "status")
  })

  it("says a level block only when a press meets it, and shows it without an alert or a description", () => {
    const { rerender } = mount({ limits: { maxDistance: { ticks: 4 } } })
    const announcer = document.querySelector<HTMLElement>("[data-rfq-announcer]")!
    for (const text of ["9", "99", "99-", "99-2", "99-20"]) type(field("Offer"), text)
    expect(announcer).toBeEmptyDOMElement()
    const shown = () => screen.getByText(/ticks from the market/, { selector: "[data-slot='field-error']" })
    expect(shown()).toHaveTextContent("7 ticks")
    expect(shown()).toHaveAttribute("role", "none")
    expect(field("Offer")).not.toHaveAttribute("aria-describedby")
    fireEvent.keyDown(field("Offer"), { key: "Enter", ctrlKey: true })
    expect(announcer).toHaveTextContent("The offer is 7 ticks from the market; the limit is 4 ticks.")
    const said = announcer.firstElementChild
    rerender({ inquiry: inquiry({ market: { label: "Composite", bid: 99.5, ask: 99.53125 } }) })
    expect(shown()).toHaveTextContent("6 ticks")
    expect(announcer.firstElementChild).toBe(said)
    // The refused press stored nothing: the field shows the live block, still without an alert or a description.
    expect(shown()).toHaveAttribute("role", "none")
    expect(field("Offer")).not.toHaveAttribute("aria-describedby")
    // The market comes back inside the line: the block is gone, and so is what was said about it, for good.
    rerender({ inquiry: inquiry({ market: { label: "Composite", bid: 99.5, ask: 99.59375 } }) })
    expect(announcer).toBeEmptyDOMElement()
    // The market moving back out waits for the next press.
    rerender({ inquiry: inquiry() })
    expect(shown()).toHaveTextContent("7 ticks")
    expect(announcer).toBeEmptyDOMElement()
    fireEvent.keyDown(field("Offer"), { key: "Enter", ctrlKey: true })
    expect(announcer).toHaveTextContent("The offer is 7 ticks from the market; the limit is 4 ticks.")
  })

  it("says the question again for every press that asks it, a second action's included", () => {
    const quote = vi.fn()
    const firm = vi.fn()
    mount({ limits: { maxDistance: { ticks: 4, level: "confirm" } }, actions: [{ id: "quote", label: "Quote", run: quote, primary: true }, { id: "firm", label: "Firm", run: firm }], inquiry: inquiry({ allowedActions: ["quote", "firm"] }) })
    const announcer = document.querySelector<HTMLElement>("[data-rfq-announcer]")!
    type(field("Offer"), "99-20")
    fireEvent.click(screen.getByRole("button", { name: /^Firm/ }))
    const first = announcer.firstElementChild
    expect(announcer).toHaveTextContent("The offer is 7 ticks from the market, past 4 ticks. Send it anyway?")
    // The send key runs Quote, which has not asked yet: it asks, and is heard asking.
    fireEvent.keyDown(field("Offer"), { key: "Enter", ctrlKey: true })
    expect(quote).not.toHaveBeenCalled()
    expect(announcer.firstElementChild).not.toBe(first)
    expect(announcer).toHaveTextContent("The offer is 7 ticks from the market, past 4 ticks. Send it anyway?")
    fireEvent.keyDown(field("Offer"), { key: "Enter", ctrlKey: true })
    expect(quote).toHaveBeenCalledTimes(1)
    expect(firm).not.toHaveBeenCalled()
  })

  it("keeps a held action in reach: focus stays on it as a block arrives, and a press on it says why", () => {
    const { quote, rerender } = mount({ defaultDraft: { ask: 99.53125 } })
    const button = screen.getByRole("button", { name: /^Quote/ })
    button.focus()
    rerender({ limits: { sides: ["buy"] } })
    expect(button).toHaveAttribute("aria-disabled", "true")
    expect(document.activeElement).toBe(button)
    fireEvent.click(button)
    expect(quote).not.toHaveBeenCalled()
    expect(document.querySelector("[data-rfq-announcer]")).toHaveTextContent("The book does not take a sell.")
  })

  it("says, asks, and lets go the same under StrictMode, and says nothing at mount", () => {
    const quote = vi.fn()
    const registry = createHotkeyRegistry({ platform: "other" })
    const actions: RfqAction[] = [{ id: "quote", label: "Quote", run: quote, primary: true }]
    const desk = { field: "desk", level: "confirm" as const, rule: "desk-check", message: "Check with the desk." }
    const ui = (allowed: string[]) => (
      <StrictMode>
        <HotkeysProvider registry={registry}>
          <RfqTicket inquiry={inquiry({ allowedActions: allowed })} actions={actions} limits={{ maxDistance: { ticks: 4 }, custom: () => [desk] }} defaultDraft={{ ask: 99.625 }} />
        </HotkeysProvider>
      </StrictMode>
    )
    const view = render(ui(["quote"]))
    const announcer = document.querySelector<HTMLElement>("[data-rfq-announcer]")!
    // A block present at mount is shown, and nothing is said until a press meets it.
    expect(screen.getByText("The offer is 7 ticks from the market; the limit is 4 ticks.", { selector: "[data-slot='field-error']" })).toHaveAttribute("role", "none")
    expect(announcer).toBeEmptyDOMElement()
    fireEvent.click(screen.getByRole("button", { name: /^Quote/ }))
    expect(announcer).toHaveTextContent("The offer is 7 ticks from the market; the limit is 4 ticks.")
    type(field("Offer"), "99-17")
    expect(announcer).toBeEmptyDOMElement()
    fireEvent.click(screen.getByRole("button", { name: /^Quote/ }))
    expect(announcer).toHaveTextContent("Check with the desk.")
    // Taken away and given back: the question goes, and the action asks again.
    view.rerender(ui([]))
    expect(announcer).toBeEmptyDOMElement()
    view.rerender(ui(["quote"]))
    fireEvent.click(screen.getByRole("button", { name: /^Quote/ }))
    expect(quote).not.toHaveBeenCalled()
    expect(announcer).toHaveTextContent("Check with the desk.")
    fireEvent.click(screen.getByRole("button", { name: /^Quote/ }))
    expect(quote).toHaveBeenCalledTimes(1)
  })

  it("clears a crossed quote's message from the offer when either level changes", () => {
    const { quote } = mount({ inquiry: inquiry({ side: "two-way" }) })
    type(field("Bid"), "99-17")
    type(field("Offer"), "99-16")
    fireEvent.click(screen.getByRole("button", { name: /^Quote/ }))
    expect(quote).not.toHaveBeenCalled()
    const crossed = screen.getByText("The quote is crossed.")
    expect(crossed).toHaveAttribute("role", "alert")
    expect(field("Offer")).toHaveAttribute("aria-describedby", crossed.id)
    // A new bid answers it: the offer no longer shows it or is described by it.
    type(field("Bid"), "99-15")
    expect(screen.queryByText("The quote is crossed.")).toBeNull()
    expect(field("Offer")).not.toHaveAttribute("aria-describedby")
    expect(field("Offer")).not.toHaveAttribute("aria-invalid")
    fireEvent.click(screen.getByRole("button", { name: /^Quote/ }))
    expect(quote).toHaveBeenCalledTimes(1)
  })

  it("lets what a press was refused for go once any block it named stops blocking", () => {
    const desk = { field: "desk", level: "block" as const, rule: "desk-policy", message: "Desk policy blocks this quote." }
    const { rerender } = mount({ limits: { custom: () => [desk], maxDistance: { ticks: 4 } } })
    const announcer = document.querySelector<HTMLElement>("[data-rfq-announcer]")!
    type(field("Offer"), "99-20")
    fireEvent.keyDown(field("Offer"), { key: "Enter", ctrlKey: true })
    expect(announcer).toHaveTextContent("The offer is 7 ticks from the market; the limit is 4 ticks.")
    expect(announcer).toHaveTextContent("Desk policy blocks this quote.")
    // The market comes to the offer: the desk still blocks, but what was said is no longer true, so it goes.
    rerender({ inquiry: inquiry({ market: { label: "Composite", bid: 99.5, ask: 99.59375 } }) })
    expect(document.querySelector("[data-rfq-limits='block']")).toHaveTextContent("Desk policy blocks this quote.")
    expect(announcer).toBeEmptyDOMElement()
  })

  it("asks again when the market adds a reason to a standing question, and lets it all go once the question is answered", () => {
    const desk = { field: "ask" as const, level: "confirm" as const, rule: "desk-check", message: "Desk check. Send it anyway?" }
    const { quote, rerender } = mount({ limits: { custom: () => [desk], maxDistance: { ticks: 4, level: "confirm" } }, inquiry: inquiry({ market: { label: "Composite", bid: 99.5, ask: 99.625 } }) })
    const announcer = document.querySelector<HTMLElement>("[data-rfq-announcer]")!
    type(field("Offer"), "99-20")
    const button = screen.getByRole("button", { name: /^Quote/ })
    fireEvent.click(button)
    expect(announcer).toHaveTextContent("Desk check. Send it anyway?")
    expect(announcer).not.toHaveTextContent("ticks")
    rerender({ inquiry: inquiry({ market: { label: "Composite", bid: 99.5, ask: 99.515625 } }) })
    expect(announcer).not.toHaveTextContent("ticks")
    fireEvent.click(button)
    expect(quote).not.toHaveBeenCalled()
    expect(announcer).toHaveTextContent("7 ticks from the market")
    fireEvent.click(button)
    expect(quote).toHaveBeenCalledTimes(1)
    expect(announcer).toBeEmptyDOMElement()
  })

  it("withdraws a question whose action the venue takes away, so it asks again when the action comes back", () => {
    const { quote, rerender } = mount({ limits: { maxDistance: { ticks: 4, level: "confirm" } } })
    type(field("Offer"), "99-20")
    fireEvent.click(screen.getByRole("button", { name: /^Quote/ }))
    expect(screen.getByRole("button", { name: /^Quote/ })).toHaveTextContent("Quote anyway?")
    rerender({ inquiry: inquiry({ allowedActions: ["pass"] }) })
    rerender({ inquiry: inquiry() })
    const button = screen.getByRole("button", { name: /^Quote/ })
    expect(button).not.toHaveTextContent("anyway")
    fireEvent.click(button)
    expect(quote).not.toHaveBeenCalled()
    expect(button).toHaveTextContent("Quote anyway?")
  })

  it("blocks under the field and holds the actions that send a quote, while a pass still runs", () => {
    const { quote, pass } = mount({ limits: { maxDistance: { ticks: 4 } } })
    type(field("Offer"), "99-20")
    const shown = screen.getByText("The offer is 7 ticks from the market; the limit is 4 ticks.", { selector: "[data-slot='field-error']" })
    expect(shown).toHaveAttribute("role", "none")
    const button = screen.getByRole("button", { name: /^Quote/ })
    expect(button).toHaveAttribute("aria-disabled", "true")
    expect(screen.getByRole("button", { name: "Pass" })).not.toHaveAttribute("aria-disabled")
    fireEvent.click(screen.getByRole("button", { name: "Pass" }))
    expect(pass).toHaveBeenCalledTimes(1)
    fireEvent.click(button)
    expect(quote).not.toHaveBeenCalled()
    expect(document.querySelector("[data-rfq-announcer]")).toHaveTextContent("The offer is 7 ticks from the market; the limit is 4 ticks.")
    type(field("Offer"), "99-17")
    expect(button).not.toHaveAttribute("aria-disabled")
    fireEvent.click(button)
    expect(quote).toHaveBeenCalledTimes(1)
  })

  it("refuses a side the book does not take: a client who buys wants an offer, and an offer is a sell", () => {
    const { quote } = mount({ limits: { sides: ["buy"] } })
    type(field("Offer"), "99-17")
    expect(screen.getByText("The book does not take a sell.", { selector: "[data-slot='field-error']" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /^Quote/ })).toHaveAttribute("aria-disabled", "true")
    fireEvent.click(screen.getByRole("button", { name: /^Quote/ }))
    expect(quote).not.toHaveBeenCalled()
    expect(document.querySelector("[data-rfq-announcer]")).toHaveTextContent("The book does not take a sell.")
  })

  it("does nothing different without limits", () => {
    const { quote } = mount()
    type(field("Offer"), "99-20")
    fireEvent.click(screen.getByRole("button", { name: /^Quote/ }))
    expect(quote).toHaveBeenCalledTimes(1)
    expect(document.querySelector("[data-rfq-limits]")).toBeNull()
  })
})

describe("quick sizes", () => {
  it("quotes for a quick size: the inquiry's own size leads the row, a press or a key picks one of yours, and the draft carries it", () => {
    const { onDraftChange, quote } = mount({ quickSizes: [1_000_000, 2_000_000] })
    const row = screen.getByRole("group", { name: "For" })
    expect(within(row).getAllByRole("button").map((b) => b.textContent)).toEqual(["5mm", "1mm", "2mm"])
    expect(within(row).getByRole("button", { name: "For 5mm" })).toHaveAttribute("aria-pressed", "true")
    fireEvent.click(within(row).getByRole("button", { name: "For 2mm" }))
    expect(lastDraft(onDraftChange).quantity).toBe(2_000_000)
    expect(within(row).getByRole("button", { name: "For 2mm" })).toHaveAttribute("aria-pressed", "true")
    expect(within(row).getByRole("button", { name: "For 5mm" })).toHaveAttribute("aria-pressed", "false")
    // mod+1 from inside a field: the first of yours, not the inquiry's.
    fireEvent.keyDown(field("Offer"), { key: "1", ctrlKey: true })
    expect(lastDraft(onDraftChange).quantity).toBe(1_000_000)
    // Back to the full size, and the size rides in the sent draft and in the words.
    fireEvent.click(within(row).getByRole("button", { name: "For 5mm" }))
    fireEvent.click(within(row).getByRole("button", { name: "For 2mm" }))
    type(field("Offer"), "99-16+")
    fireEvent.click(screen.getByRole("button", { name: /^Quote/ }))
    expect(quote).toHaveBeenCalledWith(draftOf({ ask: 99.515625, quantity: 2_000_000 }), inquiry())
    expect(describeQuote(draftOf({ ask: 99.515625, quantity: 2_000_000 }), inquiry())).toContain("2mm")
    expect(describeQuote(draftOf({ ask: 99.515625 }), inquiry())).toContain("5mm")
    expect(RFQ_TICKET_BINDINGS.filter((b) => b.id.startsWith("rfq.size-")).map((b) => b.keys)).toEqual(["mod+1", "mod+2", "mod+3", "mod+4", "mod+5", "mod+6", "mod+7", "mod+8", "mod+9"])
  })

  it("draws no row without quickSizes, and the draft carries the inquiry's size", () => {
    const { onDraftChange } = mount()
    expect(screen.queryByRole("group", { name: "For" })).toBeNull()
    type(field("Offer"), "99-16+")
    expect(lastDraft(onDraftChange)).toEqual(draftOf({ ask: 99.515625 }))
    // A key for a size that is not there does nothing.
    fireEvent.keyDown(field("Offer"), { key: "1", ctrlKey: true })
    expect(lastDraft(onDraftChange).quantity).toBe(5_000_000)
  })
})

describe("binding ownership and the fence", () => {
  it("cedes a provider-declared binding across inquiry remounts", () => {
    const registry = createHotkeyRegistry({ platform: "other" })
    const bindings = [{ id: "rfq.send", keys: "mod+s", scope: "editing" as const, description: "Ship the quote" }]
    const ui = (key: string) => (
      <HotkeysProvider registry={registry} bindings={bindings}>
        <RfqTicket key={key} inquiry={inquiry()} actions={[{ id: "quote", label: "Quote", run: vi.fn(), primary: true }]} onDraftChange={() => {}} defaultDraft={draftOf({ ask: 99.515625 })} />
      </HotkeysProvider>
    )
    const { rerender } = render(ui("a"))
    expect(registry.list().find((e) => e.id === "rfq.send")?.description).toBe("Ship the quote")
    rerender(ui("b"))
    expect(registry.list().find((e) => e.id === "rfq.send")?.description).toBe("Ship the quote")
  })

  it("runs shortcuts from the ticket's own group, where clicks land", () => {
    const registry = createHotkeyRegistry({ platform: "other" })
    const quote = vi.fn()
    mount({ actions: [{ id: "quote", label: "Quote", run: quote, primary: true }], defaultDraft: draftOf({ ask: 99.515625 }) }, registry)
    const group = document.querySelector<HTMLElement>("[data-slot='tradecn-rfq-ticket']")!
    group.focus()
    fireEvent.keyDown(group, { key: "Enter", ctrlKey: true })
    expect(quote).toHaveBeenCalledTimes(1)
  })

  it("says a level is not a level in the field's own words", () => {
    mount()
    type(field("Offer"), "banana")
    fireEvent.blur(field("Offer"))
    expect(screen.getByText("Not a level in this instrument's notation.")).toBeInTheDocument()
  })
})

describe("what the ticket sends and says", () => {
  it("quotes for the inquiry's size as it stands, a resize under the same id included, unless a quick size was taken", () => {
    const { quote, onDraftChange, rerender } = mount({ defaultDraft: { ask: 99.515625 }, quickSizes: [1_000_000] })
    rerender({ inquiry: inquiry({ quantity: 10_000_000 }) })
    expect(lastDraft(onDraftChange).quantity).toBe(10_000_000)
    expect(screen.getByRole("button", { name: "For 10mm" })).toHaveAttribute("aria-pressed", "true")
    fireEvent.click(screen.getByRole("button", { name: /^Quote/ }))
    expect(quote).toHaveBeenLastCalledWith(draftOf({ ask: 99.515625, quantity: 10_000_000 }), inquiry({ quantity: 10_000_000 }))
    // A quick size the dealer took holds through a resize; the inquiry's own size follows it again.
    fireEvent.click(screen.getByRole("button", { name: "For 1mm" }))
    rerender({ inquiry: inquiry({ quantity: 7_000_000 }) })
    fireEvent.click(screen.getByRole("button", { name: /^Quote/ }))
    expect(quote).toHaveBeenLastCalledWith(draftOf({ ask: 99.515625, quantity: 1_000_000 }), inquiry({ quantity: 7_000_000 }))
    fireEvent.click(screen.getByRole("button", { name: "For 7mm" }))
    rerender({ inquiry: inquiry({ quantity: 8_000_000 }) })
    fireEvent.click(screen.getByRole("button", { name: /^Quote/ }))
    expect(quote).toHaveBeenLastCalledWith(draftOf({ ask: 99.515625, quantity: 8_000_000 }), inquiry({ quantity: 8_000_000 }))
  })

  it("withdraws a standing question when the venue resizes the inquiry, so the next press asks again", () => {
    const { quote, rerender } = mount({ limits: { maxDistance: { ticks: 4, level: "confirm" } } })
    type(field("Offer"), "99-20")
    fireEvent.click(screen.getByRole("button", { name: /^Quote/ }))
    expect(screen.getByRole("button", { name: /^Quote anyway\?/ })).toBeInTheDocument()
    rerender({ inquiry: inquiry({ quantity: 10_000_000 }) })
    const button = screen.getByRole("button", { name: /^Quote/ })
    expect(button).toHaveTextContent(/^Quote/)
    expect(button).not.toHaveTextContent("anyway")
    fireEvent.click(button)
    expect(quote).not.toHaveBeenCalled()
    fireEvent.click(button)
    expect(quote).toHaveBeenCalledTimes(1)
  })

  it("keeps the default for a word given as undefined, the offer in its limit sentences included", () => {
    mount({ labels: { ask: undefined }, limits: { maxDistance: { ticks: 4 } }, limitsLabels: { ask: undefined } })
    type(field("Offer"), "99-20")
    expect(screen.getByText("The offer is 7 ticks from the market; the limit is 4 ticks.", { selector: "[data-slot='field-error']" })).toBeInTheDocument()
  })

  it("holds only the sides the client asked for, so a default for another side never reaches a check or a send", () => {
    const { quote, onDraftChange } = mount({ inquiry: inquiry({ side: "sell" }), defaultDraft: { bid: 99.5, ask: 99.484375 } })
    expect(screen.queryByLabelText("Offer")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: /^Quote/ }))
    expect(quote).toHaveBeenCalledWith(draftOf({ bid: 99.5, ask: null }), inquiry({ side: "sell" }))
    expect(onDraftChange).not.toHaveBeenCalled()
  })

  it("shows a block on a side it doesn't draw on the limits line, so whatever holds Quote is on screen", () => {
    const { quote } = mount({ defaultDraft: { ask: 99.515625 }, limits: { custom: () => [{ field: "bid", level: "block", rule: "no-bids", message: "No bids from this book." }] } })
    expect(document.querySelector("[data-rfq-limits='block']")).toHaveTextContent("No bids from this book.")
    fireEvent.click(screen.getByRole("button", { name: /^Quote/ }))
    expect(quote).not.toHaveBeenCalled()
  })

  it("reads the market and the quoted levels as a table, a toned context value in words beside its color, and the server's message from a region there from the start", () => {
    const { rerender } = mount({ inquiry: inquiry({ side: "two-way", quoted: { bid: 99.484375, ask: 99.53125 }, context: [{ label: "Position", value: "12mm", tone: "up" }, { label: "Risk", value: "4k", tone: "flat" }] }) })
    const table = screen.getByRole("table")
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Bid", "Offer"])
    expect(within(table).getByRole("rowheader", { name: "Composite" })).toBeInTheDocument()
    expect(within(table).getByRole("rowheader", { name: "Quoted" })).toBeInTheDocument()
    expect(within(table).getAllByRole("cell").map((c) => c.textContent)).toEqual(["", "99-16", "99-16+", "99-15+", "99-17"])
    const [position, risk] = [...document.querySelectorAll("[data-rfq-context] dd")]
    expect(position).toHaveAttribute("data-direction", "up")
    expect(position).toHaveTextContent("12mm, up")
    expect(position!.querySelector(".sr-only")).toHaveTextContent(", up")
    expect(risk).toHaveAttribute("data-direction", "flat")
    expect(risk).toHaveTextContent(/^4k$/)
    const said = document.querySelector("[data-rfq-reply]")!
    expect(said).toHaveAttribute("role", "status")
    expect(said).toBeEmptyDOMElement()
    rerender({ inquiry: inquiry({ message: "Cover 99-15" }) })
    expect(document.querySelector("[data-rfq-reply]")).toBe(said)
    expect(said).toHaveTextContent("Cover 99-15")
    expect(document.querySelector("[data-rfq-message]")).toHaveAttribute("aria-hidden", "true")
  })

  it("says a refusal again when a press meets the problem a field already shows", () => {
    mount()
    const announcer = document.querySelector<HTMLElement>("[data-rfq-announcer]")!
    fireEvent.click(screen.getByRole("button", { name: /^Quote/ }))
    expect(screen.getByText("An offer is needed.")).toHaveAttribute("role", "alert")
    expect(announcer).toBeEmptyDOMElement()
    fireEvent.click(screen.getByRole("button", { name: /^Quote/ }))
    expect(announcer).toHaveTextContent("An offer is needed.")
    const first = announcer.firstElementChild
    fireEvent.keyDown(field("Offer"), { key: "Enter", ctrlKey: true })
    expect(announcer.firstElementChild).not.toBe(first)
    expect(announcer).toHaveTextContent("An offer is needed.")
  })

  it("says each word a dealer reads from labels, offers whole quick sizes once each, and draws a destructive action in its color on the outline button", () => {
    mount({
      inquiry: inquiry({ side: "two-way", context: [{ label: "Position", value: "12mm", tone: "down" }], market: { label: "Composite", bid: 4.26, ask: 4.25 }, instrument: { symbol: "B3M", convention: BILL } }),
      defaultDraft: { bid: 4.27 },
      quickSizes: [1_000_000, 1_000_000, 0.5, -2, 2_500_000],
      labels: { millions: " Mio.", bp: "Bp.", toneDown: "abwärts", stepUp: "{label}: ein Schritt mehr", stepDown: "{label}: ein Schritt weniger" },
    })
    expect(screen.getByRole("group", { name: "Inquiry Q-1" })).toHaveTextContent("5 Mio.")
    expect(within(screen.getByRole("group", { name: "For" })).getAllByRole("button").map((b) => b.textContent)).toEqual(["5 Mio.", "1 Mio.", "2.5 Mio."])
    expect(document.querySelector("[data-rfq-distance='bid']")).toHaveTextContent("+1.0 Bp. vs market")
    expect(document.querySelector("[data-rfq-context] dd")).toHaveTextContent("12mm, abwärts")
    expect(screen.getByRole("button", { name: "Bid: ein Schritt mehr" })).toBeInTheDocument()
    const pass = screen.getByRole("button", { name: "Pass" })
    expect(pass).toHaveAttribute("data-destructive", "true")
    expect(pass.classList).toContain("text-destructive")
    expect(pass.className).not.toContain("bg-destructive")
    expect(screen.getByRole("group", { name: "Inquiry Q-1" }).className).toContain("focus-visible:ring-foreground/60")
    expect(RFQ_TICKET_BINDINGS.find((b) => b.id === "rfq.tick-up")?.description).toBe("Level up one step")
  })
})
