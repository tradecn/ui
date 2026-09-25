import { Activity, StrictMode, Suspense, createRef, useRef } from "react"
import { Separator } from "@/components/ui/separator"
import { Tooltip } from "@/components/ui/tooltip"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { FeedHealth, FeedHealthList, FeedHealthItem, FeedHealthIndicator, FeedHealthTier, FeedAge, FeedHealthLane, FeedHealthTooltipTrigger, FeedHealthTooltipContent, FeedHealthDetails, FeedHealthPending, FeedHealthAnnouncer, useFeedActions, useFeedActionMenu, type FeedAction, type FeedHealthOptions, alwaysOpen, createClock, feedActionsFor, formatAge, stalenessTier, type FeedDescriptor, type SessionCalendar } from "@/registry/tradecn/ui/feed-health"

function Strip({ feeds, actions = [], pendingMs, ...options }: FeedHealthOptions & { feeds: FeedDescriptor[]; actions?: FeedAction[]; pendingMs?: number }) {
  return <FeedHealth feeds={feeds} {...options}>
    <FeedHealthList>{(feed, index) => <div>
      {index > 0 && <Separator orientation="vertical" />}
      <Row feed={feed} actions={actions} pendingMs={pendingMs} />
    </div>}</FeedHealthList>
    <FeedHealthAnnouncer />
  </FeedHealth>
}

function Row({ feed, actions, pendingMs }: { feed: FeedDescriptor; actions: FeedAction[]; pendingMs?: number }) {
  const { actions: offered, pending, pendingLabel, run } = useFeedActions(feed, actions, { pendingMs })
  return <FeedHealthItem feed={feed} pending={pending}>
    <Tooltip>
      <FeedHealthTooltipTrigger><span>{feed.label}</span><FeedHealthIndicator className="order-first" /><FeedHealthTier /><FeedAge feed={feed} /><FeedHealthLane /><FeedHealthPending>{pendingLabel}</FeedHealthPending></FeedHealthTooltipTrigger>
      <FeedHealthTooltipContent><FeedHealthDetails>{pending && <><dt>Pending</dt><dd>{pendingLabel}</dd></>}</FeedHealthDetails></FeedHealthTooltipContent>
    </Tooltip>
    {offered.length > 0 && <DropdownMenu>
      <DropdownMenuTrigger aria-label={`Actions: ${feed.label}`} data-feed-actions={feed.id} />
      <DropdownMenuContent>{offered.map((action) => <DropdownMenuItem key={action.id} disabled={Boolean(pending)} className={action.destructive ? "text-destructive" : undefined} onClick={() => run(action.id)}>{action.label}</DropdownMenuItem>)}</DropdownMenuContent>
    </DropdownMenu>}
  </FeedHealthItem>
}

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
      return <Strip feeds={[feed()]} thresholds={T} clock={clock} />
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
    expect(item().querySelector("button")).toHaveClass("bg-stale-soft")
    expect(live()).toHaveTextContent("Market data stale, 10s")
    expect(parentRenders).toBe(1)
  })

  it("shows drops on a coalesced lane and the gap with a spinner on an ordered lane", () => {
    const clock = createClock(1000, () => t)
    t = 5000
    render(
      <Strip
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
    const off = clock.subscribe(() => { })
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
    const { rerender } = render(<Strip clock={clock} actions={actions} feeds={[feed({ allowedActions: ["pause"] }), feed({ id: "rfq", label: "RFQ" })]} />)
    expect(screen.getByRole("button", { name: "Actions: Market data" })).toHaveAttribute("data-feed-actions", "md")
    expect(screen.queryByRole("button", { name: "Actions: RFQ" })).toBeNull()
    rerender(<Strip clock={clock} feeds={[feed({ allowedActions: ["pause"] })]} />)
    expect(screen.queryByRole("button", { name: "Actions: Market data" })).toBeNull()
  })

  it("marks a pressed action pending on the feed, with the tier untouched, until the feed's state moves", () => {
    const clock = createClock(1000, () => 5000)
    const run = vi.fn()
    const own = [{ id: "reconnect", label: "Reconnect", run, destructive: true }]
    const md = feed({ allowedActions: ["reconnect"], lastMessageAt: 5000 })
    function Harness({ feeds }: { feeds: FeedDescriptor[] }) {
      return <Strip clock={clock} actions={own} feeds={feeds} pendingMs={60_000} />
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
    let settle: () => void = () => { }
    const slow = { id: "pause", label: "Pause", run: vi.fn(() => new Promise<void>((resolve) => (settle = resolve))) }
    const quick = { id: "resubscribe", label: "Resubscribe", run: vi.fn() }
    render(<Strip clock={clock} actions={[slow, quick]} feeds={[feed({ allowedActions: ["pause"], lastMessageAt: 5000 }), feed({ id: "rfq", label: "RFQ", allowedActions: ["resubscribe"], lastMessageAt: 5000 })]} pendingMs={3000} />)
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


describe("public composition", () => {
  it("keys list rows by feed id across reordered and replaced descriptors, and releases removed requests", () => {
    vi.useFakeTimers()
    const clock = { now: () => 5000, subscribe: () => () => { } }
    const run = vi.fn()
    const actions = [{ id: "resubscribe", label: "Resubscribe", run }]
    const md = feed({ lastMessageAt: 5000, allowedActions: ["resubscribe"] })
    const rfq = feed({ id: "rfq", label: "RFQ", lastMessageAt: 5000, allowedActions: ["resubscribe"] })
    function ActionRow({ feed }: { feed: FeedDescriptor }) {
      const health = useFeedActions(feed, actions, { clock })
      return <FeedHealthItem feed={feed} pending={health.pending}>
        <input aria-label={`Note: ${feed.id}`} defaultValue="" />
        <button onClick={() => health.run("resubscribe")}>{feed.label}</button>
      </FeedHealthItem>
    }
    function App({ feeds }: { feeds: readonly FeedDescriptor[] }) {
      return <StrictMode><FeedHealth feeds={feeds} clock={clock}>
        <FeedHealthList>{(feed) => <ActionRow feed={feed} />}</FeedHealthList>
        <FeedHealthAnnouncer />
      </FeedHealth></StrictMode>
    }
    const { rerender, unmount } = render(<App feeds={[md, rfq]} />)
    const note = screen.getByRole("textbox", { name: "Note: md" })
    fireEvent.change(note, { target: { value: "Keep this note" } })
    fireEvent.click(screen.getByRole("button", { name: "Market data" }))
    note.focus()
    rerender(<App feeds={[{ ...rfq }, { ...md, label: "Prices" }]} />)
    expect([...document.querySelectorAll("[data-feed]")].map((item) => item.getAttribute("data-feed"))).toEqual(["rfq", "md"])
    expect(screen.getByRole("textbox", { name: "Note: md" })).toBe(note)
    expect(note).toHaveValue("Keep this note")
    expect(note).toHaveFocus()
    expect(document.querySelector('[data-feed="md"]')).toHaveAttribute("data-pending", "resubscribe")
    expect(document.querySelector('[data-feed="rfq"]')).not.toHaveAttribute("data-pending")
    fireEvent.click(screen.getByRole("button", { name: "Prices" }))
    expect(run).toHaveBeenCalledOnce()
    expect(document.querySelector("[aria-live]")).toBeEmptyDOMElement()
    rerender(<App feeds={[rfq]} />)
    expect(vi.getTimerCount()).toBe(0)
    rerender(<App feeds={[rfq, md]} />)
    expect(screen.getByRole("textbox", { name: "Note: md" })).toHaveValue("")
    expect(document.querySelector('[data-feed="md"]')).not.toHaveAttribute("data-pending")
    expect(document.querySelector("[aria-live]")).toHaveTextContent("Market data live")
    unmount()
    vi.useRealTimers()
  })

  it("uses the nearest collection, keeps empty roots independent, and allows an explicit announcer collection", () => {
    const outer = feed({ lastMessageAt: 5000 })
    const inner = feed({ id: "rfq", label: "RFQ", lastMessageAt: 5000 })
    const clock = { now: () => 5000, subscribe: () => () => { } }
    const list = createRef<HTMLDivElement>()
    const click = vi.fn()
    function App({ feeds }: { feeds: readonly FeedDescriptor[] }) {
      return <FeedHealth feeds={feeds} clock={clock}>
        <FeedHealthList ref={list} className="flex-col" title="Outer rows" onClick={click}>{(feed, index) => <button>{index}: {feed.label}</button>}</FeedHealthList>
        <FeedHealthAnnouncer data-testid="outer-announcer" />
        <FeedHealth feeds={[inner]}>
          <FeedHealthList>{(feed) => <p>{feed.label}</p>}</FeedHealthList>
          <FeedHealthAnnouncer data-testid="inner-announcer" />
          <FeedHealthAnnouncer feeds={[]} data-testid="explicit-announcer" />
        </FeedHealth>
        <FeedHealth>
          <FeedHealthList data-testid="empty-list">{(feed) => <p>{feed.label}</p>}</FeedHealthList>
          <FeedHealthAnnouncer data-testid="empty-announcer" />
          <p>No feeds configured.</p>
        </FeedHealth>
      </FeedHealth>
    }
    const { rerender } = render(<App feeds={[outer]} />)
    expect(list.current).toHaveAttribute("data-slot", "tradecn-feed-health-list")
    expect(list.current).toHaveAttribute("title", "Outer rows")
    expect(list.current).toHaveClass("flex-col")
    fireEvent.click(screen.getByRole("button", { name: "0: Market data" }))
    expect(click).toHaveBeenCalledOnce()
    expect(screen.getByText("RFQ")).toBeVisible()
    expect(screen.getByTestId("empty-list")).toBeEmptyDOMElement()
    expect(screen.getByText("No feeds configured.")).toBeVisible()
    rerender(<App feeds={[{ ...outer, state: "disconnected" }]} />)
    expect(screen.getByTestId("outer-announcer")).toHaveTextContent("Market data offline")
    for (const id of ["inner-announcer", "explicit-announcer", "empty-announcer"]) expect(screen.getByTestId(id)).toBeEmptyDOMElement()
  })

  it("reports missing collection context instead of silently dropping requested rows or announcements", () => {
    expect(() => render(<FeedHealthList>{(feed) => <p>{feed.label}</p>}</FeedHealthList>)).toThrow("FeedHealthList must be inside FeedHealth")
    expect(() => render(<FeedHealthAnnouncer />)).toThrow("FeedHealthAnnouncer needs feeds or a FeedHealth parent")
  })

  it("forwards native props, refs, children and events, and supports a card without a tooltip", () => {
    const root = createRef<HTMLDivElement>()
    const item = createRef<HTMLDivElement>()
    const age = createRef<HTMLSpanElement>()
    const onClick = vi.fn()
    const clock = { now: () => 5000, subscribe: () => () => { } }
    const md = feed({ lastMessageAt: 5000, dropped: 7 })
    render(<FeedHealth ref={root} aria-label="Connections" className="grid" clock={clock}>
      <h2>My venue</h2>
      <FeedHealthItem ref={item} feed={md} className="flex-col" onClick={onClick} title="Feed card">
        <header><span>{md.label}</span><FeedHealthTier>Fresh</FeedHealthTier></header>
        <FeedHealthDetails><dt>Region</dt><dd>Chicago</dd></FeedHealthDetails>
        <footer><FeedAge ref={age} feed={md} title="Data age" /><FeedHealthLane /><a href="#logs">Open logs</a></footer>
      </FeedHealthItem>
      <p>No other feeds.</p>
    </FeedHealth>)
    expect(screen.getByRole("group", { name: "Connections" })).toBe(root.current)
    expect(root.current).toHaveClass("grid")
    expect(item.current).toHaveClass("flex-col")
    expect(item.current).toHaveTextContent("Fresh")
    expect(item.current).toHaveTextContent("Chicago")
    expect(age.current).toHaveTextContent("now")
    expect(age.current).toHaveAttribute("aria-hidden", "true")
    fireEvent.click(screen.getByRole("link", { name: "Open logs" }))
    expect(onClick).toHaveBeenCalledOnce()
    expect(document.querySelector("[aria-live]")).toBeNull()
  })

  it("retains state and tier words in a compact composition", () => {
    render(<FeedHealth><FeedHealthItem feed={feed({ state: "unknown", lastMessageAt: null })}>
      <FeedHealthIndicator /><span>Market data</span><FeedHealthTier className="sr-only" />
    </FeedHealthItem></FeedHealth>)
    expect(screen.getByText("unknown")).toHaveClass("sr-only")
    expect(screen.getByText("aging")).toHaveClass("sr-only")
  })

  it("keeps the root and non-subscribing item children from ticking and releases all subscriptions", () => {
    vi.useFakeTimers()
    let now = 0
    const clock = createClock(1000, () => now)
    let rowRenders = 0
    let listRenders = 0
    function StaticContent() { rowRenders++; return <span>Application content</span> }
    const { unmount } = render(<FeedHealth feeds={[feed()]} clock={clock}>
      <FeedHealthList>{(feed) => {
        listRenders++
        return <FeedHealthItem feed={feed}><StaticContent /><FeedHealthTier /><FeedAge feed={feed} /></FeedHealthItem>
      }}</FeedHealthList>
      <FeedHealthAnnouncer />
    </FeedHealth>)
    act(() => { now = 10_000; vi.advanceTimersByTime(10_000) })
    expect(screen.getByText("stale")).toBeVisible()
    expect(rowRenders).toBe(1)
    expect(listRenders).toBe(1)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
    vi.useRealTimers()
  })

  it("announces additions and tier changes together, with arbitrary IDs, but not labels, order, removals or age ticks", () => {
    const clock = { now: () => 5000, subscribe: () => () => { } }
    const one = feed({ id: "a|b=c", lastMessageAt: 5000 })
    const two = feed({ id: "a", label: "RFQ", lastMessageAt: 5000 })
    const { rerender } = render(<FeedHealthAnnouncer feeds={[one]} clock={clock} />)
    const live = document.querySelector("[aria-live]")!
    expect(live).toBeEmptyDOMElement()
    rerender(<FeedHealthAnnouncer feeds={[{ ...one, state: "disconnected" }, { ...two, lastMessageAt: 0 }]} clock={clock} />)
    expect(live).toHaveTextContent("Market data offline. RFQ aging, 5s")
    rerender(<FeedHealthAnnouncer feeds={[{ ...two, label: "Renamed", lastMessageAt: 0 }, { ...one, state: "disconnected" }]} clock={clock} />)
    expect(live).toHaveTextContent("Market data offline. RFQ aging, 5s")
    rerender(<FeedHealthAnnouncer feeds={[]} clock={clock} />)
    expect(live).toHaveTextContent("Market data offline. RFQ aging, 5s")
  })

  it("updates the live region when a removed feed returns with identical announcement text", async () => {
    const clock = { now: () => 5000, subscribe: () => () => {} }
    const offline = feed({ state: "disconnected" })
    const { rerender } = render(<FeedHealthAnnouncer feeds={[]} clock={clock} />)
    const live = document.querySelector("[aria-live]")!
    rerender(<FeedHealthAnnouncer feeds={[offline]} clock={clock} />)
    expect(live).toHaveTextContent("Market data offline")
    rerender(<FeedHealthAnnouncer feeds={[]} clock={clock} />)
    const added: string[] = []
    const observer = new MutationObserver((records) => {
      for (const record of records) for (const node of record.addedNodes) added.push(node.textContent ?? "")
    })
    observer.observe(live, { childList: true, subtree: true })
    await act(async () => { rerender(<FeedHealthAnnouncer feeds={[offline]} clock={clock} />) })
    observer.disconnect()
    expect(added).toContain("Market data offline")
    expect(document.querySelector("[aria-live]")).toBe(live)
  })

  it("clamps a future timestamp and supports a standalone age with native span props", () => {
    render(<FeedAge feed={feed({ lastMessageAt: 9000 })} clock={{ now: () => 5000, subscribe: () => () => { } }} aria-label="Age" />)
    expect(screen.getByLabelText("Age")).toHaveTextContent("now")
  })
})

describe("useFeedActions", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())
  const clock = { now: () => 5000, subscribe: vi.fn(() => () => { }) }
  const md = feed({ allowedActions: ["pause", "reconnect"] })

  it.each([false, true])("timestamps a standalone request without subscribing or changing snapshots (previous subscriber: %s)", (previousSubscriber) => {
    let time = 1000
    const clock = createClock(1000, () => time)
    if (previousSubscriber) clock.subscribe(() => {})()
    const subscribe = vi.spyOn(clock, "subscribe")
    const { result } = renderHook(() => useFeedActions(md, [{ id: "pause", label: "Pause", run: () => {} }], { clock }))
    time = 60_000
    act(() => result.current.run("pause"))
    expect(result.current.pending?.since).toBe(60_000)
    expect(subscribe).not.toHaveBeenCalled()
    expect(clock.now()).toBe(1000)
    expect(vi.getTimerCount()).toBe(1)
    act(() => vi.advanceTimersByTime(5000))
    expect(result.current.pending).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })

  it("rechecks current permissions, action definitions and feed data even through a saved run callback", () => {
    const oldRun = vi.fn()
    const newRun = vi.fn()
    const initialProps = { feed: md, actions: [{ id: "pause", label: "Pause", run: oldRun }] }
    const { result, rerender } = renderHook(({ feed, actions }) => useFeedActions(feed, actions, { clock }), { initialProps })
    const run = result.current.run
    rerender({ feed: { ...md, allowedActions: [] }, actions: initialProps.actions })
    act(() => run("pause"))
    expect(oldRun).not.toHaveBeenCalled()
    rerender({ feed: md, actions: [] })
    act(() => run("pause"))
    expect(oldRun).not.toHaveBeenCalled()
    const currentFeed = { ...md, seq: 99 }
    rerender({ feed: currentFeed, actions: [{ id: "pause", label: "Pause now", run: newRun }] })
    act(() => { run("pause"); run("pause"); run("reconnect") })
    expect(newRun).toHaveBeenCalledExactlyOnceWith(currentFeed)
    expect(result.current.pendingLabel).toBe("Pause now")
    expect(result.current.pending?.since).toBe(5000)
    expect(clock.subscribe).not.toHaveBeenCalled()
  })

  it("does not let an old promise or timer clear a newer request in the same clock tick", async () => {
    const resolves: (() => void)[] = []
    const actions = [{ id: "pause", label: "Pause", run: () => new Promise<void>((resolve) => resolves.push(resolve)) }]
    const { result, rerender } = renderHook(({ feed }) => useFeedActions(feed, actions, { clock, pendingMs: 1000 }), { initialProps: { feed: md } })
    act(() => result.current.run("pause"))
    act(() => vi.advanceTimersByTime(500))
    rerender({ feed: { ...md, state: "connecting" } })
    act(() => result.current.run("pause"))
    await act(async () => { resolves[0]!(); await Promise.resolve() })
    expect(result.current.pending?.state).toBe("connecting")
    act(() => vi.advanceTimersByTime(500))
    expect(result.current.pending).not.toBeNull()
    await act(async () => { resolves[1]!(); await Promise.resolve() })
    expect(result.current.pending).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })

  it("invalidates requests on identity changes and removal, and ignores late settlements after remount", async () => {
    let settle: () => void = () => { }
    const action = { id: "pause", label: "Pause", run: vi.fn(() => new Promise<void>((resolve) => { settle = resolve })) }
    const { result, rerender, unmount } = renderHook(({ feed }) => useFeedActions(feed, [action], { clock }), { initialProps: { feed: md } })
    const run = result.current.run
    act(() => run("pause"))
    const oldSettle = settle
    rerender({ feed: { ...md, id: "new" } })
    expect(result.current.pending).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
    act(() => run("pause"))
    await act(async () => { oldSettle(); await Promise.resolve() })
    expect(result.current.pending).not.toBeNull()
    unmount()
    expect(vi.getTimerCount()).toBe(0)
    const next = renderHook(() => useFeedActions(md, [action], { clock }))
    const removedSettle = settle
    act(() => next.result.current.run("pause"))
    await act(async () => { removedSettle(); await Promise.resolve() })
    expect(next.result.current.pending).not.toBeNull()
    act(() => run("pause"))
    expect(action.run).toHaveBeenCalledTimes(3)
  })

  it("settles throws and rejections, while void waits for the original timeout", async () => {
    const actions: FeedAction[] = [{ id: "pause", label: "Pause", run: () => { throw new Error("failed") } }]
    const { result, rerender } = renderHook(({ actions, pendingMs }) => useFeedActions(md, actions, { clock, pendingMs }), { initialProps: { actions, pendingMs: 1000 } })
    act(() => result.current.run("pause"))
    expect(result.current.pending).toBeNull()
    rerender({ actions: [{ ...actions[0]!, run: () => Promise.reject(new Error("failed")) }], pendingMs: 1000 })
    await act(async () => { result.current.run("pause"); await Promise.resolve() })
    expect(result.current.pending).toBeNull()
    rerender({ actions: [{ ...actions[0]!, run: () => { } }], pendingMs: 1000 })
    act(() => result.current.run("pause"))
    rerender({ actions, pendingMs: 5000 })
    act(() => vi.advanceTimersByTime(1000))
    expect(result.current.pending).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(["activity", "suspense"])("clears pending when %s hides its owner and ignores the canceled reply after reveal", async (boundary) => {
    const replies: (() => void)[] = []
    const actions = [{ id: "pause", label: "Pause", run: () => new Promise<void>((resolve) => replies.push(resolve)) }]
    function Row({ descriptor }: { descriptor: FeedDescriptor }) {
      const health = useFeedActions(descriptor, actions, { clock, pendingMs: 1000 })
      return <><button onClick={() => health.run("pause")}>Pause</button><output aria-label="Pending request">{health.pending?.action ?? "idle"}</output></>
    }
    const gate = new Promise<void>(() => {})
    function Sibling({ hidden }: { hidden: boolean }) {
      if (hidden) throw gate
      return null
    }
    function App({ hidden, descriptor = md }: { hidden: boolean; descriptor?: FeedDescriptor }) {
      return boundary === "activity"
        ? <Activity mode={hidden ? "hidden" : "visible"}><Row descriptor={descriptor} /></Activity>
        : <Suspense fallback={<p>Loading</p>}><Row descriptor={descriptor} /><Sibling hidden={hidden} /></Suspense>
    }
    const { rerender } = render(<App hidden={false} />, { wrapper: StrictMode })
    fireEvent.click(screen.getByRole("button", { name: "Pause" }))
    expect(screen.getByLabelText("Pending request")).toHaveTextContent("pause")
    rerender(<App hidden />)
    expect(vi.getTimerCount()).toBe(0)
    rerender(<App hidden={false} />)
    expect(screen.getByLabelText("Pending request")).toHaveTextContent("idle")
    fireEvent.click(screen.getByRole("button", { name: "Pause" }))
    await act(async () => { replies[0]!() })
    expect(screen.getByLabelText("Pending request")).toHaveTextContent("pause")
    await act(async () => { replies[1]!() })
    expect(screen.getByLabelText("Pending request")).toHaveTextContent("idle")
    fireEvent.click(screen.getByRole("button", { name: "Pause" }))
    act(() => vi.advanceTimersByTime(1000))
    expect(screen.getByLabelText("Pending request")).toHaveTextContent("idle")
    rerender(<App hidden={false} descriptor={{ ...md, state: "connecting" }} />)
    rerender(<App hidden={false} />)
    expect(screen.getByLabelText("Pending request")).toHaveTextContent("idle")
  })

  it("shares pending between custom controls while other feed owners remain usable", () => {
    const run = vi.fn()
    const actions = [{ id: "pause", label: "Pause", run }]
    function Controls({ feed: descriptor }: { feed: FeedDescriptor }) {
      const health = useFeedActions(descriptor, actions, { clock })
      return <div><button onClick={() => health.run("pause")} disabled={Boolean(health.pending)}>Menu {descriptor.id}</button><button onClick={() => health.run("pause")} disabled={Boolean(health.pending)}>Card {descriptor.id}</button></div>
    }
    render(<><Controls feed={md} /><Controls feed={{ ...md, id: "rfq" }} /></>)
    fireEvent.click(screen.getByRole("button", { name: "Card md" }))
    expect(screen.getByRole("button", { name: "Menu md" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Card md" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Menu rfq" })).toBeEnabled()
    fireEvent.click(screen.getByRole("button", { name: "Menu rfq" }))
    expect(run).toHaveBeenCalledTimes(2)
  })
})

describe("useFeedActionMenu", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  function Menu({ hasActions }: { hasActions: boolean }) {
    const fallback = useRef<HTMLHeadingElement>(null)
    const menu = useFeedActionMenu({ hasActions, fallbackRef: fallback })
    return <>
      <h2 ref={fallback} tabIndex={-1}>Feed reading</h2>
      {menu.mounted && <>
        <button {...menu.triggerProps} onClick={() => menu.menuProps.onOpenChange(true)}>Actions</button>
        {menu.menuProps.open && <div {...menu.contentProps} role="menu">
          <button onClick={() => menu.menuProps.onOpenChange(false)}>Close menu</button>
        </div>}
      </>}
      <button>Elsewhere</button>
    </>
  }

  function closingMenu() {
    const view = render(<Menu hasActions />, { wrapper: StrictMode })
    fireEvent.click(screen.getByRole("button", { name: "Actions" }))
    act(() => screen.getByRole("button", { name: "Close menu" }).focus())
    view.rerender(<Menu hasActions={false} />)
    expect(screen.getByRole("menu")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Close menu" }))
    expect(screen.getByRole("button", { name: "Actions" })).toBeInTheDocument()
    return view
  }

  it("retains an empty focused trigger until focus leaves, without a FeedHealth provider", () => {
    const { rerender } = render(<Menu hasActions={false} />)
    expect(screen.queryByRole("button", { name: "Actions" })).not.toBeInTheDocument()
    rerender(<Menu hasActions />)
    act(() => screen.getByRole("button", { name: "Actions" }).focus())
    rerender(<Menu hasActions={false} />)
    expect(screen.getByRole("button", { name: "Actions" })).toHaveFocus()
    act(() => screen.getByRole("button", { name: "Elsewhere" }).focus())
    expect(screen.queryByRole("button", { name: "Actions" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Elsewhere" })).toHaveFocus()
    expect(vi.getTimerCount()).toBe(0)
  })

  it("retains an empty open menu through dismissal and recovers lost focus to the caller's heading", () => {
    closingMenu()
    expect(screen.getByRole("heading")).not.toHaveFocus()
    act(() => vi.runOnlyPendingTimers())
    expect(screen.getByRole("heading")).toHaveFocus()
    expect(screen.queryByRole("button", { name: "Actions" })).not.toBeInTheDocument()
    expect(vi.getTimerCount()).toBe(0)
  })

  it("recovers focus when the primitive returns it to the disappearing trigger", () => {
    closingMenu()
    act(() => screen.getByRole("button", { name: "Actions" }).focus())
    act(() => vi.runOnlyPendingTimers())
    expect(screen.getByRole("heading")).toHaveFocus()
    expect(screen.queryByRole("button", { name: "Actions" })).not.toBeInTheDocument()
  })

  it("preserves an explicit destination reached before dismissal finishes", () => {
    closingMenu()
    act(() => screen.getByRole("button", { name: "Elsewhere" }).focus())
    act(() => vi.runOnlyPendingTimers())
    expect(screen.getByRole("button", { name: "Elsewhere" })).toHaveFocus()
    expect(screen.queryByRole("button", { name: "Actions" })).not.toBeInTheDocument()
  })

  it("leaves another document's focus alone", () => {
    closingMenu()
    vi.spyOn(document, "hasFocus").mockReturnValue(false)
    act(() => vi.runOnlyPendingTimers())
    expect(screen.getByRole("heading")).not.toHaveFocus()
    expect(screen.queryByRole("button", { name: "Actions" })).not.toBeInTheDocument()
  })

  it("cancels deferred recovery when the menu reopens or unmounts", () => {
    const { unmount } = closingMenu()
    fireEvent.click(screen.getByRole("button", { name: "Actions" }))
    expect(vi.getTimerCount()).toBe(0)
    act(() => vi.runOnlyPendingTimers())
    expect(screen.getByRole("menu")).toBeInTheDocument()
    expect(screen.getByRole("heading")).not.toHaveFocus()
    fireEvent.click(screen.getByRole("button", { name: "Close menu" }))
    expect(vi.getTimerCount()).toBe(1)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it("keeps a restored action menu without moving focus to the fallback", () => {
    const { rerender } = closingMenu()
    act(() => screen.getByRole("button", { name: "Actions" }).focus())
    rerender(<Menu hasActions />)
    act(() => vi.runOnlyPendingTimers())
    expect(screen.getByRole("button", { name: "Actions" })).toHaveFocus()
    expect(screen.getByRole("heading")).not.toHaveFocus()
    fireEvent.click(screen.getByRole("button", { name: "Actions" }))
    expect(screen.getByRole("menu")).toBeInTheDocument()
  })
})
