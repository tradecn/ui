import { act, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { FeedHealth, alwaysOpen, createClock, formatAge, stalenessTier, type FeedDescriptor, type SessionCalendar } from "@/registry/tradecn/ui/feed-health"

const T = { agingMs: 2000, staleMs: 10_000 }
const feed = (over: Partial<FeedDescriptor> = {}): FeedDescriptor => ({ id: "md", label: "Market data", state: "connected", lane: "coalesced", lastMessageAt: 0, ...over })
const closed: SessionCalendar = { status: () => "closed" }

describe("stalenessTier", () => {
  it.each([
    [feed(), 500, alwaysOpen, "live"],
    [feed(), 2000, alwaysOpen, "aging"],
    [feed(), 9999, alwaysOpen, "aging"],
    [feed(), 10_000, alwaysOpen, "stale"],
    [feed({ lastMessageAt: null }), 0, alwaysOpen, "aging"],
    [feed({ state: "disconnected" }), 100, alwaysOpen, "offline"],
    [feed({ state: "disconnected" }), 100, closed, "offline"],
    [feed(), 60_000, closed, "closed"],
    [feed(), 60_000, { status: () => "holiday" } as SessionCalendar, "closed"],
    [feed(), 60_000, { status: () => "pre" } as SessionCalendar, "stale"],
  ])("%#", (f, now, session, tier) => {
    expect(stalenessTier(f, now, T, session)).toBe(tier)
  })
})

describe("formatAge", () => {
  it.each([
    [null, "–"],
    [0, "now"],
    [999, "now"],
    [12_400, "12s"],
    [180_000, "3m"],
    [7_200_000, "2h"],
  ])("%s -> %s", (ms, text) => {
    expect(formatAge(ms)).toBe(text)
  })
})

describe("FeedHealth", () => {
  let t = 0
  beforeEach(() => {
    t = 0
    vi.useFakeTimers()
  })
  afterEach(() => vi.useRealTimers())

  it("ages a quiet feed through live, aging, stale, announces only the transitions, and does not re-render its parent", () => {
    const clock = createClock(1000, () => t)
    let parentRenders = 0
    function App() {
      parentRenders++
      return <FeedHealth feeds={[feed()]} thresholds={T} clock={clock} />
    }
    render(<App />)
    const item = () => document.querySelector<HTMLElement>('[data-feed="md"]')!
    const live = () => document.querySelector("[aria-live]")!
    expect(screen.getByRole("group", { name: "Feed health" }).dataset.slot).toBe("tradecn-feed-health")
    expect(item().dataset.tier).toBe("live")
    expect(item()).toHaveTextContent("now")
    expect(live()).toHaveTextContent("")
    const tick = (ms: number) =>
      act(() => {
        t += ms
        vi.advanceTimersByTime(ms)
      })
    tick(1000)
    expect(item().dataset.tier).toBe("live")
    expect(item()).toHaveTextContent("1s")
    expect(live()).toHaveTextContent("")
    tick(1000)
    expect(item().dataset.tier).toBe("aging")
    expect(live()).toHaveTextContent("Market data aging, 2s")
    tick(3000)
    expect(item()).toHaveTextContent("5s")
    expect(live()).toHaveTextContent("Market data aging, 2s")
    tick(5000)
    expect(item().dataset.tier).toBe("stale")
    expect(item().className).toContain("bg-stale-soft")
    expect(live()).toHaveTextContent("Market data stale, 10s")
    expect(parentRenders).toBe(1)
  })

  it("shows drops on a coalesced lane and the gap with a spinner on an ordered lane", () => {
    const clock = createClock(1000, () => t)
    t = 5000
    render(
      <FeedHealth
        clock={clock}
        feeds={[
          feed({ dropped: 1234, lastMessageAt: 5000 }),
          feed({ id: "rfq", label: "RFQ", lane: "ordered", seq: 42, lastMessageAt: 5000, gap: { since: 2000, replaying: true } }),
          feed({ id: "vpn", label: "VPN", state: "disconnected" }),
        ]}
      />,
    )
    expect(document.querySelector('[data-feed="md"]')).toHaveTextContent("drop 1,234")
    const rfq = document.querySelector<HTMLElement>('[data-feed="rfq"]')!
    expect(rfq).toHaveTextContent("gap 3s")
    expect(rfq.querySelector('[data-slot="spinner"]')).not.toBeNull()
    expect(document.querySelector<HTMLElement>('[data-feed="vpn"]')!.dataset.tier).toBe("offline")
    expect(document.querySelectorAll('[data-slot="separator"]').length).toBe(2)
  })

  it("the clock runs only while someone listens", () => {
    const source = vi.fn(() => t)
    const clock = createClock(1000, source)
    const off = clock.subscribe(() => {})
    vi.advanceTimersByTime(3000)
    const calls = source.mock.calls.length
    off()
    vi.advanceTimersByTime(3000)
    expect(source.mock.calls.length).toBe(calls)
  })
})
