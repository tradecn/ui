import { act, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { HotkeysProvider, useHotkey } from "@/registry/tradecn/hooks/use-hotkeys"
import { LinkGroupProvider, useLinkGroup } from "@/registry/tradecn/hooks/use-link-group"
import type { Popout } from "@/registry/tradecn/hooks/use-popout"
import { createHotkeyRegistry, type HotkeyBinding } from "@/registry/tradecn/lib/hotkeys"
import type { LinkGroup } from "@/registry/tradecn/lib/link-group"
import { LinkGroupDot, Panel, PanelActions, PanelContent, PanelHeader, PanelPopout, PanelTitle, SymbolTag, type SymbolTagProps } from "@/registry/tradecn/ui/panel"

afterEach(() => vi.restoreAllMocks())

describe("Panel", () => {
  it("is a region named by its title, and the hotkey scope of its kind", () => {
    render(
      <Panel kind="book">
        <PanelHeader>
          <PanelTitle>Order book</PanelTitle>
        </PanelHeader>
        <PanelContent>rows</PanelContent>
      </Panel>,
    )
    const panel = screen.getByRole("region", { name: "Order book" })
    expect(panel).toHaveAttribute("data-slot", "tradecn-panel")
    expect(panel).toHaveAttribute("data-hotkey-scope", "panel:book")
    expect(panel).toHaveAttribute("data-kind", "book")
    expect(panel).toHaveAttribute("tabindex", "-1")
    expect(document.querySelectorAll("[data-slot^='tradecn-']")).toHaveLength(1)
  })

  it("takes a label of its own instead of a title", () => {
    render(<Panel kind="chart" aria-label="Chart of ZN" />)
    expect(screen.getByRole("region", { name: "Chart of ZN" })).not.toHaveAttribute("aria-labelledby")
  })

  it("shows one state at a time: error over drag target over active", () => {
    const view = render(<Panel kind="book" aria-label="p" />)
    const state = () => screen.getByRole("region").getAttribute("data-state")
    expect(state()).toBe("auto")
    view.rerender(<Panel kind="book" aria-label="p" active />)
    expect(state()).toBe("active")
    view.rerender(<Panel kind="book" aria-label="p" active={false} />)
    expect(state()).toBe("inactive")
    view.rerender(<Panel kind="book" aria-label="p" active dragTarget />)
    expect(state()).toBe("drag-target")
    view.rerender(<Panel kind="book" aria-label="p" active dragTarget error />)
    expect(state()).toBe("error")
  })

  it("passes props and a class through to its element", () => {
    render(<Panel kind="book" aria-label="p" id="left" className="h-64" />)
    const panel = screen.getByRole("region")
    expect(panel).toHaveAttribute("id", "left")
    expect(panel.className).toContain("h-64")
  })

  it("gives each instance of a kind its own keys", () => {
    const BINDINGS: HotkeyBinding[] = [{ id: "book.cancel", keys: "x", scope: "panel:book", description: "Cancel" }]
    const fired: string[] = []
    function Book({ name }: { name: string }) {
      useHotkey("book.cancel", () => fired.push(name))
      return <button>{name}</button>
    }
    render(
      <HotkeysProvider registry={createHotkeyRegistry({ platform: "other" })} bindings={BINDINGS}>
        <Panel kind="book" aria-label="A">
          <Book name="A" />
        </Panel>
        <Panel kind="book" aria-label="B">
          <Book name="B" />
        </Panel>
      </HotkeysProvider>,
    )
    fireEvent.keyDown(screen.getByRole("button", { name: "B" }), { key: "x" })
    fireEvent.keyDown(document.body, { key: "x" })
    fireEvent.keyDown(screen.getByRole("button", { name: "A" }), { key: "x" })
    expect(fired).toEqual(["B", "A"])
  })
})

describe("PanelHeader", () => {
  it("is the drag handle, and its actions keep a press from reaching it", () => {
    const down = vi.fn()
    render(
      <PanelHeader onPointerDown={down} onMouseDown={down} onTouchStart={down}>
        <span>grip</span>
        <PanelActions>
          <button>close</button>
        </PanelActions>
      </PanelHeader>,
    )
    expect(screen.getByText("grip").parentElement).toHaveAttribute("data-panel-handle")
    const close = screen.getByRole("button", { name: "close" })
    fireEvent.pointerDown(close)
    fireEvent.mouseDown(close)
    fireEvent.touchStart(close)
    expect(down).not.toHaveBeenCalled()
    fireEvent.pointerDown(screen.getByText("grip"))
    expect(down).toHaveBeenCalledTimes(1)
  })
})

function Tag(props: Partial<SymbolTagProps> & { initial?: string | null }) {
  const { initial = "ZN", onCommit, ...rest } = props
  const [symbol, setSymbol] = useState<string | null>(initial)
  return (
    <SymbolTag
      value={symbol}
      onCommit={(next) => {
        onCommit?.(next)
        setSymbol(next)
      }}
      {...rest}
    />
  )
}

describe("SymbolTag", () => {
  it("opens on click with the symbol selected, and Enter commits it trimmed and upper-cased", async () => {
    const user = userEvent.setup()
    const onCommit = vi.fn()
    render(<Tag onCommit={onCommit} />)
    await user.click(screen.getByRole("button", { name: "Symbol ZN, change" }))
    const field = screen.getByRole<HTMLInputElement>("textbox", { name: "Symbol" })
    expect(field).toHaveFocus()
    expect([field.selectionStart, field.selectionEnd]).toEqual([0, 2])
    await user.keyboard(" es {Enter}")
    expect(onCommit).toHaveBeenCalledWith("ES")
    const tag = screen.getByRole("button", { name: "Symbol ES, change" })
    expect(tag).toHaveFocus()
  })

  it("opens from the keyboard", async () => {
    const user = userEvent.setup()
    render(<Tag />)
    screen.getByRole("button").focus()
    await user.keyboard("{Enter}")
    expect(screen.getByRole("textbox")).toHaveFocus()
  })

  it("puts the symbol back on Escape, and returns focus to the tag", async () => {
    const user = userEvent.setup()
    const onCommit = vi.fn()
    render(<Tag onCommit={onCommit} />)
    await user.click(screen.getByRole("button"))
    await user.keyboard("es{Escape}")
    expect(onCommit).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Symbol ZN, change" })).toHaveFocus()
  })

  it("puts the symbol back when you click away, and leaves focus where you clicked", async () => {
    const user = userEvent.setup()
    const onCommit = vi.fn()
    render(
      <>
        <Tag onCommit={onCommit} />
        <button>elsewhere</button>
      </>,
    )
    await user.click(screen.getByRole("button", { name: "Symbol ZN, change" }))
    await user.keyboard("es")
    await user.click(screen.getByRole("button", { name: "elsewhere" }))
    expect(onCommit).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Symbol ZN, change" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "elsewhere" })).toHaveFocus()
  })

  it("does not commit a blank draft or the symbol it already shows", async () => {
    const user = userEvent.setup()
    const onCommit = vi.fn()
    render(<Tag onCommit={onCommit} />)
    await user.click(screen.getByRole("button"))
    await user.keyboard("{Backspace}{Enter}")
    await user.click(screen.getByRole("button"))
    await user.keyboard("zn{Enter}")
    expect(onCommit).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Symbol ZN, change" })).toBeInTheDocument()
  })

  it("keeps the field open on a draft that does not validate, until it does", async () => {
    const user = userEvent.setup()
    const onCommit = vi.fn()
    render(<Tag onCommit={onCommit} validate={(s) => s !== "NOPE"} />)
    await user.click(screen.getByRole("button"))
    await user.keyboard("nope{Enter}")
    expect(screen.getByRole("textbox")).toHaveAttribute("aria-invalid", "true")
    expect(onCommit).not.toHaveBeenCalled()
    await user.keyboard("x")
    expect(screen.getByRole("textbox")).not.toHaveAttribute("aria-invalid")
    await user.keyboard("{Enter}")
    expect(onCommit).toHaveBeenCalledWith("NOPEX")
  })

  it("normalizes your way when case matters", async () => {
    const user = userEvent.setup()
    const onCommit = vi.fn()
    render(<Tag onCommit={onCommit} normalize={(raw) => raw.trim()} />)
    await user.click(screen.getByRole("button"))
    await user.keyboard("BRK.b{Enter}")
    expect(onCommit).toHaveBeenCalledWith("BRK.b")
  })

  it("shows a placeholder while there is no symbol, and does nothing while disabled", async () => {
    const user = userEvent.setup()
    const view = render(<SymbolTag value={null} onCommit={() => {}} placeholder="pick one" />)
    expect(screen.getByRole("button", { name: "Symbol, none, set" })).toHaveTextContent("pick one")
    view.rerender(<SymbolTag value="ZN" onCommit={() => {}} disabled editing />)
    await user.click(screen.getByRole("button"))
    expect(screen.queryByRole("textbox")).toBeNull()
  })

  it("opens from outside, for a hotkey, starting from what is showing", async () => {
    const user = userEvent.setup()
    const onEditingChange = vi.fn()
    const view = render(<SymbolTag value="ZN" onCommit={() => {}} editing={false} onEditingChange={onEditingChange} />)
    view.rerender(<SymbolTag value="ZN" onCommit={() => {}} editing onEditingChange={onEditingChange} />)
    expect(screen.getByRole<HTMLInputElement>("textbox").value).toBe("ZN")
    expect(screen.getByRole("textbox")).toHaveFocus()
    await user.keyboard("{Escape}")
    expect(onEditingChange).toHaveBeenCalledWith(false)
  })

  // Inside an input only `editing` bindings run, so those are the ones that could take the field's keys.
  it("keeps Enter and Escape for itself while open, and a press from the drag handle", async () => {
    const user = userEvent.setup()
    const BINDINGS: HotkeyBinding[] = [
      { id: "app.dismiss", keys: "escape", scope: "editing", description: "Dismiss" },
      { id: "app.send", keys: "enter", scope: "editing", description: "Send" },
    ]
    const fired: string[] = []
    function Keys() {
      useHotkey("app.dismiss", () => fired.push("dismiss"))
      useHotkey("app.send", () => fired.push("send"))
      return null
    }
    const down = vi.fn()
    render(
      <HotkeysProvider registry={createHotkeyRegistry({ platform: "other" })} bindings={BINDINGS}>
        <Keys />
        <div onPointerDown={down} onMouseDown={down}>
          <Tag />
        </div>
        <input aria-label="other field" />
      </HotkeysProvider>,
    )
    await user.click(screen.getByRole("button", { name: "Symbol ZN, change" }))
    expect(down).not.toHaveBeenCalled()
    await user.keyboard("{Escape}")
    await user.click(screen.getByRole("button", { name: "Symbol ZN, change" }))
    await user.keyboard("es{Enter}")
    expect(fired).toEqual([])
    // The same keys still reach the dispatcher from a field that is not the tag's.
    await user.click(screen.getByRole("textbox", { name: "other field" }))
    await user.keyboard("{Escape}")
    expect(fired).toEqual(["dismiss"])
  })

  it("rings when the symbol changes from outside, and not when it was typed here", async () => {
    const user = userEvent.setup()
    const animate = vi.spyOn(HTMLElement.prototype, "animate")
    function Linked() {
      const [symbol, setSymbol] = useState<string | null>("ZN")
      return (
        <>
          <SymbolTag value={symbol} onCommit={setSymbol} />
          <button onClick={() => setSymbol("CL")}>from the link</button>
        </>
      )
    }
    render(<Linked />)
    expect(animate).not.toHaveBeenCalled()
    await user.click(screen.getByRole("button", { name: "Symbol ZN, change" }))
    await user.keyboard("es{Enter}")
    expect(animate).not.toHaveBeenCalled()
    await user.click(screen.getByRole("button", { name: "from the link" }))
    expect(animate).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(animate.mock.calls[0]![0])).toContain("--panel-sync")
  })

  it("stays still under reduced motion", async () => {
    const user = userEvent.setup()
    const animate = vi.spyOn(HTMLElement.prototype, "animate")
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce") }))
    function Linked() {
      const [symbol, setSymbol] = useState<string | null>("ZN")
      return (
        <>
          <SymbolTag value={symbol} onCommit={setSymbol} />
          <button onClick={() => setSymbol("CL")}>from the link</button>
        </>
      )
    }
    render(<Linked />)
    await user.click(screen.getByRole("button", { name: "from the link" }))
    expect(animate).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})

describe("LinkGroupDot", () => {
  function Dot({ onPointerDown }: { onPointerDown?: () => void }) {
    const [group, setGroup] = useState<LinkGroup>(null)
    return (
      <div onPointerDown={onPointerDown}>
        <LinkGroupDot group={group} onGroupChange={setGroup} />
      </div>
    )
  }

  it("says its group in words and a number, and walks the groups on click", async () => {
    const user = userEvent.setup()
    const down = vi.fn()
    render(<Dot onPointerDown={down} />)
    const dot = screen.getByRole("button", { name: "Not linked, change" })
    expect(dot).toHaveAttribute("data-link-group", "none")
    await user.click(dot)
    expect(dot).toHaveAccessibleName("Link group 1, change")
    expect(dot).toHaveTextContent("1")
    expect(dot.className).toContain("bg-link-1")
    await user.keyboard("{Shift>}")
    await user.click(dot)
    await user.click(dot)
    await user.keyboard("{/Shift}")
    expect(dot).toHaveAttribute("data-link-group", "4")
    expect(down).not.toHaveBeenCalled()
  })

  it("lets your own click handler call it off", async () => {
    const user = userEvent.setup()
    const onGroupChange = vi.fn()
    render(<LinkGroupDot group={2} onGroupChange={onGroupChange} onClick={(event) => event.preventDefault()} />)
    await user.click(screen.getByRole("button"))
    expect(onGroupChange).not.toHaveBeenCalled()
  })

  it("drives two panels through one group", async () => {
    const user = userEvent.setup()
    function Linked({ name, symbol }: { name: string; symbol?: string }) {
      const link = useLinkGroup({ defaultSymbol: symbol, source: name })
      return (
        <Panel kind="chart" aria-label={name}>
          <PanelHeader>
            <SymbolTag value={link.symbol} onCommit={link.setSymbol} label={`${name} symbol`} />
            <LinkGroupDot group={link.group} onGroupChange={link.setGroup} aria-label={`${name} link`} />
          </PanelHeader>
        </Panel>
      )
    }
    render(
      <LinkGroupProvider transport={null}>
        <Linked name="left" symbol="ZN" />
        <Linked name="right" />
      </LinkGroupProvider>,
    )
    await user.click(screen.getByRole("button", { name: "left link" }))
    await user.click(screen.getByRole("button", { name: "right link" }))
    expect(screen.getByRole("button", { name: "right symbol ZN, change" })).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "right symbol ZN, change" }))
    await user.keyboard("es{Enter}")
    expect(screen.getByRole("button", { name: "left symbol ES, change" })).toBeInTheDocument()
  })
})

describe("PanelPopout", () => {
  function popoutAt(state: { host: HTMLElement; doc: Document | null }): Popout {
    return {
      isOpen: state.doc !== null,
      window: state.doc ? ({ document: state.doc } as unknown as Window) : null,
      host: state.host,
      slotRef: () => {},
      open: () => true,
      close: () => {},
    }
  }

  it("renders into the popout's host, shows the placeholder while out, and carries the keys over", () => {
    const host = document.createElement("div")
    const doc = document.implementation.createHTMLDocument("")
    doc.body.appendChild(host)
    const registry = createHotkeyRegistry({ platform: "other" })
    const attach = vi.spyOn(registry, "attach")
    const fired = vi.fn()
    const BINDINGS: HotkeyBinding[] = [{ id: "book.cancel", keys: "x", scope: "panel:book", description: "Cancel" }]
    function Book() {
      useHotkey("book.cancel", fired)
      return <button>row</button>
    }
    const tree = (open: boolean) => (
      <HotkeysProvider registry={registry} bindings={BINDINGS}>
        <PanelPopout popout={popoutAt({ host, doc: open ? doc : null })} placeholder={<p>out in its own window</p>}>
          <Panel kind="book" aria-label="Book">
            <Book />
          </Panel>
        </PanelPopout>
      </HotkeysProvider>
    )
    const view = render(tree(false))
    expect(host.querySelector("[data-slot='tradecn-panel']")).not.toBeNull()
    expect(screen.queryByText("out in its own window")).toBeNull()
    expect(attach).not.toHaveBeenCalledWith(doc)
    view.rerender(tree(true))
    expect(screen.getByText("out in its own window")).toBeInTheDocument()
    expect(attach).toHaveBeenCalledWith(doc)
    act(() => {
      host.querySelector("button")!.dispatchEvent(new KeyboardEvent("keydown", { key: "x", bubbles: true, cancelable: true }))
    })
    expect(fired).toHaveBeenCalledTimes(1)
    view.rerender(tree(false))
    act(() => {
      host.querySelector("button")!.dispatchEvent(new KeyboardEvent("keydown", { key: "x", bubbles: true, cancelable: true }))
    })
    expect(fired).toHaveBeenCalledTimes(1)
  })

  it("renders nothing without a host, as on a server", () => {
    const popout: Popout = { isOpen: false, window: null, host: null, slotRef: () => {}, open: () => false, close: () => {} }
    render(
      <PanelPopout popout={popout}>
        <p>content</p>
      </PanelPopout>,
    )
    expect(screen.queryByText("content")).toBeNull()
  })
})
