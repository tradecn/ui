import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { StrictMode, useState } from "react"
import { afterEach, expect, it, vi } from "vitest"
import { PreviewAlignment } from "./preview-alignment"

afterEach(() => { delete document.documentElement.dataset.previewAlign })

it("requests a shared preference and follows external changes without resetting the demo", () => {
  document.documentElement.dataset.previewAlign = "right"
  const requested = vi.fn()
  window.addEventListener("tradecn-preview-align", requested)
  function Demo() {
    const [batches, setBatches] = useState(0)
    return <button onClick={() => setBatches(batches + 1)}>Batches: {batches}</button>
  }
  render(<StrictMode><PreviewAlignment /><Demo /></StrictMode>)
  const controls = within(screen.getByRole("group", { name: "Preview alignment" }))
  expect(controls.getByRole("button", { name: "Align all previews right" })).toHaveAttribute("aria-pressed", "true")
  fireEvent.click(screen.getByRole("button", { name: "Batches: 0" }))
  for (const alignment of ["left", "right", "center"]) {
    fireEvent.click(controls.getByRole("button", { name: `Align all previews ${alignment}` }))
    expect((requested.mock.lastCall![0] as CustomEvent).detail).toBe(alignment)
    // The same notification arrives for a choice from another preview or browser tab.
    act(() => {
      document.documentElement.dataset.previewAlign = alignment
      window.dispatchEvent(new Event("tradecn-preview-alignment-change"))
    })
    expect(controls.getAllByRole("button", { pressed: true })).toEqual([controls.getByRole("button", { name: `Align all previews ${alignment}` })])
    expect(screen.getByRole("button", { name: "Batches: 1" })).toBeInTheDocument()
  }
  window.removeEventListener("tradecn-preview-align", requested)
})
