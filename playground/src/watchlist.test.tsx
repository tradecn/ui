import { fireEvent, render, screen } from "@testing-library/react"
import { expect, it } from "vitest"
import WatchlistLayoutDemo from "./demos/watchlist-layout"

it.each(["GC", "ES"])("returns focus to the alternate watchlist's symbol control after submitting %s", symbol => {
  render(<WatchlistLayoutDemo />)
  const select = screen.getByRole("combobox", { name: "Instrument" })
  const add = screen.getByRole("button", { name: "Add to watchlist" })
  fireEvent.change(select, { target: { value: symbol } })
  add.focus()
  fireEvent.submit(add.closest("form")!)
  expect(screen.getByRole("grid", { name: "Watchlist instruments" })).toHaveAttribute("aria-rowcount", symbol === "GC" ? "4" : "3")
  expect(screen.getByText(symbol === "GC" ? "0 selected" : "1 selected")).toBeInTheDocument()
  expect(select).toHaveValue("")
  expect(add).toBeDisabled()
  expect(select).toHaveFocus()
})

it("keeps the alternate watchlist's bulk action tied to selected rows and clears removed selections", () => {
  render(<WatchlistLayoutDemo />)
  const grid = screen.getByRole("grid", { name: "Watchlist instruments" })
  const remove = screen.getByRole("button", { name: "Remove selected" })
  fireEvent.keyDown(grid, { key: "ArrowDown" })
  expect(screen.getByText("0 selected")).toBeInTheDocument()
  expect(remove).toBeDisabled()
  const select = screen.getByRole("combobox", { name: "Instrument" })
  // ES is already present: the shared add command selects it.
  fireEvent.change(select, { target: { value: "ES" } })
  fireEvent.submit(select.closest("form")!)
  expect(screen.getByText("1 selected")).toBeInTheDocument()
  remove.focus()
  fireEvent.click(remove)
  expect(grid).toHaveAttribute("aria-rowcount", "2")
  expect(screen.getByText("0 selected")).toBeInTheDocument()
  expect(remove).toBeDisabled()
  expect(select).toHaveFocus()
})
