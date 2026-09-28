import { render, screen, within } from "@testing-library/react"
import { expect, it } from "vitest"
import SpreadMatrixCompositionDemo from "./demos/spread-matrix-composition"

it.each(["Long maturities against 2Y", "Selected curves and butterflies"])("places row headers before the readings they label in %s", (name) => {
  render(<SpreadMatrixCompositionDemo />)
  const table = screen.getByRole("table", { name })
  const rows = within(table).getAllByRole("row").slice(1)
  expect(rows).toHaveLength(2)
  for (const row of rows) {
    const header = within(row).getByRole("rowheader")
    expect(header).toHaveAttribute("scope", "row")
    expect(row.firstElementChild).toBe(header)
    expect(within(row).getByRole("cell")).toHaveTextContent(/[+−]\d/)
  }
})
