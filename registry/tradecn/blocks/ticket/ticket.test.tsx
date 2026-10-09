import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { StrictMode, useLayoutEffect } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { formatQuickSize, checkDraft, describeDraft, parseQuantity, Ticket, TICKET_BINDINGS, type TicketDraft, type TicketInstrument, type TicketProps } from "@/registry/tradecn/blocks/ticket/ticket"
import { HotkeysProvider } from "@/registry/tradecn/hooks/use-hotkeys"
import { createHotkeyRegistry, type HotkeyRegistry } from "@/registry/tradecn/lib/hotkeys"
import { formatQuantity } from "@/registry/tradecn/lib/format"

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

  it("steps the quantity by one when the instrument's step is not a whole number from 1 to the safe-integer limit", () => {
    for (const step of [0, 0.5, -100, Number.NaN, 2 ** 53]) {
      const { view, onDraftChange } = mount({ instrument: { ...ZN, quantityStep: step } })
      fireEvent.keyDown(quantity(), { key: "ArrowUp" })
      expect(quantity().value).toBe("1")
      expect(lastDraft(onDraftChange).quantity).toBe(1)
      view.unmount()
    }
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

  it("snaps an off-grid default price to the quote grid, so the price sent is the one shown", () => {
    const { run } = mount({ defaultDraft: { quantity: 5, price: 99.51 } })
    expect(price().value).toBe("99-16+")
    fireEvent.click(screen.getByRole("button", { name: "Send" }))
    expect(run.mock.calls[0]![0]).toMatchObject({ price: 99.515625 })
  })

  it("withdraws the price problem when the type stops taking a price", () => {
    mount({ defaultDraft: { quantity: 5 } })
    fireEvent.click(screen.getByRole("button", { name: "Send" }))
    expect(screen.getByText("This order type needs a price.")).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "market" } })
    expect(screen.queryByText("This order type needs a price.")).toBeNull()
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
    const root = screen.getByRole("group", { name: "Order ticket ZN" })
    expect(screen.getByText("Sent")).toBeInTheDocument()
    expect(root).toHaveAttribute("data-status", "Sent")
    expect(HTMLElement.prototype.animate).not.toHaveBeenCalled()
    rerender({ status: "Rejected", message: "Price outside the band" })
    expect(screen.getByText("Rejected")).toBeInTheDocument()
    expect(root).toHaveAttribute("data-status", "Rejected")
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
    rerender({ status: undefined, acknowledged: "ORD-2" })
    expect(root).not.toHaveAttribute("data-status")
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
  it("never runs a destructive action on the send key, even one that checks the draft", () => {
    // Cancel at the default checked is the shape the actions fixture above uses:
    // mod+enter must not reach it when it is the only action allowed.
    const cancel = vi.fn()
    mount({ defaultDraft: { quantity: 5, price: 99.5 }, actions: [{ id: "cancel", label: "Cancel", run: cancel, destructive: true }], allowedActions: ["cancel"] })
    quantity().focus()
    fireEvent.keyDown(quantity(), { key: "Enter", ctrlKey: true })
    expect(cancel).not.toHaveBeenCalled()
  })

  it("sends, flips, and steps from inside its own fields, with the keys in the editing scope", () => {
    const { run, registry } = mount({ defaultDraft: { quantity: 5, price: 99.5 }, quickSizes: [1, 2, 3, 4, 5, 6, 7, 8, 9] })
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
    const sendEntry = registry.list().find((e) => e.id === "ticket.send")
    expect(sendEntry?.keys).toBe("ctrl+enter")
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

  it("keeps a provider's declaration made while no ticket sat beneath it", () => {
    const registry = createHotkeyRegistry({ platform: "other" })
    const one = <Ticket instrument={ZN} actions={[{ id: "send", label: "Send", run: vi.fn() }]} allowedActions={["send"]} />
    const ui = (tickets: boolean) => (
      <HotkeysProvider registry={registry}>
        {tickets && one}
        <HotkeysProvider registry={registry} bindings={TICKET_BINDINGS}>{null}</HotkeysProvider>
      </HotkeysProvider>
    )
    const view = render(ui(true))
    // The ticket leaves; the declaring provider never had a ticket beneath it and must stand.
    view.rerender(ui(false))
    expect(registry.list().some((e) => e.id === "ticket.send")).toBe(true)
    view.unmount()
    expect(registry.list().some((e) => e.id === "ticket.send")).toBe(false)
  })

  it("cedes to a nested provider that declares while tickets come and go", () => {
    const registry = createHotkeyRegistry({ platform: "other" })
    const one = <Ticket instrument={ZN} actions={[{ id: "send", label: "Send", run: vi.fn() }]} allowedActions={["send"]} />
    const ui = (tickets: boolean) => (
      <HotkeysProvider registry={registry}>
        {tickets && one}
        <HotkeysProvider registry={registry} bindings={TICKET_BINDINGS}>{tickets && one}</HotkeysProvider>
      </HotkeysProvider>
    )
    const view = render(ui(true))
    // Both tickets leave; the nested provider stays, and its declaration must survive.
    view.rerender(ui(false))
    expect(registry.list().some((e) => e.id === "ticket.send")).toBe(true)
    view.unmount()
  })

  it("runs nothing in a disabled ticket, flip and price steps included", () => {
    const registry = createHotkeyRegistry({ platform: "other" })
    const { onDraftChange } = mount({ disabled: true, reference: { last: 99.5 } }, registry)
    const group = document.querySelector<HTMLElement>("[data-slot='tradecn-ticket']")!
    group.focus()
    fireEvent.keyDown(group, { key: "x", ctrlKey: true, shiftKey: true })
    fireEvent.keyDown(group, { key: "ArrowUp", ctrlKey: true })
    expect(onDraftChange).not.toHaveBeenCalled()
    expect(price().value).toBe("")
  })

  it("declares only the sizes passed, so another fenced desk stays conflict-free", () => {
    const registry = createHotkeyRegistry({ platform: "other" })
    mount({ quickSizes: [1, 5], defaultDraft: { price: 99.5 } }, registry)
    expect(registry.list().some((e) => e.id === "ticket.size-2")).toBe(true)
    expect(registry.list().some((e) => e.id === "ticket.size-9")).toBe(false)
    // Another component's fenced mod+9 — an RFQ ticket's ninth size — reports no conflict,
    // since an absent size declares nothing rather than standing unbound and fenceless.
    const el = document.createElement("div")
    document.body.appendChild(el)
    const detach = registry.bind("desk.nine", () => {}, { scope: "editing", element: () => el })
    act(() => void registry.register({ id: "desk.nine", keys: "mod+9", scope: "editing", description: "Ninth desk thing" }))
    expect(registry.conflicts()).toEqual([])
    detach()
    el.remove()
  })

  it("keeps a desk conflict-free when the consumer spreads all nine size bindings", () => {
    const registry = createHotkeyRegistry({ platform: "other" })
    render(
      <HotkeysProvider registry={registry} bindings={TICKET_BINDINGS}>
        <Ticket instrument={ZN} actions={[{ id: "send", label: "Send", run: vi.fn() }]} allowedActions={["send"]} quickSizes={[1, 5]} />
      </HotkeysProvider>,
    )
    const el = document.body.appendChild(document.createElement("div"))
    const detach = registry.bind("desk.nine", () => {}, { scope: "editing", element: () => el })
    act(() => void registry.register({ id: "desk.nine", keys: "mod+9", scope: "editing", description: "Ninth desk thing" }))
    expect(registry.conflicts()).toEqual([])
    detach()
    el.remove()
  })

  it("consumes a declared absent size and does nothing with it", () => {
    const registry = createHotkeyRegistry({ platform: "other" })
    const onDraftChange = vi.fn()
    render(
      <HotkeysProvider registry={registry} bindings={TICKET_BINDINGS}>
        <Ticket instrument={ZN} actions={[{ id: "send", label: "Send", run: vi.fn() }]} allowedActions={["send"]} onDraftChange={onDraftChange} quickSizes={[1, 5]} />
      </HotkeysProvider>,
    )
    const group = document.querySelector<HTMLElement>("[data-slot='tradecn-ticket']")!
    group.focus()
    // The consumer declared all nine, so the registry consumes mod+9 inside the fence; the
    // ticket, lacking a ninth size, does nothing with it.
    expect(fireEvent.keyDown(group, { key: "9", ctrlKey: true })).toBe(false)
    expect(onDraftChange).not.toHaveBeenCalled()
  })

  it("declares only the quick sizes that exist, absent ones falling through", () => {
    const registry = createHotkeyRegistry({ platform: "other" })
    const { onDraftChange } = mount({ quickSizes: [1, 5], defaultDraft: { price: 99.5 } }, registry)
    const group = document.querySelector<HTMLElement>("[data-slot='tradecn-ticket']")!
    group.focus()
    // An absent size's key is not claimed: the event keeps its default and the draft stands.
    expect(fireEvent.keyDown(group, { key: "9", ctrlKey: true })).toBe(true)
    expect(onDraftChange).not.toHaveBeenCalled()
    expect(fireEvent.keyDown(group, { key: "2", ctrlKey: true })).toBe(false)
    expect(onDraftChange).toHaveBeenCalledTimes(1)
  })

  it("sends nothing when only unchecked actions remain", () => {
    const send = vi.fn()
    const cancel = vi.fn()
    mount({
      actions: [
        { id: "send", label: "Send", primary: true, run: send },
        { id: "cancel", label: "Cancel order", checked: false, destructive: true, run: cancel },
      ],
      allowedActions: ["cancel"],
      defaultDraft: { quantity: 1, price: 99.5 },
    })
    const group = document.querySelector<HTMLElement>("[data-slot='tradecn-ticket']")!
    act(() => group.focus())
    // Cancel sends nothing of the draft, so the shortcut named send never runs it, and the
    // send caps stay off its button.
    fireEvent.keyDown(quantity(), { key: "Enter", ctrlKey: true })
    expect(cancel).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Cancel order" }).querySelector("kbd")).toBeNull()
  })

  it("ignores a warming feed's non-finite reference", () => {
    const { onDraftChange } = mount({ reference: { last: Number.NaN } })
    expect(screen.queryByRole("button", { name: /^Last/ })).toBeNull()
    fireEvent.keyDown(quantity(), { key: "ArrowUp", ctrlKey: true })
    expect(onDraftChange).not.toHaveBeenCalled()
    expect(checkDraft({ side: "buy", quantity: 1, price: Number.NaN, type: "limit", tif: "day", account: null }, [{ id: "limit", label: "Limit" }]).price).toBeTruthy()
  })

  it("checks a send against the commit the trader sees", () => {
    const run = vi.fn()
    const registry = createHotkeyRegistry({ platform: "other" })
    function Probe({ fire }: { fire: boolean }) {
      // Fires in the layout phase of the same commit that revoked the action: the moment a
      // real keydown can land before passive effects run.
      useLayoutEffect(() => {
        if (fire) screen.getByLabelText("Quantity").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true, cancelable: true }))
      }, [fire])
      return null
    }
    const ui = (allowed: string[], fire: boolean) => (
      <HotkeysProvider registry={registry}>
        <Ticket instrument={ZN} actions={[{ id: "send", label: "Send", primary: true, run }]} allowedActions={allowed} defaultDraft={{ quantity: 1, price: 99.5 }} />
        <Probe fire={fire} />
      </HotkeysProvider>
    )
    const view = render(ui(["send"], false))
    view.rerender(ui([], true))
    expect(run).not.toHaveBeenCalled()
  })

  it("stores the snapped value a reference button shows", () => {
    const { onDraftChange } = mount({ reference: { last: 99.5078125 } })
    // The label reads 99-16+ — the snapped value — and the click must store exactly that,
    // never the raw off-grid feed value behind it.
    fireEvent.click(screen.getByRole("button", { name: "Last 99-16+, use it" }))
    expect(onDraftChange.mock.calls.at(-1)?.[0].price).toBe(99.515625)
  })

  it("keeps the record through a window switch, and parks on return", () => {
    const { rerender } = mount({ defaultDraft: { quantity: 1, price: 99.5 } })
    const group = document.querySelector<HTMLElement>("[data-slot='tradecn-ticket']")!
    const button = screen.getByRole("button", { name: "Send" })
    act(() => button.focus())
    // A window switch blurs with no destination while the document loses focus: the record
    // stays, so a control withdrawn while the trader is away still parks on return.
    const away = vi.spyOn(document, "hasFocus").mockReturnValue(false)
    fireEvent.blur(button, { relatedTarget: null })
    away.mockRestore()
    rerender({ allowedActions: [] })
    expect(document.activeElement).toBe(group)
  })

  it("parks without scrolling when the focused action disables, and a deliberate blur is leaving", () => {
    const { rerender } = mount({ defaultDraft: { quantity: 1, price: 99.5 } })
    const group = document.querySelector<HTMLElement>("[data-slot='tradecn-ticket']")!
    const button = screen.getByRole("button", { name: "Send" })
    act(() => button.focus())
    const focusSpy = vi.spyOn(HTMLElement.prototype, "focus")
    // Disabling the focused control parks like a removal, and the park never scrolls.
    rerender({ disabled: true })
    expect(document.activeElement).toBe(group)
    const parked = focusSpy.mock.calls.at(-1)
    expect(parked?.[0]).toMatchObject({ preventScroll: true })
    focusSpy.mockRestore()
    rerender({ disabled: false })
    const again = screen.getByRole("button", { name: "Send" })
    act(() => again.focus())
    // A deliberate blur to nowhere while the window keeps focus is leaving: a later
    // withdrawal must not pull focus back into the ticket, whose fenced bindings would
    // outrank the desk's.
    fireEvent.blur(again, { relatedTarget: null })
    rerender({ allowedActions: [] })
    expect(document.activeElement).toBe(document.body)
  })

  it("spends the record when it parks, at acknowledgement frequency", () => {
    const { rerender } = mount({ defaultDraft: { quantity: 1, price: 99.5 } })
    const group = document.querySelector<HTMLElement>("[data-slot='tradecn-ticket']")!
    const button = screen.getByRole("button", { name: "Send" })
    act(() => button.focus())
    rerender({ allowedActions: [] })
    expect(document.activeElement).toBe(group)
    // The trader clicks the page background; only the spent record keeps the next server
    // update from pulling focus back into the ticket.
    act(() => (document.activeElement as HTMLElement).blur())
    expect(document.activeElement).toBe(document.body)
    rerender({ allowedActions: [], reference: { last: 99.53125 } })
    expect(document.activeElement).toBe(document.body)
  })

  it("keeps focus in the ticket when the focused action leaves", () => {
    const { rerender } = mount({ defaultDraft: { quantity: 1, price: 99.5 } })
    const group = document.querySelector<HTMLElement>("[data-slot='tradecn-ticket']")!
    const button = screen.getByRole("button", { name: "Send" })
    act(() => button.focus())
    rerender({ allowedActions: [] })
    // The park lands on the scope root itself, the element the fence makes focusable — an
    // inner div would be a browser no-op.
    expect(document.activeElement).toBe(group)
  })

  it("sends the first checked action, preferring a checked primary", () => {
    const hold = vi.fn()
    const send = vi.fn()
    const actions = [
      { id: "hold", label: "Hold", primary: true, checked: false as const, run: hold },
      { id: "send", label: "Send", run: send },
    ]
    mount({ actions, allowedActions: ["hold", "send"], defaultDraft: { quantity: 1, price: 99.5 } })
    const group = document.querySelector<HTMLElement>("[data-slot='tradecn-ticket']")!
    act(() => group.focus())
    fireEvent.keyDown(quantity(), { key: "Enter", ctrlKey: true })
    // Hold styles as primary but checks nothing of the draft, so the send key and its caps
    // pass it by for the checked action.
    expect(hold).not.toHaveBeenCalled()
    expect(send).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("button", { name: "Hold" }).querySelector("kbd")).toBeNull()
    expect(screen.getByRole("button", { name: /^Send/ }).querySelector("kbd")).not.toBeNull()
    const amend = vi.fn()
    const primarySend = vi.fn()
    const second = mount({ actions: [{ id: "amend", label: "Amend", run: amend }, { id: "send", label: "Send it", primary: true, run: primarySend }], allowedActions: ["amend", "send"], defaultDraft: { quantity: 1, price: 99.5 } })
    const groups = document.querySelectorAll<HTMLElement>("[data-slot='tradecn-ticket']")
    act(() => groups[1]!.focus())
    fireEvent.keyDown(within(second.view.container).getByLabelText("Quantity") as HTMLInputElement, { key: "Enter", ctrlKey: true })
    expect(primarySend).toHaveBeenCalledTimes(1)
    expect(amend).not.toHaveBeenCalled()
  })

  it("steps, references, and describes in the instrument's quote basis", () => {
    const BILL: TicketInstrument = { symbol: "B912", convention: { price: { kind: "decimal", decimals: 3 }, tick: 0.0005, quoteBasis: "discount" } }
    const { onDraftChange } = mount({ instrument: BILL, reference: { last: 4.25 } })
    fireEvent.keyDown(quantity(), { key: "ArrowUp", ctrlKey: true })
    // The field shows the quote grid, so the stored price moves on it too: one step of the
    // discount step, never a price tick the display would round away.
    expect(onDraftChange.mock.calls.at(-1)?.[0].price).toBe(4.251)
    expect(price().value).toBe("4.251")
    // A fraction-priced instrument quoted on yield prints its references and description in
    // the quote basis the field shows.
    const NOTE_ON_YIELD: TicketInstrument = { symbol: "T30", convention: { price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64, quoteBasis: "yield" } }
    const second = mount({ instrument: NOTE_ON_YIELD, reference: { last: 4.25 } })
    expect(within(second.view.container).getByRole("button", { name: "Last 4.250, use it" })).toBeInTheDocument()
    expect(describeDraft({ side: "buy", quantity: 5, price: 4.253, type: "limit", tif: "day", account: null }, NOTE_ON_YIELD)).toContain("@ 4.253")
  })

  it("brings the default back when the consumer unregisters their replacement", () => {
    const registry = createHotkeyRegistry({ platform: "other" })
    const { view } = mount({}, registry)
    registry.register({ id: "ticket.send", keys: "mod+s", scope: "editing", description: "Ship it" })
    expect(registry.list().find((e) => e.id === "ticket.send")?.description).toBe("Ship it")
    act(() => registry.unregister("ticket.send"))
    expect(registry.list().find((e) => e.id === "ticket.send")?.description).toBe("Send the ticket")
    view.unmount()
    expect(registry.list().some((e) => e.id === "ticket.send")).toBe(false)
  })

  it("holds its default against unregister while a ticket stands", () => {
    const registry = createHotkeyRegistry({ platform: "other" })
    mount({}, registry)
    registry.unregister("ticket.send")
    expect(registry.list().some((e) => e.id === "ticket.send")).toBe(true)
  })

  it("leaves a replacement that changed only a behavior field", () => {
    const registry = createHotkeyRegistry({ platform: "other" })
    const { view } = mount({ defaultDraft: { quantity: 5, price: 99.5 } }, registry)
    const own = registry.list().find((e) => e.id === "ticket.send")!
    // Same keys and wording, a `when` guard added: a real replacement the cleanup must keep.
    act(() => void registry.register({ id: "ticket.send", keys: own.declaredKeys, scope: own.scope, description: own.description, group: own.group, when: () => false }))
    view.unmount()
    expect(registry.list().some((e) => e.id === "ticket.send")).toBe(true)
  })

  it("cedes a binding declared through the provider's bindings, and runs shortcuts from the whole ticket", () => {
    const registry = createHotkeyRegistry({ platform: "other" })
    const bindings = [{ id: "ticket.send", keys: "mod+s", scope: "editing" as const, description: "Ship it" }]
    const run = vi.fn()
    const { rerender } = render(
      <HotkeysProvider registry={registry} bindings={bindings}>
        <Ticket instrument={ZN} actions={[{ id: "send", label: "Send", run, primary: true }]} allowedActions={["send"]} defaultDraft={{ quantity: 5, price: 99.5 }} />
      </HotkeysProvider>,
    )
    expect(registry.list().find((e) => e.id === "ticket.send")?.description).toBe("Ship it")
    const group = document.querySelector<HTMLElement>("[data-slot='tradecn-ticket']")!
    group.focus()
    fireEvent.keyDown(group, { key: "s", ctrlKey: true })
    expect(run).toHaveBeenCalledTimes(1)
    rerender(<HotkeysProvider registry={registry} bindings={bindings}>{null}</HotkeysProvider>)
    expect(registry.list().find((e) => e.id === "ticket.send")?.description).toBe("Ship it")
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
    expect(parseQuantity("1,000,000")).toBe(1_000_000)
    // A quantity reads back as the field prints it.
    for (const n of [0, 1, 999, 1000, 5000, 1_000_000, 9007199254740991]) expect(parseQuantity(formatQuantity(n)), String(n)).toBe(n)
    // A comma reads only between thousands: "2,5" from a decimal-comma keyboard is no quantity, never 25.
    for (const text of ["2,5", "10,00", "1,0,0", "0,500", ",500", "5,00,000", "1234,567"]) expect(parseQuantity(text)).toBeNull()
    expect(parseQuantity("2.5")).toBeNull()
    expect(parseQuantity("-1")).toBeNull()
    expect(parseQuantity("")).toBeNull()
  })
})


describe("limits", () => {
  const LIMITS = { maxQuantity: { confirm: 10, block: 50 }, maxDistance: { ticks: 4 } }
  const REFERENCE = { bid: 99.5, ask: 99.515625 }

  it.each(["deskPolicy", "constructor", "toString", "__proto__"])("holds checked actions for the custom field %s and releases them when its block is removed", (field) => {
    const send = vi.fn()
    const cancel = vi.fn()
    const { rerender } = mount({
      defaultDraft: draftOf(),
      limits: { custom: () => [{ field, level: "block", rule: "desk-policy", message: "Desk policy blocks this order." }] },
      actions: [{ id: "send", label: "Send", run: send }, { id: "cancel", label: "Cancel", run: cancel, checked: false }],
      allowedActions: ["send", "cancel"],
    })
    expect(document.querySelector("[data-ticket-limits='block']")).toHaveTextContent("Desk policy blocks this order.")
    const button = screen.getByRole("button", { name: /^Send/ })
    // Held, not taken away: it stays in reach, and a press on it is refused and says why.
    expect(button).toHaveAttribute("aria-disabled", "true")
    expect(button).toBeEnabled()
    fireEvent.click(button)
    expect(send).not.toHaveBeenCalled()
    expect(document.querySelector("[data-ticket-announcer]")).toHaveTextContent("Desk policy blocks this order.")
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(cancel).toHaveBeenCalledTimes(1)
    rerender({ limits: undefined })
    expect(button).not.toHaveAttribute("aria-disabled")
    expect(document.querySelector("[data-ticket-limits='block']")).toBeNull()
    fireEvent.click(button)
    expect(send).toHaveBeenCalledTimes(1)
  })

  it.each(["deskPolicy", "constructor", "toString", "__proto__"])("rechecks a custom %s block when the send key is pressed", (field) => {
    let deny = false
    const { run } = mount({
      defaultDraft: draftOf(),
      limits: { custom: () => deny ? [{ field, level: "block", rule: "desk-policy", message: "Desk policy blocks this order." }] : [] },
    })
    expect(screen.getByRole("button", { name: /^Send/ })).not.toHaveAttribute("aria-disabled")
    deny = true
    fireEvent.keyDown(price(), { key: "Enter", ctrlKey: true })
    expect(run).not.toHaveBeenCalled()
  })

  it("asks again past a confirm line, sends on the second click, and withdraws the question when the draft changes", () => {
    const { run } = mount({ limits: LIMITS, reference: REFERENCE })
    type(quantity(), "20")
    type(price(), "99-17")
    const send = screen.getByRole("button", { name: /^Send/ })
    fireEvent.click(send)
    expect(run).not.toHaveBeenCalled()
    expect(send).toHaveTextContent("Send anyway?")
    expect(send).toHaveAttribute("data-confirming", "true")
    expect(document.querySelector("[data-ticket-limits='confirm']")).toHaveTextContent("20 is above 10. Send it anyway?")
    // A change to the draft takes the question back; the next click asks again before it sends.
    type(quantity(), "21")
    expect(send).not.toHaveAttribute("data-confirming")
    expect(document.querySelector("[data-ticket-limits]")).toBeNull()
    fireEvent.click(send)
    expect(run).not.toHaveBeenCalled()
    fireEvent.click(send)
    expect(run).toHaveBeenCalledTimes(1)
    expect(run.mock.calls[0]![0]).toMatchObject({ quantity: 21, price: 99.53125 })
    expect(send).not.toHaveAttribute("data-confirming")
    expect(send).toHaveTextContent("Send")
  })

  it("counts a press once: a double-click's second click and a held Enter's repeats neither answer the question nor run again", () => {
    const { run } = mount({ limits: LIMITS, reference: REFERENCE })
    type(quantity(), "20")
    type(price(), "99-17")
    const send = screen.getByRole("button", { name: /^Send/ })
    fireEvent.click(send, { detail: 1 })
    fireEvent.click(send, { detail: 2 })
    expect(run).not.toHaveBeenCalled()
    expect(send).toHaveTextContent("Send anyway?")
    // The click a held Enter repeats on the focused button does not answer either.
    fireEvent.keyDown(send, { key: "Enter", repeat: true })
    fireEvent.click(send, { detail: 0 })
    expect(run).not.toHaveBeenCalled()
    // A fresh press does.
    fireEvent.keyDown(send, { key: "Enter" })
    fireEvent.click(send, { detail: 0 })
    expect(run).toHaveBeenCalledTimes(1)
    // With nothing to ask, a double-click still runs once.
    type(quantity(), "5")
    fireEvent.click(send, { detail: 1 })
    fireEvent.click(send, { detail: 2 })
    expect(run).toHaveBeenCalledTimes(2)
    // Letting a held Enter go ends the hold: a click with no key behind it runs again.
    fireEvent.keyDown(send, { key: "Enter", repeat: true })
    fireEvent.keyUp(send, { key: "Enter" })
    fireEvent.click(send, { detail: 0 })
    expect(run).toHaveBeenCalledTimes(3)
    // So does focus leaving the button mid-hold.
    fireEvent.keyDown(send, { key: "Enter", repeat: true })
    fireEvent.blur(send)
    fireEvent.click(send, { detail: 0 })
    expect(run).toHaveBeenCalledTimes(4)
  })

  it("holds only the button a held Enter repeats on", () => {
    const send = vi.fn()
    const cancel = vi.fn()
    mount({ actions: [{ id: "send", label: "Send", run: send, primary: true }, { id: "cancel", label: "Cancel", run: cancel, checked: false }], allowedActions: ["send", "cancel"], defaultDraft: draftOf() })
    fireEvent.keyDown(screen.getByRole("button", { name: /^Send/ }), { key: "Enter", repeat: true })
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }), { detail: 0 })
    expect(cancel).toHaveBeenCalledTimes(1)
  })

  it("says the limits' question once, as the press asks it, and not again as the market moves the numbers in it", () => {
    const { rerender } = mount({ limits: { maxDistance: { ticks: 4, level: "confirm" } }, reference: { bid: 99.5, ask: 99.515625 }, defaultDraft: draftOf({ price: 99.625 }) })
    const announcer = document.querySelector<HTMLElement>("[data-ticket-announcer]")!
    expect(announcer).toHaveAttribute("aria-live", "polite")
    expect(announcer).toBeEmptyDOMElement()
    fireEvent.click(screen.getByRole("button", { name: /^Send/ }))
    expect(announcer).toHaveTextContent("The price is 7 ticks from the market, past 4 ticks. Send it anyway?")
    const said = announcer.firstElementChild
    // A tick of market: the line on screen follows it; what was said stays said.
    rerender({ reference: { bid: 99.5, ask: 99.53125 } })
    expect(document.querySelector("[data-ticket-limits='confirm']")).toHaveTextContent("6 ticks")
    expect(announcer.firstElementChild).toBe(said)
    expect(announcer).toHaveTextContent("7 ticks")
  })

  it("says the blocks a press is refused for as it lands, and nothing as they arrive or reword", () => {
    let words = "Desk policy blocks this order."
    let on = false
    const limits = { custom: () => (on ? [{ field: "desk", level: "block" as const, rule: "desk-policy", message: words }] : []) }
    const { rerender } = mount({ limits, defaultDraft: draftOf() })
    const announcer = document.querySelector<HTMLElement>("[data-ticket-announcer]")!
    on = true
    rerender({ limits: { ...limits } })
    expect(document.querySelector("[data-ticket-limits='block']")).toHaveTextContent("Desk policy blocks this order.")
    expect(announcer).toBeEmptyDOMElement()
    fireEvent.keyDown(price(), { key: "Enter", ctrlKey: true })
    expect(announcer).toHaveTextContent("Desk policy blocks this order.")
    const said = announcer.firstElementChild
    words = "Desk policy blocks this order again."
    rerender({ limits: { ...limits } })
    expect(document.querySelector("[data-ticket-limits='block']")).toHaveTextContent("again")
    expect(announcer.firstElementChild).toBe(said)
    expect(announcer).not.toHaveTextContent("again")
    // The block clears: what was said about it goes too, for good. The block coming back waits for the next press.
    on = false
    rerender({ limits: { ...limits } })
    expect(announcer).toBeEmptyDOMElement()
    on = true
    rerender({ limits: { ...limits } })
    expect(announcer).toBeEmptyDOMElement()
    fireEvent.keyDown(price(), { key: "Enter", ctrlKey: true })
    expect(announcer).toHaveTextContent("Desk policy blocks this order again.")
  })

  it("keeps a held action in reach: focus stays on it as a block arrives, and a press on it says why", () => {
    const { run, rerender } = mount({ defaultDraft: draftOf() })
    const announcer = document.querySelector<HTMLElement>("[data-ticket-announcer]")!
    const send = screen.getByRole("button", { name: /^Send/ })
    send.focus()
    rerender({ limits: { sides: ["sell"] } })
    expect(send).toHaveAttribute("aria-disabled", "true")
    expect(document.activeElement).toBe(send)
    // A block the trader's own change brings is shown, and said when a press meets it.
    rerender({ limits: { sides: ["buy"] } })
    fireEvent.click(screen.getByRole("button", { name: "Sell" }))
    expect(document.querySelector("[data-ticket-limits='block']")).toHaveTextContent("The book does not take a sell.")
    expect(announcer).toBeEmptyDOMElement()
    fireEvent.click(send)
    expect(run).not.toHaveBeenCalled()
    expect(announcer).toHaveTextContent("The book does not take a sell.")
  })

  it("says, asks, and lets go the same under StrictMode, and says nothing at mount", () => {
    const run = vi.fn()
    const registry = createHotkeyRegistry({ platform: "other" })
    const ui = (allowed: string[]) => (
      <StrictMode>
        <HotkeysProvider registry={registry}>
          <Ticket instrument={ZN} reference={{ bid: 99.5, ask: 99.515625 }} limits={{ maxQuantity: { confirm: 10 }, maxDistance: { ticks: 4 } }} defaultDraft={draftOf({ quantity: 20, price: 99.625 })} actions={[{ id: "send", label: "Send", run, primary: true }]} allowedActions={allowed} />
        </HotkeysProvider>
      </StrictMode>
    )
    const view = render(ui(["send"]))
    const announcer = document.querySelector<HTMLElement>("[data-ticket-announcer]")!
    // A block present at mount is shown, and nothing is said until a press meets it.
    expect(screen.getByText("The price is 7 ticks from the market; the limit is 4 ticks.", { selector: "[data-slot='field-error']" })).toHaveAttribute("role", "none")
    expect(announcer).toBeEmptyDOMElement()
    fireEvent.click(screen.getByRole("button", { name: /^Send/ }))
    expect(announcer).toHaveTextContent("The price is 7 ticks from the market; the limit is 4 ticks.")
    type(price(), "99-16+")
    expect(announcer).toBeEmptyDOMElement()
    fireEvent.click(screen.getByRole("button", { name: /^Send/ }))
    expect(announcer).toHaveTextContent("20 is above 10. Send it anyway?")
    // Taken away and given back: the question goes, and the action asks again.
    view.rerender(ui([]))
    expect(announcer).toBeEmptyDOMElement()
    view.rerender(ui(["send"]))
    fireEvent.click(screen.getByRole("button", { name: /^Send/ }))
    expect(run).not.toHaveBeenCalled()
    expect(announcer).toHaveTextContent("20 is above 10. Send it anyway?")
    fireEvent.click(screen.getByRole("button", { name: /^Send/ }))
    expect(run).toHaveBeenCalledTimes(1)
  })

  it("lets what a press was refused for go once any block it named stops blocking", () => {
    const { rerender } = mount({ limits: { maxQuantity: { block: 10 }, maxDistance: { ticks: 4 } }, reference: { bid: 99.5, ask: 99.515625 }, defaultDraft: draftOf({ quantity: 20, price: 99.625 }) })
    const announcer = document.querySelector<HTMLElement>("[data-ticket-announcer]")!
    fireEvent.keyDown(price(), { key: "Enter", ctrlKey: true })
    expect(announcer).toHaveTextContent("20 is above the size limit of 10.")
    expect(announcer).toHaveTextContent("The price is 7 ticks from the market; the limit is 4 ticks.")
    // The market comes to the price: the quantity still blocks, but what was said is no longer true, so it goes.
    rerender({ reference: { bid: 99.5, ask: 99.59375 } })
    expect(screen.getByText("20 is above the size limit of 10.", { selector: "[data-slot='field-error']" })).toBeInTheDocument()
    expect(announcer).toBeEmptyDOMElement()
  })

  it("says a price block only when a press meets it, with the words the price has then, and shows it without an alert or a description", () => {
    const { rerender } = mount({ limits: { maxDistance: { ticks: 4 } }, reference: { bid: 99.5, ask: 99.515625 }, defaultDraft: draftOf() })
    const announcer = document.querySelector<HTMLElement>("[data-ticket-announcer]")!
    const shown = () => screen.getByText(/ticks from the market/, { selector: "[data-slot='field-error']" })
    // Typed a key at a time: every half-typed price is far from the market, and none of it is said.
    for (const text of ["9", "99", "99-", "99-2", "99-20"]) type(price(), text)
    expect(announcer).toBeEmptyDOMElement()
    expect(shown()).toHaveTextContent("7 ticks")
    expect(shown()).toHaveAttribute("role", "none")
    expect(price()).not.toHaveAttribute("aria-describedby")
    fireEvent.keyDown(price(), { key: "Enter", ctrlKey: true })
    expect(announcer).toHaveTextContent("The price is 7 ticks from the market; the limit is 4 ticks.")
    const said = announcer.firstElementChild
    rerender({ reference: { bid: 99.5, ask: 99.53125 } })
    expect(shown()).toHaveTextContent("6 ticks")
    expect(announcer.firstElementChild).toBe(said)
    // The refused press stored nothing: the field shows the live block, still without an alert or a description.
    expect(shown()).toHaveAttribute("role", "none")
    expect(price()).not.toHaveAttribute("aria-describedby")
    // A change to the draft lets what was said go.
    type(price(), "99-21")
    expect(announcer).toBeEmptyDOMElement()
    // A press's own problem with a field is an alert tied to it: its words change only when the trader acts.
    rerender({ limits: undefined })
    type(price(), "")
    type(quantity(), "")
    fireEvent.click(screen.getByRole("button", { name: /^Send/ }))
    const own = screen.getByText("This order type needs a price.")
    expect(own).toHaveAttribute("role", "alert")
    expect(price()).toHaveAttribute("aria-describedby", own.id)
    const ownQuantity = document.getElementById(quantity().getAttribute("aria-describedby")!)!
    expect(ownQuantity).toHaveAttribute("role", "alert")
    expect(ownQuantity).toHaveAttribute("data-slot", "field-error")
  })

  it("asks again when the market adds a reason to a standing question, and lets what it said go once the question goes", () => {
    const { run, rerender } = mount({ limits: { maxQuantity: { confirm: 10 }, maxDistance: { ticks: 4, level: "confirm" } }, reference: { bid: 99.5, ask: 99.6875 }, defaultDraft: draftOf({ quantity: 20, price: 99.625 }) })
    const announcer = document.querySelector<HTMLElement>("[data-ticket-announcer]")!
    const send = screen.getByRole("button", { name: /^Send/ })
    fireEvent.click(send)
    expect(announcer).toHaveTextContent("20 is above 10. Send it anyway?")
    expect(announcer).not.toHaveTextContent("ticks")
    // The market moves away: a distance confirm joins the question. Nothing is said as it moves.
    rerender({ reference: { bid: 99.5, ask: 99.515625 } })
    expect(announcer).not.toHaveTextContent("ticks")
    // The next press asks again, with every reason, rather than send.
    fireEvent.click(send)
    expect(run).not.toHaveBeenCalled()
    expect(announcer).toHaveTextContent("7 ticks from the market")
    // Answered: nothing of the question stays said.
    fireEvent.click(send)
    expect(run).toHaveBeenCalledTimes(1)
    expect(announcer).toBeEmptyDOMElement()
  })

  it("says the question again for every press that asks it, a second action's included", () => {
    const send = vi.fn()
    const amend = vi.fn()
    mount({ limits: { maxQuantity: { confirm: 10 } }, actions: [{ id: "send", label: "Send", run: send, primary: true }, { id: "amend", label: "Amend", run: amend }], allowedActions: ["send", "amend"], defaultDraft: draftOf({ quantity: 20 }) })
    const announcer = document.querySelector<HTMLElement>("[data-ticket-announcer]")!
    fireEvent.click(screen.getByRole("button", { name: /^Amend/ }))
    const first = announcer.firstElementChild
    expect(announcer).toHaveTextContent("20 is above 10. Send it anyway?")
    fireEvent.keyDown(price(), { key: "Enter", ctrlKey: true })
    expect(send).not.toHaveBeenCalled()
    expect(announcer.firstElementChild).not.toBe(first)
    expect(announcer).toHaveTextContent("20 is above 10. Send it anyway?")
    fireEvent.keyDown(price(), { key: "Enter", ctrlKey: true })
    expect(send).toHaveBeenCalledTimes(1)
  })

  it("withdraws a question whose action the server takes away, so it asks again when the action comes back", () => {
    const { run, rerender } = mount({ limits: LIMITS, reference: REFERENCE, defaultDraft: draftOf({ quantity: 20 }) })
    fireEvent.click(screen.getByRole("button", { name: /^Send/ }))
    expect(screen.getByRole("button", { name: /^Send/ })).toHaveTextContent("Send anyway?")
    rerender({ allowedActions: [] })
    rerender({ allowedActions: ["send"] })
    const send = screen.getByRole("button", { name: /^Send/ })
    expect(send).not.toHaveTextContent("anyway")
    fireEvent.click(send)
    expect(run).not.toHaveBeenCalled()
    expect(send).toHaveTextContent("Send anyway?")
  })

  it("blocks under the field and holds the actions that send the draft, live and as the click lands, while an unchecked action still runs", () => {
    const send = vi.fn()
    const cancel = vi.fn()
    const { rerender } = mount({
      limits: LIMITS,
      reference: REFERENCE,
      actions: [
        { id: "send", label: "Send", run: send, primary: true },
        { id: "cancel", label: "Cancel", run: cancel, checked: false },
      ],
      allowedActions: ["send", "cancel"],
    })
    type(quantity(), "60")
    type(price(), "99-17")
    // A limit's block on the quantity is shown live, without an alert or a description, like the price's.
    expect(screen.getByText("60 is above the size limit of 50.")).toHaveAttribute("role", "none")
    expect(quantity()).not.toHaveAttribute("aria-describedby")
    expect(quantity()).toHaveAttribute("aria-invalid", "true")
    const sendButton = screen.getByRole("button", { name: /^Send/ })
    const cancelButton = screen.getByRole("button", { name: "Cancel" })
    expect(sendButton).toHaveAttribute("aria-disabled", "true")
    expect(cancelButton).not.toHaveAttribute("aria-disabled")
    fireEvent.click(cancelButton)
    expect(cancel).toHaveBeenCalledTimes(1)
    type(quantity(), "5")
    expect(sendButton).not.toHaveAttribute("aria-disabled")
    expect(quantity()).not.toHaveAttribute("aria-invalid", "true")
    // A buyer's price seven ticks over the offer is past the four-tick line: said under the price, and the send holds.
    type(price(), "99-20")
    const shown = screen.getByText("The price is 7 ticks from the market; the limit is 4 ticks.", { selector: "[data-slot='field-error']" })
    // The market can reword it, so the field shows it without an alert or a description, and a press says it.
    expect(shown).toHaveAttribute("role", "none")
    expect(price()).not.toHaveAttribute("aria-describedby")
    expect(sendButton).toHaveAttribute("aria-disabled", "true")
    type(price(), "99-17")
    expect(sendButton).not.toHaveAttribute("aria-disabled")
    // A side the book does not take has no field of its own; it is said on the limits line.
    rerender({ limits: { ...LIMITS, sides: ["sell"] } })
    expect(document.querySelector("[data-ticket-limits='block']")).toHaveTextContent("The book does not take a buy.")
    expect(sendButton).toHaveAttribute("aria-disabled", "true")
    fireEvent.click(sendButton)
    expect(send).not.toHaveBeenCalled()
    expect(document.querySelector("[data-ticket-announcer]")).toHaveTextContent("The book does not take a buy.")
  })

  it("does nothing different without limits", () => {
    const { run } = mount({ reference: REFERENCE })
    type(quantity(), "60")
    type(price(), "99-20")
    fireEvent.click(screen.getByRole("button", { name: /^Send/ }))
    expect(run).toHaveBeenCalledTimes(1)
    expect(document.querySelector("[data-ticket-limits]")).toBeNull()
  })
})

describe("quick sizes", () => {
  it("puts a size in the quantity from a press or a key, printed in the convention's unit, and marks the one in force", () => {
    const { onDraftChange } = mount({ quickSizes: [1, 5, 10] })
    const row = screen.getByRole("group", { name: "Quick sizes" })
    expect(within(row).getAllByRole("button").map((b) => b.textContent)).toEqual(["1", "5", "10"])
    fireEvent.click(within(row).getByRole("button", { name: "Quantity 5" }))
    expect(quantity()).toHaveValue("5")
    expect(lastDraft(onDraftChange).quantity).toBe(5)
    expect(within(row).getByRole("button", { name: "Quantity 5" })).toHaveAttribute("aria-pressed", "true")
    expect(within(row).getByRole("button", { name: "Quantity 1" })).toHaveAttribute("aria-pressed", "false")
    // mod+3 from inside the price field.
    fireEvent.keyDown(price(), { key: "3", ctrlKey: true })
    expect(quantity()).toHaveValue("10")
    expect(lastDraft(onDraftChange).quantity).toBe(10)
    // A key for a size that is not there does nothing.
    fireEvent.keyDown(price(), { key: "4", ctrlKey: true })
    expect(lastDraft(onDraftChange).quantity).toBe(10)
    // Typing another quantity takes the mark off.
    type(quantity(), "7")
    expect(within(row).getByRole("button", { name: "Quantity 10" })).toHaveAttribute("aria-pressed", "false")
    expect(TICKET_BINDINGS.filter((b) => b.id.startsWith("ticket.size-")).map((b) => b.keys)).toEqual(["mod+1", "mod+2", "mod+3", "mod+4", "mod+5", "mod+6", "mod+7", "mod+8", "mod+9"])
  })

  it("prints millions when the convention quotes notional, and draws no row without quickSizes", () => {
    const notional: TicketInstrument = { symbol: "T10", convention: { ...ZN.convention, quantityUnit: "notional" } }
    const { view } = mount({ instrument: notional, quickSizes: [1_000_000, 5_000_000] })
    const row = screen.getByRole("group", { name: "Quick sizes" })
    expect(within(row).getAllByRole("button").map((b) => b.textContent)).toEqual(["1mm", "5mm"])
    expect(formatQuickSize(2_500_000, notional.convention)).toBe("2.5mm")
    expect(formatQuickSize(250, ZN.convention)).toBe("250")
    view.unmount()
    mount()
    expect(screen.queryByRole("group", { name: "Quick sizes" })).toBeNull()
  })
})
