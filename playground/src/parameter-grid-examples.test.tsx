import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import ParameterGridServerDemo from "@/demos/parameter-grid-server"

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, writable: true, value: vi.fn(() => ({ cancel: vi.fn(), currentTime: 0, onfinish: null })) })
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(900)
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(200)
})
afterEach(() => vi.restoreAllMocks())

it("holds a pending request until its reply, then restores edits after acceptance or refusal", async () => {
  render(<ParameterGridServerDemo />)
  const grid = screen.getByRole("grid")
  const width = document.querySelector<HTMLElement>('[data-row-id="zn"] [data-col="width"]')!
  const commit = (value: string) => {
    fireEvent.doubleClick(width)
    const input = screen.getByRole("textbox", { name: "Width" })
    fireEvent.change(input, { target: { value } })
    fireEvent.keyDown(input, { key: "Enter" })
  }
  const reply = async () => {
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Receive reply" })) })
  }

  // Reopening a pending 4 and committing the still-stored 2 used to hide that request without cancelling it.
  commit("4")
  expect(width).toHaveAttribute("data-pending")
  expect(width).toHaveAttribute("aria-readonly", "true")
  fireEvent.doubleClick(width)
  fireEvent.keyDown(grid, { key: "Enter" })
  expect(screen.queryByRole("textbox", { name: "Width" })).not.toBeInTheDocument()
  expect(width).toHaveTextContent("4.00")
  const toggle = screen.getByRole("checkbox", { name: "Disable ZN" })
  expect(toggle.hasAttribute("disabled") || toggle.getAttribute("aria-disabled") === "true").toBe(true)
  await reply()
  expect(width).not.toHaveAttribute("data-pending")
  expect(width).toHaveAttribute("aria-readonly", "false")
  expect(width).toHaveTextContent("4.00")

  commit("2")
  await reply()
  expect(width).toHaveTextContent("2.00")
  commit("9")
  await reply()
  expect(width).toHaveAttribute("data-rejected", "Over 8")
  expect(width).toHaveTextContent("2.00Over 8")
  expect(width).toHaveAttribute("aria-readonly", "false")
  expect(toggle.hasAttribute("disabled") || toggle.getAttribute("aria-disabled") === "true").toBe(false)
  commit("3")
  await reply()
  expect(width).toHaveTextContent("3.00")
  expect(width).not.toHaveAttribute("data-rejected")
})
