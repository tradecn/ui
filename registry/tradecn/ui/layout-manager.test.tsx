import { createRef, useState } from "react"
import { LayoutManagerControls } from "@/demos/layout-manager-workspace"
import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { createPreferences } from "@/registry/tradecn/lib/preferences"
import { WORKSPACE_PERSISTENCE_BOUNDARIES, type WorkspaceLayout } from "@/registry/tradecn/lib/workspace-layout"
import {
  DEFAULT_LAYOUT_MANAGER_LABELS,
  LAYOUT_TEMPLATES_SLOT,
  LayoutManager,
  useLayoutManagerItem,
  LayoutManagerItem, LayoutManagerName, LayoutManagerLoad, LayoutManagerSave, LayoutManagerSaveName, LayoutManagerRename, LayoutManagerDelete, LayoutManagerImportText, LayoutManagerImportSubmit,
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
    const view = render(<LayoutManager templates={initial} onTemplatesChange={onTemplatesChange} onLoad={onLoad} current={TWO} kinds={["book", "chart"]} now={() => T} {...props}><LayoutManagerControls onExport={onExport} onReset={onReset} /></LayoutManager>)
    const rerender = (templates: LayoutTemplate[], more: Partial<Parameters<typeof LayoutManager>[0]> = {}) =>
      view.rerender(<LayoutManager templates={templates} onTemplatesChange={onTemplatesChange} onLoad={onLoad} current={TWO} kinds={["book", "chart"]} now={() => T} {...props} {...more}><LayoutManagerControls onExport={onExport} onReset={onReset} /></LayoutManager>)
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

describe("composition and migration", () => {
  const templates = saveTemplate(saveTemplate([], "Morning", TWO, T), "With ladder", THREE, T)
  const rootProps = { templates, onTemplatesChange: vi.fn(), onLoad: vi.fn() }

  it("rejects old minimal calls and moved actions through the real compiler", () => {
    // @ts-expect-error The released minimal call needs an explicit composition.
    const minimal = <LayoutManager {...rootProps} />
    // @ts-expect-error Retained inputs do not supply a composition.
    const configured = <LayoutManager {...rootProps} current={TWO} activeId="t-1" kinds={["book"]} labels={{ title: "Saved" }} now={() => T} className="manager" />
    // @ts-expect-error Export belongs to caller controls.
    const exporting = <LayoutManager {...rootProps} onExport={() => {}}><span /></LayoutManager>
    // @ts-expect-error Reset belongs to caller controls.
    const resetting = <LayoutManager {...rootProps} onReset={() => {}}><span /></LayoutManager>
    // @ts-expect-error A template item needs caller content.
    const item = <LayoutManagerItem templateId="t-1" />
    // @ts-expect-error Custom readings use useLayoutManagerItem.
    const name = <LayoutManagerName>Custom name</LayoutManagerName>
    const conditional = <LayoutManager {...rootProps}>{Boolean(vi.fn()()) && <span />}</LayoutManager>
    const empty = <LayoutManager {...rootProps}>{null}</LayoutManager>
    expect([minimal, configured, exporting, resetting, item, name, conditional, empty]).toHaveLength(8)
  })

  it("forwards refs and native props, honors event cancellation and supports caller ordering", () => {
    const root = createRef<HTMLElement>()
    const item = createRef<HTMLDivElement>()
    const action = createRef<HTMLButtonElement>()
    const field = createRef<HTMLInputElement>()
    const onLoad = vi.fn()
    render(<LayoutManager {...rootProps} onLoad={onLoad} ref={root} aria-label="Saved workspaces" data-custom="yes">
      <p>Application content</p>
      <LayoutManagerSaveName ref={field} onChange={(event) => event.preventDefault()} />
      {templates.toReversed().map((template) => <LayoutManagerItem key={template.id} templateId={template.id} ref={template.id === "t-1" ? item : undefined}>
        <LayoutManagerName /><LayoutManagerLoad ref={action} onClick={(event) => event.preventDefault()}>Open</LayoutManagerLoad>
      </LayoutManagerItem>)}
    </LayoutManager>)
    expect(root.current).toBe(screen.getByRole("region", { name: "Saved workspaces" }))
    expect(root.current).toHaveAttribute("data-custom", "yes")
    expect(item.current).toBe(screen.getByRole("group", { name: "Morning" }))
    expect(screen.getAllByRole("group").map((node) => node.textContent)).toEqual(["With ladderOpen", "MorningOpen"])
    fireEvent.click(action.current!)
    expect(onLoad).not.toHaveBeenCalled()
    fireEvent.change(field.current!, { target: { value: "Ignored" } })
    expect(field.current).toHaveValue("")
  })

  function mounted(initial = templates) {
    const changed = vi.fn()
    const loaded = vi.fn()
    let replace: (next: LayoutTemplate[]) => void = () => {}
    function Consumer() {
      const [list, setList] = useState(initial)
      replace = setList
      return <LayoutManager templates={list} onTemplatesChange={(next) => { changed(next); setList(next) }} current={TWO} onLoad={loaded} kinds={["book", "chart"]}>
        <LayoutManagerControls />
      </LayoutManager>
    }
    const view = render(<Consumer />)
    return { ...view, changed, loaded, replace: (next: LayoutTemplate[]) => act(() => replace(next)) }
  }

  it("invalidates confirmation after a target layout changes or disappears, while preserving it across equivalent copies", () => {
    const { loaded, replace } = mounted()
    const group = () => within(screen.getByRole("group", { name: "With ladder" }))
    fireEvent.click(group().getByRole("button", { name: "Load" }))
    replace(structuredClone(templates))
    expect(group().getByRole("button", { name: "Load anyway?" })).toBeInTheDocument()
    replace([templates[0]!, { ...templates[1]!, layout: layout({ other: "unknown" }) }])
    fireEvent.click(group().getByRole("button", { name: "Load" }))
    expect(loaded).not.toHaveBeenCalled()
    replace([templates[0]!])
    replace(templates)
    expect(group().getByRole("button", { name: "Load" })).toBeInTheDocument()
  })

  it("uses the latest callbacks and skips warning confirmation with omitted or empty kinds", () => {
    const onLoad = vi.fn()
    const nextLoad = vi.fn()
    const view = render(<LayoutManager {...rootProps} onLoad={onLoad}><LayoutManagerControls /></LayoutManager>)
    fireEvent.click(within(screen.getByRole("group", { name: "With ladder" })).getByRole("button", { name: "Load" }))
    expect(onLoad).toHaveBeenCalledOnce()
    view.rerender(<LayoutManager {...rootProps} onLoad={nextLoad} kinds={[]}><LayoutManagerControls /></LayoutManager>)
    fireEvent.click(within(screen.getByRole("group", { name: "With ladder" })).getByRole("button", { name: "Load" }))
    expect(nextLoad).toHaveBeenCalledOnce()
  })

  it("commits rename once, restores its trigger for Enter and Escape, and preserves a blur destination", () => {
    const { changed } = mounted()
    const trigger = screen.getByRole("button", { name: "Rename: Morning" })
    fireEvent.click(trigger)
    const field = screen.getByRole("textbox", { name: "Rename: Morning" })
    expect(field).toHaveFocus()
    fireEvent.change(field, { target: { value: "Open" } })
    fireEvent.keyDown(field, { key: "Enter" })
    expect(changed).toHaveBeenCalledOnce()
    expect(trigger).toHaveFocus()
    fireEvent.click(trigger)
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Rename: Open" }), { key: "Escape" })
    expect(trigger).toHaveFocus()
    expect(changed).toHaveBeenCalledOnce()
    fireEvent.click(trigger)
    const saveName = screen.getByRole("textbox", { name: "Layout name" })
    act(() => saveName.focus())
    expect(saveName).toHaveFocus()
  })

  it("cancels rename after its source changes without writing the obsolete draft", () => {
    const { changed, replace } = mounted()
    const trigger = screen.getByRole("button", { name: "Rename: Morning" })
    fireEvent.click(trigger)
    fireEvent.change(screen.getByRole("textbox", { name: "Rename: Morning" }), { target: { value: "Obsolete" } })
    replace([{ ...templates[0]!, name: "Externally renamed" }, templates[1]!])
    expect(screen.queryByRole("textbox", { name: /Rename:/ })).toBeNull()
    expect(changed).not.toHaveBeenCalled()
    expect(trigger).toHaveFocus()
  })

  it("moves focus to the save field after removing a focused row", () => {
    const { replace } = mounted()
    const trigger = screen.getByRole("button", { name: "Delete: Morning" })
    act(() => trigger.focus())
    fireEvent.click(trigger)
    fireEvent.click(trigger)
    expect(screen.getByRole("textbox", { name: "Layout name" })).toHaveFocus()
    const last = screen.getByRole("button", { name: "Delete: With ladder" })
    act(() => last.focus())
    replace([])
    expect(screen.getByRole("textbox", { name: "Layout name" })).toHaveFocus()
  })

  it("links import errors, clears them on edits, and restores focus after an accepted import", () => {
    const { changed } = mounted([])
    const trigger = screen.getByRole("button", { name: "Import" })
    fireEvent.click(trigger)
    const text = screen.getByRole("textbox", { name: "Paste a layout's JSON" })
    fireEvent.change(text, { target: { value: "{}" } })
    fireEvent.click(screen.getByRole("button", { name: "Add" }))
    expect(text).toHaveAttribute("aria-invalid", "true")
    expect(text).toHaveAttribute("aria-describedby", screen.getByRole("alert").id)
    expect(changed).not.toHaveBeenCalled()
    fireEvent.change(text, { target: { value: JSON.stringify(TWO) } })
    expect(screen.queryByRole("alert")).toBeNull()
    const add = screen.getByRole("button", { name: "Add" })
    act(() => add.focus())
    fireEvent.click(add)
    expect(changed).toHaveBeenCalledOnce()
    expect(trigger).toHaveFocus()
  })

  it("supports import fields without a collapsible presentation", () => {
    const changed = vi.fn()
    render(<LayoutManager {...rootProps} onTemplatesChange={changed} now={() => T}>
      <LayoutManagerImportText /><LayoutManagerImportSubmit>Add a snapshot</LayoutManagerImportSubmit>
    </LayoutManager>)
    const text = screen.getByRole("textbox", { name: "Paste a layout's JSON" })
    fireEvent.change(text, { target: { value: JSON.stringify(TWO) } })
    fireEvent.click(screen.getByRole("button", { name: "Add a snapshot" }))
    expect(changed).toHaveBeenCalledOnce()
    expect(text).toHaveValue("")
  })

  it("preserves IME composition and prevents save Enter from submitting a surrounding form", () => {
    const changed = vi.fn()
    render(<form onSubmit={(event) => event.preventDefault()}><LayoutManager {...rootProps} current={TWO} onTemplatesChange={changed}><LayoutManagerControls /></LayoutManager></form>)
    const field = screen.getByRole("textbox", { name: "Layout name" })
    fireEvent.change(field, { target: { value: "Desk" } })
    fireEvent.keyDown(field, { key: "Enter", isComposing: true })
    expect(changed).not.toHaveBeenCalled()
    expect(fireEvent.keyDown(field, { key: "Enter" })).toBe(false)
    expect(changed).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole("button", { name: "Rename: Morning" }))
    const rename = screen.getByRole("textbox", { name: "Rename: Morning" })
    fireEvent.keyDown(rename, { key: "Enter", isComposing: true })
    fireEvent.keyDown(rename, { key: "Escape", isComposing: true })
    expect(rename).toHaveFocus()
    expect(changed).toHaveBeenCalledOnce()
  })

  it("rejects parts outside their coordinating root or item", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      expect(() => render(<LayoutManagerSave />)).toThrow("inside LayoutManager")
      expect(() => render(<LayoutManager {...rootProps}><LayoutManagerName /></LayoutManager>)).toThrow("inside LayoutManagerItem")
    } finally { error.mockRestore() }
  })

  it("supports root focus fallback without a save field and caller-disabled actions", () => {
    const changed = vi.fn()
    const view = render(<LayoutManager {...rootProps} onTemplatesChange={changed}>
      <LayoutManagerItem templateId="t-1"><LayoutManagerRename disabled /><LayoutManagerDelete disabled /></LayoutManagerItem>
    </LayoutManager>)
    expect(screen.getByRole("button", { name: "Rename: Morning" })).toBeDisabled()
    fireEvent.click(screen.getByRole("button", { name: "Delete: Morning" }))
    expect(changed).not.toHaveBeenCalled()
    act(() => screen.getByRole("group").focus())
    view.rerender(<LayoutManager {...rootProps} templates={[]}>{null}</LayoutManager>)
    expect(screen.getByRole("region")).toHaveFocus()
  })
})


it("reuses rename focus behavior in a caller-owned native field", () => {
  function CustomName() {
    const item = useLayoutManagerItem()
    return item.renaming ? <input data-layout-rename-field="" aria-label="Custom name" value={item.name} onChange={(event) => item.setName(event.target.value)} onBlur={() => item.commitRename({ restoreFocus: false })} onKeyDown={(event) => {
      if (event.key === "Enter") item.commitRename()
      if (event.key === "Escape") item.cancelRename()
    }} /> : <span>{item.name}</span>
  }
  const changed = vi.fn()
  render(<LayoutManager templates={saveTemplate([], "Morning", TWO, T)} onTemplatesChange={changed} onLoad={() => {}}>
    <LayoutManagerItem templateId="t-1"><CustomName /><LayoutManagerRename /><LayoutManagerLoad /></LayoutManagerItem>
  </LayoutManager>)
  const trigger = screen.getByRole("button", { name: "Rename: Morning" })
  const destination = screen.getByRole("button", { name: "Load" })
  fireEvent.click(trigger)
  const input = screen.getByRole("textbox", { name: "Custom name" })
  expect(input).toHaveFocus()
  fireEvent.change(input, { target: { value: "Changed" } })
  act(() => destination.focus())
  expect(destination).toHaveFocus()
  expect(changed).toHaveBeenCalledOnce()
  fireEvent.click(trigger)
  fireEvent.keyDown(screen.getByRole("textbox", { name: "Custom name" }), { key: "Enter" })
  expect(trigger).toHaveFocus()
})
