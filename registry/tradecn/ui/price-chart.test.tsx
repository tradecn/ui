import { act, fireEvent, render, screen } from "@testing-library/react"
import { createRef, StrictMode } from "react"
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

  it("reports a missing root for coordinated parts and leaves static headers independent", () => {
    render(<PriceChartHeader>Application content</PriceChartHeader>)
    expect(screen.getByText("Application content")).toBeInTheDocument()
    expect(() => render(<PriceChartReadout />)).toThrow("PriceChart parts require PriceChart")
  })
})
