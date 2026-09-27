import { fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import LayoutManagerCardsDemo from "@/demos/layout-manager-cards"
import { WORKSPACE_PERSISTENCE_BOUNDARIES, type WorkspaceLayout } from "@/registry/tradecn/lib/workspace-layout"

describe("layout manager card recipe", () => {
  it("saves the selected imported snapshot and preserves its loaded marker when saving over it", () => {
    render(<LayoutManagerCardsDemo />)
    const layout: WorkspaceLayout = {
      version: 1, kind: "tradecn-workspace",
      dockview: { grid: { root: {} }, panels: { ladder: {} } },
      panels: { ladder: { kind: "ladder", title: "Ladder", state: {} } },
      boundaries: WORKSPACE_PERSISTENCE_BOUNDARIES,
    }
    fireEvent.change(screen.getByRole("textbox", { name: "Paste a layout's JSON" }), { target: { value: JSON.stringify(layout) } })
    fireEvent.change(screen.getByRole("textbox", { name: "Imported layout name" }), { target: { value: "Imported" } })
    fireEvent.click(screen.getByRole("button", { name: "Add" }))
    const imported = within(screen.getByRole("group", { name: "Imported" }))
    fireEvent.click(imported.getByRole("button", { name: "Load" }))
    fireEvent.click(imported.getByRole("button", { name: "Load anyway?" }))
    expect(imported.getByText("loaded")).toBeInTheDocument()
    fireEvent.change(screen.getByRole("textbox", { name: "Layout name" }), { target: { value: "Saved selection" } })
    fireEvent.click(screen.getByRole("button", { name: "Save current" }))
    fireEvent.click(screen.getByRole("button", { name: "Export: Saved selection" }))
    const exported = screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Exported layout JSON" })
    expect(JSON.parse(exported.value)).toEqual(layout)
    fireEvent.change(screen.getByRole("textbox", { name: "Layout name" }), { target: { value: "Imported" } })
    fireEvent.click(screen.getByRole("button", { name: "Save current" }))
    expect(imported.getByText("loaded")).toBeInTheDocument()
  })
})
