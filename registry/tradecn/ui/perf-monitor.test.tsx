import { act, render, screen, within } from "@testing-library/react"
import { createRef, StrictMode, type ComponentProps } from "react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { createFrameSampler, summarize, type FrameReport, type FrameSampler } from "@/registry/tradecn/lib/frame-stats"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import { PerfMonitor, PerfMonitorHistogram, PerfMonitorValue, PerfMonitorLane, PerfMonitorLaneValue, usePerfLane, usePerfReport } from "@/registry/tradecn/ui/perf-monitor"

function FrameReadings() {
  return <>{(["frames", "p50", "p99", "max", "dropped", "long"] as const).map((metric) => <span key={metric} data-perf={metric}>{metric} <PerfMonitorValue metric={metric} /></span>)}</>
}

function LaneReadings({ label }: { label: string }) {
  const { meta } = usePerfLane()
  return <div data-perf-lane={label}>
    {label} <PerfMonitorLaneValue metric="kind" /> rows <PerfMonitorLaneValue metric="rows" /> batches/s <PerfMonitorLaneValue metric="rate" />
    {meta.lane === "coalesced" ? <span data-perf-dropped>drop <PerfMonitorLaneValue metric="dropped" /></span> : <span data-perf-seq>seq <PerfMonitorLaneValue metric="seq" /> <PerfMonitorLaneValue metric="gap" /></span>}
    age <PerfMonitorLaneValue metric="age" />
  </div>
}

// @ts-expect-error Readout descriptors moved to caller-owned content.
export type { PerfReadout } from "@/registry/tradecn/ui/perf-monitor"
// @ts-expect-error The former lane descriptor is now a provider component.
export type ReleasedLaneDescriptor = PerfMonitorLane

// A sampler the test drives: reports land when the test says so.
function fakeSampler(first: FrameReport) {
  let current = first
  const listeners = new Set<() => void>()
  const sampler: FrameSampler & { emit(report: FrameReport): void; started: number; stopped: number } = {
    started: 0,
    stopped: 0,
    running: false,
    start() {
      this.started++
    },
    stop() {
      this.stopped++
    },
    reset() {},
    report: () => current,
    subscribe(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    emit(report) {
      current = report
      for (const cb of listeners) cb()
    },
  }
  return sampler
}

const at = (gaps: number[], until: number, extra: Partial<Parameters<typeof summarize>[1]> = {}) => summarize(gaps, { budgetMs: 1000 / 60, binMs: 2, maxMs: 40, longTasks: 0, longTasksObserved: true, since: 0, until, ...extra })

describe("PerfMonitor", () => {
  it("is a group with the slot, prints the frame numbers, draws the histogram with the budget marked, and starts and stops its sampler with its life", () => {
    const sampler = fakeSampler(at([16, 17, 16, 30], 1000))
    const { unmount } = render(<PerfMonitor sampler={sampler}><PerfMonitorHistogram /><FrameReadings /></PerfMonitor>)
    const root = screen.getByRole("group", { name: "Frame health" })
    expect(root.dataset.slot).toBe("tradecn-perf-monitor")
    expect(root.dataset.dropped).toBe("1")
    expect(root.querySelector("[data-perf='frames']")).toHaveTextContent("frames 4")
    expect(root.querySelector("[data-perf='p50']")).toHaveTextContent("p50 16.0 ms")
    expect(root.querySelector("[data-perf='max']")).toHaveTextContent("max 30.0 ms")
    expect(root.querySelector("[data-perf='dropped']")).toHaveTextContent("dropped 1")
    expect(root.querySelector("[data-perf='long']")).toHaveTextContent("long 0")
    const chart = root.querySelector("[data-perf-histogram]")!
    expect(chart.getAttribute("role")).toBe("img")
    expect(chart.getAttribute("aria-label")).toContain("p50 16.0 ms")
    expect(chart.querySelectorAll("rect")).toHaveLength(20)
    expect(chart.querySelector("rect[data-bin='8']")?.getAttribute("data-count")).toBe("3")
    expect(chart.querySelector("[data-perf-budget]")).toHaveTextContent("16.7 ms")
    expect(sampler.started).toBe(1)
    unmount()
    expect(sampler.stopped).toBe(1)
  })

  it("labels the budget beside its marker on whichever side keeps the label inside the chart", () => {
    const sampler = fakeSampler(at([16], 1000))
    const { rerender } = render(<PerfMonitor sampler={sampler}><PerfMonitorHistogram /></PerfMonitor>)
    const label = () => document.querySelector("[data-perf-budget]")!
    const marker = () => Number(document.querySelector("[data-perf-histogram] line")!.getAttribute("x1"))
    // 16.7 ms sits left of the middle of the 160-wide chart, so the label reads to the right of the marker.
    expect(label().getAttribute("text-anchor")).toBe("start")
    expect(Number(label().getAttribute("x"))).toBeCloseTo(marker() + 2)
    rerender(<PerfMonitor sampler={sampler} budgetMs={1000 / 30}><PerfMonitorHistogram /></PerfMonitor>)
    expect(label()).toHaveTextContent("33.3 ms")
    expect(label().getAttribute("text-anchor")).toBe("end")
    expect(Number(label().getAttribute("x"))).toBeCloseTo(marker() - 2)
    // A budget past the last bin pins the marker to the right edge, and the label ends just inside it.
    rerender(<PerfMonitor sampler={sampler} budgetMs={100}><PerfMonitorHistogram /></PerfMonitor>)
    expect(marker()).toBe(160)
    expect(label().getAttribute("x")).toBe("158")
    expect(label().getAttribute("text-anchor")).toBe("end")
  })

  it("redraws on a report and not otherwise, tells onReport each time, says n/a for long tasks it cannot see, and prints your readouts", () => {
    const sampler = fakeSampler(at([16], 1000, { longTasksObserved: false }))
    const onReport = vi.fn()
    let parentRenders = 0
    function App() {
      parentRenders++
      return <PerfMonitor sampler={sampler} onReport={onReport}><FrameReadings /><span data-perf-readout="ipc batch">ipc batch 412 rows</span></PerfMonitor>
    }
    render(<App />)
    const root = screen.getByRole("group", { name: "Frame health" })
    expect(root.querySelector("[data-perf='long']")).toHaveTextContent("long n/a")
    expect(root.querySelector("[data-perf-readout='ipc batch']")).toHaveTextContent("ipc batch 412 rows")
    expect(root.querySelector("[data-perf-histogram]")).toBeNull()
    expect(onReport).toHaveBeenCalledTimes(1)
    act(() => sampler.emit(at([16, 16, 60], 1250, { longTasksObserved: false })))
    expect(root.querySelector("[data-perf='frames']")).toHaveTextContent("frames 3")
    expect(root.dataset.dropped).toBe("1")
    expect(onReport).toHaveBeenCalledTimes(2)
    expect(parentRenders).toBe(1)
  })

  it("reads each lane's meta on the report's beat: rows, batches a second, drops or sequence and gap, age", () => {
    interface Row {
      id: string
      px: number
    }
    const md = createRowStore<Row>({ getRowId: (r) => r.id, lane: "coalesced" })
    const rfq = createRowStore<Row>({ getRowId: (r) => r.id, lane: "ordered" })
    md.applyDeltas({ upsert: [{ id: "a", px: 1 }, { id: "b", px: 2 }], meta: { lane: "coalesced", dropped: 7, producedAt: 900 } })
    rfq.applyDeltas({ upsert: [{ id: "q1", px: 1 }], meta: { lane: "ordered", seq: 42, gap: true } })
    const sampler = fakeSampler(at([16], 1000))
    render(<PerfMonitor sampler={sampler}><PerfMonitorLane store={md}><LaneReadings label="Market data" /></PerfMonitorLane><PerfMonitorLane store={rfq}><LaneReadings label="RFQ" /></PerfMonitorLane></PerfMonitor>)
    const lane = (label: string) => document.querySelector<HTMLElement>(`[data-perf-lane="${label}"]`)!
    expect(lane("Market data")).toHaveTextContent("rows 2")
    expect(lane("Market data").querySelector("[data-perf-dropped]")).toHaveTextContent("drop 7")
    expect(lane("RFQ").querySelector("[data-perf-seq]")).toHaveTextContent("seq 42 gap")
    // Four batches in the next second: the rate is read between two reports.
    act(() => { for (let i = 0; i < 4; i++) md.applyDeltas({ patch: [{ id: "a", fields: { px: 2 + i } }] }) })
    act(() => sampler.emit(at([16, 16], 2000)))
    expect(lane("Market data")).toHaveTextContent("batches/s 4")
    expect(lane("RFQ")).toHaveTextContent("batches/s 0")
  })
})

describe("class-based sources", () => {
  it("keeps a class sampler and a class meta source bound to their instances", () => {
    class ClassSampler {
      running = false
      private current = at([], 0)
      private listeners = new Set<() => void>()
      start() { this.running = true }
      stop() { this.running = false }
      reset() {}
      report() { return this.current }
      subscribe(cb: () => void) {
        this.listeners.add(cb)
        return () => void this.listeners.delete(cb)
      }
      emit(report: FrameReport) {
        this.current = report
        for (const cb of this.listeners) cb()
      }
    }
    class ClassMeta {
      private store = createRowStore<{ id: string }>({ getRowId: (row) => row.id })
      getMeta() { return this.store.getMeta() }
      subscribeMeta(cb: () => void) { return this.store.subscribeMeta(cb) }
      push(id: string) { this.store.applyDeltas({ upsert: [{ id }] }) }
    }
    const sampler = new ClassSampler()
    const meta = new ClassMeta()
    render(<PerfMonitor sampler={sampler}><FrameReadings /><PerfMonitorLane store={meta}><LaneReadings label="Quotes" /></PerfMonitorLane></PerfMonitor>)
    const group = screen.getByRole("group", { name: "Frame health" })
    expect(group).toBeInTheDocument()
    act(() => sampler.emit(at([5, 5], 1000)))
    act(() => meta.push("a"))
    expect(group).toBeInTheDocument()
    expect(sampler.running).toBe(true)
  })
})

describe("PerfMonitor composition", () => {
  it("requires migration of every released call shape while allowing conditional children", () => {
    const sampler = fakeSampler(at([], 0))
    const store = createRowStore<{ id: string }>({ getRowId: (row) => row.id })
    // @ts-expect-error Released minimal usage must not silently become an empty group.
    const minimal = <PerfMonitor />
    // @ts-expect-error Retained props alone still require an explicit composition.
    const retained = <PerfMonitor sampler={sampler} budgetMs={20} window={120} refreshMs={500} label="Frames" className="w-80" onReport={() => {}} />
    // @ts-expect-error compact moved to omission of the histogram.
    const compact = <PerfMonitor compact><FrameReadings /></PerfMonitor>
    // @ts-expect-error lanes moved to caller-owned PerfMonitorLane providers.
    const lanes = <PerfMonitor lanes={[{ label: "Quotes", store }]}><FrameReadings /></PerfMonitor>
    // @ts-expect-error readouts moved to caller-owned content.
    const readouts = <PerfMonitor readouts={[{ label: "queue", value: "4" }]}><FrameReadings /></PerfMonitor>
    // @ts-expect-error The label prop owns the group name.
    const named = <PerfMonitor aria-label="Other"><FrameReadings /></PerfMonitor>
    // @ts-expect-error aria-labelledby cannot replace label either.
    const referenced = <PerfMonitor aria-labelledby="other"><FrameReadings /></PerfMonitor>
    // @ts-expect-error The root's group semantics cannot be replaced.
    const role = <PerfMonitor role="status"><FrameReadings /></PerfMonitor>
    // @ts-expect-error Lane composition is required.
    const emptyLane = <PerfMonitorLane store={store} />
    const show = store.getIds().length > 0
    const conditional = <PerfMonitor>{show && <FrameReadings />}</PerfMonitor>
    const empty = <PerfMonitor>{null}</PerfMonitor>
    const lane = <PerfMonitorLane store={store}>{show && <LaneReadings label="Quotes" />}</PerfMonitorLane>
    expect([minimal, retained, compact, lanes, readouts, named, referenced, role, emptyLane, conditional, empty, lane]).toHaveLength(12)
  })

  it("shares one subscription and sampler while keeping static content and other lanes asleep", () => {
    const sampler = fakeSampler(at([16], 1000))
    const subscribe = vi.spyOn(sampler, "subscribe")
    const a = createRowStore<{ id: string }>({ getRowId: (row) => row.id })
    const b = createRowStore<{ id: string }>({ getRowId: (row) => row.id })
    const subscribeA = vi.spyOn(a, "subscribeMeta")
    const subscribeB = vi.spyOn(b, "subscribeMeta")
    const rendered = { static: vi.fn(), report: vi.fn(), a: vi.fn(), b: vi.fn() }
    const counts = () => Object.fromEntries(Object.entries(rendered).map(([id, fn]) => [id, fn.mock.calls.length]))
    function Static() { rendered.static(); return <h2>Desk</h2> }
    function Report() { rendered.report(); return <span>{usePerfReport().frames}</span> }
    function Lane({ id }: { id: "a" | "b" }) { rendered[id](); return <span>{usePerfLane().meta.size}</span> }
    const { unmount } = render(<PerfMonitor sampler={sampler}>
      <Static /><Report /><PerfMonitorValue metric="frames" /><PerfMonitorValue metric="p99" /><PerfMonitorHistogram />
      <PerfMonitorLane store={a}><Lane id="a" /><PerfMonitorLaneValue metric="rows" /><PerfMonitorLaneValue metric="rows" /></PerfMonitorLane>
      <PerfMonitorLane store={b}><Lane id="b" /></PerfMonitorLane>
    </PerfMonitor>)
    expect(subscribe).toHaveBeenCalledTimes(1)
    expect(subscribeA).toHaveBeenCalledTimes(1)
    expect(subscribeB).toHaveBeenCalledTimes(1)
    expect(sampler.started).toBe(1)
    act(() => a.applyDeltas({ upsert: [{ id: "a" }] }))
    expect(counts()).toEqual({ static: 1, report: 1, a: 2, b: 1 })
    act(() => sampler.emit(at([16, 20], 1250)))
    expect(rendered.static.mock.calls.length).toBe(1)
    expect(rendered.report.mock.calls.length).toBe(2)
    unmount()
    expect(sampler.stopped).toBe(1)
    const before = counts()
    act(() => { sampler.emit(at([], 1500)); a.clear(); b.clear() })
    expect(counts()).toEqual(before)
  })

  it("stops a replacement sampler and returns to the initial supplied fallback", () => {
    const first = fakeSampler(at([16], 1000))
    const second = fakeSampler(at([30], 2000))
    const report = vi.fn()
    function App({ sampler }: { sampler?: FrameSampler }) { return <PerfMonitor sampler={sampler} onReport={report}><FrameReadings /></PerfMonitor> }
    const { rerender, unmount } = render(<App sampler={first} />)
    expect(report).toHaveBeenLastCalledWith(first.report())
    rerender(<App sampler={second} />)
    expect(first.stopped).toBe(1)
    expect(second.started).toBe(1)
    expect(screen.getByRole("group")).toHaveTextContent("max 30.0 ms")
    rerender(<App />)
    expect(second.stopped).toBe(1)
    expect(first.started).toBe(2)
    expect(screen.getByRole("group")).toHaveTextContent("max 16.0 ms")
    unmount()
    expect(first.stopped).toBe(2)
  })

  it("retains the released snapshot fallback for an untyped sampler without subscribe", () => {
    const sampler = { report: () => at([16], 1000), start: vi.fn(), stop: vi.fn(), reset: vi.fn(), running: false }
    const report = sampler.report()
    sampler.report = () => report
    // @ts-expect-error FrameSampler requires subscribe; released runtime also tolerated its omission.
    const view = render(<PerfMonitor sampler={sampler}><FrameReadings /></PerfMonitor>)
    expect(screen.getByRole("group")).toHaveTextContent("frames 1")
    expect(sampler.start).toHaveBeenCalledTimes(1)
    view.unmount()
    expect(sampler.stop).toHaveBeenCalledTimes(1)
  })

  it("reads the latest callback only when a report changes", () => {
    const sampler = fakeSampler(at([], 0))
    const first = vi.fn()
    const next = vi.fn()
    const { rerender } = render(<PerfMonitor sampler={sampler} onReport={first}><FrameReadings /></PerfMonitor>)
    expect(first).toHaveBeenCalledTimes(1)
    rerender(<PerfMonitor sampler={sampler} onReport={next}><FrameReadings /></PerfMonitor>)
    expect(next).not.toHaveBeenCalled()
    act(() => sampler.emit(sampler.report()))
    expect(next).not.toHaveBeenCalled()
    const report = at([16], 250)
    act(() => sampler.emit(report))
    expect(next).toHaveBeenCalledExactlyOnceWith(report)
    expect(first).toHaveBeenCalledTimes(1)
  })

  it("samples without React renders per frame and preserves report cadence, ring size and budget", () => {
    let tick: (time: number) => void = () => {}
    let refresh: () => void = () => {}
    let now = 0
    let renders = 0
    const caf = vi.fn()
    const clearTimer = vi.fn()
    const setTimer = vi.fn((cb: () => void) => { refresh = cb; return 99 })
    const sampler = createFrameSampler({ window: 3, budgetMs: 10, refreshMs: 500, observe: false, now: () => now, raf: (cb) => { tick = cb; return 12 }, caf, setTimer, clearTimer })
    const callback = vi.fn()
    function Reading() { renders++; return <span>{usePerfReport().frames}</span> }
    const { unmount } = render(<PerfMonitor sampler={sampler} budgetMs={10} onReport={callback}><Reading /><PerfMonitorHistogram /></PerfMonitor>)
    expect(setTimer).toHaveBeenCalledWith(expect.any(Function), 500)
    act(() => { for (const t of [0, 8, 18, 33, 53]) tick(t) })
    expect(renders).toBe(1)
    expect(callback).toHaveBeenCalledTimes(1)
    now = 500
    act(() => refresh())
    expect(renders).toBe(2)
    expect(sampler.report()).toMatchObject({ frames: 3, p50: 15, p99: 20, max: 20, mean: 15, dropped: 1, droppedAboveMs: 15, longTasksObserved: false, until: 500 })
    expect(screen.getByRole("img")).toHaveAccessibleName(/p50 15.0 ms, p99 20.0 ms, 1 dropped/)
    act(() => sampler.reset())
    expect(sampler.report().frames).toBe(0)
    expect(sampler.running).toBe(true)
    unmount()
    expect(sampler.running).toBe(false)
    expect(caf).toHaveBeenCalledWith(12)
    expect(clearTimer).toHaveBeenCalledWith(99)
  })

  it("captures owned sampler settings on mount while the histogram budget stays reactive", () => {
    vi.useFakeTimers()
    const onReport = vi.fn()
    const { rerender, unmount } = render(<PerfMonitor window={3} budgetMs={10} refreshMs={500} onReport={onReport}><PerfMonitorHistogram /></PerfMonitor>)
    expect(onReport.mock.lastCall?.[0].droppedAboveMs).toBe(15)
    act(() => vi.advanceTimersByTime(500))
    expect(onReport.mock.lastCall?.[0].frames).toBe(3)
    expect(onReport).toHaveBeenCalledTimes(2)
    rerender(<PerfMonitor window={9} budgetMs={20} refreshMs={100} onReport={onReport}><PerfMonitorHistogram /></PerfMonitor>)
    expect(document.querySelector("[data-perf-budget]")).toHaveTextContent("20.0 ms")
    act(() => vi.advanceTimersByTime(100))
    expect(onReport).toHaveBeenCalledTimes(2)
    act(() => vi.advanceTimersByTime(400))
    expect(onReport.mock.lastCall?.[0]).toMatchObject({ frames: 3, droppedAboveMs: 15 })
    unmount()
    expect(vi.getTimerCount()).toBe(0)
    vi.useRealTimers()
  })

  it("balances sampler ownership during development effect replay", () => {
    const sampler = fakeSampler(at([], 0))
    const { unmount } = render(<StrictMode><PerfMonitor sampler={sampler}><FrameReadings /></PerfMonitor></StrictMode>)
    expect(sampler.started - sampler.stopped).toBe(1)
    unmount()
    expect(sampler.started).toBe(sampler.stopped)
  })

  it("prints n/a where the browser cannot observe long tasks", () => {
    // The spec ignores an unsupported entry type without throwing, so a browser without
    // longtask support would otherwise report a measured zero forever.
    vi.stubGlobal("PerformanceObserver", class {
      static supportedEntryTypes = ["mark", "measure"]
      disconnect = vi.fn()
      observe = vi.fn()
    })

    const timers = new Set<() => void>()
    const sampler = createFrameSampler({ raf: () => 42, caf: vi.fn(), setTimer: (cb) => { timers.add(cb); return cb }, clearTimer: (id) => { timers.delete(id as () => void) } })
    render(<PerfMonitor sampler={sampler}><PerfMonitorValue metric="long" /></PerfMonitor>)
    // Refreshed: the report now carries whether long tasks were ever observable.
    act(() => timers.forEach((tick) => tick()))
    expect(screen.getByText("n/a")).toBeInTheDocument()
    expect(screen.queryByText("0")).toBeNull()
    vi.unstubAllGlobals()
    // An observer lacking the support list entirely reads n/a the same way.
    vi.stubGlobal("PerformanceObserver", class {
      disconnect = vi.fn()
      observe = vi.fn()
    })
    const timers2 = new Set<() => void>()
    const sampler2 = createFrameSampler({ raf: () => 43, caf: vi.fn(), setTimer: (cb) => { timers2.add(cb); return cb }, clearTimer: (id) => { timers2.delete(id as () => void) } })
    const second = render(<PerfMonitor sampler={sampler2}><PerfMonitorValue metric="long" /></PerfMonitor>)
    act(() => timers2.forEach((tick) => tick()))
    expect(within(second.container).getByText("n/a")).toBeInTheDocument()
    vi.unstubAllGlobals()
  })

  it("disconnects real sampler observers and cancels timers through effect replay and unmount", () => {
    const observers: { receive: (list: { getEntries(): unknown[] }) => void; disconnect: ReturnType<typeof vi.fn> }[] = []
    const observe = vi.fn()
    vi.stubGlobal("PerformanceObserver", class {
      static supportedEntryTypes = ["longtask"]
      disconnect = vi.fn()
      observe = observe
      constructor(receive: (list: { getEntries(): unknown[] }) => void) { observers.push({ receive, disconnect: this.disconnect }) }
    })
    const caf = vi.fn()
    const timers = new Set<() => void>()
    const sampler = createFrameSampler({ raf: () => 42, caf, setTimer: (cb) => { timers.add(cb); return cb }, clearTimer: (id) => { timers.delete(id as () => void) } })
    const onReport = vi.fn()
    const { unmount } = render(<StrictMode><PerfMonitor sampler={sampler} onReport={onReport}><FrameReadings /></PerfMonitor></StrictMode>)
    expect(observers).toHaveLength(2)
    expect(observers[0]!.disconnect).toHaveBeenCalledTimes(1)
    expect(observers[1]!.disconnect).not.toHaveBeenCalled()
    expect(observe).toHaveBeenCalledWith({ type: "longtask", buffered: false })
    expect(timers.size).toBe(1)
    act(() => { observers[1]!.receive({ getEntries: () => [1, 2] }); for (const refresh of timers) refresh() })
    expect(screen.getByRole("group")).toHaveTextContent("long 2")
    act(() => sampler.reset())
    expect(screen.getByRole("group")).toHaveTextContent("long 0")
    unmount()
    expect(observers[1]!.disconnect).toHaveBeenCalledTimes(1)
    expect(timers.size).toBe(0)
    expect(caf).toHaveBeenCalledTimes(2)
    expect(sampler.running).toBe(false)
    vi.unstubAllGlobals()
  })

  it("preserves empty, fresh, backward-clock and cleared lane readings and resets on source replacement", () => {
    vi.spyOn(Date, "now").mockReturnValue(900)
    const store = createRowStore<{ id: string }>({ getRowId: (row) => row.id, lane: "ordered" })
    const next = createRowStore<{ id: string }>({ getRowId: (row) => row.id, lane: "coalesced" })
    const sampler = fakeSampler(at([], 1000))
    function App({ source = store }: { source?: typeof store }) { return <PerfMonitor sampler={sampler}><PerfMonitorLane store={source}><LaneReadings label="Quotes" /></PerfMonitorLane></PerfMonitor> }
    const { rerender } = render(<App />)
    const group = screen.getByRole("group")
    expect(group).toHaveTextContent("rows 0 batches/s 0seq – age –")
    act(() => store.applyDeltas({ upsert: [{ id: "a" }], meta: { lane: "ordered", seq: 4, gap: true } }))
    expect(group).toHaveTextContent("rows 1 batches/s 0seq 4 gapage 100.0 ms")
    act(() => sampler.emit(at([], 2000)))
    expect(group).toHaveTextContent("batches/s 1")
    act(() => sampler.emit(at([], 500)))
    expect(group).toHaveTextContent("batches/s 0")
    expect(group).toHaveTextContent("age 0.0 ms")
    act(() => { store.clear(); sampler.emit(at([], 1500)) })
    expect(group).toHaveTextContent("rows 0 batches/s 1")
    rerender(<App source={next} />)
    expect(group).toHaveTextContent("coalesced rows 0 batches/s 0drop 0age –")
    act(() => store.applyDeltas({ upsert: [{ id: "old" }] }))
    expect(group).toHaveTextContent("rows 0")
    vi.restoreAllMocks()
  })

  it("forwards native refs and events and supports accessible tables and caller-owned keyboard controls", async () => {
    const sampler = fakeSampler(at([16, 20], 1000))
    const store = createRowStore<{ id: string }>({ getRowId: (row) => row.id })
    const root = createRef<HTMLDivElement>()
    const value = createRef<HTMLSpanElement>()
    const svg = createRef<SVGSVGElement>()
    const lane = createRef<HTMLSpanElement>()
    const click = vi.fn()
    const reset = vi.spyOn(sampler, "reset")
    render(<PerfMonitor sampler={sampler} ref={root} label="Desk" id="desk" onClick={click}>
      <button type="button" onClick={() => sampler.reset()}>Reset measurements</button>
      <table><caption>Frames</caption><tbody><tr><th scope="row">Tail</th><td><PerfMonitorValue ref={value} title="Tail gap" metric="p99" format={(v) => <strong>{v} milliseconds</strong>} /></td></tr></tbody></table>
      <PerfMonitorLane store={store}><table><caption>Feeds</caption><tbody><tr><th scope="row">Quotes</th><td><PerfMonitorLaneValue ref={lane} metric="rows" format={({ meta }) => <em>{meta.size} rows</em>} /></td></tr></tbody></table></PerfMonitorLane>
      <PerfMonitorHistogram ref={svg} className="custom-chart" width={240} />
    </PerfMonitor>)
    expect(root.current).toBe(screen.getByRole("group", { name: "Desk" }))
    expect(value.current).toHaveTextContent("20 milliseconds")
    expect(lane.current).toHaveTextContent("0 rows")
    expect(svg.current).toHaveAttribute("width", "240")
    expect(svg.current).toHaveClass("custom-chart")
    expect(screen.getByRole("rowheader", { name: "Tail" }).nextElementSibling).toContainElement(value.current)
    expect(screen.getByRole("rowheader", { name: "Quotes" }).nextElementSibling).toContainElement(lane.current)
    const user = userEvent.setup()
    await user.tab()
    expect(screen.getByRole("button", { name: "Reset measurements" })).toHaveFocus()
    await user.keyboard("{Enter}")
    expect(reset).toHaveBeenCalledTimes(1)
    expect(click).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("button")).toHaveFocus()
  })

  it("keeps the group role and name authoritative for untyped callers", () => {
    const overrides = { "aria-label": "Wrong", "aria-labelledby": "wrong", role: "status" }
    // @ts-expect-error Exercise an untyped caller overriding the reserved role and naming props.
    render(<PerfMonitor {...overrides} label="Frames"><span id="wrong">Other</span></PerfMonitor>)
    expect(screen.getByRole("group", { name: "Frames" })).not.toHaveAttribute("aria-labelledby")
    expect(screen.queryByRole("status")).toBeNull()
  })

  it("reports context misuse instead of returning detached empty readings", () => {
    expect(() => render(<PerfMonitorValue metric="frames" />)).toThrow("inside PerfMonitor")
    expect(() => render(<PerfMonitorLaneValue metric="rows" />)).toThrow("inside PerfMonitorLane")
  })
})

// Exported public types accept native refs and conditional composition without assertions.
export const monitorProps: ComponentProps<typeof PerfMonitor> = { children: null, ref: createRef<HTMLDivElement>() }
