import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { FeedHealth, alwaysOpen, createClock, feedActionsFor, formatAge, stalenessTier, type FeedDescriptor, type SessionCalendar } from "@/registry/tradecn/ui/feed-health"

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

describe("feed actions", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())
  const actions = [
    { id: "pause", label: "Pause", run: vi.fn() },
    { id: "reconnect", label: "Reconnect", run: vi.fn(), destructive: true },
    { id: "resubscribe", label: "Resubscribe", run: vi.fn() },
  ]

  it("offers a feed only the actions the server allows, in the consumer's order", () => {
    expect(feedActionsFor(feed({ allowedActions: ["reconnect", "pause"] }), actions).map((a) => a.id)).toEqual(["pause", "reconnect"])
    expect(feedActionsFor(feed(), actions)).toEqual([])
    expect(feedActionsFor(feed({ allowedActions: [] }), actions)).toEqual([])
    expect(feedActionsFor(feed({ allowedActions: ["pause"] }), undefined)).toEqual([])
  })

  it("draws the menu button for a feed with allowed actions and none for the rest, and no button without actions", () => {
    const clock = createClock(1000, () => 0)
    const { rerender } = render(<FeedHealth clock={clock} actions={actions} feeds={[feed({ allowedActions: ["pause"] }), feed({ id: "rfq", label: "RFQ" })]} />)
    expect(screen.getByRole("button", { name: "Actions: Market data" })).toHaveAttribute("data-feed-actions", "md")
    expect(screen.queryByRole("button", { name: "Actions: RFQ" })).toBeNull()
    rerender(<FeedHealth clock={clock} feeds={[feed({ allowedActions: ["pause"] })]} />)
    expect(screen.queryByRole("button", { name: "Actions: Market data" })).toBeNull()
  })

  it("marks a pressed action pending on the feed, with the tier untouched, until the feed's state moves", () => {
    const clock = createClock(1000, () => 5000)
    const run = vi.fn()
    const own = [{ id: "reconnect", label: "Reconnect", run }]
    const md = feed({ allowedActions: ["reconnect"], lastMessageAt: 5000 })
    function Harness({ feeds }: { feeds: FeedDescriptor[] }) {
      return <FeedHealth clock={clock} actions={own} feeds={feeds} pendingMs={60_000} />
    }
    const { rerender } = render(<Harness feeds={[md]} />)
    const item = () => document.querySelector<HTMLElement>('[data-feed="md"]')!
    expect(item().dataset.pending).toBeUndefined()
    // The press, through the consumer's menu.
    fireEvent.click(screen.getByRole("button", { name: "Actions: Market data" }))
    const menuItem = screen.getByRole("menuitem", { name: "Reconnect" })
    expect(menuItem.className).toContain("text-destructive")
    fireEvent.click(menuItem)
    expect(run).toHaveBeenCalledWith(md)
    expect(item().dataset.pending).toBe("reconnect")
    expect(item().dataset.tier).toBe("live")
    expect(item().querySelector("[data-feed-pending]")).toHaveTextContent("Reconnect")
    // The feed's state moves: the request is answered, whatever the answer.
    rerender(<Harness feeds={[{ ...md, state: "connecting" }]} />)
    expect(item().dataset.pending).toBeUndefined()
    expect(item().querySelector("[data-feed-pending]")).toBeNull()
  })

  it("lets the pending mark lapse after pendingMs, and settles it when the run's promise does", async () => {
    const clock = createClock(1000, () => 5000)
    let settle: () => void = () => {}
    const slow = { id: "pause", label: "Pause", run: vi.fn(() => new Promise<void>((resolve) => (settle = resolve))) }
    const quick = { id: "resubscribe", label: "Resubscribe", run: vi.fn() }
    render(<FeedHealth clock={clock} actions={[slow, quick]} feeds={[feed({ allowedActions: ["pause"], lastMessageAt: 5000 }), feed({ id: "rfq", label: "RFQ", allowedActions: ["resubscribe"], lastMessageAt: 5000 })]} pendingMs={3000} />)
    fireEvent.click(screen.getByRole("button", { name: "Actions: RFQ" }))
    fireEvent.click(screen.getByRole("menuitem", { name: "Resubscribe" }))
    const rfq = () => document.querySelector<HTMLElement>('[data-feed="rfq"]')!
    expect(rfq().dataset.pending).toBe("resubscribe")
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(rfq().dataset.pending).toBeUndefined()
    fireEvent.click(screen.getByRole("button", { name: "Actions: Market data" }))
    fireEvent.click(screen.getByRole("menuitem", { name: "Pause" }))
    const md = () => document.querySelector<HTMLElement>('[data-feed="md"]')!
    expect(md().dataset.pending).toBe("pause")
    await act(async () => {
      settle()
      await Promise.resolve()
    })
    expect(md().dataset.pending).toBeUndefined()
  })
})
