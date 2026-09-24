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

it.each(["expiry", "clear"])("returns focus from terminal history after %s removes the overflow", async (change) => {
  vi.useFakeTimers()
  const alerts = alertStore.createAlertStore()
  alerts.push({ severity: "warning", title: "Retained", allowedActions: ["ack"] })
  alerts.push({ severity: "info", title: "Temporary" })
  render(<DeskAlerts alerts={alerts} actions={[]} />)
  const trigger = screen.getByRole("button", { name: "1 more" })
  trigger.focus()
  fireEvent.click(trigger)
  await act(async () => { await vi.advanceTimersByTimeAsync(100) })
  const dialog = screen.getByRole("dialog", { name: "All notices" })
  await act(async () => {
    if (change === "expiry") await vi.advanceTimersByTimeAsync(12_000)
    else alerts.clear()
  })
  expect(alerts.size()).toBe(change === "expiry" ? 1 : 0)
  if (change === "expiry") fireEvent.keyDown(dialog, { key: "Escape", code: "Escape" })
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

it("replaces the local collection with its empty state and restores the notices", () => {
  render(<AlertsCollectionDemo />)
  const notices = within(screen.getByRole("group", { name: "Notices" }))
  for (const button of notices.getAllByRole("button", { name: /^Dismiss:/ })) fireEvent.click(button)
  expect(notices.queryByRole("list")).toBeNull()
  expect(notices.getByText("No notices.")).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "Restore notices" }))
  expect(notices.getAllByRole("listitem")).toHaveLength(2)
  expect(notices.queryByText("No notices.")).toBeNull()
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
