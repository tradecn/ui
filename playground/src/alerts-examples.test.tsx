import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import * as alertStore from "@/registry/tradecn/lib/alert-store"
import AlertsCollectionDemo from "./demos/alerts-collection"
import AlertsActionsDemo from "./demos/alerts-actions"
import AlertsHistoryDemo from "./demos/alerts-history"
import AlertsBridgeDemo from "./demos/alerts-bridge"
import { DeskAlerts } from "./demos/terminal"

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

it("restores focus when a desk action removes its notice, and never expires one", async () => {
  vi.useFakeTimers()
  const alerts = alertStore.createAlertStore()
  alerts.push({ severity: "warning", title: "Stays", allowedActions: ["ack"] })
  alerts.push({ severity: "info", title: "Plain" })
  render(<DeskAlerts alerts={alerts} actions={[{ id: "ack", label: "Acknowledge", onAction: (alert) => alerts.dismiss(alert.id) }]} />)
  // No TTL: the displayed notice carries no actions, exactly the kind the demo's old
  // twelve-second timer expired.
  await act(async () => { await vi.advanceTimersByTimeAsync(13_000) })
  expect(alerts.size()).toBe(2)
  const dismiss = screen.getByRole("button", { name: "Dismiss: Plain" })
  act(() => dismiss.focus())
  fireEvent.click(dismiss)
  await act(async () => { await vi.advanceTimersByTimeAsync(0) })
  const acknowledge = screen.getByRole("button", { name: "Acknowledge" })
  expect(screen.getByRole("button", { name: "Dismiss: Stays" })).toHaveFocus()
  act(() => acknowledge.focus())
  fireEvent.click(acknowledge)
  await act(async () => { await vi.advanceTimersByTimeAsync(0) })
  expect(alerts.size()).toBe(0)
  expect(screen.getByRole("button", { name: "History" })).toHaveFocus()
})

it("recovers focus when an arrival displaces the shown notice", async () => {
  // Reconnect's follow-up push lands 800 ms after the refocus and replaces the keyed
  // notice whose dismiss now holds focus; the outgoing notice hands focus back.
  vi.useFakeTimers()
  const alerts = alertStore.createAlertStore()
  alerts.push({ severity: "critical", title: "Rejected" })
  alerts.push({ severity: "warning", title: "Slow", allowedActions: ["reconnect"] })
  render(<DeskAlerts alerts={alerts} actions={[{ id: "reconnect", label: "Reconnect", onAction: (alert) => { alerts.dismiss(alert.id); setTimeout(() => void alerts.push({ severity: "info", title: "Reconnected" }), 800) } }]} />)
  const reconnect = screen.getByRole("button", { name: "Reconnect" })
  act(() => reconnect.focus())
  fireEvent.click(reconnect)
  await act(async () => { await vi.advanceTimersByTimeAsync(0) })
  expect(screen.getByRole("button", { name: "Dismiss: Rejected" })).toHaveFocus()
  await act(async () => { await vi.advanceTimersByTimeAsync(800) })
  expect(screen.getByRole("button", { name: "Dismiss: Reconnected" })).toHaveFocus()
  expect(document.activeElement).not.toBe(document.body)
})

it.each(["dismiss", "clear"])("returns focus from terminal history after a server %s removes the overflow", async (change) => {
  vi.useFakeTimers()
  const alerts = alertStore.createAlertStore()
  alerts.push({ severity: "warning", title: "Retained", allowedActions: ["ack"] })
  const shown = alerts.push({ severity: "info", title: "Temporary" })
  render(<DeskAlerts alerts={alerts} actions={[]} />)
  const trigger = screen.getByRole("button", { name: "1 more" })
  trigger.focus()
  fireEvent.click(trigger)
  await act(async () => { await vi.advanceTimersByTimeAsync(100) })
  const dialog = screen.getByRole("dialog", { name: "All notices" })
  await act(async () => {
    if (change === "dismiss") alerts.dismiss(shown.id)
    else alerts.clear()
  })
  expect(alerts.size()).toBe(change === "dismiss" ? 1 : 0)
  if (change === "dismiss") fireEvent.keyDown(dialog, { key: "Escape", code: "Escape" })
  else fireEvent.click(within(dialog).getByRole("button", { name: "Close" }))
  await act(async () => { await vi.advanceTimersByTimeAsync(100) })
  expect(screen.queryByRole("dialog")).toBeNull()
  expect(trigger).toHaveFocus()
  expect(trigger).toHaveAccessibleName("History")
})

it.each(["dismiss", "clear"])("returns focus from the history example after %s removes the overflow", async (change) => {
  vi.useFakeTimers()
  const alerts = alertStore.createAlertStore()
  vi.spyOn(alertStore, "createAlertStore").mockReturnValueOnce(alerts)
  render(<AlertsHistoryDemo />)
  const trigger = screen.getByRole("button", { name: "2 more" })
  trigger.focus()
  fireEvent.click(trigger)
  await act(async () => { await vi.advanceTimersByTimeAsync(100) })
  const dialog = screen.getByRole("dialog", { name: "Notice history" })
  act(() => {
    if (change === "dismiss") alerts.dismiss(alerts.list().slice(0, 2).map((alert) => alert.id))
    else alerts.clear()
  })
  expect(alerts.size()).toBe(change === "dismiss" ? 2 : 0)
  if (change === "dismiss") fireEvent.keyDown(dialog, { key: "Escape", code: "Escape" })
  else fireEvent.click(within(dialog).getByRole("button", { name: "Close" }))
  await act(async () => { await vi.advanceTimersByTimeAsync(100) })
  expect(screen.queryByRole("dialog")).toBeNull()
  expect(trigger).toHaveFocus()
  expect(trigger).toHaveAccessibleName("History")
})

it("replaces the local collection with its empty state and restores the notices, focus riding along", async () => {
  render(<AlertsCollectionDemo />)
  const notices = within(screen.getByRole("group", { name: "Notices" }))
  const buttons = notices.getAllByRole("button", { name: /^Dismiss:/ })
  // Dismissing a focused notice hands focus to the first remaining notice's dismiss — here
  // the one BEFORE the dismissed notice, which is what distinguishes first from next — then
  // to Restore notices when the list empties. Removal itself never moves focus.
  act(() => buttons[1]!.focus())
  fireEvent.click(buttons[1]!)
  await act(async () => {})
  expect(notices.getByRole("button", { name: "Dismiss: Order filled" })).toHaveFocus()
  fireEvent.click(notices.getAllByRole("button", { name: /^Dismiss:/ })[0]!)
  await act(async () => {})
  expect(screen.getByRole("button", { name: "Restore notices" })).toHaveFocus()
  expect(notices.queryByRole("list")).toBeNull()
  expect(notices.getByText("No notices.")).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "Restore notices" }))
  expect(notices.getAllByRole("listitem")).toHaveLength(2)
  expect(notices.queryByText("No notices.")).toBeNull()
})

it("hands focus to a receive button when the actions demo empties, and to the next notice before that", async () => {
  render(<AlertsActionsDemo />)
  const notices = within(screen.getByRole("group", { name: "Notices" }))
  // An action removes its notice too: focus lands exactly on the remaining notice's
  // dismiss — never a server-action button, which a held Enter would fire.
  const acknowledge = notices.getAllByRole("button", { name: "Acknowledge" })
  act(() => acknowledge[0]!.focus())
  fireEvent.click(acknowledge[0]!)
  await act(async () => {})
  expect(notices.getAllByRole("button", { name: /^Dismiss:/ })[0]).toHaveFocus()
  fireEvent.click(notices.getAllByRole("button", { name: /^Dismiss:/ })[0]!)
  await act(async () => {})
  expect(screen.getByRole("button", { name: "Receive slow feed" })).toHaveFocus()
})

it("hands focus to the receive control when the bridge demo clears, and to the next dismiss before that", async () => {
  render(<AlertsBridgeDemo />)
  const notices = within(screen.getByRole("group", { name: "Notices" }))
  fireEvent.click(screen.getByRole("button", { name: "Receive slow notice" }))
  const dismisses = notices.getAllByRole("button", { name: /^Dismiss:/ })
  expect(dismisses).toHaveLength(2)
  act(() => dismisses[0]!.focus())
  fireEvent.click(dismisses[0]!)
  await act(async () => {})
  expect(notices.getAllByRole("button", { name: /^Dismiss:/ })[0]).toHaveFocus()
  const clear = screen.getByRole("button", { name: "Clear all" })
  act(() => clear.focus())
  fireEvent.click(clear)
  await act(async () => {})
  expect(notices.getByText("No notices.")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Receive slow notice" })).toHaveFocus()
})

it("hands focus to the next notice or the History trigger when the history demo removes", async () => {
  render(<AlertsHistoryDemo />)
  const notices = within(screen.getByRole("group", { name: "Notices" }))
  const dismisses = notices.getAllByRole("button", { name: /^Dismiss:/ })
  act(() => dismisses[0]!.focus())
  fireEvent.click(dismisses[0]!)
  await act(async () => {})
  // The remaining shown notice's dismiss takes focus, exactly.
  expect(notices.getAllByRole("button", { name: /^Dismiss:/ })[0]).toHaveFocus()
  const clear = screen.getByRole("button", { name: "Clear all" })
  act(() => clear.focus())
  fireEvent.click(clear)
  await act(async () => {})
  // Clear all unmounts itself; the always-rendered History trigger takes the focus.
  expect(screen.getByRole("button", { name: "History" })).toHaveFocus()
})

it.each([AlertsActionsDemo, AlertsHistoryDemo, AlertsBridgeDemo])("omits the store-backed list when notices are cleared in %s", (Demo) => {
  render(<Demo />)
  const notices = within(screen.getByRole("group", { name: "Notices" }))
  const clear = notices.queryByRole("button", { name: "Clear all" })
  if (clear) fireEvent.click(clear)
  else for (const button of notices.getAllByRole("button", { name: /^Dismiss:/ })) fireEvent.click(button)
  expect(notices.queryByRole("list")).toBeNull()
  expect(notices.queryByRole("button", { name: "Clear all" })).toBeNull()
  expect(notices.getByText("No notices.")).toBeInTheDocument()
})

it("announces forwarded notices through the bridge readout without repeating a folded arrival", () => {
  render(<AlertsBridgeDemo />)
  const status = screen.getByRole("status")
  expect(status).toHaveAttribute("aria-atomic", "true")
  expect(within(status).getByText("None yet")).toBeInTheDocument()
  const receive = screen.getByRole("button", { name: "Receive slow notice" })
  fireEvent.click(receive)
  expect(within(status).getByText("1")).toBeInTheDocument()
  expect(within(status).getByText("Feed slow")).toBeInTheDocument()
  const announcement = status.textContent
  fireEvent.click(receive)
  expect(screen.getByText(/Received 2 times/)).toBeInTheDocument()
  expect(status.textContent).toBe(announcement)
  fireEvent.click(screen.getByRole("button", { name: "Clear all" }))
  fireEvent.click(receive)
  expect(within(status).getByText("2")).toBeInTheDocument()
  expect(screen.getAllByRole("status")).toHaveLength(1)
  expect(screen.queryByRole("alert")).toBeNull()
})
