import { act, fireEvent, render, renderHook, screen, within } from "@testing-library/react"
import { createRef, StrictMode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createAlertStore, type Alert, type AlertStore } from "@/registry/tradecn/lib/alert-store"
import { useRowIds } from "@/registry/tradecn/hooks/use-row-store"
import { Alerts, AlertsList, AlertsEmpty, AlertsAnnouncer, AlertItem, AlertHeader, AlertTitle, AlertBody, AlertActions, AlertActionButton, AlertDismiss, AlertHistory, AlertSeverity, alertColumns, useAlert, useAlertView, useToastBridge, type UseAlertOptions } from "@/registry/tradecn/ui/alerts"

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

function Notice({ alerts, id, options, onAction }: { alerts: AlertStore; id: string; options?: UseAlertOptions; onAction?: (alert: Alert) => void }) {
  const alert = useAlert(alerts, id, options)
  if (!alert) return null
  return (
    <AlertItem tone={alert.tone} data-alert-id={id}>
      <AlertHeader>
        <AlertTitle>{alert.title}</AlertTitle>
        <AlertSeverity tone={alert.tone}>{alert.severity}</AlertSeverity>
      </AlertHeader>
      <AlertBody>{alert.message} <span data-alert-count>{alert.count}</span></AlertBody>
      <AlertActions>
        {onAction && <AlertActionButton alert={alert} action="ack" onAction={onAction}>Acknowledge</AlertActionButton>}
        <AlertDismiss aria-label={`Dismiss: ${alert.title}`} onClick={() => alerts.dismiss(id)} />
      </AlertActions>
    </AlertItem>
  )
}

function Collection({ alerts, visible = 3, options, onAction }: { alerts: AlertStore; visible?: number; options?: UseAlertOptions; onAction?: (alert: Alert) => void }) {
  const ids = useRowIds(useAlertView(alerts)).slice(0, visible)
  return (
    <Alerts>
      <AlertsAnnouncer alerts={alerts} id={ids[0] ?? null} assertive={["critical"]} />
      <AlertsList>{ids.map((id) => <Notice key={id} alerts={alerts} id={id} options={options} onAction={onAction} />)}</AlertsList>
      {ids.length === 0 && <AlertsEmpty>No notices.</AlertsEmpty>}
    </Alerts>
  )
}

describe("notice composition", () => {
  it("uses the caller's referenced heading without adding a fallback label", () => {
    render(<><h2 id="desk-notices">Desk notices</h2><Alerts aria-labelledby="desk-notices">Caller content</Alerts></>)
    expect(screen.getByRole("group", { name: "Desk notices" })).not.toHaveAttribute("aria-label")
    expect(screen.queryByRole("group", { name: "Notices" })).toBeNull()
  })

  it("works without a store, forwards native props and refs, and leaves content and controls to the caller", () => {
    const root = createRef<HTMLDivElement>()
    const list = createRef<HTMLUListElement>()
    const item = createRef<HTMLLIElement>()
    const body = createRef<HTMLDivElement>()
    const dismiss = vi.fn()
    render(
      <Alerts ref={root} aria-label="Desk notices" className="custom-root" data-owner="desk">
        <button type="button">Consumer toolbar</button>
        <AlertsList ref={list} aria-label="Messages">
          <AlertItem ref={item} tone="stale">
            <AlertBody ref={body} className="custom-body"><a href="/orders/42">View order</a><p>Custom rich content.</p></AlertBody>
            <AlertHeader><AlertTitle>Caller title</AlertTitle><AlertSeverity>warning</AlertSeverity></AlertHeader>
            <AlertActions><AlertDismiss onClick={dismiss}>Remove notice</AlertDismiss></AlertActions>
          </AlertItem>
        </AlertsList>
      </Alerts>,
    )
    expect(root.current).toBe(screen.getByRole("group", { name: "Desk notices" }))
    expect(root.current).toHaveAttribute("data-owner", "desk")
    expect(root.current).toHaveClass("custom-root")
    expect(list.current).toBe(screen.getByRole("list", { name: "Messages" }))
    expect(item.current).toBe(screen.getByRole("listitem"))
    expect(item.current?.firstElementChild).toBe(body.current)
    expect(body.current).toHaveClass("custom-body")
    expect(screen.getByRole("link", { name: "View order" })).toHaveAttribute("href", "/orders/42")
    fireEvent.click(screen.getByRole("button", { name: "Remove notice" }))
    expect(dismiss).toHaveBeenCalledOnce()
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(screen.queryByRole("alert")).toBeNull()
    expect(screen.queryByRole("button", { name: "Clear all" })).toBeNull()
  })

  it("names the default dismiss icon and respects the caller's naming props", () => {
    const { rerender } = render(<AlertDismiss />)
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument()
    rerender(<AlertDismiss aria-label="Dismiss: Feed slow" />)
    expect(screen.getByRole("button", { name: "Dismiss: Feed slow" })).toBeInTheDocument()
    rerender(<><span id="dismiss-label">Remove warning</span><AlertDismiss aria-labelledby="dismiss-label" /></>)
    expect(screen.getByRole("button", { name: "Remove warning" })).not.toHaveAttribute("aria-label")
    rerender(<AlertDismiss aria-label="Remove notice: Feed slow">Remove notice</AlertDismiss>)
    expect(screen.getByRole("button", { name: "Remove notice: Feed slow" })).toHaveTextContent("Remove notice")
  })

  it("follows newest-first IDs while a repeat updates the mounted notice and announcement", () => {
    const c = clock()
    const alerts = seeded(c.now)
    render(<Collection alerts={alerts} />)
    expect([...document.querySelectorAll<HTMLElement>("li[data-alert-id]")].map((row) => row.dataset.alertId)).toEqual(["n4", "n3", "n2"])
    act(() => { c.tick(1); alerts.push({ key: "top", severity: "critical", title: "Top" }) })
    act(() => { c.tick(1); alerts.push({ key: "top", severity: "critical", title: "Top", message: "Again" }) })
    const row = document.querySelector<HTMLElement>("li[data-alert-id]")!
    expect(row.querySelector("[data-alert-count]")).toHaveTextContent("2")
    expect(within(row).getByText(/Again/)).toBeInTheDocument()
    expect(document.querySelector("[data-alerts-assertive]")).toHaveTextContent("critical: Top. Again (2)")
  })

  it("offers an allowed action with caller-owned content and updates when permissions change", () => {
    const alerts = seeded(clock().now)
    const onAction = vi.fn()
    render(<Collection alerts={alerts} visible={4} onAction={onAction} />)
    fireEvent.click(screen.getByRole("button", { name: "Acknowledge" }))
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ id: "n4" }))
    expect(alerts.size()).toBe(4)
    act(() => alerts.store.applyDeltas({ patch: [{ id: "n4", fields: { allowedActions: [] } }] }))
    expect(screen.queryByRole("button", { name: "Acknowledge" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Dismiss: Order rejected" }))
    expect(alerts.size()).toBe(3)
    act(() => alerts.clear())
    expect(screen.getByText("No notices.")).toBeInTheDocument()
  })

  it("forwards an action button's ref, accessible name, and disabled state", () => {
    const alert = seeded(clock().now).store.getRow("n4")!
    const ref = createRef<HTMLButtonElement>()
    const onAction = vi.fn()
    const { rerender } = render(<AlertActionButton ref={ref} alert={alert} action="ack" aria-label="Confirm rejection" disabled onAction={onAction}><span>Confirm</span></AlertActionButton>)
    const button = screen.getByRole("button", { name: "Confirm rejection" })
    expect(ref.current).toBe(button)
    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(onAction).not.toHaveBeenCalled()
    rerender(<AlertActionButton ref={ref} alert={alert} action="ack" aria-label="Confirm rejection" onAction={onAction}><span>Confirm</span></AlertActionButton>)
    fireEvent.click(button)
    expect(onAction).toHaveBeenCalledWith(alert)
  })
})

describe("useAlert", () => {
  it("updates only the subscribed row", () => {
    const alerts = seeded(clock().now)
    const rendered = vi.fn()
    const { result } = renderHook(() => { rendered(); return useAlert(alerts, "n1") })
    expect(rendered).toHaveBeenCalledTimes(1)
    act(() => alerts.store.applyDeltas({ patch: [{ id: "n2", fields: { title: "Other row" } }] }))
    expect(rendered).toHaveBeenCalledTimes(1)
    act(() => alerts.store.applyDeltas({ patch: [{ id: "n1", fields: { title: "Changed" } }] }))
    expect(result.current?.title).toBe("Changed")
    expect(rendered).toHaveBeenCalledTimes(2)
  })

  it("expires only mounted plain notices, restarts on repeats, and never expires actionable notices", () => {
    vi.useFakeTimers()
    const c = clock()
    const alerts = seeded(c.now)
    render(<Collection alerts={alerts} options={{ ttlMs: 5_000, now: c.now }} />)
    act(() => { c.tick(5_000); vi.advanceTimersByTime(5_000) })
    expect(alerts.store.getRow("n3")).toBeUndefined()
    // The previously hidden row mounts after n3 expires and schedules its already-due timer.
    act(() => vi.advanceTimersByTime(0))
    expect(alerts.store.getRow("n1")).toBeUndefined()
    expect(alerts.size()).toBe(2)
    act(() => alerts.push({ key: "later", severity: "info", title: "Later" }))
    act(() => { c.tick(4_000); vi.advanceTimersByTime(4_000) })
    act(() => alerts.push({ key: "later", severity: "info", title: "Later" }))
    act(() => { c.tick(4_000); vi.advanceTimersByTime(4_000) })
    expect(alerts.size()).toBe(3)
    act(() => { c.tick(1_000); vi.advanceTimersByTime(1_000) })
    expect(alerts.size()).toBe(2)
    act(() => { c.tick(60_000); vi.advanceTimersByTime(60_000) })
    expect(alerts.size()).toBe(2)
    expect(document.activeElement).toBe(document.body)
  })

  it("keeps hidden rows, cleans up timers on unmount, and follows store and ID replacements", () => {
    vi.useFakeTimers()
    const c = clock()
    const first = seeded(c.now)
    const second = seeded(c.now)
    const { result, rerender, unmount } = renderHook(({ alerts, id }) => useAlert(alerts, id, { ttlMs: 1_000, now: c.now }), { initialProps: { alerts: first, id: "n1" } })
    rerender({ alerts: second, id: "n3" })
    expect(result.current?.id).toBe("n3")
    act(() => { c.tick(1_000); vi.advanceTimersByTime(1_000) })
    expect(first.size()).toBe(4)
    expect(second.store.getRow("n3")).toBeUndefined()
    expect(second.store.getRow("n1")).toBeDefined()
    rerender({ alerts: second, id: "n1" })
    unmount()
    act(() => vi.runAllTimers())
    expect(second.store.getRow("n1")).toBeDefined()
  })

  it("disables an existing timer when actions arrive and enables expiry when they are removed", () => {
    vi.useFakeTimers()
    const c = clock()
    const alerts = seeded(c.now)
    renderHook(() => useAlert(alerts, "n1", { ttlMs: 1_000, now: c.now }))
    act(() => alerts.store.applyDeltas({ patch: [{ id: "n1", fields: { allowedActions: ["unmapped-action"] } }] }))
    act(() => { c.tick(2_000); vi.advanceTimersByTime(2_000) })
    expect(alerts.store.getRow("n1")).toBeDefined()
    act(() => alerts.store.applyDeltas({ patch: [{ id: "n1", fields: { allowedActions: [] } }] }))
    act(() => vi.advanceTimersByTime(0))
    expect(alerts.store.getRow("n1")).toBeUndefined()
  })
})

describe("AlertsAnnouncer", () => {
  it("announces only the chosen notice, switches urgency, and permits an empty selection", () => {
    const alerts = seeded(clock().now)
    const { rerender } = render(<AlertsAnnouncer alerts={alerts} id="n4" assertive={["critical"]} />)
    expect(screen.getByRole("alert")).toHaveTextContent("critical: Order rejected. Price away from market")
    expect(screen.getByRole("status")).toBeEmptyDOMElement()
    rerender(<AlertsAnnouncer alerts={alerts} id="n1" assertive={["critical"]} />)
    expect(screen.getByRole("status")).toHaveTextContent("info: Feed connected")
    expect(screen.getByRole("alert")).toBeEmptyDOMElement()
    act(() => alerts.push({ id: "", severity: "info", title: "Empty ID" }))
    rerender(<AlertsAnnouncer alerts={alerts} id="" />)
    expect(screen.getByRole("status")).toHaveTextContent("info: Empty ID")
    rerender(<AlertsAnnouncer alerts={alerts} id={null} />)
    expect(screen.getByRole("status")).toBeEmptyDOMElement()
    expect(screen.getByRole("alert")).toBeEmptyDOMElement()
  })
})

describe("AlertHistory and alertColumns", () => {
  it("renders the independent grid and permits caller-owned columns and labels", () => {
    const alerts = seeded(clock().now)
    expect(alertColumns().map((column) => column.key)).toEqual(["at", "severity", "title", "message", "count"])
    expect(alertColumns({ labels: { noticeTitle: "Subject" } })[2]!.header).toBe("Subject")
    const columns = alertColumns({ time: printTime }).filter((column) => column.key !== "severity")
    render(<div style={{ height: RECT.height }}><AlertHistory alerts={alerts} label="Log" columns={columns} /></div>)
    expect(screen.getByRole("grid", { name: "Log" })).toHaveAttribute("aria-rowcount", "5")
    expect(screen.queryByRole("columnheader", { name: "Severity" })).toBeNull()
    expect(document.querySelector("[data-row-id]")).toHaveAttribute("data-row-id", "n4")
    act(() => alerts.push({ severity: "info", title: "Newest" }))
    expect(screen.getByRole("grid", { name: "Log" })).toHaveAttribute("aria-rowcount", "6")
    expect(document.querySelector("[data-row-id]")).toHaveAttribute("data-row-id", "n5")
    expect(screen.getByRole("gridcell", { name: "Newest" })).toBeInTheDocument()
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

describe("under StrictMode", () => {
  it("keeps following arrivals and cleans up the expiry hook after the mount rehearsal", () => {
    vi.useFakeTimers()
    const c = clock()
    const alerts = createAlertStore({ now: c.now })
    render(<StrictMode><Collection alerts={alerts} options={{ ttlMs: 1_000, now: c.now }} /></StrictMode>)
    expect(screen.getByText("No notices.")).toBeInTheDocument()
    act(() => alerts.push({ severity: "info", title: "Later" }))
    expect(screen.getByText("Later")).toBeInTheDocument()
    act(() => { c.tick(1_000); vi.advanceTimersByTime(1_000) })
    expect(screen.getByText("No notices.")).toBeInTheDocument()
  })
})
