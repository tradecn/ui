// @vitest-environment node
import { describe, expect, it, vi } from "vitest"
import { createFrameSampler, formatMs, histogram, percentile, summarize } from "@/registry/tradecn/lib/frame-stats"

describe("percentile and histogram", () => {
  it("reads percentiles off a sorted list, and the last bin takes everything past the end", () => {
    const sorted = [10, 12, 14, 16, 18, 20, 22, 24, 26, 60]
    expect(percentile(sorted, 50)).toBe(18)
    expect(percentile(sorted, 99)).toBe(60)
    expect(percentile(sorted, 0)).toBe(10)
    expect(percentile([], 50)).toBe(0)
    expect(histogram([0, 1.9, 2, 15, 39.9, 40, 400, -1, NaN], 2, 40)).toEqual([2, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3])
    expect(histogram([], 5, 20)).toEqual([0, 0, 0, 0])
  })

  it("summarizes gaps against a budget: a frame past one and a half budgets missed its slot", () => {
    const report = summarize([16, 17, 16, 30, 16, 50], { budgetMs: 1000 / 60, binMs: 2, maxMs: 40, longTasks: 2, longTasksObserved: true, since: 0, until: 1000 })
    expect(report.frames).toBe(6)
    expect(report.p50).toBe(16)
    expect(report.max).toBe(50)
    expect(report.dropped).toBe(2)
    expect(report.droppedAboveMs).toBeCloseTo(25)
    expect(report.longTasks).toBe(2)
    expect(report.histogram[8]).toBe(4)
    expect(report.histogram[19]).toBe(1)
    expect(formatMs(1000 / 60)).toBe("16.7 ms")
  })
})

describe("createFrameSampler", () => {
  function rig(options: { window?: number } = {}) {
    let t = 0
    const callbacks: ((t: number) => void)[] = []
    const timers: (() => void)[] = []
    const cleared: unknown[] = []
    const sampler = createFrameSampler({
      window: options.window ?? 600,
      budgetMs: 1000 / 60,
      refreshMs: 250,
      raf: (cb) => {
        callbacks.push(cb)
        return callbacks.length
      },
      caf: (id) => cleared.push(id),
      now: () => t,
      setTimer: (cb) => {
        timers.push(cb)
        return timers.length
      },
      clearTimer: (id) => cleared.push(`timer-${String(id)}`),
      observe: false,
    })
    const frame = (ms: number) => {
      t += ms
      const cb = callbacks.pop()!
      callbacks.length = 0
      cb(t)
    }
    const refresh = () => timers[0]!()
    return { sampler, frame, refresh, cleared, callbacks }
  }

  it("collects a gap per frame, reports on the timer and not per frame, and keeps the same report between refreshes", () => {
    const { sampler, frame, refresh } = rig()
    const heard = vi.fn()
    sampler.subscribe(heard)
    sampler.start()
    expect(sampler.running).toBe(true)
    frame(0)
    frame(16)
    frame(17)
    frame(33)
    expect(heard).not.toHaveBeenCalled()
    const before = sampler.report()
    expect(before.frames).toBe(0)
    refresh()
    expect(heard).toHaveBeenCalledTimes(1)
    const report = sampler.report()
    expect(report).not.toBe(before)
    expect(report.frames).toBe(3)
    expect(report.p50).toBe(17)
    expect(report.max).toBe(33)
    expect(report.dropped).toBe(1)
    expect(report.longTasksObserved).toBe(false)
    expect(sampler.report()).toBe(report)
  })

  it("keeps only the last frames of the window, forgets on reset, and stops cleanly", () => {
    const { sampler, frame, refresh, cleared } = rig({ window: 3 })
    sampler.start()
    frame(0)
    for (const gap of [10, 20, 30, 40]) frame(gap)
    refresh()
    expect(sampler.report().frames).toBe(3)
    expect(sampler.report().p50).toBe(30)
    expect(sampler.report().max).toBe(40)
    sampler.reset()
    expect(sampler.report().frames).toBe(0)
    sampler.stop()
    expect(sampler.running).toBe(false)
    expect(cleared).toContain("timer-1")
    expect(cleared.length).toBe(2)
    sampler.stop()
    expect(cleared.length).toBe(2)
  })
})
