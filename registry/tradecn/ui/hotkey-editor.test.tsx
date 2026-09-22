import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { HotkeysProvider } from "@/registry/tradecn/hooks/use-hotkeys"
import { createHotkeyRegistry, type HotkeyBinding, type HotkeyEntry } from "@/registry/tradecn/lib/hotkeys"
import { HotkeyEditor, groupOf, matchesQuery, scopeWord, type HotkeyEditorProps } from "@/registry/tradecn/ui/hotkey-editor"

const BINDINGS: HotkeyBinding[] = [
  { id: "palette.open", keys: "mod+k", scope: "editing", description: "Open the command palette", group: "General" },
  { id: "go.blotter", keys: "g b", scope: "global", description: "Go to the blotter", group: "Go" },
  { id: "go.book", keys: "g o", scope: "global", description: "Go to the book", group: "Go" },
  { id: "book.cancel", keys: "x", scope: "panel:book", description: "Cancel the selected order" },
]

function mount(props: HotkeyEditorProps = {}) {
  const registry = createHotkeyRegistry({ platform: "other" })
  for (const binding of BINDINGS) registry.register(binding)
  const onChange = vi.fn()
  registry.onChange(onChange)
  render(
    <HotkeysProvider registry={registry}>
      <HotkeyEditor {...props} />
    </HotkeysProvider>,
  )
  return { registry, onChange }
}
const row = (id: string) => document.querySelector<HTMLElement>(`[data-hotkey-row="${id}"]`)!
const keysOf = (id: string) => row(id).querySelector("[data-hotkey-keys]")?.getAttribute("data-hotkey-keys")
const caps = (id: string) => [...row(id).querySelectorAll("kbd[data-slot='kbd']")].map((k) => k.textContent)

describe("the pure parts", () => {
  it("names a scope, groups a binding, and finds one by its words or its keys", () => {
    expect(scopeWord("panel:book")).toBe("book")
    expect(scopeWord("global")).toBe("global")
    const entry: HotkeyEntry = { ...BINDINGS[3]!, defaultKeys: "x", remapped: false }
    expect(groupOf(entry)).toBe("book")
    expect(groupOf({ ...BINDINGS[1]!, defaultKeys: "g b", remapped: false })).toBe("Go")
    const palette: HotkeyEntry = { ...BINDINGS[0]!, defaultKeys: "mod+k", remapped: false }
    expect(matchesQuery(palette, "", "other")).toBe(true)
    expect(matchesQuery(palette, "palette", "other")).toBe(true)
    expect(matchesQuery(palette, "ctrl", "other")).toBe(true)
    expect(matchesQuery(palette, "general", "other")).toBe(true)
    expect(matchesQuery(palette, "blotter", "other")).toBe(false)
  })
})

describe("HotkeyEditor", () => {
  it("is a region with the slot, lists every binding under its group with its keys, and sorts the groups", () => {
    mount()
    const region = screen.getByRole("region", { name: "Keyboard shortcuts" })
    expect(region.dataset.slot).toBe("tradecn-hotkey-editor")
    expect(region.dataset.remapped).toBe("0")
    expect([...region.querySelectorAll("[data-hotkey-group]")].map((g) => g.getAttribute("data-hotkey-group"))).toEqual(["General", "Go", "book"])
    expect(within(document.querySelector('[data-hotkey-group="Go"]')!).getAllByText(/Go to/).map((e) => e.textContent)).toEqual(["Go to the blotter", "Go to the book"])
    expect(caps("go.blotter")).toEqual(["G", "B"])
    expect(caps("palette.open")).toEqual(["Ctrl", "K"])
    expect(keysOf("book.cancel")).toBe("x")
  })

  it("finds a shortcut by its words or its keys, and says when nothing matches", () => {
    mount()
    const search = screen.getByLabelText("Find a shortcut")
    fireEvent.change(search, { target: { value: "blotter" } })
    expect(document.querySelectorAll("[data-hotkey-row]")).toHaveLength(1)
    expect(row("go.blotter")).toBeInTheDocument()
    fireEvent.change(search, { target: { value: "ctrl" } })
    expect([...document.querySelectorAll("[data-hotkey-row]")].map((r) => r.getAttribute("data-hotkey-row"))).toEqual(["palette.open"])
    fireEvent.change(search, { target: { value: "zzz" } })
    expect(screen.getByText("No shortcut matches.")).toBeInTheDocument()
    fireEvent.change(search, { target: { value: "" } })
    expect(document.querySelectorAll("[data-hotkey-row]")).toHaveLength(4)
  })

  it("changes a shortcut by pressing it, marks it changed, tells the registry's onChange, and resets it", () => {
    const { registry, onChange } = mount()
    fireEvent.click(screen.getByRole("button", { name: "Change: Go to the blotter" }))
    const capture = row("go.blotter").querySelector<HTMLElement>("[data-hotkey-capture]")!
    expect(capture).toHaveAttribute("aria-pressed", "true")
    const event = fireEvent.keyDown(capture, { key: "k", code: "KeyK", ctrlKey: true, shiftKey: true })
    expect(event).toBe(false)
    expect(registry.list().find((e) => e.id === "go.blotter")?.keys).toBe("ctrl+shift+k")
    expect(row("go.blotter").dataset.remapped).toBe("true")
    expect(caps("go.blotter")).toEqual(["Ctrl", "Shift", "K"])
    expect(onChange).toHaveBeenLastCalledWith({ "go.blotter": "ctrl+shift+k" })
    expect(screen.getByRole("region", { name: "Keyboard shortcuts" }).dataset.remapped).toBe("1")
    fireEvent.click(screen.getByRole("button", { name: "Reset: Go to the blotter" }))
    expect(registry.list().find((e) => e.id === "go.blotter")?.keys).toBe("g b")
    expect(onChange).toHaveBeenLastCalledWith({})
    expect(row("go.blotter").dataset.remapped).toBeUndefined()
  })

  it("Escape cancels a capture, a bare modifier is not a shortcut, and Backspace unbinds", () => {
    const { registry } = mount()
    fireEvent.click(screen.getByRole("button", { name: "Change: Cancel the selected order" }))
    let capture = row("book.cancel").querySelector<HTMLElement>("[data-hotkey-capture]")!
    fireEvent.keyDown(capture, { key: "Shift", shiftKey: true })
    expect(row("book.cancel").querySelector("[data-hotkey-capture]")).not.toBeNull()
    fireEvent.keyDown(capture, { key: "Escape" })
    expect(row("book.cancel").querySelector("[data-hotkey-capture]")).toBeNull()
    expect(keysOf("book.cancel")).toBe("x")
    fireEvent.click(screen.getByRole("button", { name: "Change: Cancel the selected order" }))
    capture = row("book.cancel").querySelector<HTMLElement>("[data-hotkey-capture]")!
    fireEvent.keyDown(capture, { key: "Backspace" })
    expect(registry.list().find((e) => e.id === "book.cancel")?.keys).toBe("")
    expect(within(row("book.cancel")).getByText("unbound")).toBeInTheDocument()
  })

  it("takes a chord as text, and says when the text is not a shortcut", () => {
    const { registry } = mount()
    fireEvent.click(screen.getByRole("button", { name: "Type it: Go to the book" }))
    const input = screen.getByLabelText("Keys for Go to the book") as HTMLInputElement
    expect(input.value).toBe("g o")
    fireEvent.change(input, { target: { value: "g h" } })
    fireEvent.keyDown(input, { key: "Enter" })
    expect(registry.list().find((e) => e.id === "go.book")?.keys).toBe("g h")
    expect(caps("go.book")).toEqual(["G", "H"])
    fireEvent.click(screen.getByRole("button", { name: "Type it: Go to the book" }))
    fireEvent.change(screen.getByLabelText("Keys for Go to the book"), { target: { value: "a+b" } })
    fireEvent.keyDown(screen.getByLabelText("Keys for Go to the book"), { key: "Enter" })
    expect(row("go.book").querySelector("[data-hotkey-problem]")).toHaveTextContent("Not a shortcut")
    expect(registry.list().find((e) => e.id === "go.book")?.keys).toBe("g h")
    fireEvent.keyDown(screen.getByLabelText("Keys for Go to the book"), { key: "Escape" })
    expect(row("go.book").querySelector("[data-hotkey-problem]")).toBeNull()
  })

  it("says conflicts under the rows they touch, in words", () => {
    const { registry } = mount()
    act(() => registry.remap("go.book", "g b"))
    expect(row("go.book").querySelector("[data-hotkey-conflicts]")).toHaveTextContent('same keys as "Go to the blotter"')
    expect(row("go.blotter").querySelector("[data-hotkey-conflicts]")).toHaveTextContent('same keys as "Go to the book"')
    act(() => registry.remap("palette.open", "g"))
    expect(row("palette.open").querySelector("[data-hotkey-conflicts]")).toHaveTextContent('starts the chord of "Go to the blotter"')
    act(() => registry.remap("book.cancel", "g b"))
    expect(row("book.cancel").querySelector("[data-hotkey-conflicts]")).toHaveTextContent('hides, while focus is in this panel, "Go to the blotter"')
    act(() => registry.reset())
    expect(document.querySelector("[data-hotkey-conflicts]")).toBeNull()
  })

  it("resets everything, exports the overrides, asks you to import, and hides what you say", () => {
    const onExport = vi.fn()
    const onImport = vi.fn()
    const { registry } = mount({ onExport, onImport, hide: (e) => e.id === "book.cancel" })
    expect(document.querySelector('[data-hotkey-row="book.cancel"]')).toBeNull()
    const resetAll = screen.getByRole("button", { name: "Reset all" })
    expect(resetAll).toBeDisabled()
    act(() => {
      registry.remap("go.book", "g h")
      registry.remap("go.blotter", "g l")
    })
    expect(resetAll).toBeEnabled()
    fireEvent.click(screen.getByRole("button", { name: "Export" }))
    expect(onExport).toHaveBeenCalledWith({ "go.book": "g h", "go.blotter": "g l" })
    fireEvent.click(screen.getByRole("button", { name: "Import" }))
    expect(onImport).toHaveBeenCalledTimes(1)
    fireEvent.click(resetAll)
    expect(registry.overrides()).toEqual({})
    expect(resetAll).toBeDisabled()
  })
})
