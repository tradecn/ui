import { act, fireEvent, render, renderHook, screen } from "@testing-library/react"
import { useState, type ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import { HotkeyScope, HotkeysProvider, useHotkey, useHotkeyList, useHotkeys, useMaybeHotkeys, usePendingChord } from "@/registry/tradecn/hooks/use-hotkeys"
import { createHotkeyRegistry, type HotkeyBinding } from "@/registry/tradecn/lib/hotkeys"

const BINDINGS: HotkeyBinding[] = [
  { id: "palette.open", keys: "mod+k", scope: "editing", description: "Open the command palette" },
  { id: "go.home", keys: "g h", scope: "global", description: "Go home" },
  { id: "book.cancel", keys: "x", scope: "panel:book", description: "Cancel the selected order" },
]

function Bound({ id, onFire, enabled }: { id: string; onFire: () => void; enabled?: boolean }) {
  useHotkey(id, onFire, { enabled })
  return null
}

describe("HotkeysProvider", () => {
  it("creates a registry, declares the bindings, listens, and cleans up", () => {
    const fired = vi.fn()
    const registry = createHotkeyRegistry({ platform: "other" })
    const view = render(
      <HotkeysProvider registry={registry} bindings={BINDINGS}>
        <Bound id="palette.open" onFire={fired} />
      </HotkeysProvider>,
    )
    expect(registry.list().map((e) => e.id)).toEqual(["palette.open", "go.home", "book.cancel"])
    fireEvent.keyDown(document.body, { key: "k", ctrlKey: true })
    expect(fired).toHaveBeenCalledTimes(1)
    view.unmount()
    fireEvent.keyDown(document.body, { key: "k", ctrlKey: true })
    expect(fired).toHaveBeenCalledTimes(1)
    expect(registry.list()).toEqual([])
  })

  it("makes its own registry when given none", () => {
    const { result } = renderHook(() => useHotkeys(), { wrapper: ({ children }: { children: ReactNode }) => <HotkeysProvider>{children}</HotkeysProvider> })
    expect(result.current.list()).toEqual([])
  })

  it("is required by useHotkeys and optional for useMaybeHotkeys", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    expect(() => renderHook(() => useHotkeys())).toThrow(/HotkeysProvider/)
    error.mockRestore()
    expect(renderHook(() => useMaybeHotkeys()).result.current).toBeNull()
  })
})

describe("useHotkey", () => {
  it("calls the latest handler without rebinding", () => {
    const registry = createHotkeyRegistry({ platform: "other" })
    const bind = vi.spyOn(registry, "bind")
    const seen: number[] = []
    function Counter() {
      const [n, setN] = useState(0)
      useHotkey("palette.open", () => seen.push(n))
      return <button onClick={() => setN((v) => v + 1)}>inc</button>
    }
    render(
      <HotkeysProvider registry={registry} bindings={BINDINGS}>
        <Counter />
      </HotkeysProvider>,
    )
    fireEvent.keyDown(document.body, { key: "k", ctrlKey: true })
    fireEvent.click(screen.getByText("inc"))
    fireEvent.keyDown(document.body, { key: "k", ctrlKey: true })
    expect(seen).toEqual([0, 1])
    expect(bind).toHaveBeenCalledTimes(1)
  })

  it("detaches while disabled", () => {
    const fired = vi.fn()
    const registry = createHotkeyRegistry({ platform: "other" })
    const ui = (enabled: boolean) => (
      <HotkeysProvider registry={registry} bindings={BINDINGS}>
        <Bound id="palette.open" onFire={fired} enabled={enabled} />
      </HotkeysProvider>
    )
    const view = render(ui(false))
    fireEvent.keyDown(document.body, { key: "k", ctrlKey: true })
    expect(fired).not.toHaveBeenCalled()
    view.rerender(ui(true))
    fireEvent.keyDown(document.body, { key: "k", ctrlKey: true })
    expect(fired).toHaveBeenCalledTimes(1)
  })
})

describe("HotkeyScope", () => {
  it("marks the DOM, takes focus on click, and gives each instance its own keys", () => {
    const left = vi.fn()
    const right = vi.fn()
    render(
      <HotkeysProvider bindings={BINDINGS}>
        <HotkeyScope scope="panel:book" data-testid="left" className="p-2">
          <Bound id="book.cancel" onFire={left} />
          <button>left</button>
        </HotkeyScope>
        <HotkeyScope scope="panel:book" data-testid="right">
          <Bound id="book.cancel" onFire={right} />
          <button>right</button>
        </HotkeyScope>
      </HotkeysProvider>,
    )
    const el = screen.getByTestId("left")
    expect(el).toHaveAttribute("data-hotkey-scope", "panel:book")
    expect(el).toHaveAttribute("tabindex", "-1")
    expect(el).toHaveClass("p-2")
    fireEvent.keyDown(screen.getByText("left"), { key: "x" })
    expect(left).toHaveBeenCalledTimes(1)
    expect(right).not.toHaveBeenCalled()
    fireEvent.keyDown(screen.getByText("right"), { key: "x" })
    expect(right).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(document.body, { key: "x" })
    expect(left).toHaveBeenCalledTimes(1)
    expect(right).toHaveBeenCalledTimes(1)
  })
})

describe("useHotkeyList and usePendingChord", () => {
  it("re-render on remap and while a chord is in flight", () => {
    const registry = createHotkeyRegistry({ platform: "other" })
    function Readout() {
      const list = useHotkeyList()
      const pending = usePendingChord()
      return (
        <p data-testid="out">
          {list.map((e) => `${e.id}=${e.keys}`).join(",")}|{pending ?? "-"}
        </p>
      )
    }
    render(
      <HotkeysProvider registry={registry} bindings={BINDINGS}>
        <Bound id="go.home" onFire={() => {}} />
        <Readout />
      </HotkeysProvider>,
    )
    expect(screen.getByTestId("out")).toHaveTextContent("palette.open=ctrl+k,go.home=g h,book.cancel=x|-")
    act(() => void registry.remap("palette.open", "mod+p"))
    expect(screen.getByTestId("out")).toHaveTextContent("palette.open=ctrl+p,")
    fireEvent.keyDown(document.body, { key: "g" })
    expect(screen.getByTestId("out")).toHaveTextContent("|g")
    fireEvent.keyDown(document.body, { key: "h" })
    expect(screen.getByTestId("out")).toHaveTextContent("|-")
  })
})
