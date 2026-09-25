import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type uPlot from "uplot"
import { barId, type Bar } from "@/registry/tradecn/lib/price-series"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import { PriceChart, PriceChartLast, PriceChartPlot, PriceChartReadout, type PriceChartProps } from "@/registry/tradecn/ui/price-chart"

const drawing = vi.hoisted(() => ({ plots: [] as PlotDouble[] }))

// Keep the lifecycle real while replacing only uPlot's canvas work. The installed browser matrix
// covers drawing and pointer coordinates; these assertions catch accidental remounts and extra work.
interface PlotDouble {
  options: uPlot.Options
  data: uPlot.AlignedData
  setData: ReturnType<typeof vi.fn>
  setSize: ReturnType<typeof vi.fn>
  redraw: ReturnType<typeof vi.fn>
  destroy: ReturnType<typeof vi.fn>
  setCursor: ReturnType<typeof vi.fn>
  valToPos: ReturnType<typeof vi.fn>
  cursor: { idx: number | null; event?: MouseEvent; left: number; top: number }
  fireCursor: () => void
}

vi.mock("uplot", () => ({
  default: class {
    static pxRatio = 1
    static tzDate = (date: Date) => date
    setData = vi.fn((data: uPlot.AlignedData) => { this.data = data })
    setSize = vi.fn()
    redraw = vi.fn()
    destroy = vi.fn()
    cursor: PlotDouble["cursor"] = { idx: null, left: -10, top: -10 }
    fireCursor = () => this.options.hooks?.setCursor?.forEach((hook) => hook?.(this as unknown as uPlot))
    setCursor = vi.fn((position: { left: number; top: number }, fireHook = true) => {
      Object.assign(this.cursor, position)
      if (fireHook) this.fireCursor()
    })
    valToPos = vi.fn((value: number) => value)
    over = document.createElement("div")
    options: uPlot.Options
    data: uPlot.AlignedData
    constructor(options: uPlot.Options, data: uPlot.AlignedData) {
      this.options = options
      this.data = data
      drawing.plots.push(this)
    }
  },
}))

let resize: (width: number, height: number) => void
let resizeDisconnect: ReturnType<typeof vi.fn>
beforeEach(() => {
  drawing.plots.length = 0
  resizeDisconnect = vi.fn()
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: (entries: { contentRect: { width: number; height: number } }[]) => void) {
      resize = (width, height) => callback([{ contentRect: { width, height } }])
    }
    observe() { resize(600, 240) }
    disconnect = resizeDisconnect
  })
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as CanvasRenderingContext2D)
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 600, 240))
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

const convention = { kind: "decimal", decimals: 2 } as const
const first: Bar = { time: 1_000, open: 10, high: 12, low: 9, close: 11 }
function setup(extra: Partial<PriceChartProps> = {}) {
  const store = createRowStore<Bar>({ getRowId: (bar) => barId(bar.time), lane: "ordered" })
  store.applyDeltas({ upsert: [first] })
  const chart = (props: Partial<PriceChartProps> = {}) => <PriceChart store={store} convention={convention} label="Sample" {...extra} {...props}><PriceChartLast /><PriceChartPlot /><PriceChartReadout /></PriceChart>
  return { store, chart, ...render(chart()) }
}

describe("PriceChart plot lifecycle", () => {
  it("uses setData for a batch, keeps overlay work out of cursor renders and survives inline configurations", () => {
    const values = vi.fn((bars: readonly Bar[]) => bars.map((bar) => bar.close + 1))
    const overlays = [{ id: "a", label: "Average", values }]
    const { store, chart, rerender, unmount } = setup({ overlays })
    const plot = drawing.plots[0]!
    expect(drawing.plots).toHaveLength(1)
    expect(values).toHaveBeenCalledOnce()
    act(() => store.applyDeltas({ upsert: [{ ...first, close: 12 }] }))
    expect(plot.setData).toHaveBeenCalledOnce()
    expect(plot.data[1]).toEqual([12])
    expect(document.querySelector("[data-chart-last]")).toHaveTextContent("12.00")
    expect(values).toHaveBeenCalledTimes(2)
    act(() => screen.getByRole("slider").focus())
    fireEvent.keyDown(screen.getByRole("slider"), { key: "Escape" })
    rerender(chart({ convention: { ...convention }, overlays: [...overlays], className: "h-96" }))
    expect(drawing.plots).toHaveLength(1)
    expect(plot.destroy).not.toHaveBeenCalled()
    expect(values).toHaveBeenCalledTimes(2)
    act(() => resize(700, 300))
    expect(plot.setSize).toHaveBeenLastCalledWith({ width: 700, height: 300 })
    expect(drawing.plots).toHaveLength(1)
    unmount()
    expect(plot.destroy).toHaveBeenCalledOnce()
    expect(resizeDisconnect).toHaveBeenCalledOnce()
  })

  it("moves the keyboard crosshair to the retained bar when the selected tail is removed", () => {
    const { store } = setup()
    act(() => store.applyDeltas({ upsert: [{ ...first, time: 2_000 }, { ...first, time: 3_000 }] }))
    const plot = drawing.plots[0]!
    act(() => screen.getByRole("slider").focus())
    plot.setCursor.mockClear()
    act(() => store.applyDeltas({ remove: [barId(2_000), barId(3_000)] }))
    expect(screen.getByRole("slider")).toHaveAttribute("aria-valuenow", "0")
    expect(plot.setCursor).toHaveBeenLastCalledWith({ left: first.time, top: first.close }, false)
  })

  it("resynchronizes keyboard coordinates after uPlot commits new scales without echoing callbacks", () => {
    const onCursor = vi.fn()
    const { store } = setup({ onCursor })
    const plot = drawing.plots[0]!
    act(() => screen.getByRole("slider").focus())
    expect(onCursor).toHaveBeenCalledOnce()
    act(() => store.applyDeltas({ upsert: [{ ...first, close: 12 }] }))
    plot.valToPos.mockImplementation((value: number) => value + 50)
    act(() => plot.fireCursor())
    expect(plot.setCursor).toHaveBeenLastCalledWith({ left: 1_050, top: 62 }, false)
    expect(onCursor).toHaveBeenCalledOnce()
  })

  it("keeps pointer coordinates through data commits and hands control back to the keys", () => {
    const onCursor = vi.fn()
    const { store } = setup({ onCursor })
    act(() => store.applyDeltas({ upsert: [{ ...first, time: 2_000 }, { ...first, time: 3_000 }] }))
    const plot = drawing.plots[0]!
    Object.assign(plot.cursor, { idx: 2, left: 2_950, top: 9, event: new MouseEvent("mousemove") })
    act(() => plot.fireCursor())
    expect(onCursor).toHaveBeenCalledOnce()
    plot.setCursor.mockClear()
    act(() => store.applyDeltas({ remove: [barId(2_000), barId(3_000)] }))
    plot.cursor.idx = 0
    act(() => plot.fireCursor())
    expect(plot.setCursor).not.toHaveBeenCalled()
    expect(plot.cursor).toMatchObject({ left: 2_950, top: 9 })
    expect(onCursor).toHaveBeenCalledTimes(2)
    fireEvent.keyDown(screen.getByRole("slider"), { key: "Escape" })
    expect(plot.setCursor).toHaveBeenLastCalledWith({ left: -10, top: -10 }, false)
    fireEvent.keyDown(screen.getByRole("slider"), { key: "Home" })
    expect(plot.setCursor).toHaveBeenLastCalledWith({ left: 1_000, top: 11 }, false)
    plot.setCursor.mockClear()
    act(() => plot.fireCursor())
    expect(plot.setCursor).toHaveBeenLastCalledWith({ left: 1_000, top: 11 }, false)
    expect(onCursor).toHaveBeenCalledTimes(4)
  })

  it("lets a key reclaim the same bar from the pointer and ignores a destroyed plot's queued hook", () => {
    const onCursor = vi.fn()
    const { chart, rerender } = setup({ onCursor })
    const old = drawing.plots[0]!
    Object.assign(old.cursor, { idx: 0, left: 1_020, top: 9, event: new MouseEvent("mousemove") })
    act(() => old.fireCursor())
    old.setCursor.mockClear()
    fireEvent.keyDown(screen.getByRole("slider"), { key: "Home" })
    expect(old.setCursor).toHaveBeenLastCalledWith({ left: 1_000, top: 11 }, false)
    rerender(chart({ kind: "candles" }))
    const current = drawing.plots[1]!
    act(() => old.fireCursor())
    act(() => current.fireCursor())
    expect(current.setCursor).toHaveBeenLastCalledWith({ left: 1_000, top: 11 }, false)
    expect(onCursor).toHaveBeenCalledOnce()
  })

  it("recreates for structural changes and destroys on empty data before repopulation", () => {
    const { store, chart, rerender } = setup()
    const original = drawing.plots[0]!
    rerender(chart({ kind: "candles" }))
    expect(original.destroy).toHaveBeenCalledOnce()
    const candles = drawing.plots[1]!
    expect(candles.data).toEqual([[1_000], [10], [12], [9], [11]])
    act(() => store.clear())
    expect(candles.destroy).toHaveBeenCalledOnce()
    expect(screen.getByRole("img")).toBeInTheDocument()
    act(() => store.applyDeltas({ upsert: [first] }))
    expect(drawing.plots).toHaveLength(3)
    expect(screen.getByRole("slider")).toBeInTheDocument()
  })

  it("uses replacement overlay functions on the next batch and pads missing values with gaps", () => {
    const original = vi.fn(() => [15])
    const next = vi.fn(() => [NaN, 20, 30])
    const { store, chart, rerender } = setup({ overlays: [{ id: "a", label: "A", values: original }] })
    rerender(chart({ overlays: [{ id: "a", label: "New name", values: next }] }))
    expect(next).not.toHaveBeenCalled()
    act(() => store.applyDeltas({ upsert: [{ ...first, time: 2_000 }] }))
    expect(drawing.plots).toHaveLength(1)
    expect(next).toHaveBeenCalledOnce()
    expect(drawing.plots[0]!.data[2]).toEqual([null, 20])
  })

  it("repaints palette changes without replacing the plot and disconnects the observer", async () => {
    const { unmount } = setup()
    const plot = drawing.plots[0]!
    plot.redraw.mockClear()
    await act(async () => { document.documentElement.classList.add("dark") })
    expect(plot.redraw).toHaveBeenCalled()
    expect(drawing.plots).toHaveLength(1)
    unmount()
    plot.redraw.mockClear()
    await act(async () => { document.documentElement.classList.remove("dark") })
    expect(plot.redraw).not.toHaveBeenCalled()
  })
})
