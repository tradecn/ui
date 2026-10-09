import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { createRef, StrictMode, type ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createClock } from "@/registry/tradecn/lib/clock"
import { NULL_TOKEN } from "@/registry/tradecn/lib/format"
import { DEFAULT_STATUS_BAR_LABELS, STATUS_TONE_CLASS, StatusBar, StatusBarEnvironmentBadge, StatusBarClocks, StatusBarClockReadout, StatusBarUser, clockFormat, formatClock } from "@/registry/tradecn/ui/status-bar"

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// 2026-09-22T14:30:05Z: 10:30:05 in New York, 15:30:05 in London, 23:30:05 in Tokyo.
const T = Date.UTC(2026, 8, 22, 14, 30, 5)

describe("the clocks", () => {
  it("prints a zone's time in lining figures, caches the formatter, and prints the null token for a zone it does not know", () => {
    expect(formatClock(T, { label: "NY", zone: "America/New_York" })).toBe("10:30:05")
    expect(formatClock(T, { label: "LDN", zone: "Europe/London" })).toBe("15:30:05")
    expect(formatClock(T, { label: "TKO", zone: "Asia/Tokyo", seconds: false })).toBe("23:30")
    expect(formatClock(T, { label: "NY", zone: "America/New_York", hourCycle: "h12" })).toMatch(/^10:30:05/)
    expect(clockFormat("Europe/London")).toBe(clockFormat("Europe/London"))
    expect(clockFormat("Nowhere/Land")).toBeNull()
    expect(formatClock(T, { label: "?", zone: "Nowhere/Land" })).toBe(NULL_TOKEN)
  })

  it("ticks on the clock it is given, once a second for every readout at once", () => {
    vi.useFakeTimers()
    let t = T
    const clock = createClock(1000, () => t)
    render(<StatusBar><StatusBarClocks><StatusBarClockReadout label="New York" zone="America/New_York" source={clock} /><StatusBarClockReadout label="London" zone="Europe/London" source={clock} /></StatusBarClocks></StatusBar>)
    const ny = screen.getByTitle("America/New_York")
    const ldn = screen.getByTitle("Europe/London")
    expect(within(ny).getByText("10:30:05")).toBeInTheDocument()
    expect(within(ldn).getByText("15:30:05")).toBeInTheDocument()
    act(() => {
      t += 1000
      vi.advanceTimersByTime(1000)
    })
    expect(within(ny).getByText("10:30:06")).toBeInTheDocument()
    expect(within(ldn).getByText("15:30:06")).toBeInTheDocument()
    expect(ny.querySelector("time")).toHaveAttribute("dateTime", new Date(T + 1000).toISOString())
    expect(ny.querySelector("[data-status-time]")?.className).toContain("lining-nums")
    expect(screen.getByRole("group", { name: "Clocks" })).toBeInTheDocument()
  })
})

describe("StatusBar", () => {
  it("preserves the terminal composition, environment tone, user and application wrappers", () => {
    render(<StatusBar data-environment="PRODUCTION">
      <StatusBarEnvironmentBadge label="PRODUCTION" tone="destructive" />
      <div data-status-slot="left">feeds</div><div data-status-slot="center">middle</div>
      <StatusBarUser user="jdoe" /><div data-status-slot="right">frames</div>
    </StatusBar>)
    const bar = screen.getByRole("group", { name: "Status" })
    expect(bar.dataset.slot).toBe("tradecn-status-bar")
    expect(bar.dataset.environment).toBe("PRODUCTION")
    const env = bar.querySelector<HTMLElement>("[data-status-environment]")!
    expect(env).toHaveTextContent("PRODUCTION")
    expect(env.dataset.tone).toBe("destructive")
    expect(env.className).toContain(STATUS_TONE_CLASS.destructive)
    // Every tone is a tint behind foreground text: a tone's own color on its tint doesn't read at 4.5 to 1. The tint is a
    // background image, which a badge style's own dark background can't paint over.
    for (const tone of Object.values(STATUS_TONE_CLASS)) expect(tone).toMatch(/^text-foreground bg-\[linear-gradient\(/)
    expect(within(env).getByText("Environment:")).toHaveClass("sr-only")
    const user = bar.querySelector<HTMLElement>("[data-status-user]")!
    expect(user).toHaveTextContent("jdoe")
    expect(user).toHaveAttribute("title", "Signed in as jdoe")
    expect(bar.querySelector("[data-status-slot='left']")).toHaveTextContent("feeds")
    expect(bar.querySelector("[data-status-slot='center']")).toHaveTextContent("middle")
    expect(bar.querySelector("[data-status-slot='right']")).toHaveTextContent("frames")
    // In order: the environment first, the user after the clocks, your right slot last.
    const order = [...bar.children].map((el) => (el as HTMLElement).dataset.statusSlot ?? (el as HTMLElement).dataset.statusEnvironment ?? (el as HTMLElement).dataset.statusUser)
    expect(order).toEqual(["PRODUCTION", "left", "center", "jdoe", "right"])
  })

  it("omits absent parts and localizes readings independently", () => {
    render(<StatusBar aria-label="Statusleiste"><StatusBarEnvironmentBadge label="UAT" prefix="Umgebung" /><StatusBarUser user="jdoe" prefix="Angemeldet als" /></StatusBar>)
    const bar = screen.getByRole("group", { name: "Statusleiste" })
    expect(bar.querySelector("[data-status-slot='left']")).toBeNull()
    expect(bar.querySelector("[data-status-slot='right']")).toBeNull()
    expect(bar.querySelector("[data-status-slot='clocks']")).toBeNull()
    expect(within(bar).getByText("Umgebung:")).toBeInTheDocument()
    expect(bar.querySelector("[data-status-user]")).toHaveAttribute("title", "Angemeldet als jdoe")
    const plain = bar.querySelector<HTMLElement>("[data-status-environment]")!
    expect(plain.dataset.tone).toBeUndefined()
    for (const tone of Object.values(STATUS_TONE_CLASS)) expect(plain.className).not.toContain(tone)
    expect(DEFAULT_STATUS_BAR_LABELS.title).toBe("Status")
  })
})


describe("public composition", () => {
  it("forwards native props, refs and events and permits independent reading order", () => {
    const root = createRef<HTMLDivElement>(), clocks = createRef<HTMLDivElement>()
    const env = createRef<HTMLSpanElement>(), user = createRef<HTMLSpanElement>(), clock = createRef<HTMLSpanElement>()
    const key = vi.fn(), click = vi.fn()
    render(<StatusBar id="desk" ref={root} aria-labelledby="desk-name" className="grid" onKeyDown={key}>
      <h2 id="desk-name">Desk</h2>
      <StatusBarUser ref={user} user="ana" className="font-bold" title="Operator" onClick={click} />
      <StatusBarClocks ref={clocks} aria-label="Markets" className="grid">
        <StatusBarClockReadout ref={clock} label="UTC" zone="UTC" title="Coordinated time" className="justify-between" />
      </StatusBarClocks>
      <button type="button">Reconnect</button>
      <StatusBarEnvironmentBadge ref={env} label="UAT" className="rounded" title="Testing" />
    </StatusBar>)
    expect(root.current).toBe(screen.getByRole("group", { name: "Desk" }))
    expect(root.current).toHaveClass("grid")
    expect(clocks.current).toBe(screen.getByRole("group", { name: "Markets" }))
    expect(env.current).toBe(screen.getByTitle("Testing"))
    expect(user.current).toBe(screen.getByTitle("Operator"))
    expect(clock.current).toBe(screen.getByTitle("Coordinated time"))
    expect(clock.current).toHaveClass("justify-between")
    fireEvent.click(user.current!)
    fireEvent.keyDown(screen.getByRole("button"), { key: "Enter" })
    expect(click).toHaveBeenCalledOnce()
    expect(key).toHaveBeenCalledOnce()
    expect(root.current?.lastElementChild).toBe(env.current)
    expect(root.current?.querySelector("[aria-live], [role=status]")).toBeNull()
  })

  it("keeps ticking local, switches sources, and cleans up the last subscription in StrictMode", () => {
    vi.useFakeTimers()
    let t = T
    const first = createClock(1000, () => t), second = createClock(500, () => t + 5000)
    const sibling = vi.fn(() => <button type="button">Account</button>)
    function Sibling() { return sibling() }
    function Layout({ source = first, count = 2 }) {
      return <StrictMode><StatusBar><Sibling />{Array.from({ length: count }, (_, i) => <StatusBarClockReadout key={i} label={`Market ${i}`} zone="UTC" source={source} seconds={i === 0} />)}</StatusBar></StrictMode>
    }
    const view = render(<Layout />)
    const rendered = sibling.mock.calls.length
    expect(vi.getTimerCount()).toBe(1)
    act(() => { t += 1000; vi.advanceTimersByTime(1000) })
    expect(sibling).toHaveBeenCalledTimes(rendered)
    expect(screen.getByText("14:30:06")).toBeInTheDocument()
    view.rerender(<Layout source={second} count={1} />)
    expect(vi.getTimerCount()).toBe(1)
    expect(screen.getByText("14:30:11")).toBeInTheDocument()
    view.rerender(<Layout count={0} />)
    expect(vi.getTimerCount()).toBe(0)
    view.rerender(<Layout count={1} />)
    expect(vi.getTimerCount()).toBe(1)
    view.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it("updates clock options and standalone readings without a root", () => {
    const source = createClock(1000, () => T)
    const view = render(<StatusBarClockReadout label="NY" zone="America/New_York" source={source} />)
    expect(screen.getByText("10:30:05")).toBeInTheDocument()
    view.rerender(<StatusBarClockReadout label="Tokyo" zone="Asia/Tokyo" seconds={false} source={source} />)
    expect(screen.getByText("23:30")).toBeInTheDocument()
    view.rerender(<StatusBarClockReadout label="Unknown" zone="Nowhere/Land" source={source} />)
    expect(screen.getByText(NULL_TOKEN)).toBeInTheDocument()
    expect(screen.getByTitle("Nowhere/Land").querySelector("time")).toHaveAttribute("dateTime", new Date(T).toISOString())
    expect(() => formatClock(NaN, { label: "UTC", zone: "UTC" })).toThrow(RangeError)
    expect(formatClock(NaN, { label: "?", zone: "Nowhere/Land" })).toBe(NULL_TOKEN)
  })
})

// Real-compiler migration checks: an obsolete call must not compile as an empty bar.
function publicComposition(children: ReactNode) {
  const ref = createRef<HTMLDivElement>()
  const valid = <StatusBar ref={ref} onKeyDown={() => {}}>{children}</StatusBar>
  const conditional = <StatusBar>{false}</StatusBar>
  // @ts-expect-error A root now requires explicit content.
  const empty = <StatusBar />
  // @ts-expect-error Styling alone no longer supplies a composition.
  const styled = <StatusBar className="border-0" />
  // @ts-expect-error Environment moves into StatusBarEnvironmentBadge.
  const environment = <StatusBar environment={{ label: "UAT" }}>{children}</StatusBar>
  // @ts-expect-error Clock entries move into StatusBarClocks/StatusBarClockReadout.
  const clocks = <StatusBar clocks={[]}>{children}</StatusBar>
  // @ts-expect-error User moves into StatusBarUser.
  const user = <StatusBar user="me">{children}</StatusBar>
  // @ts-expect-error Left content moves into caller JSX.
  const left = <StatusBar left="feeds">{children}</StatusBar>
  // @ts-expect-error Center content and the spacer move into caller JSX.
  const center = <StatusBar center="session">{children}</StatusBar>
  // @ts-expect-error Right content moves into caller JSX.
  const right = <StatusBar right="frames">{children}</StatusBar>
  // @ts-expect-error Source moves onto each ClockReadout.
  const clock = <StatusBar clock={createClock()}>{children}</StatusBar>
  // @ts-expect-error Names move to native aria props and reading prefixes.
  const labels = <StatusBar labels={{ title: "Desk" }}>{children}</StatusBar>
  // @ts-expect-error The clocks group requires caller-owned readings.
  const group = <StatusBarClocks />
  return [valid, conditional, empty, styled, environment, clocks, user, left, center, right, clock, labels, group]
}
void publicComposition
