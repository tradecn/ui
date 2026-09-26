import { createRef, StrictMode } from "react"
import { Button } from "@/components/ui/button"
import { HotkeyEditorGroups } from "@/demos/hotkey-editor-groups"
import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { HotkeysProvider } from "@/registry/tradecn/hooks/use-hotkeys"
import { createHotkeyRegistry, type HotkeyBinding, type HotkeyEntry, type HotkeyOverrides } from "@/registry/tradecn/lib/hotkeys"
import { HotkeyEditor, HotkeyEditorItem, HotkeyEditorKeys, HotkeyEditorChange, HotkeyEditorEdit, HotkeyEditorCapture, HotkeyEditorInput, HotkeyEditorProblem, HotkeyEditorResetAll, useHotkeyEditor, useHotkeyEditorItem, groupOf, matchesQuery, scopeWord, type HotkeyEditorProps } from "@/registry/tradecn/ui/hotkey-editor"

const BINDINGS: HotkeyBinding[] = [
  { id: "palette.open", keys: "mod+k", scope: "editing", description: "Open the command palette", group: "General" },
  { id: "go.blotter", keys: "g b", scope: "global", description: "Go to the blotter", group: "Go" },
  { id: "go.book", keys: "g o", scope: "global", description: "Go to the book", group: "Go" },
  { id: "book.cancel", keys: "x", scope: "panel:book", description: "Cancel the selected order" },
]

type RecipeProps = Omit<HotkeyEditorProps, "children"> & { onExport?: (overrides: HotkeyOverrides) => void; onImport?: () => void }

function mount({ onExport, onImport, ...props }: RecipeProps = {}) {
  const registry = createHotkeyRegistry({ platform: "other" })
  for (const binding of BINDINGS) registry.register(binding)
  const onChange = vi.fn()
  registry.onChange(onChange)
  const rendered = render(
    <HotkeysProvider registry={registry}>
      <HotkeyEditor {...props}>
        <HotkeyEditorGroups>
          {onExport && <Button onClick={() => onExport(registry.overrides())}>Export</Button>}
          {onImport && <Button onClick={onImport}>Import</Button>}
        </HotkeyEditorGroups>
      </HotkeyEditor>
    </HotkeysProvider>,
  )
  return { registry, onChange, ...rendered }
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

  it("drops a conflict line once both handlers are fenced apart, and shows it again when one leaves", () => {
    const { registry } = mount()
    act(() => {
      registry.register({ id: "ticket.send", keys: "mod+enter", scope: "editing", description: "Send the ticket", group: "Ticket" })
      registry.register({ id: "rfq.send", keys: "mod+enter", scope: "editing", description: "Send the quote", group: "Inquiry" })
    })
    expect(row("ticket.send").querySelector("[data-hotkey-conflicts]")).toHaveTextContent('same keys as "Send the quote"')
    const a = document.createElement("div")
    const b = document.createElement("div")
    document.body.append(a, b)
    let off = () => {}
    act(() => {
      registry.bind("ticket.send", () => {}, { scope: "editing", element: () => a })
      off = registry.bind("rfq.send", () => {}, { scope: "editing", element: () => b })
    })
    expect(document.querySelector("[data-hotkey-conflicts]")).toBeNull()
    act(() => off())
    expect(row("rfq.send").querySelector("[data-hotkey-conflicts]")).toHaveTextContent('same keys as "Send the ticket"')
    a.remove()
    b.remove()
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


describe("composition and migration", () => {
  it("requires composition for minimal and configured v1 calls", () => {
    // @ts-expect-error The released minimal call must migrate.
    const minimal = <HotkeyEditor />
    // @ts-expect-error Retained optional props cannot supply a composition.
    const configured = <HotkeyEditor hide={() => false} labels={{ title: "Keys" }} className="keys" />
    // @ts-expect-error Export belongs to caller controls.
    const exporting = <HotkeyEditor onExport={() => {}}><span /></HotkeyEditor>
    // @ts-expect-error Import belongs to caller controls.
    const importing = <HotkeyEditor onImport={() => {}}><span /></HotkeyEditor>
    const show = Boolean(vi.fn()())
    const composed = <HotkeyEditor>{show && <span />}</HotkeyEditor>
    const conditional = <HotkeyEditor>{null}</HotkeyEditor>
    expect([minimal, configured, exporting, importing, composed, conditional]).toHaveLength(6)
  })

  it("forwards native refs and events, and allows a different collection order", () => {
    const rootRef = createRef<HTMLDivElement>()
    const itemRef = createRef<HTMLDivElement>()
    const buttonRef = createRef<HTMLButtonElement>()
    const onClick = vi.fn((event: React.MouseEvent) => event.preventDefault())
    const registry = createHotkeyRegistry({ platform: "other" })
    BINDINGS.forEach((binding) => registry.register(binding))
    render(<HotkeysProvider registry={registry}><HotkeyEditor ref={rootRef} aria-label="My shortcuts" data-custom="root">
      <p>Application content</p>
      <HotkeyEditorItem bindingId="go.book" ref={itemRef} className="card">
        <HotkeyEditorKeys />
        <HotkeyEditorChange ref={buttonRef} onClick={onClick}>Record</HotkeyEditorChange>
        <HotkeyEditorCapture />
      </HotkeyEditorItem>
      <HotkeyEditorItem bindingId="go.blotter"><HotkeyEditorKeys /></HotkeyEditorItem>
    </HotkeyEditor></HotkeysProvider>)
    expect(rootRef.current).toBe(screen.getByRole("region", { name: "My shortcuts" }))
    expect(itemRef.current).toHaveClass("card")
    expect([...rootRef.current!.querySelectorAll("[data-hotkey-row]")].map((r) => r.getAttribute("data-hotkey-row"))).toEqual(["go.book", "go.blotter"])
    fireEvent.click(buttonRef.current!)
    expect(onClick).toHaveBeenCalledOnce()
    expect(document.querySelector("[data-hotkey-capture]")).toBeNull()
  })

  it("recovers focus after capture, text commit, Escape and binding removal", () => {
    const { registry } = mount()
    const change = screen.getByRole("button", { name: "Change: Go to the blotter" })
    fireEvent.click(change)
    const capture = row("go.blotter").querySelector<HTMLElement>("[data-hotkey-capture]")!
    expect(capture).toHaveFocus()
    fireEvent.keyDown(capture, { key: "z" })
    expect(change).toHaveFocus()
    const edit = screen.getByRole("button", { name: "Type it: Go to the blotter" })
    fireEvent.click(edit)
    const input = screen.getByLabelText("Keys for Go to the blotter")
    expect(input).toHaveFocus()
    fireEvent.change(input, { target: { value: "g h" } })
    fireEvent.keyDown(input, { key: "Enter" })
    expect(edit).toHaveFocus()
    fireEvent.click(edit)
    fireEvent.keyDown(screen.getByLabelText("Keys for Go to the blotter"), { key: "Escape" })
    expect(edit).toHaveFocus()
    fireEvent.click(edit)
    act(() => registry.unregister("go.blotter"))
    expect(screen.getByLabelText("Find a shortcut")).toHaveFocus()
  })

  it("does not steal focus when a draft is blurred, and does not commit it", () => {
    const { registry } = mount()
    fireEvent.click(screen.getByRole("button", { name: "Type it: Go to the book" }))
    fireEvent.change(screen.getByLabelText("Keys for Go to the book"), { target: { value: "g h" } })
    act(() => screen.getByLabelText("Find a shortcut").focus())
    expect(screen.getByLabelText("Find a shortcut")).toHaveFocus()
    expect(screen.queryByLabelText("Keys for Go to the book")).toBeNull()
    expect(registry.list().find((entry) => entry.id === "go.book")?.keys).toBe("g o")
  })

  it("cancels a stale draft after external remapping but preserves unrelated updates", () => {
    const { registry } = mount()
    const edit = screen.getByRole("button", { name: "Type it: Go to the book" })
    fireEvent.click(edit)
    fireEvent.change(screen.getByLabelText("Keys for Go to the book"), { target: { value: "g h" } })
    act(() => registry.remap("go.blotter", "g l"))
    expect(screen.getByLabelText("Keys for Go to the book")).toHaveValue("g h")
    act(() => registry.load({ "go.book": "g j" }))
    expect(screen.queryByLabelText("Keys for Go to the book")).toBeNull()
    expect(edit).toHaveFocus()
    expect(keysOf("go.book")).toBe("g j")
  })

  it("keeps editing keydowns out of application bindings and parent forms", () => {
    const registry = createHotkeyRegistry({ platform: "other" })
    registry.register(BINDINGS[0]!)
    const fired = vi.fn()
    registry.bind("palette.open", fired)
    const submit = vi.fn()
    render(<HotkeysProvider registry={registry}><form onSubmit={submit}><HotkeyEditor><HotkeyEditorGroups /></HotkeyEditor></form></HotkeysProvider>)
    fireEvent.click(screen.getByRole("button", { name: "Type it: Open the command palette" }))
    const input = screen.getByLabelText("Keys for Open the command palette")
    fireEvent.keyDown(input, { key: "k", ctrlKey: true })
    expect(fired).not.toHaveBeenCalled()
    expect(fireEvent.keyDown(input, { key: "Enter" })).toBe(false)
    expect(submit).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Change: Open the command palette" }))
    fireEvent.keyDown(document.querySelector("[data-hotkey-capture]")!, { key: "k", ctrlKey: true })
    expect(fired).not.toHaveBeenCalled()
  })

  it("links validation to the input and announces the problem", () => {
    mount()
    fireEvent.click(screen.getByRole("button", { name: "Type it: Go to the book" }))
    const input = screen.getByLabelText("Keys for Go to the book")
    fireEvent.change(input, { target: { value: "a+b" } })
    fireEvent.keyDown(input, { key: "Enter" })
    expect(input).toHaveAttribute("aria-invalid", "true")
    expect(input).toHaveAttribute("aria-describedby", screen.getByRole("alert").id)
    expect(input).toHaveFocus()
  })

  it("shares one subscription across readings and cleans it up under StrictMode", () => {
    const registry = createHotkeyRegistry({ platform: "other" })
    registry.register(BINDINGS[0]!)
    const subscribe = registry.subscribe
    let active = 0
    registry.subscribe = (listener) => { active++; const off = subscribe(listener); return () => { active--; off() } }
    const { unmount } = render(<StrictMode><HotkeysProvider registry={registry}><HotkeyEditor><HotkeyEditorItem bindingId="palette.open"><HotkeyEditorKeys /><HotkeyEditorKeys /><HotkeyEditorEdit>Edit</HotkeyEditorEdit><HotkeyEditorInput /><HotkeyEditorProblem /></HotkeyEditorItem><HotkeyEditorResetAll>Reset</HotkeyEditorResetAll></HotkeyEditor></HotkeysProvider></StrictMode>)
    expect(active).toBe(1)
    unmount()
    expect(active).toBe(0)
  })

  it("keeps hidden binding conflicts and clears unknown overrides with reset all", () => {
    const { registry } = mount({ hide: (entry) => entry.id === "go.blotter" })
    act(() => registry.load({ "go.book": "g b", unknown: "z" }))
    expect(row("go.book").querySelector("[data-hotkey-conflicts]")).toHaveTextContent("Go to the blotter")
    fireEvent.click(screen.getByRole("button", { name: "Reset all" }))
    expect(registry.overrides()).toEqual({})
  })

  it("does not revive an old draft when imported keys later return to their original value", () => {
    const { registry } = mount()
    fireEvent.click(screen.getByRole("button", { name: "Type it: Go to the book" }))
    fireEvent.change(screen.getByLabelText("Keys for Go to the book"), { target: { value: "g h" } })
    act(() => registry.remap("go.book", "g j"))
    act(() => registry.reset("go.book"))
    expect(screen.queryByLabelText("Keys for Go to the book")).toBeNull()
  })

  it("recovers focus when the caller removes a reset button after resetting", () => {
    const { registry } = mount()
    act(() => registry.remap("go.book", "g h"))
    const reset = screen.getByRole("button", { name: "Reset: Go to the book" })
    act(() => reset.focus())
    fireEvent.click(reset)
    expect(row("go.book")).toHaveFocus()
  })

  it("cancels edits on registry replacement and keeps field refs and canceled events", () => {
    const first = createHotkeyRegistry({ platform: "other" })
    const second = createHotkeyRegistry({ platform: "other" })
    first.register(BINDINGS[0]!)
    second.register(BINDINGS[0]!)
    const inputRef = createRef<HTMLInputElement>()
    const onChange = vi.fn((event: React.ChangeEvent) => event.preventDefault())
    const composition = <HotkeyEditor><HotkeyEditorItem bindingId="palette.open"><HotkeyEditorEdit>Type it</HotkeyEditorEdit><HotkeyEditorInput ref={inputRef} onChange={onChange} /><HotkeyEditorKeys /></HotkeyEditorItem></HotkeyEditor>
    const { rerender } = render(<HotkeysProvider registry={first}>{composition}</HotkeysProvider>)
    fireEvent.click(screen.getByRole("button", { name: "Type it: Open the command palette" }))
    expect(inputRef.current).toHaveFocus()
    fireEvent.change(inputRef.current!, { target: { value: "x" } })
    expect(inputRef.current).toHaveValue("ctrl+k")
    rerender(<HotkeysProvider registry={second}>{composition}</HotkeysProvider>)
    expect(inputRef.current).toBeNull()
    expect(screen.getByRole("button", { name: "Type it: Open the command palette" })).toHaveFocus()
  })

  it.each([false, true])("cancels a draft when a binding is replaced, with removal %s", (remove) => {
    const { registry } = mount()
    fireEvent.click(screen.getByRole("button", { name: "Type it: Go to the book" }))
    fireEvent.change(screen.getByLabelText("Keys for Go to the book"), { target: { value: "x" } })
    act(() => {
      if (remove) registry.unregister("go.book")
      registry.register({ ...BINDINGS[2]!, description: "Open the new view", scope: "editing" })
    })
    expect(screen.queryByLabelText("Keys for Open the new view")).toBeNull()
    expect(screen.getByRole("button", { name: "Type it: Open the new view" })).toHaveFocus()
    expect(keysOf("go.book")).toBe("g o")
  })

  it("retains caller field descriptions alongside capture hints and validation", () => {
    const registry = createHotkeyRegistry({ platform: "other" })
    registry.register(BINDINGS[0]!)
    render(<HotkeysProvider registry={registry}><HotkeyEditor><p id="help">Choose a shortcut</p><HotkeyEditorItem bindingId="palette.open"><HotkeyEditorChange>Change</HotkeyEditorChange><HotkeyEditorCapture aria-describedby="help" /><HotkeyEditorProblem /></HotkeyEditorItem></HotkeyEditor></HotkeysProvider>)
    fireEvent.click(screen.getByRole("button", { name: "Change: Open the command palette" }))
    const capture = document.querySelector<HTMLElement>("[data-hotkey-capture]")!
    expect(capture).toHaveAccessibleDescription("Choose a shortcut Escape cancels, Backspace unbinds")
    fireEvent.keyDown(capture, { key: "+", ctrlKey: true })
    expect(capture).toHaveAccessibleDescription(/Choose a shortcut Escape cancels, Backspace unbinds Not a shortcut/)
  })

  it("reports missing coordination contexts", () => {
    function MissingRoot() { useHotkeyEditor(); return null }
    function MissingItem() { useHotkeyEditorItem(); return null }
    expect(() => render(<MissingRoot />)).toThrow("inside HotkeyEditor")
    expect(() => render(<MissingItem />)).toThrow("inside HotkeyEditorItem")
  })
})
