import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { HotkeyScope, HotkeysProvider } from "@/registry/tradecn/hooks/use-hotkeys"
import { createHotkeyRegistry } from "@/registry/tradecn/lib/hotkeys"
import { CommandPalette, createActionRegistry, scorePaletteAction, type ActionRegistry, type PaletteAction, type SymbolResult, type SymbolSearchAdapter } from "@/registry/tradecn/ui/command-palette"

const run = { blotter: vi.fn(), ticket: vi.fn(), ticketSell: vi.fn(), cancel: vi.fn() }

function seed(): ActionRegistry {
  const actions = createActionRegistry()
  actions.register([
    { id: "go.blotter", title: "Go to blotter", group: "Navigate", keywords: ["orders"], bindingId: "go.blotter", run: run.blotter },
    { id: "ticket.new", title: "New ticket", group: "Trade", run: run.ticket, secondary: { title: "New sell ticket", run: run.ticketSell } },
    { id: "book.cancel", title: "Cancel selected order", group: "Trade", scope: "panel:book", run: run.cancel },
  ])
  return actions
}

const rows = () => screen.queryAllByRole("option").map((el) => el.getAttribute("data-row"))
const input = () => screen.getByRole("combobox")
const type = (value: string) => fireEvent.change(input(), { target: { value } })

beforeEach(() => {
  // cmdk scrolls the highlighted row into view; happy-dom has no layout to scroll.
  Element.prototype.scrollIntoView = vi.fn()
  for (const fn of Object.values(run)) fn.mockClear()
})
afterEach(() => {
  vi.useRealTimers()
})

describe("createActionRegistry", () => {
  it("lists, replaces by id, and unregisters only what a call added", () => {
    const actions = createActionRegistry()
    const woke = vi.fn()
    actions.subscribe(woke)
    const a: PaletteAction = { id: "a", title: "A", run: () => {} }
    const off = actions.register(a)
    const first = actions.list()
    expect(first).toEqual([a])
    expect(actions.list()).toBe(first)
    const replacement: PaletteAction = { id: "a", title: "A2", run: () => {} }
    actions.register(replacement)
    off()
    expect(actions.list()).toEqual([replacement])
    expect(woke).toHaveBeenCalledTimes(2)
  })

  it("keeps recents most recent first, deduplicated, capped, and tells persistence", () => {
    const actions = createActionRegistry({ maxRecents: 2 })
    const saved = vi.fn()
    actions.onRecentsChange(saved)
    actions.loadRecents([{ kind: "action", id: "a" }])
    expect(saved).not.toHaveBeenCalled()
    actions.touch({ kind: "symbol", symbol: { symbol: "AAPL" } })
    actions.touch({ kind: "action", id: "a" })
    actions.touch({ kind: "action", id: "b" })
    expect(actions.recents()).toEqual([
      { kind: "action", id: "b" },
      { kind: "action", id: "a" },
    ])
    expect(saved).toHaveBeenCalledTimes(3)
  })
})

describe("scorePaletteAction", () => {
  const action: PaletteAction = { id: "orders.cancel-all", title: "Cancel all orders", keywords: ["flatten", "kill"], run: () => {} }

  it("ranks where the word lands", () => {
    const s = (q: string) => scorePaletteAction(action, q)
    expect(s("cancel")).toBeGreaterThan(s("orders"))
    expect(s("orders")).toBeGreaterThan(s("ancel"))
    expect(s("ancel")).toBeGreaterThan(s("kill"))
    expect(s("kill")).toBeGreaterThan(s("cao"))
    expect(s("cao")).toBeGreaterThan(0)
  })

  it("needs every word to land somewhere", () => {
    expect(scorePaletteAction(action, "cancel kill")).toBeGreaterThan(0)
    expect(scorePaletteAction(action, "cancel zebra")).toBe(-1)
    expect(scorePaletteAction(action, "")).toBe(0)
  })
})

describe("CommandPalette", () => {
  it("renders nothing until opened, then grouped actions under the slot", () => {
    const actions = seed()
    const view = render(<CommandPalette actions={actions} hotkeys={null} />)
    expect(document.querySelector("[data-slot='tradecn-command-palette']")).toBeNull()
    view.rerender(<CommandPalette actions={actions} hotkeys={null} open />)
    const slot = document.querySelector("[data-slot='tradecn-command-palette']")
    expect(slot).toHaveAttribute("data-variant", "palette")
    // The scoped action is not on offer: focus was never inside panel:book.
    expect(rows()).toEqual(["action:go.blotter", "action:ticket.new"])
    expect(within(slot as HTMLElement).getByText("Navigate")).toBeInTheDocument()
    expect(within(slot as HTMLElement).getByText("Trade")).toBeInTheDocument()
  })

  it("filters and orders by score, and says when nothing matches", () => {
    render(<CommandPalette actions={seed()} hotkeys={null} open />)
    // "tr" starts the Trade group's name and is only letters-in-order in "Go to blotter".
    type("tr")
    expect(rows()).toEqual(["action:ticket.new", "action:go.blotter"])
    type("orders")
    expect(rows()).toEqual(["action:go.blotter"])
    type("zebra")
    expect(rows()).toEqual([])
    expect(screen.getByText("No results")).toBeInTheDocument()
  })

  it("runs the row on Enter, closes, and remembers it", () => {
    const actions = seed()
    const onOpenChange = vi.fn()
    render(<CommandPalette actions={actions} hotkeys={null} defaultOpen onOpenChange={onOpenChange} />)
    type("ticket")
    fireEvent.keyDown(input(), { key: "Enter" })
    expect(run.ticket).toHaveBeenCalledTimes(1)
    expect(run.ticketSell).not.toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenLastCalledWith(false)
    expect(actions.recents()).toEqual([{ kind: "action", id: "ticket.new" }])
  })

  it("runs the second action on Shift+Enter, and the first when there is no second", () => {
    render(<CommandPalette actions={seed()} hotkeys={null} open />)
    type("ticket")
    expect(screen.getByText("New sell ticket")).toBeInTheDocument()
    fireEvent.keyDown(input(), { key: "Enter", shiftKey: true })
    expect(run.ticketSell).toHaveBeenCalledTimes(1)
    expect(run.ticket).not.toHaveBeenCalled()
    type("blotter")
    fireEvent.keyDown(input(), { key: "Enter", shiftKey: true })
    expect(run.blotter).toHaveBeenCalledTimes(1)
  })

  it("runs the second action from a click on its hint", () => {
    render(<CommandPalette actions={seed()} hotkeys={null} open />)
    type("ticket")
    fireEvent.click(screen.getByText("New sell ticket"))
    expect(run.ticketSell).toHaveBeenCalledTimes(1)
    expect(run.ticket).not.toHaveBeenCalled()
  })

  it("puts recents first on an empty query", () => {
    const actions = seed()
    actions.loadRecents([
      { kind: "symbol", symbol: { symbol: "AAPL", name: "Apple" } },
      { kind: "action", id: "ticket.new" },
      { kind: "action", id: "gone" },
    ])
    render(<CommandPalette actions={actions} hotkeys={null} open />)
    expect(rows()).toEqual(["recent-symbol:AAPL:", "recent:ticket.new", "action:go.blotter", "action:ticket.new"])
  })

  it("offers a scoped action when opened from inside its scope", () => {
    const actions = seed()
    const ui = (open: boolean) => (
      <HotkeysProvider>
        <HotkeyScope scope="panel:book">
          <button>in the book</button>
        </HotkeyScope>
        <CommandPalette actions={actions} open={open} />
      </HotkeysProvider>
    )
    const view = render(ui(false))
    act(() => screen.getByText("in the book").focus())
    view.rerender(ui(true))
    expect(rows()).toContain("action:book.cancel")
    expect(screen.getByText("book")).toBeInTheDocument()
  })
})

describe("symbol search", () => {
  const AAPL: SymbolResult = { symbol: "AAPL", name: "Apple Inc", exchange: "NASDAQ", kind: "equity" }

  function adapter(results: Record<string, SymbolResult[]>): SymbolSearchAdapter & { calls: string[]; aborted: string[] } {
    const calls: string[] = []
    const aborted: string[] = []
    return {
      calls,
      aborted,
      minLength: 2,
      debounceMs: 100,
      search(query, signal) {
        calls.push(query)
        signal.addEventListener("abort", () => aborted.push(query))
        return new Promise((resolve) => setTimeout(() => resolve(results[query] ?? []), 50))
      },
    }
  }

  it("debounces, shows that it is searching, and lists only answers to the query on screen", async () => {
    vi.useFakeTimers()
    const symbols = adapter({ aa: [AAPL], aap: [AAPL] })
    const onSymbolSelect = vi.fn()
    const watch = vi.fn()
    const actions = createActionRegistry()
    render(<CommandPalette actions={actions} hotkeys={null} open symbols={symbols} onSymbolSelect={onSymbolSelect} symbolSecondary={{ title: "Add to watchlist", run: watch }} />)
    type("a")
    await act(() => vi.advanceTimersByTimeAsync(200))
    expect(symbols.calls).toEqual([])
    type("aa")
    expect(screen.getByText("Searching…")).toBeInTheDocument()
    await act(() => vi.advanceTimersByTimeAsync(120))
    type("aap")
    await act(() => vi.advanceTimersByTimeAsync(40))
    // "aa" was in flight when the query moved on: aborted, and its answer never shows.
    expect(symbols.aborted).toEqual(["aa"])
    expect(rows()).toEqual([])
    await act(() => vi.advanceTimersByTimeAsync(200))
    expect(symbols.calls).toEqual(["aa", "aap"])
    expect(rows()).toEqual(["symbol:AAPL:NASDAQ"])
    expect(screen.getByText("Apple Inc · NASDAQ")).toBeInTheDocument()
    expect(screen.getByText("equity")).toBeInTheDocument()
    fireEvent.keyDown(input(), { key: "Enter", shiftKey: true })
    expect(watch).toHaveBeenCalledWith(AAPL)
    expect(onSymbolSelect).not.toHaveBeenCalled()
    expect(actions.recents()).toEqual([{ kind: "symbol", symbol: AAPL }])
  })

  it("treats a failed search as no results", async () => {
    vi.useFakeTimers()
    const symbols: SymbolSearchAdapter = { debounceMs: 0, search: () => Promise.reject(new Error("offline")) }
    render(<CommandPalette actions={createActionRegistry()} hotkeys={null} open symbols={symbols} />)
    type("aapl")
    await act(() => vi.advanceTimersByTimeAsync(10))
    expect(screen.getByText("No results")).toBeInTheDocument()
  })
})

describe("hotkeys", () => {
  it("declares and answers its own binding, shows shortcuts from the registry, and follows a remap", () => {
    const hotkeys = createHotkeyRegistry({ platform: "other" })
    hotkeys.register({ id: "go.blotter", keys: "g b", scope: "global", description: "Go to the blotter" })
    const onOpenChange = vi.fn()
    const view = render(
      <HotkeysProvider registry={hotkeys}>
        <CommandPalette actions={seed()} onOpenChange={onOpenChange} />
      </HotkeysProvider>,
    )
    expect(hotkeys.list().find((e) => e.id === "palette.open")).toMatchObject({ keys: "ctrl+k", scope: "editing" })
    fireEvent.keyDown(document.body, { key: "k", ctrlKey: true })
    const row = () => screen.getByText("Go to blotter").closest("[role=option]") as HTMLElement
    expect(within(row()).getByText("G")).toBeInTheDocument()
    expect(within(row()).getByText("B")).toBeInTheDocument()
    act(() => void hotkeys.remap("go.blotter", "g o"))
    expect(within(row()).getByText("O")).toBeInTheDocument()
    // Focus is behind the dialog's wall now, so the palette answers its own key to close.
    expect(onOpenChange).toHaveBeenLastCalledWith(true)
    fireEvent.keyDown(input(), { key: "k", ctrlKey: true })
    expect(onOpenChange).toHaveBeenLastCalledWith(false)
    view.unmount()
    expect(hotkeys.list().map((e) => e.id)).toEqual(["go.blotter"])
  })

  it("takes keys typed before focus arrives into the query, and keeps them from the hotkeys", () => {
    const hotkeys = createHotkeyRegistry({ platform: "other" })
    const cancel = vi.fn()
    hotkeys.register({ id: "orders.cancel", keys: "x", scope: "global", description: "Cancel" }, cancel)
    const detach = hotkeys.attach()
    // Wherever this base puts focus on open, put it back on the body: the gap Base UI leaves in a browser.
    const focus = vi.spyOn(HTMLElement.prototype, "focus").mockImplementation(() => {})
    render(<CommandPalette actions={seed()} hotkeys={hotkeys} open />)
    expect(document.activeElement).toBe(document.body)
    const typed = fireEvent.keyDown(document.body, { key: "x" })
    expect(typed).toBe(false)
    expect(cancel).not.toHaveBeenCalled()
    expect(input()).toHaveValue("x")
    // A modified key is not text, and still does not reach the dispatcher.
    fireEvent.keyDown(document.body, { key: "x", ctrlKey: true })
    expect(input()).toHaveValue("x")
    // Enter in the gap runs the highlighted row, and Shift+Enter its second action.
    fireEvent.keyDown(document.body, { key: "Backspace" })
    fireEvent.change(input(), { target: { value: "ticket" } })
    expect(fireEvent.keyDown(document.body, { key: "Enter", shiftKey: true })).toBe(false)
    expect(run.ticketSell).toHaveBeenCalledTimes(1)
    expect(run.ticket).not.toHaveBeenCalled()
    // Once focus is inside, the palette stops listening and the input is an input again.
    focus.mockRestore()
    act(() => input().focus())
    fireEvent.keyDown(document.body, { key: "x" })
    expect(cancel).toHaveBeenCalledTimes(1)
    detach()
  })

  it("leaves a binding the consumer declared alone, and declares nothing when told not to", () => {
    const hotkeys = createHotkeyRegistry({ platform: "other" })
    hotkeys.register({ id: "palette.open", keys: "mod+p", scope: "editing", description: "Mine" })
    const view = render(<CommandPalette actions={seed()} hotkeys={hotkeys} />)
    act(() => void hotkeys.handle(new KeyboardEvent("keydown", { key: "p", ctrlKey: true })))
    expect(screen.getByRole("combobox")).toBeInTheDocument()
    view.unmount()
    expect(hotkeys.list()).toMatchObject([{ id: "palette.open", description: "Mine" }])
    hotkeys.unregister("palette.open")
    render(<CommandPalette actions={seed()} hotkeys={hotkeys} hotkey={false} />)
    expect(hotkeys.list()).toEqual([])
  })
})

describe("go-bar", () => {
  const grammar = (text: string): PaletteAction[] => {
    const [symbol, fn] = text.toUpperCase().split(/\s+/)
    if (!symbol || !/^[A-Z]{1,5}$/.test(symbol)) return []
    return ["DES", "GP"].filter((f) => !fn || f.startsWith(fn)).map((f) => ({ id: `${symbol}.${f}`, title: `${symbol} ${f}`, run: () => run.blotter(`${symbol} ${f}`) }))
  }

  it("renders inline, opens on focus, and closes when focus leaves", () => {
    render(
      <>
        <CommandPalette variant="go-bar" actions={seed()} hotkeys={null} />
        <button>elsewhere</button>
      </>,
    )
    const slot = document.querySelector("[data-slot='tradecn-command-palette']") as HTMLElement
    expect(slot).toHaveAttribute("data-variant", "go-bar")
    expect(rows()).toEqual([])
    fireEvent.focus(input())
    expect(rows()).toEqual(["action:go.blotter", "action:ticket.new"])
    fireEvent.blur(input(), { relatedTarget: screen.getByText("elsewhere") })
    expect(rows()).toEqual([])
  })

  it("reads SYMBOL FUNCTION through the grammar and runs the first row on Enter", () => {
    render(<CommandPalette variant="go-bar" actions={seed()} hotkeys={null} goBarGrammar={grammar} />)
    fireEvent.focus(input())
    type("aapl")
    expect(rows().slice(0, 2)).toEqual(["command:AAPL.DES", "command:AAPL.GP"])
    type("aapl g")
    expect(rows()).toEqual(["command:AAPL.GP"])
    fireEvent.keyDown(input(), { key: "Enter" })
    expect(run.blotter).toHaveBeenCalledWith("AAPL GP")
    expect(input()).toHaveValue("")
  })

  it("clears on Escape and focuses from its hotkey", () => {
    const hotkeys = createHotkeyRegistry({ platform: "other" })
    const detach = hotkeys.attach()
    render(<CommandPalette variant="go-bar" actions={seed()} hotkeys={hotkeys} />)
    expect(hotkeys.list()).toMatchObject([{ id: "go-bar.focus", keys: "/", scope: "global" }])
    fireEvent.keyDown(document.body, { key: "/" })
    expect(document.activeElement).toBe(input())
    type("tick")
    fireEvent.keyDown(input(), { key: "Escape" })
    expect(input()).toHaveValue("")
    detach()
  })
})
