import { act, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { summarize, type FrameReport, type FrameSampler } from "@/registry/tradecn/lib/frame-stats"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import { PerfMonitor } from "@/registry/tradecn/ui/perf-monitor"

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
    const { unmount } = render(<PerfMonitor sampler={sampler} />)
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

  it("redraws on a report and not otherwise, tells onReport each time, says n/a for long tasks it cannot see, and prints your readouts", () => {
    const sampler = fakeSampler(at([16], 1000, { longTasksObserved: false }))
    const onReport = vi.fn()
    let parentRenders = 0
    function App() {
      parentRenders++
      return <PerfMonitor sampler={sampler} onReport={onReport} readouts={[{ label: "ipc batch", value: "412 rows" }]} compact />
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
    render(<PerfMonitor sampler={sampler} lanes={[{ label: "Market data", store: md }, { label: "RFQ", store: rfq }]} compact />)
    const lane = (label: string) => document.querySelector<HTMLElement>(`[data-perf-lane="${label}"]`)!
    expect(lane("Market data")).toHaveTextContent("rows 2")
    expect(lane("Market data").querySelector("[data-perf-dropped]")).toHaveTextContent("drop 7")
    expect(lane("RFQ").querySelector("[data-perf-seq]")).toHaveTextContent("seq 42 gap")
    // Four batches in the next second: the rate is read between two reports.
    for (let i = 0; i < 4; i++) md.applyDeltas({ patch: [{ id: "a", fields: { px: 2 + i } }] })
    act(() => sampler.emit(at([16, 16], 2000)))
    expect(lane("Market data")).toHaveTextContent("batches/s 4")
    expect(lane("RFQ")).toHaveTextContent("batches/s 0")
  })
})
