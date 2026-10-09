import { act, render, screen } from "@testing-library/react"
import { StrictMode } from "react"
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
    [-Infinity, "0:00"],
    [Infinity, "–"],
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
    // Named by its label and the time left together, which follows the digits.
    expect(screen.getByRole("timer")).toHaveAccessibleName("Inquiry 0:12")
    expect(root().dataset.tier).toBe("plenty")
    expect(digits()).toHaveTextContent("0:12")
    expect(live()).toHaveTextContent("")
    tick(1000)
    expect(root().dataset.tier).toBe("plenty")
    expect(digits()).toHaveTextContent("0:11")
    expect(screen.getByRole("timer")).toHaveAccessibleName("Inquiry 0:11")
    expect(live()).toHaveTextContent("")
    tick(1000)
    expect(root().dataset.tier).toBe("soon")
    expect(root()).toHaveClass("bg-expiring-soft", "text-foreground")
    expect(root()).not.toHaveClass("text-expiring")
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

  it("sizes the bar from a fresh sample while the shared clock idles", () => {
    let t = 0
    const clock = createClock(1000, () => t)
    // Start and stop the clock: its last tick stays 0 while ten minutes pass unsubscribed.
    clock.subscribe(() => {})()
    t = 600_000
    render(<Countdown clock={clock} startsAt={600_000} expiresAt={630_000} />)
    // The animation runs for the thirty seconds actually left, not the stale ten minutes.
    const recorded = animations.at(-1)!
    expect(recorded.options.duration).toBe(30_000)
  })

  it("reads first sight from a fresh sample, so one drawn in the second after its deadline is over at once", () => {
    let t = 0
    const clock = createClock(1000, () => t)
    const stop = clock.subscribe(() => {})
    t = 500
    // The last tick still reads 0, but first sight samples 500: past the end, so the digits, the tier, and
    // the bar all say it is over from the first frame instead of after the next tick.
    render(<Countdown clock={clock} startsAt={-29_700} expiresAt={300} />)
    expect(root().dataset.tier).toBe("expired")
    expect(digits()).toHaveTextContent("0:00")
    expect(bar().style.transform).toBe("scaleX(0)")
    expect(animations).toHaveLength(0)
    stop()
  })

  it("shows the real time left from its first frame after the clock sat idle, and announces nothing for the catch-up", () => {
    let t = 0
    const clock = createClock(1000, () => t)
    // The clock's last tick stays 0 while ten minutes pass with nothing subscribed.
    clock.subscribe(() => {})()
    t = 600_000
    let firstFrame: { tier?: string; digits?: string | null } = {}
    function Probe() {
      return (
        <div
          ref={(node) => {
            if (!node || firstFrame.tier) return
            const timer = node.querySelector<HTMLElement>('[data-slot="tradecn-countdown"]')!
            firstFrame = { tier: timer.dataset.tier, digits: timer.querySelector("[data-countdown-digits]")!.textContent }
          }}
        >
          <Countdown clock={clock} expiresAt={605_000} label="Inquiry" />
        </div>
      )
    }
    render(<Probe />)
    // The stale tick would have read ten minutes and five seconds left: plenty, then soon once the clock caught up.
    expect(firstFrame).toEqual({ tier: "soon", digits: "0:05" })
    expect(root().querySelector("[aria-live]")).toHaveTextContent("")
  })

  it("holds the bar still with no finite deadline: empty for one it cannot read, full for an endless one", () => {
    t = 1000
    const clock = createClock(1000, () => t)
    const { rerender } = render(<Countdown clock={clock} expiresAt={NaN} startsAt={0} />)
    expect(root().dataset.tier).toBe("expired")
    expect(digits()).toHaveTextContent("0:00")
    expect(bar().style.transform).toBe("scaleX(0)")
    rerender(<Countdown clock={clock} expiresAt={Infinity} startsAt={0} />)
    expect(root().dataset.tier).toBe("plenty")
    expect(digits()).toHaveTextContent("–")
    expect(bar().style.transform).toBe("scaleX(1)")
    expect(animations).toHaveLength(0)
    tick(5000)
    expect(bar().style.transform).toBe("scaleX(1)")
  })

  it("measures from first sight when startsAt is not a finite time", () => {
    t = 4000
    const clock = createClock(1000, () => t)
    render(<Countdown expiresAt={10_000} startsAt={NaN} clock={clock} />)
    expect(animations[0]!.keyframes[0]).toEqual({ transform: "scaleX(1)" })
    expect(animations[0]!.options.duration).toBe(6000)
  })

  it("calls onExpire once for a mount past its deadline under StrictMode", () => {
    t = 20_000
    const clock = createClock(1000, () => t)
    const onExpire = vi.fn()
    render(
      <StrictMode>
        <Countdown expiresAt={12_000} startsAt={0} clock={clock} onExpire={onExpire} />
      </StrictMode>,
    )
    expect(onExpire).toHaveBeenCalledTimes(1)
    tick(2000)
    expect(onExpire).toHaveBeenCalledTimes(1)
  })

  it("sizes first sight from a fresh sample without startsAt", () => {
    let t = 0
    const clock = createClock(1000, () => t)
    clock.subscribe(() => {})()
    t = 600_000
    // Without startsAt, first sight is the start: freshly sampled, the bar begins full for
    // the thirty seconds left, not at a sliver of the stale ten-minute span.
    render(<Countdown clock={clock} expiresAt={630_000} />)
    const recorded = animations.at(-1)!
    expect(recorded.options.duration).toBe(30_000)
    expect(recorded.keyframes[0]?.transform).toBe("scaleX(1)")
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

  it("draws the bar from the tick when the browser has no Web Animations", () => {
    const animate = Element.prototype.animate
    const spied = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "animate")
    // A browser without the API has it nowhere on the chain; the suite's spy must vanish too.
    Object.defineProperty(Element.prototype, "animate", { value: undefined, configurable: true, writable: true })
    if (spied) Object.defineProperty(HTMLElement.prototype, "animate", { value: undefined, configurable: true, writable: true })
    try {
      t = 2000
      const clock = createClock(1000, () => t)
      render(<Countdown expiresAt={12_000} startsAt={0} clock={clock} />)
      expect(animations).toHaveLength(0)
      expect(bar().style.transform).toBe(`scaleX(${10_000 / 12_000})`)
      tick(4000)
      expect(bar().style.transform).toBe(`scaleX(${6_000 / 12_000})`)
      tick(6000)
      expect(bar().style.transform).toBe("scaleX(0)")
    } finally {
      Object.defineProperty(Element.prototype, "animate", { value: animate, configurable: true, writable: true })
      if (spied) Object.defineProperty(HTMLElement.prototype, "animate", spied)
    }
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
