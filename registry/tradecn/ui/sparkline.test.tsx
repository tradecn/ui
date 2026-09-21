import { act, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { resetSizeObserver } from "@/registry/tradecn/lib/sparkline-geometry"
import { Sparkline } from "@/registry/tradecn/ui/sparkline"

afterEach(() => {
  resetSizeObserver()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const fixed = { width: 104, height: 24 }
const slot = () => document.querySelector<HTMLElement>("[data-slot='tradecn-sparkline']")!

describe("Sparkline", () => {
  it("is an image that says in words what the line shows", () => {
    render(<Sparkline values={[100, 99, 101.5]} label="ZN, last 30 minutes" {...fixed} />)
    const chart = screen.getByRole("img", { name: "ZN, last 30 minutes: up, last 101.5, low 99, high 101.5" })
    expect(chart).toHaveAttribute("data-slot", "tradecn-sparkline")
    expect(chart).not.toHaveAttribute("tabindex")
    expect(chart.querySelector("svg")).toHaveAttribute("aria-hidden", "true")
    expect(chart.style.width).toBe("104px")
  })

  it("colors by the last reading against the first, and zero is flat", () => {
    const view = render(<Sparkline values={[1, 5, 2]} label="s" {...fixed} />)
    const stroke = () => slot().querySelector("path:last-of-type")!.getAttribute("class")
    expect(slot()).toHaveAttribute("data-direction", "up")
    expect(stroke()).toContain("stroke-up")
    view.rerender(<Sparkline values={[3, 5, 2]} label="s" {...fixed} />)
    expect(slot()).toHaveAttribute("data-direction", "down")
    expect(stroke()).toContain("stroke-down")
    view.rerender(<Sparkline values={[2, 5, 2]} label="s" {...fixed} />)
    expect(slot()).toHaveAttribute("data-direction", "flat")
    expect(stroke()).toContain("stroke-flat")
  })

  it("compares against a baseline when there is one, and draws it", () => {
    render(<Sparkline values={[1, 5, 2]} baseline={4} label="s" {...fixed} />)
    expect(slot()).toHaveAttribute("data-direction", "down")
    expect(slot().querySelector("line")).toHaveAttribute("stroke-dasharray", "2 2")
  })

  it("takes a direction you already know, or none", () => {
    const view = render(<Sparkline values={[1, 2]} direction="down" label="s" {...fixed} />)
    expect(slot()).toHaveAttribute("data-direction", "down")
    view.rerender(<Sparkline values={[1, 2]} direction="none" label="s" {...fixed} />)
    expect(slot()).toHaveAttribute("data-direction", "none")
    expect(screen.getByRole("img")).toHaveAccessibleName("s: last 2, low 1, high 2")
  })

  it("formats through your formatter", () => {
    // 99.5 is 99 and 16/32; 99.53125 is 99 and 17/32. Both land exactly on a 32nd.
    render(<Sparkline values={[99.5, 99.53125]} format={(v) => `${Math.floor(v)}-${String(Math.round((v % 1) * 32)).padStart(2, "0")}`} label="ZN" {...fixed} />)
    expect(screen.getByRole("img")).toHaveAccessibleName("ZN: up, last 99-17, low 99-16, high 99-17")
  })

  it("says so when there is nothing to draw", () => {
    render(<Sparkline values={[null, Number.NaN]} label="ZN" interactive {...fixed} />)
    const chart = screen.getByRole("img", { name: "ZN: no data" })
    expect(chart).toHaveAttribute("data-empty")
    expect(chart.querySelector("path")?.getAttribute("d") ?? "").toBe("")
  })

  it("leaves the area out when asked", () => {
    const view = render(<Sparkline values={[1, 2, 3]} label="s" {...fixed} />)
    expect(slot().querySelectorAll("path")).toHaveLength(2)
    view.rerender(<Sparkline values={[1, 2, 3]} label="s" area={false} {...fixed} />)
    expect(slot().querySelectorAll("path")).toHaveLength(1)
  })

  it("observes nothing at a fixed size, and shares one observer otherwise", () => {
    const made: { cb: ResizeObserverCallback; observe: ReturnType<typeof vi.fn>; unobserve: ReturnType<typeof vi.fn> }[] = []
    class FakeObserver {
      observe = vi.fn()
      unobserve = vi.fn()
      disconnect = vi.fn()
      cb: ResizeObserverCallback
      constructor(cb: ResizeObserverCallback) {
        this.cb = cb
        made.push(this)
      }
    }
    vi.stubGlobal("ResizeObserver", FakeObserver)
    const view = render(
      <>
        <Sparkline values={[1, 2]} label="fixed" {...fixed} />
        <Sparkline values={[1, 2]} label="a" />
        <Sparkline values={[2, 1]} label="b" />
      </>,
    )
    expect(made).toHaveLength(1)
    expect(made[0]!.observe).toHaveBeenCalledTimes(2)
    const a = screen.getByRole("img", { name: /^a:/ })
    expect(a.querySelector("svg")).toBeNull()
    act(() => made[0]!.cb([{ target: a, contentRect: { width: 200, height: 40 } } as unknown as ResizeObserverEntry], made[0] as unknown as ResizeObserver))
    expect(a.querySelector("svg")).toHaveAttribute("viewBox", "0 0 200 40")
    expect(screen.getByRole("img", { name: /^b:/ }).querySelector("svg")).toBeNull()
    view.unmount()
    expect(made[0]!.unobserve).toHaveBeenCalledTimes(2)
  })
})

describe("the crosshair", () => {
  const values = [10, 12, null, 11, 15]
  const times = (i: number) => `10:0${i}`

  it("is a slider only when asked for, and starts at the last reading on focus", async () => {
    const user = userEvent.setup()
    render(<Sparkline values={values} label="ZN" interactive pointLabel={times} {...fixed} />)
    const chart = screen.getByRole("slider", { name: "ZN" })
    expect(chart).toHaveAttribute("aria-valuemax", "3")
    expect(chart).toHaveAttribute("aria-valuetext", "ZN: up, last 15, low 10, high 15")
    expect(document.querySelector("[data-sparkline-readout]")).toBeNull()
    await user.tab()
    expect(chart).toHaveFocus()
    expect(chart).toHaveAttribute("aria-valuenow", "3")
    expect(chart).toHaveAttribute("aria-valuetext", "10:04 15")
    expect(document.querySelector("[data-sparkline-readout]")).toHaveTextContent("10:04 15")
    expect(chart.querySelector("circle")).not.toBeNull()
  })

  it("walks the readings with the keyboard, over the gap, and stops at the ends", async () => {
    const user = userEvent.setup()
    render(<Sparkline values={values} label="ZN" interactive pointLabel={times} {...fixed} />)
    const chart = screen.getByRole("slider")
    await user.tab()
    await user.keyboard("{ArrowLeft}")
    expect(chart).toHaveAttribute("aria-valuetext", "10:03 11")
    await user.keyboard("{ArrowLeft}")
    expect(chart).toHaveAttribute("aria-valuetext", "10:01 12")
    await user.keyboard("{Home}{ArrowLeft}")
    expect(chart).toHaveAttribute("aria-valuetext", "10:00 10")
    await user.keyboard("{End}{ArrowRight}")
    expect(chart).toHaveAttribute("aria-valuetext", "10:04 15")
    await user.keyboard("{PageDown}")
    expect(chart).toHaveAttribute("aria-valuenow", "0")
    await user.keyboard("{PageUp}")
    expect(chart).toHaveAttribute("aria-valuenow", "3")
  })

  it("puts the crosshair away on Escape and on blur", async () => {
    const user = userEvent.setup()
    render(
      <>
        <Sparkline values={values} label="ZN" interactive {...fixed} />
        <button>elsewhere</button>
      </>,
    )
    await user.tab()
    await user.keyboard("{Escape}")
    expect(document.querySelector("[data-sparkline-readout]")).toBeNull()
    await user.keyboard("{ArrowLeft}")
    expect(document.querySelector("[data-sparkline-readout]")).toHaveTextContent("11")
    await user.tab()
    expect(document.querySelector("[data-sparkline-readout]")).toBeNull()
  })

  it("claims the keys it uses and leaves the rest alone", () => {
    const outer = vi.fn((event: React.KeyboardEvent) => event.defaultPrevented)
    render(
      <div onKeyDown={outer}>
        <Sparkline values={values} label="ZN" interactive {...fixed} />
      </div>,
    )
    const chart = screen.getByRole("slider")
    fireEvent.keyDown(chart, { key: "ArrowLeft" })
    fireEvent.keyDown(chart, { key: "x" })
    expect(outer.mock.results.map((r) => r.value)).toEqual([true, false])
  })

  it("follows the pointer to the nearest reading, and lets go when it leaves", () => {
    render(<Sparkline values={values} label="ZN" interactive {...fixed} />)
    const chart = screen.getByRole("slider")
    vi.spyOn(chart, "getBoundingClientRect").mockReturnValue({ left: 100, top: 0, width: 208, height: 48, right: 308, bottom: 48, x: 100, y: 0, toJSON: () => ({}) })
    // The box is drawn at twice its geometry, so 100 + 2 * 27 is x = 27: nearest the reading at x = 27.
    fireEvent.pointerMove(chart, { clientX: 154 })
    expect(chart).toHaveAttribute("aria-valuetext", "12")
    fireEvent.pointerMove(chart, { clientX: 9999 })
    expect(chart).toHaveAttribute("aria-valuetext", "15")
    fireEvent.pointerLeave(chart)
    expect(document.querySelector("[data-sparkline-readout]")).toBeNull()
  })

  it("keeps a crosshair parked at the end on the series when it gets shorter", async () => {
    const user = userEvent.setup()
    const view = render(<Sparkline values={[1, 2, 3, 4]} label="s" interactive {...fixed} />)
    await user.tab()
    view.rerender(<Sparkline values={[1, 2]} label="s" interactive {...fixed} />)
    expect(screen.getByRole("slider")).toHaveAttribute("aria-valuetext", "2")
  })

  it("still calls your own handlers", async () => {
    const user = userEvent.setup()
    const onKeyDown = vi.fn()
    const onFocus = vi.fn()
    render(<Sparkline values={values} label="ZN" interactive onKeyDown={onKeyDown} onFocus={onFocus} {...fixed} />)
    await user.tab()
    await user.keyboard("{ArrowLeft}")
    expect(onFocus).toHaveBeenCalledTimes(1)
    expect(onKeyDown).toHaveBeenCalledTimes(1)
  })
})
