import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import FeedHealthDemo from "./demos/feed-health"
import FeedHealthLanesDemo from "./demos/feed-health-lanes"
import FeedHealthActionsDemo from "./demos/feed-health-actions"
import FeedHealthCardDemo from "./demos/feed-health-card"
import { FeedHealthScene } from "./items/feed-health"

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

it("starts with one feed, ages quietly and recovers when a message arrives", () => {
  render(<FeedHealthDemo />)
  const item = document.querySelector("[data-feed]")!
  expect(document.querySelectorAll("[data-feed]")).toHaveLength(1)
  expect(item).toHaveAttribute("data-tier", "live")
  act(() => vi.advanceTimersByTime(10_000))
  expect(item).toHaveAttribute("data-tier", "stale")
  expect(item).toHaveAttribute("data-state", "connected")
  fireEvent.click(screen.getByRole("button", { name: "Receive a message" }))
  expect(item).toHaveAttribute("data-tier", "live")
  expect(document.querySelector("[aria-live]")).toHaveTextContent("Market data live")
})

it("preserves lane readings and accessible tier words when the caller compacts the rows", () => {
  render(<FeedHealthLanesDemo />)
  expect(document.querySelector('[data-feed="md"]')).toHaveTextContent("drop 7")
  expect(document.querySelector('[data-feed="rfq"]')).toHaveTextContent("gap 3s replaying")
  fireEvent.click(screen.getByRole("checkbox", { name: "Compact" }))
  for (const tier of document.querySelectorAll('[data-slot="tradecn-feed-health-tier"]')) expect(tier).toHaveClass("sr-only")
  fireEvent.click(screen.getByRole("button", { name: "Close RFQ gap" }))
  expect(document.querySelector('[data-feed="rfq"]')).not.toHaveTextContent("gap")
  expect(document.querySelector('[data-feed="rfq"]')).toHaveAttribute("data-tier", "live")
})

it.each([["menu", FeedHealthActionsDemo], ["card", FeedHealthCardDemo]] as const)("settles the %s recipe's state-changing and same-state replies", async (_, Demo) => {
  const { unmount } = render(<Demo />)
  const item = document.querySelector("[data-feed]")!
  const press = (name: string) => {
    const menu = screen.queryByRole("button", { name: "Actions: RFQ" })
    if (menu) fireEvent.click(menu)
    fireEvent.click(screen.getByRole(menu ? "menuitem" : "button", { name }))
  }
  press("Reconnect")
  expect(item).toHaveAttribute("data-tier", "offline")
  expect(item).toHaveAttribute("data-pending", "reconnect")
  expect(screen.getByRole("button", { name: "Disconnect RFQ" })).toBeDisabled()
  await act(async () => { await vi.advanceTimersByTimeAsync(1200) })
  expect(item).toHaveAttribute("data-state", "connected")
  expect(item).not.toHaveAttribute("data-pending")
  press("Resubscribe")
  expect(item).toHaveAttribute("data-pending", "resubscribe")
  await act(async () => { await vi.advanceTimersByTimeAsync(1200) })
  expect(item).toHaveAttribute("data-state", "connected")
  expect(item).not.toHaveAttribute("data-pending")
  expect(screen.getByRole("status")).toHaveTextContent("Resubscribed.")
  press("Resubscribe")
  unmount()
  act(() => vi.advanceTimersByTime(100))
  expect(vi.getTimerCount()).toBe(0)
})

it("shares one pending owner between the full and compact views and announces tiers once", () => {
  const { unmount } = render(<FeedHealthScene />)
  const views = [...document.querySelectorAll<HTMLElement>('[data-feed="md"]')]
  fireEvent.click(within(views[0]!).getByRole("button", { name: "Actions: Market data" }))
  fireEvent.click(screen.getByRole("menuitem", { name: "Pause" }))
  for (const view of views) expect(view).toHaveAttribute("data-pending", "pause")
  expect(document.querySelectorAll('[data-slot="tradecn-feed-health-announcer"]')).toHaveLength(1)
  unmount()
  act(() => vi.advanceTimersByTime(100))
  expect(vi.getTimerCount()).toBe(0)
})
