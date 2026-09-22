import { act, fireEvent, render, renderHook, screen, within } from "@testing-library/react"
import { StrictMode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createAlertStore, type Alert } from "@/registry/tradecn/lib/alert-store"
import { ALERT_TONE_BAR, AlertList, Alerts, alertColumns, useToastBridge } from "@/registry/tradecn/ui/alerts"

const RECT = { width: 800, height: 240 }
const saved = new Map<string, PropertyDescriptor | undefined>()

beforeEach(() => {
  saved.set("animate", Object.getOwnPropertyDescriptor(HTMLElement.prototype, "animate"))
  Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, writable: true, value: vi.fn(() => ({ cancel: vi.fn(), currentTime: 0, onfinish: null })) })
  for (const [prop, size] of [["offsetWidth", RECT.width], ["offsetHeight", RECT.height]] as const) {
    saved.set(prop, Object.getOwnPropertyDescriptor(HTMLElement.prototype, prop))
    Object.defineProperty(HTMLElement.prototype, prop, {
      configurable: true,
      get(this: HTMLElement) {
        return this.classList.contains("overflow-auto") ? size : 0
      },
    })
  }
})
afterEach(() => {
  for (const [prop, descriptor] of saved) {
    if (descriptor) Object.defineProperty(HTMLElement.prototype, prop, descriptor)
    else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[prop]
  }
  saved.clear()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function clock(start = 1_000) {
  let t = start
  return { now: () => t, tick: (ms: number) => (t += ms) }
}

const printTime = (ms: number) => `t${ms}`

function seeded(now: () => number) {
  let n = 0
  const alerts = createAlertStore({ now, nextId: () => `n${++n}` })
  alerts.push({ severity: "info", title: "Feed connected", tone: "up" })
  alerts.push({ key: "md:slow", severity: "warning", title: "Feed slow", message: "1.2 s behind", tone: "stale", allowedActions: ["reconnect", "mute"] })
  alerts.push({ severity: "fill", title: "Filled 5mm T 4 1/8 05/34", tone: "primary" })
  alerts.push({ severity: "critical", title: "Order rejected", message: "Price away from market", tone: "destructive", allowedActions: ["ack"] })
  return alerts
}

describe("Alerts", () => {
  it("shows the newest few with the severity word, the tone, the message, the count, the time, and says how many more there are", () => {
    const c = clock()
    const alerts = seeded(c.now)
    c.tick(10)
    alerts.push({ key: "md:slow", severity: "warning", title: "Feed slow", message: "2.0 s behind", tone: "stale", allowedActions: ["reconnect"] })
    render(<Alerts alerts={alerts} time={printTime} />)
    const strip = screen.getByRole("group", { name: "Notices" })
    expect(strip.dataset.slot).toBe("tradecn-alerts")
    expect(strip.dataset.count).toBe("4")
    expect(strip.dataset.shown).toBe("3")
    // The folded notice took the newest time, so it leads; the two at one time run by id, newest id first.
    const rows = [...strip.querySelectorAll<HTMLElement>("li[data-alert-id]")]
    expect(rows.map((li) => li.dataset.alertId)).toEqual(["n2", "n4", "n3"])
    const slow = rows[0]!
    expect(slow.dataset.severity).toBe("warning")
    expect(slow.dataset.tone).toBe("stale")
    expect(within(slow).getByText("warning")).toBeInTheDocument()
    expect(within(slow).getByText("2.0 s behind")).toBeInTheDocument()
    expect(slow.querySelector("[data-alert-count]")).toHaveAttribute("data-alert-count", "2")
    expect(slow.querySelector("[data-alert-count]")).toHaveTextContent("×2")
    expect(slow.querySelector("[data-alert-bar]")?.className).toContain(ALERT_TONE_BAR.stale)
    expect(within(slow).getByText("t1010")).toBeInTheDocument()
    expect(rows[1]!.querySelector("[data-alert-count]")).toBeNull()
    expect(screen.getByRole("button", { name: "1 more" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Clear all" })).toBeInTheDocument()
  })

  it("shows a repeat folded into the notice already at the top, whose row changes but whose place does not", () => {
    const c = clock()
    const alerts = seeded(c.now)
    render(<Alerts alerts={alerts} assertive={["warning"]} />)
    expect(document.querySelector('li[data-alert-id="n4"]')).toBeInTheDocument()
    // Fold into the newest row twice: the order is the same each time, the count is not.
    act(() => {
      c.tick(1)
      alerts.push({ key: "md:rejected", id: "n4", severity: "critical", title: "Order rejected" })
    })
    // n4 has no key, so that was a new row; give the top row a key and fold into it instead.
    act(() => {
      c.tick(1)
      alerts.push({ key: "top", severity: "warning", title: "Top", tone: "stale" })
    })
    const top = () => document.querySelector<HTMLElement>("li[data-alert-id]")!
    expect(top()).toHaveAttribute("data-severity", "warning")
    expect(top().querySelector("[data-alert-count]")).toBeNull()
    act(() => {
      c.tick(1)
      alerts.push({ key: "top", severity: "warning", title: "Top", tone: "stale", message: "again" })
    })
    expect(top().querySelector("[data-alert-count]")).toHaveTextContent("×2")
    expect(within(top()).getByText("again")).toBeInTheDocument()
    act(() => {
      c.tick(1)
      alerts.push({ key: "top", severity: "warning", title: "Top", tone: "stale", message: "and again" })
    })
    expect(top().querySelector("[data-alert-count]")).toHaveTextContent("×3")
    expect(document.querySelector("[data-alerts-assertive]")).toHaveTextContent("warning: Top. and again (3)")
  })

  it("offers only the actions a notice allows, in your order with your labels, and dismisses and clears through the store", () => {
    const alerts = seeded(clock().now)
    const onAction = vi.fn()
    render(<Alerts alerts={alerts} actions={[{ id: "ack", label: "Acknowledge", onAction }, { id: "reconnect", label: "Reconnect", onAction }, { id: "pause", label: "Pause", onAction }]} visible={4} />)
    const slow = document.querySelector<HTMLElement>('li[data-alert-id="n2"]')!
    expect([...slow.querySelectorAll<HTMLElement>("[data-alert-action]")].map((b) => b.textContent)).toEqual(["Reconnect"])
    const rejected = document.querySelector<HTMLElement>('li[data-alert-id="n4"]')!
    fireEvent.click(within(rejected).getByRole("button", { name: "Acknowledge" }))
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ id: "n4", severity: "critical" }))
    expect(document.querySelector('li[data-alert-id="n1"] [data-alert-action]')).toBeNull()
    fireEvent.click(within(rejected).getByRole("button", { name: "Dismiss: Order rejected" }))
    expect(alerts.size()).toBe(3)
    expect(document.querySelector('li[data-alert-id="n4"]')).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }))
    expect(alerts.size()).toBe(0)
    expect(screen.getByText("No notices.")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Clear all" })).toBeNull()
  })

  it("dismisses a notice without an action after ttlMs and never one with an action, and takes no focus", () => {
    vi.useFakeTimers()
    const c = clock()
    const alerts = seeded(c.now)
    render(<Alerts alerts={alerts} ttlMs={5_000} now={c.now} visible={4} />)
    expect(alerts.size()).toBe(4)
    expect(document.activeElement).toBe(document.body)
    act(() => {
      c.tick(4_999)
      vi.advanceTimersByTime(4_999)
    })
    expect(alerts.size()).toBe(4)
    act(() => {
      c.tick(1)
      vi.advanceTimersByTime(1)
    })
    // The two without actions are gone; the two with actions stay for as long as it takes.
    expect(alerts.list().map((a) => a.id).sort()).toEqual(["n2", "n4"])
    act(() => {
      c.tick(60_000)
      vi.advanceTimersByTime(60_000)
    })
    expect(alerts.size()).toBe(2)
    // A notice arriving later gets its own clock, and a repeat folded into it starts the clock again.
    act(() => alerts.push({ key: "later", severity: "info", title: "Later" }))
    act(() => {
      c.tick(4_000)
      vi.advanceTimersByTime(4_000)
    })
    expect(alerts.size()).toBe(3)
    act(() => alerts.push({ key: "later", severity: "info", title: "Later" }))
    act(() => {
      c.tick(4_000)
      vi.advanceTimersByTime(4_000)
    })
    expect(alerts.size()).toBe(3)
    act(() => {
      c.tick(1_000)
      vi.advanceTimersByTime(1_000)
    })
    expect(alerts.size()).toBe(2)
    expect(document.activeElement).toBe(document.body)
  })

  it("announces the newest notice politely, and at once only for a severity you name", () => {
    const alerts = seeded(clock().now)
    render(<Alerts alerts={alerts} assertive={["critical"]} />)
    const polite = document.querySelector("[data-alerts-polite]")!
    const urgent = document.querySelector("[data-alerts-assertive]")!
    expect(polite).toHaveAttribute("role", "status")
    expect(polite).toHaveAttribute("aria-live", "polite")
    expect(urgent).toHaveAttribute("role", "alert")
    expect(urgent).toHaveAttribute("aria-live", "assertive")
    expect(urgent).toHaveTextContent("critical: Order rejected. Price away from market")
    expect(polite).toHaveTextContent("")
    act(() => alerts.push({ severity: "info", title: "Feed reconnected" }))
    expect(polite).toHaveTextContent("info: Feed reconnected")
    expect(urgent).toHaveTextContent("")
  })

  it("opens the whole list in your dialog as a grid, newest first, from the more button", () => {
    const alerts = seeded(clock().now)
    render(<Alerts alerts={alerts} time={printTime} />)
    expect(screen.queryByRole("dialog")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "1 more" }))
    const dialog = screen.getByRole("dialog", { name: "All notices" })
    const grid = within(dialog).getByRole("grid", { name: "All notices" })
    expect(grid).toHaveAttribute("aria-rowcount", "5")
    expect([...grid.querySelectorAll<HTMLElement>("[data-row-id]")].map((r) => r.dataset.rowId)).toEqual(["n4", "n3", "n2", "n1"])
    expect(within(grid).getByText("critical")).toBeInTheDocument()
    expect(within(grid).getByText("Price away from market")).toBeInTheDocument()
  })

  it("takes its words from labels", () => {
    const alerts = seeded(clock().now)
    render(<Alerts alerts={alerts} labels={{ title: "Meldungen", more: "{n} weitere", clearAll: "Alle löschen", dismiss: "Schließen" }} />)
    expect(screen.getByRole("group", { name: "Meldungen" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "1 weitere" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Alle löschen" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Schließen: Order rejected" })).toBeInTheDocument()
  })
})

describe("AlertList and alertColumns", () => {
  it("is the grid over the store, newest first, with the columns as a list to spread", () => {
    const alerts = seeded(clock().now)
    expect(alertColumns().map((c) => c.key)).toEqual(["at", "severity", "title", "message", "count"])
    render(
      <div style={{ height: 240 }}>
        <AlertList alerts={alerts} label="Log" />
      </div>,
    )
    const grid = screen.getByRole("grid", { name: "Log" })
    expect(document.querySelector("[data-slot='tradecn-alert-list']")).toBeInTheDocument()
    expect(grid.dataset.preset).toBe("blotter")
    expect([...grid.querySelectorAll<HTMLElement>("[data-row-id]")].map((r) => r.dataset.rowId)).toEqual(["n4", "n3", "n2", "n1"])
    act(() => alerts.push({ severity: "info", title: "Newest" }))
    expect(grid.querySelector("[data-row-id]")).toHaveAttribute("data-row-id", "n5")
  })
})

describe("useToastBridge", () => {
  it("forwards each new notice once, oldest of a batch first, and not a notice folded into an existing key", () => {
    const c = clock()
    const alerts = seeded(c.now)
    const toast = vi.fn()
    renderHook(() => useToastBridge(alerts, toast))
    expect(toast).not.toHaveBeenCalled()
    act(() => {
      c.tick(1)
      alerts.push({ severity: "info", title: "A" })
    })
    expect(toast).toHaveBeenCalledTimes(1)
    expect(toast).toHaveBeenLastCalledWith(expect.objectContaining({ title: "A" }))
    act(() => alerts.push({ key: "md:slow", severity: "warning", title: "Feed slow", message: "3 s behind" }))
    expect(toast).toHaveBeenCalledTimes(1)
    act(() => alerts.dismiss("n1"))
    act(() => {
      c.tick(1)
      alerts.push({ severity: "info", title: "B" })
    })
    expect(toast).toHaveBeenCalledTimes(2)
    const { unmount } = renderHook(() => useToastBridge(alerts, null))
    act(() => alerts.push({ severity: "info", title: "C" }))
    expect(toast).toHaveBeenCalledTimes(3)
    unmount()
  })
})

// Keep the type in use so a change to Alert's shape is caught here too.
const _shape: Alert = { id: "x", at: 0, seq: 1, severity: "s", title: "t", count: 1 }
void _shape

describe("under StrictMode", () => {
  it("the strip keeps following the store after the mount rehearsal", () => {
    const alerts = createAlertStore()
    render(
      <StrictMode>
        <Alerts alerts={alerts} />
      </StrictMode>,
    )
    expect(screen.getByText("No notices.")).toBeInTheDocument()
    act(() => alerts.push({ severity: "info", title: "Later" }))
    expect(document.querySelector("li[data-alert-id]")).toHaveTextContent("Later")
  })
})
