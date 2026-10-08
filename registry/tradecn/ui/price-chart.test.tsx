import { act, fireEvent, render, screen } from "@testing-library/react"
import { createRef, StrictMode, useEffect, useLayoutEffect } from "react"
import { createPortal } from "react-dom"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { InstrumentConvention } from "@/registry/tradecn/lib/format"
import { barId, foldTicks, type Bar } from "@/registry/tradecn/lib/price-series"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import { CHART_TOKEN_CLASS, usePriceChart, PriceChart, PriceChartLegend, PriceChartOverlaySwatch, PriceChartHeader, PriceChartLast, PriceChartChange, PriceChartReadout, PriceChartPlot, PriceChartEmpty } from "@/registry/tradecn/ui/price-chart"

// happy-dom has no 2D canvas context, so nothing is drawn here: these tests cover what the chart says and
// does around the picture, the readout, the keys, the accessible name, the subscription. The picture, the
// tokens reaching the canvas, and the pointer crosshair are the browser matrix's.

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

// Behavior-preserving capture of every plot built, so a test can watch one instance's methods.
const plots = vi.hoisted(() => [] as { redraw: (rebuildPaths?: boolean, recalcAxes?: boolean) => void }[])
vi.mock("uplot", async (importOriginal) => {
  const mod = await importOriginal<{ default: typeof import("uplot") }>()
  const Real = mod.default
  const Captured = function (this: unknown, ...args: ConstructorParameters<typeof Real>) {
    const u = new Real(...args)
    plots.push(u)
    return u
  }
  Captured.prototype = Real.prototype
  Object.assign(Captured, Real)
  return { ...mod, default: Captured as unknown as typeof Real }
})

const ZN: InstrumentConvention = { price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 }
const MINUTE = 60_000
const T0 = Date.UTC(2026, 0, 15, 14, 30)

const bar = (i: number, open: number, close: number, spread = 1 / 32): Bar => ({ time: T0 + i * MINUTE, open, high: Math.max(open, close) + spread, low: Math.min(open, close) - spread, close, volume: 10 * (i + 1) })

function seeded() {
  const store = createRowStore<Bar>({ getRowId: (b) => barId(b.time), lane: "ordered" })
  store.applyDeltas({ upsert: [bar(0, 110.5, 110.53125), bar(1, 110.53125, 110.5), bar(2, 110.5, 110.5625)] })
  return store
}

const root = () => document.querySelector<HTMLElement>("[data-slot='tradecn-price-chart']")!
const text = (selector: string) => root().querySelector(selector)?.textContent ?? ""

// The plot mounts only with a measured box and a drawable canvas, so these supply both: a ResizeObserver
// that reports once, a 2D context of recording no-ops, and a sized box.
function stubDrawing() {
  const bag: Record<string | symbol, unknown> = {}
  const ctxStub = new Proxy(bag, {
    get(target, key) {
      if (key === "measureText") return () => ({ width: 10 })
      if (key === "createLinearGradient" || key === "createRadialGradient" || key === "createPattern") return () => ({ addColorStop() {} })
      if (!(key in target)) target[key] = vi.fn()
      return target[key]
    },
    set(target, key, value) {
      target[key] = value
      return true
    },
  })
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctxStub as never)
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 600, height: 300, top: 0, left: 0, right: 600, bottom: 300, x: 0, y: 0, toJSON: () => ({}) } as DOMRect)
  vi.stubGlobal("Path2D", class {
    addPath() {}
    moveTo() {}
    lineTo() {}
    rect() {}
    arc() {}
    closePath() {}
  })
  vi.stubGlobal("ResizeObserver", class {
    callback: ResizeObserverCallback
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback
    }
    observe(target: Element) {
      this.callback([{ target, contentRect: { width: 600, height: 300 } } as ResizeObserverEntry], this as unknown as ResizeObserver)
    }
    unobserve() {}
    disconnect() {}
  })
}

describe("PriceChart", () => {
  it("names itself, prints the last close with its change and sign, and carries the direction as data", () => {
    render(<PriceChart store={seeded()} convention={ZN} label="ZN, today" zone="America/New_York"><PriceChartHeader><PriceChartLast /><PriceChartChange /><PriceChartReadout /></PriceChartHeader><PriceChartPlot><PriceChartEmpty /></PriceChartPlot></PriceChart>)
    expect(screen.getByRole("group", { name: "ZN, today" })).toBe(root())
    expect(root()).toHaveAttribute("data-kind", "line")
    expect(root()).toHaveAttribute("data-direction", "up")
    expect(root()).not.toHaveAttribute("data-empty")
    expect(text("[data-chart-last]")).toBe("110-18")
    // Against the first bar's open, 110-16: two 32nds up.
    expect(text("[data-chart-change]")).toBe("+0-02 (+0.06%)")
    expect(root().querySelector("[data-chart-last]")!.className).toContain("text-up")
    expect(root().querySelector("[data-chart-header]")!.className).toContain("tabular-nums")
  })

  it("prints its readings in the price notation's font, survives a malformed locale, and drops a non-finite volume", () => {
    // The readings print convention.price whatever the quote basis, so the font follows the
    // notation: a fraction price on a yield-quoted instrument stays monospace.
    const onYield: InstrumentConvention = { ...ZN, quoteBasis: "yield" }
    const store = seeded()
    render(<PriceChart store={store} convention={onYield} label="Yield note" locale="en_US"><PriceChartHeader><PriceChartLast /><PriceChartChange /><PriceChartReadout /></PriceChartHeader><PriceChartPlot><PriceChartEmpty /></PriceChartPlot></PriceChart>)
    expect(document.querySelector("[data-chart-last]")!.className).toContain("--tradecn-font-mono")
    expect(document.querySelector("[data-chart-change]")!.className).toContain("--tradecn-font-mono")
    expect(document.querySelector("[data-chart-readout]")!.className).toContain("--tradecn-font-mono")
    // A malformed locale tag must not throw during render: the formatter drops it and renders.
    expect(screen.getByRole("group", { name: "Yield note" })).toBeInTheDocument()
    // A non-finite volume reads as absent: focusing the plot puts the cursor on the last bar,
    // whose NaN volume must not print as a dash.
    act(() => store.applyDeltas({ upsert: [{ ...bar(2, 110.5, 110.5625), volume: Number.NaN }] }))
    act(() => screen.getByRole("slider").focus())
    const readout = document.querySelector("[data-chart-readout]")!
    expect(readout.textContent).not.toContain("V ")
  })

  it("is a slider over the bars whose name says the direction in a word, the range, and the count", () => {
    render(<PriceChart store={seeded()} convention={ZN} label="ZN, today"><PriceChartHeader><PriceChartLast /><PriceChartChange /><PriceChartReadout /></PriceChartHeader><PriceChartPlot><PriceChartEmpty /></PriceChartPlot></PriceChart>)
    const plot = screen.getByRole("slider")
    expect(plot).toHaveAccessibleName("ZN, today: up, last 110-18, +0-02 (+0.06%), low 110-15, high 110-19, 3 bars")
    expect(plot).toHaveAttribute("aria-valuemin", "0")
    expect(plot).toHaveAttribute("aria-valuemax", "2")
    expect(plot).toHaveAttribute("aria-valuenow", "2")
    expect(plot).toHaveAttribute("tabindex", "0")
  })

  it("measures the change from a baseline when given, and draws no direction for equal", () => {
    const view = render(<PriceChart store={seeded()} convention={ZN} label="ZN" baseline={110.59375}><PriceChartHeader><PriceChartLast /><PriceChartChange /><PriceChartReadout /></PriceChartHeader><PriceChartPlot><PriceChartEmpty /></PriceChartPlot></PriceChart>)
    expect(root()).toHaveAttribute("data-direction", "down")
    expect(text("[data-chart-change]")).toBe("−0-01 (−0.03%)")
    view.rerender(<PriceChart store={seeded()} convention={ZN} label="ZN" baseline={110.5625}><PriceChartHeader><PriceChartLast /><PriceChartChange /><PriceChartReadout /></PriceChartHeader><PriceChartPlot><PriceChartEmpty /></PriceChartPlot></PriceChart>)
    expect(root()).toHaveAttribute("data-direction", "flat")
    expect(text("[data-chart-change]")).toBe("0-00 (0.00%)")
    expect(root().querySelector("[data-chart-last]")!.className).toContain("text-flat")
  })

  it("walks the bars with the keys and reads each one out in the zone", () => {
    render(<PriceChart store={seeded()} convention={ZN} label="ZN" zone="America/New_York" kind="candles"><PriceChartHeader><PriceChartLast /><PriceChartChange /><PriceChartReadout /></PriceChartHeader><PriceChartPlot><PriceChartEmpty /></PriceChartPlot></PriceChart>)
    const plot = screen.getByRole("slider")
    expect(root()).toHaveAttribute("data-kind", "candles")
    act(() => plot.focus())
    // Focus lands on the last bar: 09:32 New York for 14:32 UTC.
    expect(plot).toHaveAttribute("aria-valuenow", "2")
    expect(text("[data-chart-readout]")).toBe("09:32:00 O 110-16 H 110-19 L 110-15 C 110-18 V 30")
    fireEvent.keyDown(plot, { key: "ArrowLeft" })
    expect(plot).toHaveAttribute("aria-valuenow", "1")
    expect(text("[data-chart-readout]")).toBe("09:31:00 O 110-17 H 110-18 L 110-15 C 110-16 V 20")
    expect(plot).toHaveAttribute("aria-valuetext", "09:31:00 O 110-17 H 110-18 L 110-15 C 110-16 V 20")
    fireEvent.keyDown(plot, { key: "Home" })
    expect(plot).toHaveAttribute("aria-valuenow", "0")
    fireEvent.keyDown(plot, { key: "PageUp" })
    expect(plot).toHaveAttribute("aria-valuenow", "2")
    fireEvent.keyDown(plot, { key: "ArrowLeft" })
    fireEvent.keyDown(plot, { key: "ArrowLeft" })
    fireEvent.keyDown(plot, { key: "ArrowLeft" })
    // Clamped at the first bar.
    expect(plot).toHaveAttribute("aria-valuenow", "0")
    fireEvent.keyDown(plot, { key: "Escape" })
    expect(text("[data-chart-readout]")).toBe("")
    expect(plot).toHaveAttribute("aria-valuenow", "2")
  })

  it("claims the keys it uses and leaves a modified key to whoever is above it", () => {
    render(<PriceChart store={seeded()} convention={ZN} label="ZN"><PriceChartHeader><PriceChartLast /><PriceChartChange /><PriceChartReadout /></PriceChartHeader><PriceChartPlot><PriceChartEmpty /></PriceChartPlot></PriceChart>)
    const plot = screen.getByRole("slider")
    act(() => plot.focus())
    const claimed = fireEvent.keyDown(plot, { key: "ArrowLeft" })
    expect(claimed, "default prevented").toBe(false)
    const passed = fireEvent.keyDown(plot, { key: "ArrowLeft", metaKey: true })
    expect(passed).toBe(true)
    expect(plot).toHaveAttribute("aria-valuenow", "1")
    const other = fireEvent.keyDown(plot, { key: "a" })
    expect(other).toBe(true)
    // The slider's second pair: Down back one, Up forward one.
    fireEvent.keyDown(plot, { key: "ArrowDown" })
    expect(plot).toHaveAttribute("aria-valuenow", "0")
    fireEvent.keyDown(plot, { key: "ArrowUp" })
    expect(plot).toHaveAttribute("aria-valuenow", "1")
  })

  it("keeps the consumer's own handlers on the root, where they see every key after the plot", () => {
    const keys: [string, boolean][] = []
    const onFocus = vi.fn()
    render(<PriceChart store={seeded()} convention={ZN} label="ZN" onKeyDown={(event) => keys.push([event.key, event.defaultPrevented])} onFocus={onFocus}><PriceChartHeader><PriceChartLast /><PriceChartChange /><PriceChartReadout /></PriceChartHeader><PriceChartPlot><PriceChartEmpty /></PriceChartPlot></PriceChart>)
    const plot = screen.getByRole("slider")
    act(() => plot.focus())
    fireEvent.keyDown(plot, { key: "ArrowLeft" })
    fireEvent.keyDown(plot, { key: "a" })
    // A claimed key arrives with its default prevented, an unclaimed one clean; the focus reaches the root's handler too.
    expect(keys).toEqual([
      ["ArrowLeft", true],
      ["a", false],
    ])
    expect(onFocus).toHaveBeenCalled()
    expect(plot).toHaveAttribute("aria-valuenow", "1")
  })

  it("tells the consumer which bar the cursor is on, and null when it leaves", () => {
    const onCursor = vi.fn()
    render(<PriceChart store={seeded()} convention={ZN} label="ZN" onCursor={onCursor}><PriceChartHeader><PriceChartLast /><PriceChartChange /><PriceChartReadout /></PriceChartHeader><PriceChartPlot><PriceChartEmpty /></PriceChartPlot></PriceChart>)
    const plot = screen.getByRole("slider")
    act(() => plot.focus())
    expect(onCursor).toHaveBeenLastCalledWith(expect.objectContaining({ close: 110.5625 }))
    fireEvent.keyDown(plot, { key: "ArrowLeft" })
    expect(onCursor).toHaveBeenLastCalledWith(expect.objectContaining({ close: 110.5 }))
    act(() => plot.blur())
    expect(onCursor).toHaveBeenLastCalledWith(null)
  })

  it("follows the store: a fold into the open bar moves the last, a new bar grows the count", () => {
    const store = seeded()
    render(<PriceChart store={store} convention={ZN} label="ZN"><PriceChartHeader><PriceChartLast /><PriceChartChange /><PriceChartReadout /></PriceChartHeader><PriceChartPlot><PriceChartEmpty /></PriceChartPlot></PriceChart>)
    act(() => store.applyDeltas(foldTicks(store, [{ at: T0 + 2 * MINUTE + 30_000, price: 110.484375 }], MINUTE)))
    expect(text("[data-chart-last]")).toBe("110-15+")
    expect(root()).toHaveAttribute("data-direction", "down")
    expect(screen.getByRole("slider")).toHaveAttribute("aria-valuemax", "2")
    act(() => store.applyDeltas(foldTicks(store, [{ at: T0 + 3 * MINUTE, price: 110.625 }], MINUTE)))
    expect(screen.getByRole("slider")).toHaveAttribute("aria-valuemax", "3")
    expect(text("[data-chart-last]")).toBe("110-20")
    expect(screen.getByRole("slider")).toHaveAccessibleName("ZN: up, last 110-20, +0-04 (+0.11%), low 110-15, high 110-20, 4 bars")
  })

  it("says so with no bars, takes no focus, and comes alive when the first bar lands", () => {
    const store = createRowStore<Bar>({ getRowId: (b) => barId(b.time), lane: "ordered" })
    render(<PriceChart store={store} convention={ZN} label="ZN" labels={{ noData: "Nothing yet" }}><PriceChartHeader><PriceChartLast /><PriceChartChange /><PriceChartReadout /></PriceChartHeader><PriceChartPlot><PriceChartEmpty /></PriceChartPlot></PriceChart>)
    expect(root()).toHaveAttribute("data-empty", "")
    expect(text("[data-chart-last]")).toBe("Nothing yet")
    expect(text("[data-chart-empty]")).toBe("Nothing yet")
    const plot = screen.getByRole("img", { name: "ZN: Nothing yet" })
    expect(plot).not.toHaveAttribute("tabindex")
    act(() => store.applyDeltas({ upsert: [bar(0, 100, 101)] }))
    expect(root()).not.toHaveAttribute("data-empty")
    expect(screen.getByRole("slider")).toHaveAttribute("tabindex", "0")
    expect(root().querySelector("[data-chart-empty]")).toBeNull()
  })

  it("is an image, not a slider, with the crosshair off", () => {
    render(<PriceChart store={seeded()} convention={ZN} label="ZN" crosshair={false}><PriceChartHeader><PriceChartLast /><PriceChartChange /><PriceChartReadout /></PriceChartHeader><PriceChartPlot><PriceChartEmpty /></PriceChartPlot></PriceChart>)
    const plot = screen.getByRole("img")
    expect(plot).not.toHaveAttribute("tabindex")
    fireEvent.keyDown(plot, { key: "ArrowLeft" })
    expect(text("[data-chart-readout]")).toBe("")
  })

  it("lists every overlay by its word beside a swatch in its chart token", () => {
    const sma = { id: "sma", label: "3-bar average", values: (bars: readonly Bar[]) => bars.map((_, i) => (i < 2 ? null : (bars[i]!.close + bars[i - 1]!.close + bars[i - 2]!.close) / 3)) }
    render(<PriceChart store={seeded()} convention={ZN} label="ZN" overlays={[sma, { id: "vwap", label: "VWAP", values: (bars) => bars.map((b) => b.close), color: 5 }]}><PriceChartHeader><PriceChartLast /><PriceChartChange /><PriceChartReadout /></PriceChartHeader><PriceChartPlot><PriceChartEmpty /></PriceChartPlot><PriceChartLegend><li><PriceChartOverlaySwatch overlayId="sma" />3-bar average</li><li><PriceChartOverlaySwatch overlayId="vwap" />VWAP</li></PriceChartLegend></PriceChart>)
    const legend = screen.getByRole("list", { name: "Overlays" })
    const items = legend.querySelectorAll("li")
    expect([...items].map((li) => li.textContent)).toEqual(["3-bar average", "VWAP"])
    expect(items[0]!.querySelector("span")!.className).toContain(CHART_TOKEN_CLASS[0])
    expect(items[1]!.querySelector("span")!.className).toContain("bg-chart-5")
    expect(CHART_TOKEN_CLASS).toHaveLength(8)
  })

  it("prints a decimal convention with its places and takes a fixed height", () => {
    const store = createRowStore<Bar>({ getRowId: (b) => barId(b.time), lane: "ordered" })
    store.applyDeltas({ upsert: [{ time: T0, open: 5000, high: 5010.25, low: 4998.5, close: 5008.75 }] })
    render(<PriceChart store={store} convention={{ price: { kind: "decimal", decimals: 2 }, tick: 0.25 }} label="ES" height={180}><PriceChartHeader><PriceChartLast /><PriceChartChange /><PriceChartReadout /></PriceChartHeader><PriceChartPlot><PriceChartEmpty /></PriceChartPlot></PriceChart>)
    expect(text("[data-chart-last]")).toBe("5,008.75")
    expect(text("[data-chart-change]")).toBe("+8.75 (+0.18%)")
    expect(root().style.height).toBe("180px")
  })

  it("keeps following its store under StrictMode's mount rehearsal", () => {
    const store = seeded()
    render(
      <StrictMode>
        <PriceChart store={store} convention={ZN} label="ZN"><PriceChartHeader><PriceChartLast /><PriceChartChange /><PriceChartReadout /></PriceChartHeader><PriceChartPlot><PriceChartEmpty /></PriceChartPlot></PriceChart>
      </StrictMode>,
    )
    act(() => store.applyDeltas({ upsert: [bar(3, 110.5625, 110.75)] }))
    expect(text("[data-chart-last]")).toBe("110-24")
    expect(screen.getByRole("slider")).toHaveAttribute("aria-valuemax", "3")
  })
})

describe("PriceChart composition", () => {
  it("requires explicit children for every released self-closing call shape", () => {
    const store = seeded()
    // @ts-expect-error The minimal v1 call needs explicit parts.
    const minimal = <PriceChart store={store} convention={ZN} label="ZN" />
    // @ts-expect-error Retained plotting options do not supply composition.
    const configured = <PriceChart store={store} convention={ZN} label="ZN" kind="candles" height={200} crosshair={false} overlays={[]} onCursor={() => {}} />
    // @ts-expect-error Retained native props and labels must still request migration.
    const styled = <PriceChart store={store} convention={ZN} label="ZN" className="h-full" labels={{ noData: "Waiting" }} />
    const supported = [null, false, undefined, store.getIds().length > 0 && <PriceChartPlot key="plot" />].map((children, i) => <PriceChart key={i} store={store} convention={ZN} label="ZN">{children}</PriceChart>)
    expect([minimal, configured, styled, ...supported]).toHaveLength(7)
  })

  it("supports a reordered legend and footer readout without a header", () => {
    const store = seeded()
    const overlays = [{ id: "first", label: "First", values: () => [] }, { id: "second", label: "Second", values: () => [] }]
    render(
      <PriceChart store={store} convention={ZN} label="ZN" overlays={overlays} zone="UTC">
        <h2>Application heading</h2>
        <PriceChartLegend aria-label="Indicators"><li><PriceChartOverlaySwatch overlayId="second" />Second</li><li><PriceChartOverlaySwatch overlayId="first" />First</li></PriceChartLegend>
        <PriceChartPlot />
        <footer><PriceChartReadout /><PriceChartLast /></footer>
      </PriceChart>,
    )
    expect(root().querySelector("[data-chart-header]")).toBeNull()
    expect([...screen.getByRole("list", { name: "Indicators" }).querySelectorAll("span")].map((el) => el.className)).toEqual([expect.stringContaining("bg-chart-2"), expect.stringContaining("bg-chart-1")])
    act(() => screen.getByRole("slider").focus())
    expect(root().querySelector("footer [data-chart-readout]")).toHaveTextContent("14:32:00 110-18 V 30")
    expect(screen.getByRole("heading")).toHaveTextContent("Application heading")
  })

  it("forwards refs and native props and lets plot handlers prevent built-in keys", () => {
    const refs = { root: createRef<HTMLDivElement>(), header: createRef<HTMLDivElement>(), plot: createRef<HTMLDivElement>(), last: createRef<HTMLSpanElement>(), change: createRef<HTMLSpanElement>(), readout: createRef<HTMLSpanElement>(), legend: createRef<HTMLUListElement>(), swatch: createRef<HTMLSpanElement>() }
    const onFocus = vi.fn()
    const onBlur = vi.fn()
    render(
      <PriceChart ref={refs.root} store={seeded()} convention={ZN} label="ZN" overlays={[{ id: "a", label: "A", values: () => [] }]}>
        <PriceChartHeader ref={refs.header} title="Readings"><PriceChartLast ref={refs.last} /><PriceChartChange ref={refs.change} /><PriceChartReadout ref={refs.readout} /></PriceChartHeader>
        <PriceChartPlot ref={refs.plot} title="Plot" onFocus={onFocus} onBlur={onBlur} onKeyDown={(event) => event.key === "Home" && event.preventDefault()} />
        <PriceChartLegend ref={refs.legend}><li><PriceChartOverlaySwatch ref={refs.swatch} overlayId="a" /></li></PriceChartLegend>
      </PriceChart>,
    )
    for (const ref of Object.values(refs)) expect(ref.current).toBeInTheDocument()
    expect(refs.header.current).toHaveAttribute("title", "Readings")
    act(() => refs.plot.current!.focus())
    fireEvent.keyDown(refs.plot.current!, { key: "Home" })
    expect(refs.plot.current).toHaveAttribute("aria-valuenow", "2")
    fireEvent.keyDown(refs.plot.current!, { key: "ArrowLeft" })
    expect(refs.plot.current).toHaveAttribute("aria-valuenow", "1")
    act(() => refs.plot.current!.blur())
    expect(onFocus).toHaveBeenCalledOnce()
    expect(onBlur).toHaveBeenCalledOnce()
  })

  it("repaints on a system scheme flip and drops the listener with the plot", async () => {
    stubDrawing()
    const listeners = new Set<() => void>()
    const mql = {
      matches: false,
      media: "(prefers-color-scheme: dark)",
      addEventListener: (_: string, fn: () => void) => void listeners.add(fn),
      removeEventListener: (_: string, fn: () => void) => void listeners.delete(fn),
    }
    vi.spyOn(window, "matchMedia").mockReturnValue(mql as unknown as MediaQueryList)
    const view = render(<PriceChart store={seeded()} convention={ZN} label="ZN"><PriceChartPlot /></PriceChart>)
    // Drain the plot's queued first commit while the stubs are still in place.
    await act(async () => {})
    expect(listeners.size).toBe(1)
    const redraw = vi.spyOn(plots.at(-1)!, "redraw").mockImplementation(() => {})
    // The tokens are read once this round of observers has run.
    await act(async () => { for (const fn of [...listeners]) fn() })
    expect(redraw).toHaveBeenCalled()
    view.unmount()
    await act(async () => {})
    expect(listeners.size).toBe(0)
  })

  it("repaints a popped-out plot from its own window's root, once the popout has copied the theme there", async () => {
    stubDrawing()
    // A popout renders the chart through a portal into a host it moves into a window of its own, without
    // remounting it, and keeps that window's root in step with the page's from an observer made after the
    // chart's, as use-popout does.
    const host = document.createElement("div")
    document.body.append(host)
    render(createPortal(<PriceChart store={seeded()} convention={ZN} label="ZN"><PriceChartPlot /></PriceChart>, host))
    await act(async () => {})
    const popout = document.implementation.createHTMLDocument("popout")
    popout.body.append(host)
    new MutationObserver(() => { popout.documentElement.className = document.documentElement.className }).observe(document.documentElement, { attributes: true })
    // Under which root's class each reading of the tokens is made.
    const readUnder: string[] = []
    const read = window.getComputedStyle
    vi.spyOn(window, "getComputedStyle").mockImplementation((element, pseudo) => {
      readUnder.push(element.ownerDocument.documentElement.className)
      return read.call(window, element, pseudo)
    })
    try {
      await act(async () => { document.documentElement.classList.add("dark") })
      expect(readUnder.length).toBeGreaterThan(0)
      expect(readUnder.every((name) => name.includes("dark"))).toBe(true)
    } finally {
      document.documentElement.classList.remove("dark")
    }
  })

  it("measures the plot again when a popout closes and hands it back, and goes on following its box", async () => {
    stubDrawing()
    // Observers that report the box they are told to, made by the page's window or by a popout's.
    let box = { width: 600, height: 300 }
    const live = new Set<{ fire: () => void; window: string }>()
    const observerFor = (window: string) =>
      class {
        targets: Element[] = []
        record: { fire: () => void; window: string }
        constructor(callback: ResizeObserverCallback) {
          this.record = { fire: () => callback(this.targets.map((target) => ({ target, contentRect: { ...box } }) as unknown as ResizeObserverEntry), this as unknown as ResizeObserver), window }
        }
        observe(target: Element) {
          this.targets.push(target)
          live.add(this.record)
          this.record.fire()
        }
        unobserve() {}
        disconnect() {
          live.delete(this.record)
        }
      }
    vi.stubGlobal("ResizeObserver", observerFor("page"))
    const host = document.createElement("div")
    document.body.append(host)
    render(createPortal(<PriceChart store={seeded()} convention={ZN} label="ZN"><PriceChartPlot /></PriceChart>, host))
    await act(async () => {})
    // A popout with a window of its own takes the chart; a theme change binds the plot to it.
    const popout = document.implementation.createHTMLDocument("popout")
    Object.defineProperty(popout, "defaultView", { configurable: true, value: { ResizeObserver: observerFor("popout"), matchMedia: window.matchMedia.bind(window) } })
    popout.body.append(host)
    await act(async () => { document.documentElement.classList.add("dark") })
    await act(async () => { document.documentElement.classList.remove("dark") })
    expect([...live].map((observer) => observer.window).sort()).toEqual(["page", "popout"])
    // The popout closes: its window is gone, the host is back in the page, and the box has changed.
    for (const observer of [...live]) if (observer.window === "popout") live.delete(observer)
    document.body.append(host)
    box = { width: 800, height: 400 }
    await act(async () => { for (const observer of [...live]) observer.fire() })
    await act(async () => {})
    const plot = plots.at(-1) as unknown as { width: number; height: number }
    expect([plot.width, plot.height]).toEqual([800, 400])
    expect([...live].map((observer) => observer.window)).toEqual(["page"])
  })

  it("draws the axis in the runtime's zone for a zone the runtime does not know, as the readout does", async () => {
    stubDrawing()
    const before = plots.length
    render(<PriceChart store={seeded()} convention={ZN} label="ZN" zone="Not/A_Zone"><PriceChartPlot /></PriceChart>)
    await act(async () => {})
    expect(plots.length).toBe(before + 1)
  })

  it("tells a screen reader on the plot what it took focus with, not every update after, and the bar a key reaches as it reads then", () => {
    const store = seeded()
    render(<PriceChart store={store} convention={ZN} label="ZN" zone="UTC"><PriceChartPlot /></PriceChart>)
    const plot = screen.getByRole("slider")
    act(() => plot.focus())
    const name = plot.getAttribute("aria-label")
    const value = plot.getAttribute("aria-valuetext")
    // The live last bar trades: the picture and the visible readings move, the name and the value do not.
    act(() => store.applyDeltas({ upsert: [bar(2, 110.5, 110.75)] }))
    expect(plot.getAttribute("aria-label")).toBe(name)
    expect(plot.getAttribute("aria-valuetext")).toBe(value)
    // A key moves the selection, and the bar it reaches is read as it is now.
    fireEvent.keyDown(plot, { key: "ArrowLeft" })
    fireEvent.keyDown(plot, { key: "ArrowRight" })
    expect(plot.getAttribute("aria-valuetext")).toBe("14:32:00 110-24 V 30")
    // With the crosshair put away, the value is the reading the plot took focus with, and stays it.
    fireEvent.keyDown(plot, { key: "Escape" })
    expect(plot.getAttribute("aria-valuetext")).toBe(name)
    act(() => store.applyDeltas({ upsert: [bar(2, 110.5, 110.5)] }))
    expect(plot.getAttribute("aria-valuetext")).toBe(name)
    // Nor does a new bar move the slider's value.
    const now = plot.getAttribute("aria-valuenow")
    act(() => store.applyDeltas({ upsert: [bar(3, 110.5, 110.5)] }))
    expect(plot.getAttribute("aria-valuenow")).toBe(now)
    expect(plot).toHaveAttribute("aria-valuemax", "3")
    // The keys step from where the slider rests.
    fireEvent.keyDown(plot, { key: "ArrowLeft" })
    expect(plot).toHaveAttribute("aria-valuenow", "1")
    // Leaving lets the name follow the feed again.
    act(() => plot.blur())
    expect(plot.getAttribute("aria-label")).not.toBe(name)
  })

  it("reads a selection the pointer made before focus as it is when focus arrives, and names a chart switched under focus for its new instrument", () => {
    const store = seeded()
    type Select = (index: number | null, fromPointer?: boolean) => void
    let point: Select | null = null
    // The plot's pointer hook selects through the chart's context; without a canvas, this stands in for it.
    function Pointer() {
      const state = usePriceChart() as unknown as { select: Select }
      useLayoutEffect(() => {
        point = state.select
      })
      return null
    }
    const { rerender } = render(<PriceChart store={store} convention={ZN} label="ZN" zone="UTC"><PriceChartPlot /><Pointer /></PriceChart>)
    const plot = screen.getByRole("slider")
    act(() => point!(2, true))
    // The hovered last bar trades before the plot takes focus.
    act(() => store.applyDeltas({ upsert: [bar(2, 110.5, 110.75)] }))
    act(() => plot.focus())
    expect(plot).toHaveAttribute("aria-valuetext", "14:32:00 110-24 V 30")
    rerender(<PriceChart store={store} convention={ZN} label="ZH" zone="UTC"><PriceChartPlot /><Pointer /></PriceChart>)
    expect(plot.getAttribute("aria-label")).toMatch(/^ZH: /)
  })

  it("reads a chart switched to another instrument under focus afresh, its value as well as its name", () => {
    const zf = createRowStore<Bar>({ getRowId: (b) => barId(b.time), lane: "ordered" })
    zf.applyDeltas({ upsert: [bar(0, 107.25, 107.25), bar(1, 107.25, 107.5), bar(2, 107.5, 107.75)] })
    const decimal: InstrumentConvention = { price: { kind: "decimal", decimals: 3 }, tick: 0.001 }
    const { rerender } = render(<PriceChart store={seeded()} convention={ZN} label="ZN" zone="UTC"><PriceChartPlot /></PriceChart>)
    const plot = screen.getByRole("slider")
    act(() => plot.focus())
    expect(plot).toHaveAttribute("aria-valuetext", "14:32:00 110-18 V 30")
    // Another instrument with bars at the same times: its own price, not the last one's.
    rerender(<PriceChart store={zf} convention={decimal} label="ZF" zone="UTC"><PriceChartPlot /></PriceChart>)
    expect(plot).toHaveAttribute("aria-valuetext", "14:32:00 107.750 V 30")
    expect(plot.getAttribute("aria-label")).toMatch(/^ZF: /)
    // A store swapped under the same label is read afresh too.
    const name = plot.getAttribute("aria-label")
    rerender(<PriceChart store={seeded()} convention={decimal} label="ZF" zone="UTC"><PriceChartPlot /></PriceChart>)
    expect(plot.getAttribute("aria-label")).not.toBe(name)
  })

  it("reads a focused plot afresh when a stable store is reloaded for another instrument after the label changes", () => {
    const store = seeded()
    const decimal: InstrumentConvention = { price: { kind: "decimal", decimals: 3 }, tick: 0.001 }
    const zfBars = [bar(0, 107.25, 107.25), bar(1, 107.25, 107.5), bar(2, 107.5, 107.75)]
    // The store stays one object, as the docs ask; an effect keyed on the symbol loads the new bars after the label lands.
    function Chart({ symbol }: { symbol: "ZN" | "ZF" }) {
      useEffect(() => {
        if (symbol === "ZF") store.applyDeltas({ upsert: zfBars })
      }, [symbol])
      return <PriceChart store={store} convention={symbol === "ZN" ? ZN : decimal} label={symbol} zone="UTC"><PriceChartPlot /></PriceChart>
    }
    const { rerender } = render(<Chart symbol="ZN" />)
    const plot = screen.getByRole("slider")
    act(() => plot.focus())
    rerender(<Chart symbol="ZF" />)
    expect(plot).toHaveAttribute("aria-valuetext", "14:32:00 107.750 V 30")
    expect(plot.getAttribute("aria-label")).toMatch(/^ZF: .*last 107\.750/)
  })

  it("reads a focused plot afresh when a stable store is cleared and loaded again", () => {
    const store = seeded()
    render(<PriceChart store={store} convention={ZN} label="ZN" zone="UTC"><PriceChartPlot /></PriceChart>)
    const plot = screen.getByRole("slider")
    act(() => plot.focus())
    act(() => store.clear())
    act(() => store.applyDeltas({ upsert: [bar(0, 107.25, 107.25), bar(1, 107.25, 107.5), bar(2, 107.5, 107.75)] }))
    expect(plot.getAttribute("aria-label")).toMatch(/last 107-24/)
    expect(plot).toHaveAttribute("aria-valuetext", "14:32:00 107-24 V 30")
  })

  it("reads a focused plot afresh when a store empty at the switch fills, and keeps the slider's value inside its bars", () => {
    const zf = createRowStore<Bar>({ getRowId: (b) => barId(b.time), lane: "ordered" })
    const store = seeded()
    const { rerender } = render(<PriceChart store={store} convention={ZN} label="ZN" zone="UTC"><PriceChartPlot /></PriceChart>)
    const plot = screen.getByRole("slider")
    act(() => plot.focus())
    fireEvent.keyDown(plot, { key: "Escape" })
    rerender(<PriceChart store={zf} convention={ZN} label="ZF" zone="UTC"><PriceChartPlot /></PriceChart>)
    act(() => zf.applyDeltas({ upsert: [bar(0, 107.25, 107.25), bar(1, 107.25, 107.5), bar(2, 107.5, 107.75)] }))
    expect(plot.getAttribute("aria-label")).toMatch(/^ZF: .*3 bars$/)
    expect(plot).toHaveAttribute("aria-valuenow", "2")
    // Bars that go take the resting value with them, inside what is left.
    act(() => zf.applyDeltas({ remove: [barId(T0 + MINUTE), barId(T0 + 2 * MINUTE)] }))
    expect(Number(plot.getAttribute("aria-valuenow"))).toBeLessThanOrEqual(Number(plot.getAttribute("aria-valuemax")))
  })

  it("reads a focused plot afresh when only its kind or only its notation changes", () => {
    const store = seeded()
    const decimal: InstrumentConvention = { price: { kind: "decimal", decimals: 3 }, tick: 0.001 }
    const { rerender } = render(<PriceChart store={store} convention={ZN} label="ZN" zone="UTC"><PriceChartPlot /></PriceChart>)
    const plot = screen.getByRole("slider")
    act(() => plot.focus())
    expect(plot).toHaveAttribute("aria-valuetext", "14:32:00 110-18 V 30")
    rerender(<PriceChart store={store} convention={ZN} label="ZN" zone="UTC" kind="candles"><PriceChartPlot /></PriceChart>)
    expect(plot.getAttribute("aria-valuetext")).toMatch(/^14:32:00 O 110-16 H .* C 110-18 V 30$/)
    rerender(<PriceChart store={store} convention={decimal} label="ZN" zone="UTC" kind="candles"><PriceChartPlot /></PriceChart>)
    expect(plot.getAttribute("aria-valuetext")).toMatch(/ C 110\.56\d V 30$/)
  })

  it("reads the selected bar afresh when another bar replaces it, and holds it through a tick", () => {
    const store = seeded()
    render(<PriceChart store={store} convention={ZN} label="ZN" zone="UTC"><PriceChartPlot /></PriceChart>)
    const plot = screen.getByRole("slider")
    act(() => plot.focus())
    // A tick on the selected bar leaves its open alone, so the reading holds.
    act(() => store.applyDeltas({ upsert: [bar(2, 110.5, 110.75)] }))
    expect(plot).toHaveAttribute("aria-valuetext", "14:32:00 110-18 V 30")
    // A correction that replaces the bar, its open with it, is read.
    act(() => store.applyDeltas({ upsert: [bar(2, 110.25, 110.25)] }))
    expect(plot).toHaveAttribute("aria-valuetext", "14:32:00 110-08 V 30")
  })

  it("keeps the value text live while the plot does not have focus", () => {
    const store = seeded()
    type Select = (index: number | null, fromPointer?: boolean) => void
    let point: Select | null = null
    function Pointer() {
      const state = usePriceChart() as unknown as { select: Select }
      useLayoutEffect(() => {
        point = state.select
      })
      return null
    }
    render(<PriceChart store={store} convention={ZN} label="ZN" zone="UTC"><PriceChartPlot /><Pointer /></PriceChart>)
    const plot = screen.getByRole("slider")
    act(() => point!(2, true))
    expect(plot).toHaveAttribute("aria-valuetext", "14:32:00 110-18 V 30")
    act(() => store.applyDeltas({ upsert: [bar(2, 110.5, 110.75)] }))
    expect(plot).toHaveAttribute("aria-valuetext", "14:32:00 110-24 V 30")
  })

  it("shares one subscription across repeated readings and cleans it up", () => {
    const store = seeded()
    const subscribe = store.subscribeMeta
    const unsubscribe = vi.fn()
    const subscription = vi.spyOn(store, "subscribeMeta").mockImplementation((callback) => {
      const dispose = subscribe(callback)
      return () => { unsubscribe(); dispose() }
    })
    function CustomReadout() {
      const { bars, bar, readout } = usePriceChart()
      return <output>{bars.length}: {bar ? readout : "Select a bar"}</output>
    }
    const view = render(<PriceChart store={store} convention={ZN} label="ZN"><PriceChartPlot /><PriceChartReadout /><PriceChartReadout /><CustomReadout /></PriceChart>)
    expect(subscription).toHaveBeenCalledOnce()
    act(() => screen.getByRole("slider").focus())
    expect(screen.getByRole("status")).toHaveTextContent("3:")
    act(() => store.applyDeltas({ upsert: [bar(3, 110.5, 110.75)] }))
    expect(screen.getByRole("status")).toHaveTextContent("4:")
    expect(subscription).toHaveBeenCalledOnce()
    view.unmount()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })

  it("notifies once per cursor change in StrictMode and uses the latest callback", () => {
    const store = seeded()
    const original = vi.fn()
    const next = vi.fn()
    const chart = (onCursor: typeof original) => <StrictMode><PriceChart store={store} convention={ZN} label="ZN" onCursor={onCursor}><PriceChartPlot /></PriceChart></StrictMode>
    const view = render(chart(original))
    expect(original).not.toHaveBeenCalled()
    const plot = screen.getByRole("slider")
    act(() => plot.focus())
    fireEvent.keyDown(plot, { key: "Home" })
    fireEvent.keyDown(plot, { key: "Home" })
    expect(original).toHaveBeenCalledTimes(2)
    view.rerender(chart(next))
    act(() => store.applyDeltas({ upsert: [bar(0, 110.5, 110.75)] }))
    expect(next).not.toHaveBeenCalled()
    fireEvent.keyDown(plot, { key: "End" })
    expect(next).toHaveBeenCalledOnce()
    act(() => plot.blur())
    expect(next).toHaveBeenLastCalledWith(null)
    view.unmount()
    expect(next).toHaveBeenCalledTimes(2)
  })

  it("retains the slider's readout without a visible readout and supports custom empty content", () => {
    const store = seeded()
    const emptyRef = createRef<HTMLDivElement>()
    render(<PriceChart store={store} convention={ZN} label="ZN" zone="UTC"><PriceChartPlot><PriceChartEmpty ref={emptyRef} title="Waiting">Waiting for the feed</PriceChartEmpty></PriceChartPlot></PriceChart>)
    const plot = screen.getByRole("slider")
    act(() => plot.focus())
    fireEvent.keyDown(plot, { key: "Home" })
    expect(plot).toHaveAttribute("aria-valuetext", "14:30:00 110-17 V 10")
    act(() => store.clear())
    // Focus stays where it is when the bars go: the plot keeps its tab stop until it is left.
    expect(screen.getByRole("img")).toHaveAttribute("tabindex", "0")
    expect(document.activeElement).toBe(screen.getByRole("img"))
    act(() => screen.getByRole("img").blur())
    expect(screen.getByRole("img")).not.toHaveAttribute("tabindex")
    expect(emptyRef.current).toHaveTextContent("Waiting for the feed")
    act(() => store.applyDeltas({ upsert: [bar(0, 110.5, 110.75)] }))
    expect(screen.getByRole("slider")).toHaveAttribute("aria-valuemax", "0")
    expect(emptyRef.current).toBeNull()
  })

  it("keeps custom cursor readings consistent when the store shrinks or clears", () => {
    const store = seeded()
    const onCursor = vi.fn()
    function CursorIndex() {
      const { cursor, bar: selected, bars } = usePriceChart()
      return <output>{cursor ?? "none"}:{selected?.time ?? "none"}:{bars.length}</output>
    }
    render(<PriceChart store={store} convention={ZN} label="ZN" onCursor={onCursor}><PriceChartPlot /><CursorIndex /></PriceChart>)
    act(() => screen.getByRole("slider").focus())
    expect(screen.getByRole("status")).toHaveTextContent(`2:${T0 + 2 * MINUTE}:3`)
    act(() => store.applyDeltas({ remove: [barId(T0 + MINUTE), barId(T0 + 2 * MINUTE)] }))
    expect(screen.getByRole("status")).toHaveTextContent(`0:${T0}:1`)
    expect(screen.getByRole("slider")).toHaveAttribute("aria-valuenow", "0")
    act(() => store.clear())
    expect(screen.getByRole("status")).toHaveTextContent("none:none:0")
    expect(onCursor).toHaveBeenCalledOnce()
  })

  it("retains a silently clamped keyboard selection as bars return and deduplicates keys", () => {
    const store = seeded()
    const onCursor = vi.fn()
    function CursorIndex() {
      const { cursor, bar: selected } = usePriceChart()
      return <output>{cursor}:{selected?.time}</output>
    }
    render(<StrictMode><PriceChart store={store} convention={ZN} label="ZN" onCursor={onCursor}><PriceChartPlot /><PriceChartReadout /><CursorIndex /></PriceChart></StrictMode>)
    const plot = screen.getByRole("slider")
    act(() => plot.focus())
    expect(onCursor).toHaveBeenCalledOnce()
    act(() => store.applyDeltas({ remove: [barId(T0 + MINUTE), barId(T0 + 2 * MINUTE)] }))
    const readout = text("[data-chart-readout]")
    for (let i = 1; i <= 3; i++) {
      act(() => store.applyDeltas({ upsert: [bar(i, 110.5, 110.75)] }))
      expect(screen.getByRole("status")).toHaveTextContent(`0:${T0}`)
      expect(plot).toHaveAttribute("aria-valuenow", "0")
      expect(text("[data-chart-readout]")).toBe(readout)
      expect(onCursor).toHaveBeenCalledOnce()
    }
    fireEvent.keyDown(plot, { key: "Home" })
    expect(onCursor).toHaveBeenCalledOnce()
    fireEvent.keyDown(plot, { key: "End" })
    expect(onCursor).toHaveBeenCalledTimes(2)
    act(() => store.applyDeltas({ remove: [1, 2, 3].map((i) => barId(T0 + i * MINUTE)) }))
    fireEvent.keyDown(plot, { key: "End" })
    fireEvent.keyDown(plot, { key: "End" })
    expect(plot).toHaveAttribute("aria-valuenow", "0")
    expect(onCursor).toHaveBeenCalledTimes(2)
  })

  it("reports a missing root for coordinated parts and leaves static headers independent", () => {
    render(<PriceChartHeader>Application content</PriceChartHeader>)
    expect(screen.getByText("Application content")).toBeInTheDocument()
    expect(() => render(<PriceChartReadout />)).toThrow("PriceChart parts require PriceChart")
  })
})
