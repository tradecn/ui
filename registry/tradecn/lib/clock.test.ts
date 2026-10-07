import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { createClock } from "@/registry/tradecn/lib/clock"

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

it("samples the source without changing subscriber snapshots, notifications or timer ownership", () => {
  let time = 1000
  const clock = createClock(1000, () => time)
  const listener = vi.fn()
  const unsubscribe = clock.subscribe(listener)
  time = 1500
  expect(clock.sample?.()).toBe(1500)
  expect(clock.now()).toBe(1000)
  expect(listener).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(1)
  vi.advanceTimersByTime(1000)
  expect(clock.now()).toBe(1500)
  expect(listener).toHaveBeenCalledOnce()
  unsubscribe()
  time = 60_000
  expect(clock.sample?.()).toBe(60_000)
  expect(clock.now()).toBe(1500)
  expect(vi.getTimerCount()).toBe(0)
  const stop = clock.subscribe(listener)
  expect(clock.now()).toBe(60_000)
  stop()
})

it.each([0, -5, NaN, Infinity, 2 ** 31])("ticks once a second for an interval of %d ms, instead of as fast as the timer allows", (interval) => {
  const every = vi.spyOn(globalThis, "setInterval")
  let time = 0
  const clock = createClock(interval, () => time)
  const listener = vi.fn()
  const stop = clock.subscribe(listener)
  // Checked before any time passes: a zero delay would spin the fake timers forever.
  expect(every).toHaveBeenLastCalledWith(expect.any(Function), 1000)
  time = 1000
  vi.advanceTimersByTime(1000)
  expect(listener).toHaveBeenCalledOnce()
  expect(clock.now()).toBe(1000)
  stop()
})
