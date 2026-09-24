import { fireEvent, render, screen, within } from "@testing-library/react"
import { expect, it } from "vitest"
import AlertsDemo from "./demos/alerts"
import AlertsActionsDemo from "./demos/alerts-actions"
import AlertsHistoryDemo from "./demos/alerts-history"
import AlertsBridgeDemo from "./demos/alerts-bridge"

it("replaces the basic list with its empty state and restores the notices", () => {
  render(<AlertsDemo />)
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
