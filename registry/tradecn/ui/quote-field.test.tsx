import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { InstrumentConvention } from "@/registry/tradecn/lib/format"
import { QuoteField, type QuoteFieldProps } from "@/registry/tradecn/ui/quote-field"

const NOTE: InstrumentConvention = { price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 }
const BILL: InstrumentConvention = { price: { kind: "decimal", decimals: 3 }, tick: 0.0005, quoteBasis: "discount" }
const CREDIT: InstrumentConvention = { price: { kind: "decimal", decimals: 3 }, tick: 0.001, quoteBasis: "spread" }

// A parent that keeps the value, as a ticket would.
function mount(props: Partial<QuoteFieldProps> = {}) {
  const changes = vi.fn()
  let value: number | null = props.value ?? null
  const view = render(<QuoteField convention={NOTE} onValueChange={changes} {...props} value={value} />)
  const set = (next: number | null, extra: Partial<QuoteFieldProps> = {}) => {
    value = next
    view.rerender(<QuoteField convention={NOTE} onValueChange={changes} {...props} {...extra} value={next} />)
  }
  return { changes, set, view }
}
const input = (name = "Price") => screen.getByLabelText(name) as HTMLInputElement
const type = (el: HTMLInputElement, text: string) => fireEvent.change(el, { target: { value: text } })
const last = (fn: ReturnType<typeof vi.fn>) => fn.mock.calls.at(-1)?.[0]

describe("QuoteField", () => {
  it("is labeled by its basis, carries the slot, and offers zero in the notation as a hint", () => {
    render(<QuoteField convention={NOTE} value={null} onValueChange={() => {}} />)
    const root = document.querySelector<HTMLElement>('[data-slot="tradecn-quote-field"]')!
    expect(root.dataset.basis).toBe("price")
    expect(input().placeholder).toBe("0-00")
    render(<QuoteField convention={BILL} value={null} onValueChange={() => {}} side="bid" />)
    expect(input("Discount").placeholder).toBe("0.000")
    expect(document.querySelector('[data-basis="discount"]')?.getAttribute("data-side")).toBe("bid")
    render(<QuoteField convention={CREDIT} value={null} onValueChange={() => {}} label="Offer spread" />)
    expect(input("Offer spread")).toBeInTheDocument()
  })

  it("reads what is typed on every keystroke, prints it back in the notation on blur, and marks what is not a quote", () => {
    const { changes, set } = mount()
    type(input(), "99-16+")
    expect(last(changes)).toBe(99.515625)
    set(99.515625)
    expect(input().value).toBe("99-16+")
    type(input(), "99.75")
    expect(last(changes)).toBe(99.75)
    set(99.75)
    expect(input().value).toBe("99.75")
    fireEvent.blur(input())
    expect(input().value).toBe("99-24")
    type(input(), "abc")
    expect(last(changes)).toBeNull()
    set(null)
    expect(input()).not.toHaveAttribute("aria-invalid")
    fireEvent.blur(input())
    expect(input()).toHaveAttribute("aria-invalid", "true")
    expect(screen.getByText("Not a price in this instrument's notation.")).toBeInTheDocument()
    type(input(), "99-1")
    expect(input()).not.toHaveAttribute("aria-invalid")
    type(input(), "")
    fireEvent.blur(input())
    expect(input()).not.toHaveAttribute("aria-invalid")
  })

  it("names the basis in its own words when the text is not a quote, or says what it is told to", () => {
    render(<QuoteField convention={BILL} value={null} onValueChange={() => {}} />)
    type(input("Discount"), "4-16")
    fireEvent.blur(input("Discount"))
    expect(screen.getByText("Not a discount in this instrument's notation.")).toBeInTheDocument()
    render(<QuoteField convention={CREDIT} value={null} onValueChange={() => {}} invalidText="Spreads are decimals." />)
    type(input("Spread"), "x")
    fireEvent.blur(input("Spread"))
    expect(screen.getByText("Spreads are decimals.")).toBeInTheDocument()
  })

  it("steps by the instrument's step with the arrows and the buttons, ten with Shift, and leaves modified arrows alone", () => {
    const { changes, set } = mount({ value: 99.5 })
    fireEvent.keyDown(input(), { key: "ArrowUp" })
    expect(last(changes)).toBe(99.515625)
    expect(input().value).toBe("99-16+")
    set(99.515625)
    fireEvent.keyDown(input(), { key: "ArrowDown", shiftKey: true })
    expect(last(changes)).toBe(99.359375)
    expect(input().value).toBe("99-11+")
    set(99.359375)
    fireEvent.click(screen.getByRole("button", { name: "Price up one tick" }))
    expect(input().value).toBe("99-12")
    set(99.375)
    fireEvent.click(screen.getByRole("button", { name: "Price down one tick" }))
    expect(input().value).toBe("99-11+")
    set(99.359375)
    const before = changes.mock.calls.length
    const held = fireEvent.keyDown(input(), { key: "ArrowUp", ctrlKey: true })
    expect(held).toBe(true)
    fireEvent.keyDown(input(), { key: "ArrowUp", metaKey: true })
    fireEvent.keyDown(input(), { key: "ArrowUp", altKey: true })
    expect(changes.mock.calls.length).toBe(before)
    expect(input().value).toBe("99-11+")
  })

  it("steps a blank field from stepFrom, and from nothing not at all", () => {
    const { changes, set } = mount({ stepFrom: 100 })
    fireEvent.keyDown(input(), { key: "ArrowDown" })
    expect(last(changes)).toBe(99.984375)
    expect(input().value).toBe("99-31+")
    set(null, { stepFrom: null })
    type(input(), "")
    const before = changes.mock.calls.length
    fireEvent.keyDown(input(), { key: "ArrowUp" })
    expect(changes.mock.calls.length).toBe(before)
    expect(input().value).toBe("")
  })

  it("follows a value the parent moves, and leaves the text alone while it already reads as the value", () => {
    const { set } = mount({ value: 99.5 })
    expect(input().value).toBe("99-16")
    set(99.53125)
    expect(input().value).toBe("99-17")
    type(input(), "99-2")
    set(99.0625)
    expect(input().value).toBe("99-2")
    set(null)
    expect(input().value).toBe("")
    type(input(), "abc")
    fireEvent.blur(input())
    expect(input()).toHaveAttribute("aria-invalid", "true")
    set(99.5)
    expect(input().value).toBe("99-16")
    expect(input()).not.toHaveAttribute("aria-invalid")
  })

  it("steps in another basis, by that basis's step", () => {
    const changes = vi.fn()
    render(<QuoteField convention={BILL} value={4.253} onValueChange={changes} />)
    fireEvent.keyDown(input("Discount"), { key: "ArrowUp" })
    expect(last(changes)).toBe(4.254)
    expect(input("Discount").value).toBe("4.254")
    const spread = vi.fn()
    render(<QuoteField convention={{ ...CREDIT, quoteStep: 0.25 }} value={12.5} onValueChange={spread} />)
    fireEvent.keyDown(input("Spread"), { key: "ArrowDown", shiftKey: true })
    expect(last(spread)).toBe(10)
  })

  it("prints the parent's problem under the field over its own, and is disabled as a whole", () => {
    mount({ error: "This order type needs a price.", disabled: true })
    expect(screen.getByText("This order type needs a price.")).toBeInTheDocument()
    expect(input()).toHaveAttribute("aria-invalid", "true")
    expect(input()).toBeDisabled()
    expect(screen.getByRole("button", { name: "Price up one tick" })).toBeDisabled()
  })
})
