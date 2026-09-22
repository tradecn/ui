import { act, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createClock } from "@/registry/tradecn/lib/clock"
import { Countdown, countdownTier, formatRemaining } from "@/registry/tradecn/ui/countdown"

describe("countdownTier", () => {
  it.each([
    [30_000, "plenty"],
    [10_001, "plenty"],
    [10_000, "soon"],
    [1, "soon"],
    [0, "expired"],
    [-5, "expired"],
    [NaN, "expired"],
  ])("%d ms is %s", (ms, tier) => {
    expect(countdownTier(ms)).toBe(tier)
  })
  it("takes its own threshold", () => {
    expect(countdownTier(20_000, { soonMs: 30_000 })).toBe("soon")
  })
})

describe("formatRemaining", () => {
  it.each([
    [0, "0:00"],
    [1, "0:01"],
    [999, "0:01"],
    [1000, "0:01"],
    [1001, "0:02"],
    [90_000, "1:30"],
    [3_600_000, "1:00:00"],
    [3_723_000, "1:02:03"],
    [-400, "0:00"],
    [NaN, "0:00"],
  ])("%d ms is %s", (ms, text) => {
    expect(formatRemaining(ms)).toBe(text)
  })
})

interface Recorded {
  keyframes: Keyframe[]
  options: KeyframeAnimationOptions
  cancel: ReturnType<typeof vi.fn>
}

describe("Countdown", () => {
  let t = 0
  let animations: Recorded[] = []
  beforeEach(() => {
    t = 0
    animations = []
    vi.useFakeTimers()
    // happy-dom has real Web Animations, and its cancel() leaves a rejected promise behind; record instead.
    vi.spyOn(HTMLElement.prototype, "animate").mockImplementation((keyframes, options) => {
      const record: Recorded = { keyframes: keyframes as Keyframe[], options: options as KeyframeAnimationOptions, cancel: vi.fn() }
      animations.push(record)
      return record as unknown as Animation
    })
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })
  const tick = (ms: number) =>
    act(() => {
      t += ms
      vi.advanceTimersByTime(ms)
    })
  const root = () => document.querySelector<HTMLElement>('[data-slot="tradecn-countdown"]')!
  const digits = () => root().querySelector("[data-countdown-digits]")!
  const bar = () => root().querySelector<HTMLElement>("span[aria-hidden] > span")!

  it("ticks through plenty, soon, and expired, speaks only when the tier changes, fires onExpire once, and re-renders nothing above it", () => {
    const clock = createClock(1000, () => t)
    const onExpire = vi.fn()
    let parentRenders = 0
    function App() {
      parentRenders++
      return <Countdown expiresAt={12_000} startsAt={0} clock={clock} label="Inquiry" onExpire={onExpire} />
    }
    render(<App />)
    const live = () => root().querySelector("[aria-live]")!
    expect(root().getAttribute("role")).toBe("timer")
    expect(root().getAttribute("aria-label")).toBe("Inquiry")
    expect(root().dataset.tier).toBe("plenty")
    expect(digits()).toHaveTextContent("0:12")
    expect(live()).toHaveTextContent("")
    tick(1000)
    expect(root().dataset.tier).toBe("plenty")
    expect(digits()).toHaveTextContent("0:11")
    expect(live()).toHaveTextContent("")
    tick(1000)
    expect(root().dataset.tier).toBe("soon")
    expect(root().className).toContain("bg-expiring-soft")
    expect(live()).toHaveTextContent("Inquiry 0:10")
    tick(5000)
    expect(digits()).toHaveTextContent("0:05")
    expect(live()).toHaveTextContent("Inquiry 0:10")
    expect(onExpire).not.toHaveBeenCalled()
    tick(5000)
    expect(root().dataset.tier).toBe("expired")
    expect(digits()).toHaveTextContent("0:00")
    expect(live()).toHaveTextContent("Inquiry 0:00")
    expect(onExpire).toHaveBeenCalledTimes(1)
    tick(2000)
    expect(digits()).toHaveTextContent("0:00")
    expect(onExpire).toHaveBeenCalledTimes(1)
    expect(parentRenders).toBe(1)
  })

  it("animates the bar once, linear, for exactly the time left, and starts over when the end moves", () => {
    t = 2000
    const clock = createClock(1000, () => t)
    const { rerender } = render(<Countdown expiresAt={12_000} startsAt={0} clock={clock} />)
    expect(animations).toHaveLength(1)
    expect(animations[0]!.options).toMatchObject({ duration: 10_000, easing: "linear", fill: "forwards" })
    expect(animations[0]!.keyframes).toEqual([{ transform: `scaleX(${10_000 / 12_000})` }, { transform: "scaleX(0)" }])
    expect(bar().style.transform).toBe("")
    tick(3000)
    expect(animations).toHaveLength(1)
    rerender(<Countdown expiresAt={20_000} startsAt={0} clock={clock} />)
    expect(animations[0]!.cancel).toHaveBeenCalledTimes(1)
    expect(animations).toHaveLength(2)
    expect(animations[1]!.options.duration).toBe(15_000)
    expect(animations[1]!.keyframes[0]).toEqual({ transform: "scaleX(0.75)" })
  })

  it("draws the bar at zero with no animation once it is over, and cancels a running one when it gets there", () => {
    t = 20_000
    const clock = createClock(1000, () => t)
    const { unmount } = render(<Countdown expiresAt={12_000} startsAt={0} clock={clock} />)
    expect(animations).toHaveLength(0)
    expect(bar().style.transform).toBe("scaleX(0)")
    expect(root().dataset.tier).toBe("expired")
    unmount()
    t = 0
    render(<Countdown expiresAt={3000} startsAt={0} clock={clock} />)
    expect(animations).toHaveLength(1)
    tick(3000)
    expect(animations[0]!.cancel).toHaveBeenCalledTimes(1)
    expect(bar().style.transform).toBe("scaleX(0)")
  })

  it("steps the bar with the digits under reduced motion", () => {
    vi.spyOn(window, "matchMedia").mockImplementation((query) => ({ matches: query.includes("reduce"), media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false }) as unknown as MediaQueryList)
    const clock = createClock(1000, () => t)
    render(<Countdown expiresAt={10_000} startsAt={0} clock={clock} />)
    expect(animations).toHaveLength(0)
    expect(bar().style.transform).toBe("scaleX(1)")
    tick(5000)
    expect(bar().style.transform).toBe("scaleX(0.5)")
    tick(5000)
    expect(bar().style.transform).toBe("scaleX(0)")
  })

  it("measures the bar from first sight when it is not told where it began", () => {
    t = 4000
    const clock = createClock(1000, () => t)
    render(<Countdown expiresAt={10_000} clock={clock} />)
    expect(animations[0]!.keyframes[0]).toEqual({ transform: "scaleX(1)" })
    expect(animations[0]!.options.duration).toBe(6000)
  })

  it("compact is the digits alone, announce off says nothing, and two countdowns share one clock", () => {
    const source = vi.fn(() => t)
    const clock = createClock(1000, source)
    render(
      <>
        <Countdown expiresAt={5000} clock={clock} compact announce={false} />
        <Countdown expiresAt={8000} clock={clock} compact announce={false} />
      </>,
    )
    const timers = document.querySelectorAll('[data-slot="tradecn-countdown"]')
    expect(timers).toHaveLength(2)
    expect(timers[0]!.querySelector("[aria-hidden]")).toBeNull()
    expect(document.querySelector("[aria-live]")).toBeNull()
    expect(animations).toHaveLength(0)
    const before = source.mock.calls.length
    tick(3000)
    expect(source.mock.calls.length - before).toBe(3)
    expect(timers[0]!).toHaveTextContent("0:02")
    expect(timers[1]!).toHaveTextContent("0:05")
  })
})
