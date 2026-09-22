import { act, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createClock } from "@/registry/tradecn/lib/clock"
import { NULL_TOKEN } from "@/registry/tradecn/lib/format"
import { DEFAULT_STATUS_BAR_LABELS, STATUS_TONE_CLASS, StatusBar, clockFormat, formatClock } from "@/registry/tradecn/ui/status-bar"

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
    render(<StatusBar clocks={[{ label: "New York", zone: "America/New_York" }, { label: "London", zone: "Europe/London" }]} clock={clock} />)
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
  it("names itself, prints the environment as a word in its tone, the user, and puts your children in the slots", () => {
    render(<StatusBar environment={{ label: "PRODUCTION", tone: "destructive" }} user="jdoe" left={<span>feeds</span>} center={<span>middle</span>} right={<span>frames</span>} />)
    const bar = screen.getByRole("group", { name: "Status" })
    expect(bar.dataset.slot).toBe("tradecn-status-bar")
    expect(bar.dataset.environment).toBe("PRODUCTION")
    const env = bar.querySelector<HTMLElement>("[data-status-environment]")!
    expect(env).toHaveTextContent("PRODUCTION")
    expect(env.dataset.tone).toBe("destructive")
    expect(env.className).toContain(STATUS_TONE_CLASS.destructive)
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

  it("leaves out what it is not given, and takes its words from labels", () => {
    render(<StatusBar labels={{ title: "Statusleiste", environment: "Umgebung", user: "Angemeldet als" }} environment={{ label: "UAT" }} user="jdoe" />)
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
