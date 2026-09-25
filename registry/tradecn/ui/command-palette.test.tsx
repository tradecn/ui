import * as React from "react"
import { CommandGroup, CommandShortcut } from "@/components/ui/command"
import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { HotkeyScope, HotkeysProvider } from "@/registry/tradecn/hooks/use-hotkeys"
import { createHotkeyRegistry } from "@/registry/tradecn/lib/hotkeys"
import { CommandPalette, CommandPaletteContent, CommandPaletteDialog, CommandPaletteEmpty, CommandPaletteInput, CommandPaletteItem, CommandPaletteKeys, CommandPaletteList, CommandPaletteResults, CommandPaletteSecondary, useCommandPalette, type CommandPaletteProps, createActionRegistry, scorePaletteAction, type ActionRegistry, type PaletteAction, type SymbolResult, type SymbolSearchAdapter } from "@/registry/tradecn/ui/command-palette"

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
    const view = render(<ComposedPalette actions={actions} hotkeys={null} />)
    expect(document.querySelector("[data-slot='tradecn-command-palette']")).toBeNull()
    view.rerender(<ComposedPalette actions={actions} hotkeys={null} open />)
    const slot = document.querySelector("[data-slot='tradecn-command-palette']")
    expect(slot).toHaveAttribute("data-variant", "palette")
    // The scoped action is not on offer: focus was never inside panel:book.
    expect(rows()).toEqual(["action:go.blotter", "action:ticket.new"])
    expect(within(slot as HTMLElement).getByText("Navigate")).toBeInTheDocument()
    expect(within(slot as HTMLElement).getByText("Trade")).toBeInTheDocument()
  })

  it("filters and orders by score, and says when nothing matches", () => {
    render(<ComposedPalette actions={seed()} hotkeys={null} open />)
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
    render(<ComposedPalette actions={actions} hotkeys={null} defaultOpen onOpenChange={onOpenChange} />)
    type("ticket")
    fireEvent.keyDown(input(), { key: "Enter" })
    expect(run.ticket).toHaveBeenCalledTimes(1)
    expect(run.ticketSell).not.toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenLastCalledWith(false)
    expect(actions.recents()).toEqual([{ kind: "action", id: "ticket.new" }])
  })

  it("runs the second action on Shift+Enter, and the first when there is no second", () => {
    render(<ComposedPalette actions={seed()} hotkeys={null} open />)
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
    render(<ComposedPalette actions={seed()} hotkeys={null} open />)
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
    render(<ComposedPalette actions={actions} hotkeys={null} open />)
    expect(rows()).toEqual(["recent-symbol:AAPL:", "recent:ticket.new", "action:go.blotter", "action:ticket.new"])
  })

  it("offers a scoped action when opened from inside its scope", () => {
    const actions = seed()
    const ui = (open: boolean) => (
      <HotkeysProvider>
        <HotkeyScope scope="panel:book">
          <button>in the book</button>
        </HotkeyScope>
        <ComposedPalette actions={actions} open={open} />
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
    render(<ComposedPalette actions={actions} hotkeys={null} open symbols={symbols} onSymbolSelect={onSymbolSelect} symbolSecondary={{ title: "Add to watchlist", run: watch }} />)
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
    render(<ComposedPalette actions={createActionRegistry()} hotkeys={null} open symbols={symbols} />)
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
        <ComposedPalette actions={seed()} onOpenChange={onOpenChange} />
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
    render(<ComposedPalette actions={seed()} hotkeys={hotkeys} open />)
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
    const view = render(<ComposedPalette actions={seed()} hotkeys={hotkeys} />)
    act(() => void hotkeys.handle(new KeyboardEvent("keydown", { key: "p", ctrlKey: true })))
    expect(screen.getByRole("combobox")).toBeInTheDocument()
    view.unmount()
    expect(hotkeys.list()).toMatchObject([{ id: "palette.open", description: "Mine" }])
    hotkeys.unregister("palette.open")
    render(<ComposedPalette actions={seed()} hotkeys={hotkeys} hotkey={false} />)
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
        <ComposedPalette variant="go-bar" actions={seed()} hotkeys={null} />
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
    render(<ComposedPalette variant="go-bar" actions={seed()} hotkeys={null} goBarGrammar={grammar} />)
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
    render(<ComposedPalette variant="go-bar" actions={seed()} hotkeys={hotkeys} />)
    expect(hotkeys.list()).toMatchObject([{ id: "go-bar.focus", keys: "/", scope: "global" }])
    fireEvent.keyDown(document.body, { key: "/" })
    expect(document.activeElement).toBe(input())
    type("tick")
    fireEvent.keyDown(input(), { key: "Escape" })
    expect(input()).toHaveValue("")
    detach()
  })
})

function ComposedPalette(props: Omit<CommandPaletteProps, "children">) {
  const content = <CommandPaletteContent><CommandPaletteInput /><CommandPaletteList><PaletteResults /></CommandPaletteList></CommandPaletteContent>
  return <CommandPalette {...props}>{props.variant === "go-bar" ? content : <CommandPaletteDialog>{content}</CommandPaletteDialog>}</CommandPalette>
}

function PaletteResults() {
  const { loading } = useCommandPalette()
  return (
    <>
      <CommandPaletteEmpty>{loading ? "Searching…" : "No results"}</CommandPaletteEmpty>
      <CommandPaletteResults>
        {(group) => (
          <CommandGroup heading={group.heading}>
            {(group.id === "recent" ? group.rows.slice(0, 5) : group.rows).map((row) => (
              <CommandPaletteItem key={row.key} row={row}>
                <span className="truncate">{row.title}</span>
                {row.subtitle && <span className="truncate text-muted-foreground">{row.subtitle}</span>}
                {row.badge && <span className="rounded border border-border px-1 text-xs uppercase">{row.badge}</span>}
                {(row.secondary || row.keys) && (
                  <CommandShortcut className="flex shrink-0 items-center gap-2 text-xs tracking-normal">
                    <CommandPaletteSecondary><CommandPaletteKeys keys="shift+enter" />{row.secondary?.title}</CommandPaletteSecondary>
                    {row.keys && <CommandPaletteKeys keys={row.keys} />}
                  </CommandShortcut>
                )}
              </CommandPaletteItem>
            ))}
          </CommandGroup>
        )}
      </CommandPaletteResults>
    </>
  )
}

describe("public composition", () => {
  it("rejects released childless call shapes while accepting explicit conditional content", () => {
    const actions = seed()
    // @ts-expect-error v1 minimal call must request a migration, not render an empty provider.
    const minimal = <CommandPalette actions={actions} />
    // @ts-expect-error Retaining open must not make the obsolete call valid.
    const controlled = <CommandPalette actions={actions} open onOpenChange={() => {}} />
    // @ts-expect-error The former inline call also requires composition.
    const inline = <CommandPalette actions={actions} variant="go-bar" defaultOpen hotkey={false} />
    // @ts-expect-error Retained labels do not supply children.
    const named = <CommandPalette actions={actions} labels={{ title: "Find" }} />
    // @ts-expect-error Styling belongs on Content or Dialog now.
    const styled = <CommandPalette actions={actions} className="wide">{null}</CommandPalette>
    // @ts-expect-error Empty content belongs to the caller.
    const labeled = <CommandPalette actions={actions} labels={{ empty: "Nothing" }}>{null}</CommandPalette>
    const condition = actions.list().length > 0
    // @ts-expect-error cmdk owns onChange; use onChangeCapture for native observations.
    const changed = <CommandPaletteInput onChange={() => {}} />
    expect(changed).toBeDefined()
    const allowed = [null, false, undefined, condition && <span key="child">Application content</span>].map((children, i) => <CommandPalette key={i} actions={actions}>{children}</CommandPalette>)
    expect([minimal, controlled, inline, named, styled, labeled, ...allowed]).toHaveLength(10)
  })

  it("reports missing required coordination", () => {
    // @ts-expect-error A JavaScript caller still gets a useful runtime failure.
    expect(() => render(<CommandPalette>{null}</CommandPalette>)).toThrow("CommandPalette requires actions")
    expect(() => render(<CommandPaletteInput />)).toThrow("useCommandPalette requires CommandPaletteContent")
  })

  it("selects the visible order and keeps caller content and native events", () => {
    const actions = seed()
    const cancel = vi.fn((event: React.KeyboardEvent<HTMLDivElement>) => event.preventDefault())
    function Results() {
      const { groups } = useCommandPalette()
      return <CommandPaletteList>{[...groups].reverse().flatMap((group) => group.rows).map((row) => <CommandPaletteItem key={row.key} row={row} title={row.title}><strong>{row.title}</strong><span>Application detail</span></CommandPaletteItem>)}</CommandPaletteList>
    }
    const view = render(<CommandPalette actions={actions} variant="go-bar" defaultOpen hotkeys={null}><CommandPaletteContent onKeyDown={cancel} title="Custom content"><h2>My commands</h2><CommandPaletteInput aria-label="Custom query" /><Results /><p>Application footer</p></CommandPaletteContent></CommandPalette>)
    expect(rows()).toEqual(["action:ticket.new", "action:go.blotter"])
    fireEvent.keyDown(input(), { key: "Enter", shiftKey: true })
    expect(run.ticketSell).not.toHaveBeenCalled()
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(screen.getByText("Application footer")).toBeInTheDocument()
    view.rerender(<CommandPalette actions={actions} variant="go-bar" defaultOpen hotkeys={null}><CommandPaletteContent><CommandPaletteInput /><Results /></CommandPaletteContent></CommandPalette>)
    fireEvent.keyDown(input(), { key: "Enter", shiftKey: true })
    expect(run.ticketSell).toHaveBeenCalledTimes(1)
    expect(run.blotter).not.toHaveBeenCalled()
  })

  it("exposes all eligible recents while letting the caller cap them", () => {
    const actions = createActionRegistry()
    actions.loadRecents(Array.from({ length: 8 }, (_, i) => ({ kind: "symbol", symbol: { symbol: `S${i}` } })))
    function Results() {
      const { groups } = useCommandPalette()
      return <><output data-testid="count">{groups[0]?.rows.length}</output><CommandPaletteList><PaletteResults /></CommandPaletteList></>
    }
    render(<CommandPalette actions={actions} variant="go-bar" defaultOpen hotkeys={null}><CommandPaletteContent><CommandPaletteInput /><Results /></CommandPaletteContent></CommandPalette>)
    expect(screen.getByTestId("count")).toHaveTextContent("8")
    expect(rows()).toHaveLength(5)
  })

  it("does not execute removed or disabled results, including a disabled secondary button", () => {
    const actions = seed()
    let stale: Parameters<ReturnType<typeof useCommandPalette>["select"]>[0] | undefined
    function Results() {
      const { groups, select } = useCommandPalette()
      const row = groups.flatMap((group) => group.rows).find((row) => row.key === "action:ticket.new")
      React.useEffect(() => { if (row) stale = row }, [row])
      return <><button onClick={() => stale && select(stale)}>Try previous result</button><CommandPaletteList>{row && <CommandPaletteItem row={row} disabled>{row.title}<CommandPaletteSecondary>Sell instead</CommandPaletteSecondary></CommandPaletteItem>}</CommandPaletteList></>
    }
    const view = render(<CommandPalette actions={actions} variant="go-bar" defaultOpen hotkeys={null}><CommandPaletteContent><CommandPaletteInput /><Results /></CommandPaletteContent></CommandPalette>)
    expect(screen.getByText("Sell instead")).toBeDisabled()
    fireEvent.click(screen.getByText("Sell instead"))
    fireEvent.click(screen.getByRole("option"))
    fireEvent.keyDown(input(), { key: "Enter", shiftKey: true })
    expect(run.ticketSell).not.toHaveBeenCalled()
    expect(run.ticket).not.toHaveBeenCalled()
    view.rerender(<CommandPalette actions={createActionRegistry()} variant="go-bar" defaultOpen hotkeys={null}><CommandPaletteContent><CommandPaletteInput /><Results /></CommandPaletteContent></CommandPalette>)
    fireEvent.click(screen.getByText("Try previous result"))
    expect(run.ticket).not.toHaveBeenCalled()
  })

  it("closes before touching recents and invoking one selected callback", () => {
    const calls: string[] = []
    const actions = createActionRegistry()
    actions.register({ id: "a", title: "Action", run: () => calls.push("primary"), secondary: { title: "Alternate", run: () => calls.push("secondary") } })
    actions.onRecentsChange(() => calls.push("recent"))
    render(<ComposedPalette actions={actions} hotkeys={null} defaultOpen onOpenChange={(open) => { if (!open) calls.push("close") }} />)
    fireEvent.click(screen.getByText("Alternate"))
    expect(calls).toEqual(["close", "recent", "secondary"])
  })

  it("forwards content, input, list, item and secondary refs", () => {
    const contentRef = React.createRef<HTMLDivElement>()
    const inputRef = React.createRef<HTMLInputElement>()
    const listRef = React.createRef<HTMLDivElement>()
    const itemRef = React.createRef<HTMLDivElement>()
    const secondaryRef = React.createRef<HTMLButtonElement>()
    function Results() {
      const { groups } = useCommandPalette()
      const row = groups.flatMap((group) => group.rows).find((row) => row.secondary)!
      return <CommandPaletteList ref={listRef}><CommandPaletteItem ref={itemRef} row={row} className="custom-row">{row.title}<CommandPaletteSecondary ref={secondaryRef}>Alternate</CommandPaletteSecondary></CommandPaletteItem></CommandPaletteList>
    }
    render(<CommandPalette actions={seed()} variant="go-bar" defaultOpen hotkeys={null}><CommandPaletteContent ref={contentRef}><CommandPaletteInput ref={inputRef} /><Results /></CommandPaletteContent></CommandPalette>)
    expect(contentRef.current).toHaveAttribute("data-slot", "tradecn-command-palette")
    expect(inputRef.current).toBe(input())
    expect(listRef.current).toHaveAttribute("role", "listbox")
    expect(itemRef.current).toHaveClass("custom-row")
    expect(secondaryRef.current).toHaveTextContent("Alternate")
  })

  it("drops an old adapter's same-query results and cancels searches when closed", async () => {
    vi.useFakeTimers()
    const signals: AbortSignal[] = []
    const first: SymbolSearchAdapter = { debounceMs: 0, search: vi.fn(async (_query, signal) => { signals.push(signal); return [{ symbol: "OLD" }] }) }
    let answer: (results: SymbolResult[]) => void = () => {}
    const second: SymbolSearchAdapter = { debounceMs: 0, search: vi.fn((_query, signal) => { signals.push(signal); return new Promise<SymbolResult[]>((resolve) => { answer = resolve }) }) }
    const actions = createActionRegistry()
    const view = render(<ComposedPalette actions={actions} variant="go-bar" hotkeys={null} open symbols={first} />)
    type("a")
    await act(() => vi.advanceTimersByTimeAsync(1))
    expect(rows()).toEqual(["symbol:OLD:"])
    view.rerender(<ComposedPalette actions={actions} variant="go-bar" hotkeys={null} open symbols={second} />)
    expect(rows()).toEqual([])
    expect(screen.getByText("Searching…")).toBeInTheDocument()
    await act(() => vi.advanceTimersByTimeAsync(1))
    expect(signals[0]?.aborted).toBe(true)
    view.rerender(<ComposedPalette actions={actions} variant="go-bar" hotkeys={null} open={false} symbols={second} />)
    expect(signals[1]?.aborted).toBe(true)
    await act(async () => answer([{ symbol: "LATE" }]))
    view.rerender(<ComposedPalette actions={actions} variant="go-bar" hotkeys={null} open symbols={second} />)
    expect(rows()).toEqual([])
    view.unmount()
  })

  it("shares one search among state readers and releases subscriptions and pending requests", async () => {
    vi.useFakeTimers()
    const actions = createActionRegistry()
    const off = vi.fn()
    const original = actions.subscribe
    actions.subscribe = vi.fn((listener) => { const unsubscribe = original(listener); return () => { off(); unsubscribe() } })
    let signal: AbortSignal | undefined
    const search = vi.fn((_query: string, pending: AbortSignal) => { signal = pending; return new Promise<SymbolResult[]>(() => {}) })
    function Reader() { const { loading } = useCommandPalette(); return <span>{loading ? "Pending" : "Idle"}</span> }
    const view = render(<CommandPalette actions={actions} hotkeys={null} variant="go-bar" defaultOpen symbols={{ search, debounceMs: 10 }}><CommandPaletteContent><CommandPaletteInput /><Reader /><Reader /><CommandPaletteList><PaletteResults /></CommandPaletteList></CommandPaletteContent></CommandPalette>)
    type("aa")
    await act(() => vi.advanceTimersByTimeAsync(11))
    expect(search).toHaveBeenCalledTimes(1)
    expect(actions.subscribe).toHaveBeenCalledTimes(2)
    view.unmount()
    expect(signal?.aborted).toBe(true)
    expect(off).toHaveBeenCalledTimes(2)
  })
})

describe("caller controls", () => {
  it("supports click interception through the primitive's native capture event", () => {
    const stopped = vi.fn((event: React.MouseEvent<HTMLDivElement>) => event.stopPropagation())
    function Results() {
      const { groups } = useCommandPalette()
      const row = groups[0]!.rows[0]!
      // @ts-expect-error cmdk replaces bubbling onClick; use onClickCapture to intercept it.
      const ignoredClick = <CommandPaletteItem row={row} onClick={() => {}}>Title</CommandPaletteItem>
      // @ts-expect-error cmdk replaces bubbling onPointerMove; capture remains supported.
      const ignoredPointer = <CommandPaletteItem row={row} onPointerMove={() => {}}>Title</CommandPaletteItem>
      expect([ignoredClick, ignoredPointer]).toHaveLength(2)
      return <CommandPaletteList><CommandPaletteItem row={row} onClickCapture={stopped}>{row.title}</CommandPaletteItem></CommandPaletteList>
    }
    render(<CommandPalette actions={seed()} hotkeys={null} variant="go-bar" defaultOpen><CommandPaletteContent><CommandPaletteInput /><Results /></CommandPaletteContent></CommandPalette>)
    fireEvent.click(screen.getByRole("option"))
    expect(stopped).toHaveBeenCalledTimes(1)
    expect(run.blotter).not.toHaveBeenCalled()
  })

  it.each([false, true])("blocks a disabled secondary from Shift+Enter (early focus: %s)", (early) => {
    const focus = early ? vi.spyOn(HTMLElement.prototype, "focus").mockImplementation(() => {}) : undefined
    function Results() {
      const { groups } = useCommandPalette()
      const row = groups.flatMap((group) => group.rows).find((row) => row.secondary)!
      return <CommandPaletteList><CommandPaletteItem row={row}>{row.title}<CommandPaletteSecondary disabled>Alternate</CommandPaletteSecondary></CommandPaletteItem></CommandPaletteList>
    }
    render(<CommandPalette actions={seed()} hotkeys={null} open><CommandPaletteDialog><CommandPaletteContent><CommandPaletteInput /><Results /></CommandPaletteContent></CommandPaletteDialog></CommandPalette>)
    fireEvent.keyDown(early ? document.body : input(), { key: "Enter", shiftKey: true })
    expect(run.ticketSell).not.toHaveBeenCalled()
    expect(run.ticket).not.toHaveBeenCalled()
    fireEvent.keyDown(early ? document.body : input(), { key: "Enter" })
    expect(run.ticket).toHaveBeenCalledTimes(1)
    focus?.mockRestore()
  })

  it("preserves application controls' Enter and navigation without selecting a row", () => {
    const clicked = vi.fn()
    const typed = vi.fn()
    render(<CommandPalette actions={seed()} hotkeys={null} variant="go-bar" defaultOpen><CommandPaletteContent><CommandPaletteInput /><CommandPaletteList><PaletteResults /></CommandPaletteList><button onClick={clicked}>Application action</button><textarea aria-label="Notes" onKeyDown={typed} /></CommandPaletteContent></CommandPalette>)
    const button = screen.getByText("Application action")
    act(() => button.focus())
    expect(fireEvent.keyDown(button, { key: "Enter" })).toBe(true)
    fireEvent.click(button)
    expect(clicked).toHaveBeenCalledTimes(1)
    const notes = screen.getByRole("textbox", { name: "Notes" })
    expect(fireEvent.keyDown(notes, { key: "ArrowDown" })).toBe(true)
    expect(typed).toHaveBeenCalledTimes(1)
    expect(run.blotter).not.toHaveBeenCalled()
    expect(run.ticket).not.toHaveBeenCalled()
  })

  it.each(["palette", "go-bar"] as const)("closes %s from an application control and preserves native event targets", (variant) => {
    const hotkeys = createHotkeyRegistry({ platform: "other" })
    const onOpenChange = vi.fn()
    const contentRef = React.createRef<HTMLDivElement>()
    const targets: EventTarget[] = []
    const content = <CommandPaletteContent ref={contentRef} onKeyDown={(event) => targets.push(event.currentTarget)}><CommandPaletteInput /><CommandPaletteList><PaletteResults /></CommandPaletteList><button>Application action</button></CommandPaletteContent>
    render(<CommandPalette actions={seed()} hotkeys={hotkeys} variant={variant} defaultOpen onOpenChange={onOpenChange}>{variant === "palette" ? <CommandPaletteDialog>{content}</CommandPaletteDialog> : content}</CommandPalette>)
    const button = screen.getByText("Application action")
    act(() => button.focus())
    fireEvent.keyDown(button, { key: "a" })
    expect(targets).toEqual([contentRef.current])
    fireEvent.keyDown(button, variant === "palette" ? { key: "k", ctrlKey: true } : { key: "Escape" })
    expect(onOpenChange).toHaveBeenLastCalledWith(false)
    expect(run.blotter).not.toHaveBeenCalled()
  })

  it("preserves the secondary marker when caller props try to remove it", () => {
    function Results() {
      const { groups } = useCommandPalette()
      const row = groups.flatMap((group) => group.rows).find((row) => row.secondary)!
      return <CommandPaletteList><CommandPaletteItem row={row}>{row.title}<CommandPaletteSecondary disabled data-secondary={undefined}>Alternate</CommandPaletteSecondary></CommandPaletteItem></CommandPaletteList>
    }
    render(<CommandPalette actions={seed()} hotkeys={null} open><CommandPaletteDialog><CommandPaletteContent><CommandPaletteInput /><Results /></CommandPaletteContent></CommandPaletteDialog></CommandPalette>)
    fireEvent.keyDown(input(), { key: "Enter", shiftKey: true })
    expect(run.ticketSell).not.toHaveBeenCalled()
    expect(screen.getByText("Alternate")).toHaveAttribute("data-secondary")
  })
})

describe("forwarded refs", () => {
  it("keeps forwarded callback refs stable through query and registry updates", () => {
    const content = vi.fn()
    const field = vi.fn()
    const actions = seed()
    const view = render(<CommandPalette actions={actions} hotkeys={null} variant="go-bar" defaultOpen><CommandPaletteContent ref={content}><CommandPaletteInput ref={field} /><CommandPaletteList><PaletteResults /></CommandPaletteList></CommandPaletteContent></CommandPalette>)
    expect(content).toHaveBeenCalledTimes(1)
    expect(field).toHaveBeenCalledTimes(1)
    type("ticket")
    act(() => { actions.register({ id: "new", title: "Another ticket", run: () => {} }) })
    expect(content).toHaveBeenCalledTimes(1)
    expect(field).toHaveBeenCalledTimes(1)
    const nextContent = vi.fn()
    const nextField = vi.fn()
    view.rerender(<CommandPalette actions={actions} hotkeys={null} variant="go-bar" defaultOpen><CommandPaletteContent ref={nextContent}><CommandPaletteInput ref={nextField} /><CommandPaletteList><PaletteResults /></CommandPaletteList></CommandPaletteContent></CommandPalette>)
    expect(content.mock.calls.map(([node]) => node === null)).toEqual([false, true])
    expect(field.mock.calls.map(([node]) => node === null)).toEqual([false, true])
    expect(nextContent).toHaveBeenCalledTimes(1)
    expect(nextField).toHaveBeenCalledTimes(1)
    view.unmount()
    expect(nextContent.mock.calls.map(([node]) => node === null)).toEqual([false, true])
    expect(nextField.mock.calls.map(([node]) => node === null)).toEqual([false, true])
  })

  it("forwards replaced input nodes and preserves callback-ref cleanup", () => {
    const actions = seed()
    const element = React.createRef<HTMLInputElement>()
    const detach = vi.fn()
    const callback = vi.fn<(node: HTMLInputElement | null) => () => void>(() => detach)
    function App({ version, ref }: { version: number; ref: React.Ref<HTMLInputElement> }) {
      // eslint-disable-next-line no-restricted-syntax -- Tests cmdk node replacement, shared by both bases; installed JSX does not use asChild.
      return <CommandPalette actions={actions} hotkeys={null} variant="go-bar" defaultOpen><CommandPaletteContent><CommandPaletteInput asChild ref={ref}><input key={version} /></CommandPaletteInput><CommandPaletteList><PaletteResults /></CommandPaletteList></CommandPaletteContent></CommandPalette>
    }
    const view = render(<App version={0} ref={element} />)
    const first = element.current
    view.rerender(<App version={1} ref={element} />)
    expect(element.current).toBe(input())
    expect(element.current).not.toBe(first)
    expect(first?.isConnected).toBe(false)
    view.rerender(<App version={1} ref={callback} />)
    expect(element.current).toBeNull()
    expect(callback).toHaveBeenCalledTimes(1)
    type("ticket")
    expect(callback).toHaveBeenCalledTimes(1)
    view.rerender(<App version={2} ref={callback} />)
    expect(detach).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledTimes(2)
    view.unmount()
    expect(detach).toHaveBeenCalledTimes(2)
    expect(callback.mock.calls.every(([node]) => node !== null)).toBe(true)
  })
})
