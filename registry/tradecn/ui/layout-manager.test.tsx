import { fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { createPreferences } from "@/registry/tradecn/lib/preferences"
import { WORKSPACE_PERSISTENCE_BOUNDARIES, type WorkspaceLayout } from "@/registry/tradecn/lib/workspace-layout"
import {
  DEFAULT_LAYOUT_MANAGER_LABELS,
  LAYOUT_TEMPLATES_SLOT,
  LayoutManager,
  deleteTemplate,
  duplicateTemplate,
  exportTemplate,
  importTemplate,
  parseLayoutTemplates,
  readLayoutTemplates,
  renameTemplate,
  saveTemplate,
  writeLayoutTemplates,
  type LayoutTemplate,
} from "@/registry/tradecn/ui/layout-manager"

function layout(panels: Record<string, string>): WorkspaceLayout {
  return {
    version: 1,
    kind: "tradecn-workspace",
    dockview: { grid: { root: {} }, panels: Object.fromEntries(Object.keys(panels).map((id) => [id, {}])) },
    panels: Object.fromEntries(Object.entries(panels).map(([id, kind]) => [id, { kind, title: kind, state: {} }])),
    boundaries: WORKSPACE_PERSISTENCE_BOUNDARIES,
  }
}

const TWO = layout({ "book-1": "book", "chart-1": "chart" })
const THREE = layout({ "book-1": "book", "chart-1": "chart", "ladder-1": "ladder" })
const T = 1_700_000_000_000

describe("the list as data", () => {
  it("saves under a name, replaces the one already named, renames, duplicates beside the original, and deletes", () => {
    let list = saveTemplate([], " Desk A ", TWO, T)
    expect(list).toEqual([{ id: "t-1", name: "Desk A", layout: TWO, savedAt: T }])
    list = saveTemplate(list, "Desk B", THREE, T + 1)
    expect(list.map((t) => t.id)).toEqual(["t-1", "t-2"])
    list = saveTemplate(list, "Desk A", THREE, T + 2)
    expect(list).toHaveLength(2)
    expect(list[0]).toMatchObject({ id: "t-1", layout: THREE, savedAt: T + 2 })
    list = renameTemplate(list, "t-2", " Morning ")
    expect(list[1]?.name).toBe("Morning")
    expect(renameTemplate(list, "t-2", "  ")[1]?.name).toBe("Morning")
    list = duplicateTemplate(list, "t-1", T + 3)
    expect(list.map((t) => t.name)).toEqual(["Desk A", "Copy of Desk A", "Morning"])
    expect(list[1]).toMatchObject({ id: "t-3", savedAt: T + 3 })
    expect(list[1]?.layout).toEqual(THREE)
    expect(list[1]?.layout).not.toBe(list[0]?.layout)
    expect(duplicateTemplate(list, "t-1", T, "Evening")[1]?.name).toBe("Evening")
    expect(duplicateTemplate(list, "nope", T)).toEqual(list)
    expect(deleteTemplate(list, "t-3").map((t) => t.id)).toEqual(["t-1", "t-2"])
  })

  it("exports a layout as JSON and imports one back, refusing text that is not a layout", () => {
    const list = saveTemplate([], "Desk A", TWO, T)
    const text = exportTemplate(list[0]!)
    expect(JSON.parse(text)).toEqual(TWO)
    const imported = importTemplate(list, text, "From a colleague", T + 5)
    expect(imported?.map((t) => t.name)).toEqual(["Desk A", "From a colleague"])
    expect(imported?.[1]?.layout).toEqual(TWO)
    expect(importTemplate(list, "{}", "x", T)).toBeNull()
    expect(importTemplate(list, "not json", "x", T)).toBeNull()
  })

  it("reads a stored list taking nothing on trust, and round-trips through a preferences slot", () => {
    const list = saveTemplate(saveTemplate([], "Desk A", TWO, T), "Desk B", THREE, T + 1)
    let prefs = createPreferences({ template: [LAYOUT_TEMPLATES_SLOT] })
    prefs = writeLayoutTemplates(prefs, list)
    expect(prefs.slots[LAYOUT_TEMPLATES_SLOT]?.version).toBe(1)
    expect(readLayoutTemplates(prefs)).toEqual(list)
    expect(readLayoutTemplates(createPreferences())).toEqual([])
    // A template whose layout does not parse is dropped; the rest stay; a bare list reads too.
    expect(parseLayoutTemplates({ version: 1, templates: [list[0], { id: "bad", name: "Bad", layout: { kind: "other" } }, { id: "", name: "x", layout: TWO }] })).toEqual([list[0]])
    expect(parseLayoutTemplates(JSON.stringify(list))).toEqual(list)
    expect(parseLayoutTemplates("nope")).toEqual([])
    expect(parseLayoutTemplates(null)).toEqual([])
  })
})

describe("LayoutManager", () => {
  function setup(initial: LayoutTemplate[] = [], props: Partial<Parameters<typeof LayoutManager>[0]> = {}) {
    const onTemplatesChange = vi.fn()
    const onLoad = vi.fn()
    const onExport = vi.fn()
    const onReset = vi.fn()
    const view = render(<LayoutManager templates={initial} onTemplatesChange={onTemplatesChange} onLoad={onLoad} onExport={onExport} onReset={onReset} current={TWO} kinds={["book", "chart"]} now={() => T} {...props} />)
    const rerender = (templates: LayoutTemplate[], more: Partial<Parameters<typeof LayoutManager>[0]> = {}) =>
      view.rerender(<LayoutManager templates={templates} onTemplatesChange={onTemplatesChange} onLoad={onLoad} onExport={onExport} onReset={onReset} current={TWO} kinds={["book", "chart"]} now={() => T} {...props} {...more} />)
    return { onTemplatesChange, onLoad, onExport, onReset, rerender, region: screen.getByRole("region", { name: "Layouts" }) }
  }

  it("saves the current layout under a typed name, says when the name is taken, and lists the templates with their panel counts", () => {
    const { onTemplatesChange, rerender, region } = setup()
    expect(region.dataset.slot).toBe("tradecn-layout-manager")
    expect(region).toHaveTextContent(DEFAULT_LAYOUT_MANAGER_LABELS.empty)
    const save = screen.getByRole("button", { name: "Save current" })
    expect(save).toBeDisabled()
    const field = screen.getByRole("textbox", { name: "Layout name" })
    fireEvent.change(field, { target: { value: "Desk A" } })
    expect(save).toBeEnabled()
    fireEvent.keyDown(field, { key: "Enter" })
    expect(onTemplatesChange).toHaveBeenLastCalledWith([{ id: "t-1", name: "Desk A", layout: TWO, savedAt: T }])
    expect(field).toHaveValue("")
    const list = onTemplatesChange.mock.lastCall![0] as LayoutTemplate[]
    rerender(list, { activeId: "t-1" })
    const row = region.querySelector("[data-layout-template='t-1']")!
    expect(row).toHaveAttribute("data-active", "true")
    expect(row.querySelector("[data-layout-name]")).toHaveTextContent("Desk A")
    expect(row.querySelector("[data-layout-panels]")).toHaveTextContent("2 panels")
    expect(row.querySelector("[data-layout-active]")).toHaveTextContent("loaded")
    fireEvent.change(field, { target: { value: "Desk A" } })
    expect(region.querySelector("[data-layout-taken]")).toHaveTextContent("A layout named Desk A exists. Save replaces it.")
    // Without a current layout there is nothing to save.
    rerender(list, { current: null })
    expect(screen.getByRole("button", { name: "Save current" })).toBeDisabled()
  })

  it("loads at once when the workspace has every kind, asks again when it does not, deletes on the second press, renames inline, duplicates, exports, and resets", () => {
    const list = saveTemplate(saveTemplate([], "Desk A", TWO, T), "With ladder", THREE, T + 1)
    const { onTemplatesChange, onLoad, onExport, onReset, region } = setup(list)
    const a = within(region.querySelector("[data-layout-template='t-1']")!)
    const b = within(region.querySelector("[data-layout-template='t-2']")!)
    // Every kind known: one press loads.
    fireEvent.click(a.getByRole("button", { name: "Load" }))
    expect(onLoad).toHaveBeenCalledWith(TWO, list[0])
    // A kind the workspace lacks is said, and Load asks again.
    expect(region.querySelector("[data-layout-template='t-2']")).toHaveAttribute("data-unknown-kinds", "1")
    expect(b.getByText("Needs ladder")).toBeInTheDocument()
    fireEvent.click(b.getByRole("button", { name: "Load" }))
    expect(onLoad).toHaveBeenCalledTimes(1)
    fireEvent.click(b.getByRole("button", { name: "Load anyway?" }))
    expect(onLoad).toHaveBeenCalledTimes(2)
    expect(onLoad).toHaveBeenLastCalledWith(THREE, list[1])
    // Delete asks once; another row's press withdraws the question.
    fireEvent.click(a.getByRole("button", { name: "Delete: Desk A" }))
    expect(onTemplatesChange).not.toHaveBeenCalled()
    expect(a.getByRole("button", { name: "Delete?: Desk A" })).toBeInTheDocument()
    fireEvent.click(b.getByRole("button", { name: "Delete: With ladder" }))
    expect(a.getByRole("button", { name: "Delete: Desk A" })).toBeInTheDocument()
    fireEvent.click(b.getByRole("button", { name: "Delete?: With ladder" }))
    expect(onTemplatesChange).toHaveBeenLastCalledWith([list[0]])
    // Rename inline: Enter commits, Escape leaves it.
    fireEvent.click(a.getByRole("button", { name: "Rename: Desk A" }))
    const rename = screen.getByRole("textbox", { name: "Rename: Desk A" })
    fireEvent.change(rename, { target: { value: "Desk One" } })
    fireEvent.keyDown(rename, { key: "Enter" })
    expect(onTemplatesChange).toHaveBeenLastCalledWith([{ ...list[0]!, name: "Desk One" }, list[1]])
    fireEvent.click(a.getByRole("button", { name: "Rename: Desk A" }))
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Rename: Desk A" }), { key: "Escape" })
    expect(screen.queryByRole("textbox", { name: "Rename: Desk A" })).toBeNull()
    // Duplicate and export.
    fireEvent.click(a.getByRole("button", { name: "Duplicate: Desk A" }))
    expect((onTemplatesChange.mock.lastCall![0] as LayoutTemplate[]).map((t) => t.name)).toEqual(["Desk A", "Copy of Desk A", "With ladder"])
    fireEvent.click(a.getByRole("button", { name: "Export: Desk A" }))
    expect(onExport).toHaveBeenCalledWith(exportTemplate(list[0]!), list[0])
    fireEvent.click(screen.getByRole("button", { name: "Reset to default" }))
    expect(onReset).toHaveBeenCalledTimes(1)
  })

  it("imports a pasted layout under a name and refuses text that is not one", () => {
    const { onTemplatesChange } = setup()
    fireEvent.click(screen.getByRole("button", { name: "Import" }))
    const paste = screen.getByRole("textbox", { name: "Paste a layout's JSON" })
    fireEvent.change(paste, { target: { value: "{}" } })
    fireEvent.click(screen.getByRole("button", { name: "Add" }))
    expect(screen.getByRole("alert")).toHaveTextContent("That is not a workspace layout.")
    expect(onTemplatesChange).not.toHaveBeenCalled()
    fireEvent.change(paste, { target: { value: JSON.stringify(THREE) } })
    fireEvent.change(screen.getAllByRole("textbox", { name: "Layout name" })[1]!, { target: { value: "Pasted" } })
    fireEvent.click(screen.getByRole("button", { name: "Add" }))
    expect(onTemplatesChange).toHaveBeenLastCalledWith([{ id: "t-1", name: "Pasted", layout: THREE, savedAt: T }])
    expect(screen.queryByRole("textbox", { name: "Paste a layout's JSON" })).toBeNull()
  })
})
