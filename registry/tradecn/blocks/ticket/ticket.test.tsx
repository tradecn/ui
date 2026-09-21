import { fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { checkDraft, describeDraft, parseQuantity, Ticket, TICKET_BINDINGS, type TicketDraft, type TicketInstrument, type TicketProps } from "@/registry/tradecn/blocks/ticket/ticket"
import { HotkeysProvider } from "@/registry/tradecn/hooks/use-hotkeys"
import { createHotkeyRegistry, type HotkeyRegistry } from "@/registry/tradecn/lib/hotkeys"

const ZN: TicketInstrument = { symbol: "ZN", convention: { price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 }, quantityStep: 100 }
const ES: TicketInstrument = { symbol: "ES", convention: { price: { kind: "decimal", decimals: 2 }, tick: 0.25 } }

const draftOf = (over: Partial<TicketDraft> = {}): TicketDraft => ({ side: "buy", quantity: 5, price: 99.515625, type: "limit", tif: "day", account: null, ...over })

function mount(props: Partial<TicketProps> = {}, registry: HotkeyRegistry | null = createHotkeyRegistry({ platform: "other" })) {
  const run = vi.fn()
  const onDraftChange = vi.fn()
  const ui = <Ticket instrument={ZN} actions={[{ id: "send", label: "Send", run, primary: true }]} allowedActions={["send"]} onDraftChange={onDraftChange} {...props} />
  const view = render(registry ? <HotkeysProvider registry={registry}>{ui}</HotkeysProvider> : ui)
  const rerender = (next: Partial<TicketProps>) => {
    const again = <Ticket instrument={ZN} actions={[{ id: "send", label: "Send", run, primary: true }]} allowedActions={["send"]} onDraftChange={onDraftChange} {...props} {...next} />
    view.rerender(registry ? <HotkeysProvider registry={registry}>{again}</HotkeysProvider> : again)
  }
  return { run, onDraftChange, view, rerender, registry }
}

const price = () => screen.getByLabelText("Price") as HTMLInputElement
const quantity = () => screen.getByLabelText("Quantity") as HTMLInputElement
const type = (input: HTMLInputElement, value: string) => fireEvent.change(input, { target: { value } })
const lastDraft = (fn: ReturnType<typeof vi.fn>) => fn.mock.calls.at(-1)?.[0] as TicketDraft

// happy-dom 20 has real Web Animations, and cancelling one leaves a rejected promise behind. The
// ring test counts calls, so an inert stand-in records them and animates nothing.
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "animate").mockImplementation(() => ({ cancel() {}, finish() {}, currentTime: 0, onfinish: null }) as unknown as Animation)
})
afterEach(() => vi.restoreAllMocks())

describe("Ticket", () => {
  it("is a group named for its instrument, an editing hotkey scope, and the block's slot", () => {
    mount()
    const ticket = screen.getByRole("group", { name: "Order ticket ZN" })
    expect(ticket).toHaveAttribute("data-slot", "tradecn-ticket")
    expect(ticket).toHaveAttribute("data-hotkey-scope", "editing")
    expect(ticket).toHaveAttribute("data-side", "buy")
    expect(screen.getByText("ZN")).toBeInTheDocument()
  })

  it("reads a price in the instrument's notation, prints it back, and steps it by the tick", () => {
    const { onDraftChange } = mount({ reference: { bid: 99.5, ask: 99.515625, last: 99.5 } })
    type(price(), "99-16+")
    expect(lastDraft(onDraftChange).price).toBe(99.515625)
    fireEvent.blur(price())
    expect(price().value).toBe("99-16+")
    fireEvent.keyDown(price(), { key: "ArrowUp" })
    expect(price().value).toBe("99-17")
    expect(lastDraft(onDraftChange).price).toBe(99.53125)
    fireEvent.keyDown(price(), { key: "ArrowDown", shiftKey: true })
    expect(price().value).toBe("99-12")
    fireEvent.click(screen.getByRole("button", { name: "Price up one tick" }))
    expect(price().value).toBe("99-12+")
    fireEvent.click(screen.getByRole("button", { name: "Price down one tick" }))
    expect(price().value).toBe("99-12")
    // A decimal is taken too, and comes back in the notation.
    type(price(), "99.75")
    fireEvent.blur(price())
    expect(price().value).toBe("99-24")
  })

  it("marks what is not a price on blur, and clears the mark as soon as something else is typed", () => {
    mount()
    type(price(), "abc")
    expect(price()).not.toHaveAttribute("aria-invalid")
    fireEvent.blur(price())
    expect(price()).toHaveAttribute("aria-invalid", "true")
    expect(screen.getByText("Not a price in this instrument's notation.")).toBeInTheDocument()
    type(price(), "99-1")
    expect(price()).not.toHaveAttribute("aria-invalid")
    // 32 thirty-seconds is not a price either; a blank field is not wrong.
    type(price(), "99-32")
    fireEvent.blur(price())
    expect(price()).toHaveAttribute("aria-invalid", "true")
    type(price(), "")
    fireEvent.blur(price())
    expect(price()).not.toHaveAttribute("aria-invalid")
  })

  it("steps a blank price from the last, then the mid, then the side there is, and from nothing not at all", () => {
    const { rerender } = mount({ reference: { bid: 99.5, ask: 99.53125 } })
    fireEvent.keyDown(price(), { key: "ArrowUp" })
    // Mid of 99-16 and 99-17 is 99-16+, one tick up is 99-17.
    expect(price().value).toBe("99-17")
    rerender({ reference: { last: 100 }, defaultDraft: {} })
    type(price(), "")
    fireEvent.keyDown(price(), { key: "ArrowDown" })
    expect(price().value).toBe("99-31+")
    rerender({ reference: { ask: 101 } })
    type(price(), "")
    fireEvent.keyDown(price(), { key: "ArrowUp" })
    expect(price().value).toBe("101-00+")
    rerender({ reference: undefined })
    type(price(), "")
    fireEvent.keyDown(price(), { key: "ArrowUp" })
    expect(price().value).toBe("")
  })

  it("takes a reference price in one click, and none when the order type has no price", () => {
    const { onDraftChange } = mount({ reference: { bid: 99.5, ask: 99.515625, last: 99.5078125 } })
    fireEvent.click(screen.getByRole("button", { name: "Ask 99-16+, use it" }))
    expect(price().value).toBe("99-16+")
    fireEvent.click(screen.getByRole("button", { name: "Bid 99-16, use it" }))
    expect(lastDraft(onDraftChange).price).toBe(99.5)
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "market" } })
    expect(price()).toBeDisabled()
    expect(screen.getByRole("button", { name: "Bid 99-16, use it" })).toBeDisabled()
    expect(price().placeholder).toBe("market")
  })

  it("reads a whole quantity with or without separators and steps it by the instrument's step", () => {
    const { onDraftChange } = mount()
    type(quantity(), "5,000")
    expect(lastDraft(onDraftChange).quantity).toBe(5000)
    fireEvent.blur(quantity())
    expect(quantity().value).toBe("5,000")
    fireEvent.keyDown(quantity(), { key: "ArrowUp" })
    expect(quantity().value).toBe("5,100")
    fireEvent.keyDown(quantity(), { key: "ArrowDown", shiftKey: true })
    expect(quantity().value).toBe("4,100")
    type(quantity(), "2.5")
    expect(lastDraft(onDraftChange).quantity).toBeNull()
  })

  it("shows the side through aria-pressed and flips it", () => {
    const { onDraftChange } = mount()
    expect(screen.getByRole("button", { name: "Buy" })).toHaveAttribute("aria-pressed", "true")
    fireEvent.click(screen.getByRole("button", { name: "Sell" }))
    expect(screen.getByRole("button", { name: "Sell" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: "Buy" })).toHaveAttribute("aria-pressed", "false")
    expect(screen.getByRole("group", { name: "Order ticket ZN" })).toHaveAttribute("data-side", "sell")
    expect(lastDraft(onDraftChange).side).toBe("sell")
  })

  it("renders only the actions the server allowed, in your order, and says so when there are none", () => {
    const run = vi.fn()
    const { rerender } = mount({
      actions: [
        { id: "send", label: "Send", run },
        { id: "amend", label: "Amend", run },
        { id: "cancel", label: "Cancel", run, destructive: true },
      ],
      allowedActions: ["cancel", "send"],
    })
    expect(screen.getAllByRole("button").filter((b) => b.hasAttribute("data-action")).map((b) => b.getAttribute("data-action"))).toEqual(["send", "cancel"])
    rerender({ allowedActions: [] })
    expect(screen.queryByRole("button", { name: "Send" })).toBeNull()
    expect(screen.getByText("Nothing can be done with this ticket right now.")).toBeInTheDocument()
    rerender({ allowedActions: undefined })
    expect(screen.getByText("Nothing can be done with this ticket right now.")).toBeInTheDocument()
  })

  it("checks the draft as the action runs: a quantity above zero, a price when the type takes one", () => {
    const { run } = mount()
    fireEvent.click(screen.getByRole("button", { name: "Send" }))
    expect(run).not.toHaveBeenCalled()
    expect(screen.getByText("Enter a quantity above zero.")).toBeInTheDocument()
    expect(screen.getByText("This order type needs a price.")).toBeInTheDocument()
    type(quantity(), "5")
    expect(screen.queryByText("Enter a quantity above zero.")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Send" }))
    expect(run).not.toHaveBeenCalled()
    type(price(), "99-16+")
    fireEvent.click(screen.getByRole("button", { name: "Send" }))
    expect(run).toHaveBeenCalledTimes(1)
    expect(run).toHaveBeenCalledWith(draftOf(), ZN)
    // A market order needs no price and sends none.
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "market" } })
    fireEvent.click(screen.getByRole("button", { name: "Send" }))
    expect(run).toHaveBeenLastCalledWith(draftOf({ type: "market", price: null }), ZN)
  })

  it("labels an action from the draft, and marks the primary one with the send keys", () => {
    mount({ actions: [{ id: "send", label: (d) => (d.side === "buy" ? "Buy it" : "Sell it"), run: vi.fn(), primary: true }] })
    const button = screen.getByRole("button", { name: "Buy it" })
    expect(button.querySelectorAll("kbd[data-slot='kbd']")).toHaveLength(2)
    expect(button.textContent).toContain("Ctrl")
    fireEvent.click(screen.getByRole("button", { name: "Sell" }))
    expect(screen.getByRole("button", { name: "Sell it" })).toBeInTheDocument()
  })

  it("prints the status and the message as given, and rings once in primary when acknowledged", () => {
    const { rerender } = mount({ status: "Sent" })
    expect(screen.getByText("Sent")).toBeInTheDocument()
    expect(HTMLElement.prototype.animate).not.toHaveBeenCalled()
    rerender({ status: "Rejected", message: "Price outside the band" })
    expect(screen.getByText("Rejected")).toBeInTheDocument()
    expect(screen.getByText("Price outside the band")).toBeInTheDocument()
    expect(HTMLElement.prototype.animate).not.toHaveBeenCalled()
    rerender({ status: "Acknowledged", acknowledged: "ORD-1" })
    expect(HTMLElement.prototype.animate).toHaveBeenCalledTimes(1)
    const [frames] = (HTMLElement.prototype.animate as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!
    expect(JSON.stringify(frames)).toContain("var(--primary)")
    rerender({ status: "Acknowledged", acknowledged: "ORD-1" })
    expect(HTMLElement.prototype.animate).toHaveBeenCalledTimes(1)
    rerender({ status: "Acknowledged", acknowledged: "ORD-2" })
    expect(HTMLElement.prototype.animate).toHaveBeenCalledTimes(2)
  })

  it("tells the draft after it changed, not on the first render", () => {
    const { onDraftChange } = mount({ defaultDraft: { quantity: 5, price: 99.5 } })
    expect(onDraftChange).not.toHaveBeenCalled()
    expect(quantity().value).toBe("5")
    expect(price().value).toBe("99-16")
    fireEvent.click(screen.getByRole("button", { name: "Sell" }))
    expect(onDraftChange).toHaveBeenCalledTimes(1)
  })

  it("has an account field only when given accounts", () => {
    const { rerender, onDraftChange } = mount()
    expect(screen.queryByLabelText("Account")).toBeNull()
    rerender({ accounts: [{ id: "A-1", label: "A-1" }, { id: "A-2", label: "A-2" }] })
    fireEvent.change(screen.getByLabelText("Account"), { target: { value: "A-2" } })
    expect(lastDraft(onDraftChange).account).toBe("A-2")
  })
})

describe("Ticket keys", () => {
  it("sends, flips, and steps from inside its own fields, with the keys in the editing scope", () => {
    const { run, registry } = mount({ defaultDraft: { quantity: 5, price: 99.5 } })
    expect(registry!.list().map((e) => e.id)).toEqual(expect.arrayContaining(TICKET_BINDINGS.map((b) => b.id)))
    expect(registry!.list().find((e) => e.id === "ticket.send")?.scope).toBe("editing")
    quantity().focus()
    fireEvent.keyDown(quantity(), { key: "Enter", ctrlKey: true })
    expect(run).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(quantity(), { key: "x", ctrlKey: true, shiftKey: true })
    expect(screen.getByRole("group", { name: "Order ticket ZN" })).toHaveAttribute("data-side", "sell")
    fireEvent.keyDown(quantity(), { key: "ArrowUp", ctrlKey: true })
    expect(price().value).toBe("99-16+")
    fireEvent.keyDown(quantity(), { key: "ArrowDown", ctrlKey: true })
    fireEvent.keyDown(quantity(), { key: "ArrowDown", ctrlKey: true })
    expect(price().value).toBe("99-15+")
    // Plain Enter sends nothing.
    fireEvent.keyDown(quantity(), { key: "Enter" })
    expect(run).toHaveBeenCalledTimes(1)
  })

  it("does nothing when the server allows nothing, even from the key", () => {
    const { run, rerender } = mount({ defaultDraft: { quantity: 5, price: 99.5 } })
    rerender({ allowedActions: [] })
    quantity().focus()
    fireEvent.keyDown(quantity(), { key: "Enter", ctrlKey: true })
    expect(run).not.toHaveBeenCalled()
  })

  it("keeps two tickets' keys apart, declares the bindings once, and takes them back with the last ticket", () => {
    const registry = createHotkeyRegistry({ platform: "other" })
    const a = vi.fn()
    const b = vi.fn()
    const view = render(
      <HotkeysProvider registry={registry}>
        <Ticket instrument={ZN} actions={[{ id: "send", label: "Send A", run: a }]} allowedActions={["send"]} defaultDraft={{ quantity: 1, price: 99.5 }} />
        <Ticket instrument={ES} actions={[{ id: "send", label: "Send B", run: b }]} allowedActions={["send"]} defaultDraft={{ quantity: 1, price: 5012.25 }} />
      </HotkeysProvider>,
    )
    const fields = screen.getAllByLabelText("Quantity")
    fireEvent.keyDown(fields[1]!, { key: "Enter", ctrlKey: true })
    expect(a).not.toHaveBeenCalled()
    expect(b).toHaveBeenCalledTimes(1)
    expect(registry.list().filter((e) => e.id === "ticket.send")).toHaveLength(1)
    view.rerender(
      <HotkeysProvider registry={registry}>
        <Ticket instrument={ZN} actions={[{ id: "send", label: "Send A", run: a }]} allowedActions={["send"]} defaultDraft={{ quantity: 1, price: 99.5 }} />
      </HotkeysProvider>,
    )
    expect(registry.list().some((e) => e.id === "ticket.send")).toBe(true)
    fireEvent.keyDown(screen.getByLabelText("Quantity"), { key: "Enter", ctrlKey: true })
    expect(a).toHaveBeenCalledTimes(1)
    view.unmount()
    expect(registry.list().some((e) => e.id === "ticket.send")).toBe(false)
  })

  it("leaves a binding the consumer declared alone, keys and wording, and shows those keys", () => {
    const registry = createHotkeyRegistry({ platform: "other" })
    registry.register({ id: "ticket.send", keys: "mod+s", scope: "editing", description: "Ship it" })
    const { run, view } = mount({ defaultDraft: { quantity: 5, price: 99.5 } }, registry)
    expect(registry.list().find((e) => e.id === "ticket.send")?.description).toBe("Ship it")
    expect(screen.getByRole("button", { name: "Send" }).textContent).toContain("S")
    fireEvent.keyDown(quantity(), { key: "s", ctrlKey: true })
    expect(run).toHaveBeenCalledTimes(1)
    view.unmount()
    expect(registry.list().some((e) => e.id === "ticket.send")).toBe(true)
  })

  it("renders without a HotkeysProvider and shows no keys", () => {
    mount({}, null)
    expect(screen.getByRole("button", { name: "Send" }).querySelectorAll("kbd")).toHaveLength(0)
  })
})

describe("describeDraft, checkDraft, parseQuantity", () => {
  it("says a draft in words", () => {
    expect(describeDraft(draftOf(), ZN)).toBe("Buy 5 ZN @ 99-16+")
    expect(describeDraft(draftOf({ side: "sell", quantity: 5000, type: "market", price: null }), ZN)).toBe("Sell 5,000 ZN at market")
    expect(describeDraft(draftOf({ quantity: null, price: null }), ES)).toBe("Buy ES")
    expect(describeDraft(draftOf({ price: 5012.25 }), ES)).toBe("Buy 5 ES @ 5,012.25")
  })

  it("names what stops a draft", () => {
    expect(checkDraft(draftOf(), [{ id: "limit", label: "Limit" }])).toEqual({})
    expect(checkDraft(draftOf({ quantity: 0, price: null }), [{ id: "limit", label: "Limit" }])).toEqual({ quantity: "Enter a quantity above zero.", price: "This order type needs a price." })
    expect(checkDraft(draftOf({ price: null, type: "market" }), [{ id: "market", label: "Market", priced: false }])).toEqual({})
  })

  it("reads whole numbers only", () => {
    expect(parseQuantity("5")).toBe(5)
    expect(parseQuantity(" 5,000 ")).toBe(5000)
    expect(parseQuantity("2.5")).toBeNull()
    expect(parseQuantity("-1")).toBeNull()
    expect(parseQuantity("")).toBeNull()
  })
})

