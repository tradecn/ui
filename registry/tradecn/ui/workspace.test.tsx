import { act, fireEvent, render, screen } from "@testing-library/react"
import { useState } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { HotkeysProvider, useHotkey } from "@/registry/tradecn/hooks/use-hotkeys"
import type { HotkeyBinding } from "@/registry/tradecn/lib/hotkeys"
import { parseWorkspaceLayout, WORKSPACE_PERSISTENCE_BOUNDARIES, type WorkspaceLayout } from "@/registry/tradecn/lib/workspace-layout"
import { Workspace, useWorkspacePanel, type WorkspaceApi, type WorkspaceProps } from "@/registry/tradecn/ui/workspace"

// The dock runs in happy-dom: it builds its DOM and its model, and reports every size as zero. What
// is checked here is the tradecn half: records, state, the layout written out and read back, and
// that each panel is the hotkey scope of its kind. Drag, drop, and geometry are the browser matrix's.

const BINDINGS: HotkeyBinding[] = [{ id: "book.cancel", keys: "x", scope: "panel:book", description: "Cancel" }]

const fired: string[] = []

function Book({ id }: { id: string }) {
  const panel = useWorkspacePanel()
  const [local, setLocal] = useState(0)
  useHotkey("book.cancel", () => fired.push(id))
  return (
    <div data-book={id} data-active={panel.active} data-location={panel.location}>
      <output data-symbol>{String(panel.state.symbol ?? "")}</output>
      <button type="button" onClick={() => panel.setState({ symbol: "ES" })}>
        to ES
      </button>
      <button type="button" onClick={() => panel.setState({ symbol: String(panel.state.symbol ?? "") })}>
        same
      </button>
      <button type="button" onClick={() => panel.setTitle(`${panel.title}!`)}>
        rename
      </button>
      <button type="button" onClick={() => setLocal((n) => n + 1)}>
        local {local}
      </button>
      <button type="button" onClick={panel.close}>
        close me
      </button>
    </div>
  )
}

function Chart() {
  const panel = useWorkspacePanel()
  return <div data-chart={panel.id}>chart</div>
}

const PANELS = { book: Book, chart: Chart }

async function mount(props: Partial<WorkspaceProps> = {}) {
  let api: WorkspaceApi | null = null
  const onLayoutChange = vi.fn()
  const onLayoutError = vi.fn()
  const view = render(
    <HotkeysProvider bindings={BINDINGS}>
      <Workspace
        panels={PANELS}
        layoutChangeDelay={50}
        onLayoutChange={onLayoutChange}
        onLayoutError={onLayoutError}
        seed={(a) => {
          a.addPanel({ kind: "book", state: { symbol: "ZN" } })
          a.addPanel({ kind: "chart", position: { reference: "book-1", direction: "right" } })
        }}
        {...props}
        onReady={(a) => {
          api = a
          props.onReady?.(a)
        }}
      />
    </HotkeysProvider>,
  )
  await act(async () => {})
  if (!api) throw new Error("the workspace never became ready")
  return { api: api as WorkspaceApi, onLayoutChange, onLayoutError, view }
}

const settle = () => act(() => vi.advanceTimersByTime(60))

beforeEach(() => {
  vi.useFakeTimers()
  fired.length = 0
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("Workspace", () => {
  it("seeds when there is nothing to restore, and every panel is a hotkey scope of its kind inside the dock", async () => {
    const { api } = await mount()
    const root = document.querySelector("[data-slot='tradecn-workspace']")!
    expect(root).not.toBeNull()
    const book = root.querySelector("[data-workspace-panel='book-1'] > [data-slot='tradecn-panel']")!
    expect(book).toHaveAttribute("data-hotkey-scope", "panel:book")
    expect(book).toHaveAttribute("aria-label", "book")
    expect(book.querySelector("[data-symbol]")).toHaveTextContent("ZN")
    expect(root.querySelector("[data-chart='chart-1']")).not.toBeNull()
    expect(api.panels().map((p) => [p.id, p.kind, p.title])).toEqual([
      ["book-1", "book", "book"],
      ["chart-1", "chart", "chart"],
    ])
    expect(root.querySelectorAll("[data-workspace-tab]")).toHaveLength(2)
    expect(screen.getByRole("button", { name: "Close book" })).toBeInTheDocument()
  })

  it("puts the keyboard inside the panel it focuses, and the panel's key answers there and nowhere else", async () => {
    const { api } = await mount()
    act(() => api.focusPanel("book-1"))
    const book = document.querySelector("[data-workspace-panel='book-1'] > [data-slot='tradecn-panel']")!
    expect(document.activeElement).toBe(book)
    expect(api.activePanel()).toBe("book-1")
    fireEvent.keyDown(document.activeElement!, { key: "x" })
    expect(fired).toEqual(["book-1"])
    act(() => api.focusPanel("chart-1"))
    fireEvent.keyDown(document.activeElement!, { key: "x" })
    expect(fired).toEqual(["book-1"])
    expect(api.activePanel()).toBe("chart-1")
  })

  it("hands over one layout after a burst goes quiet, and the layout parses back to itself", async () => {
    const { api, onLayoutChange } = await mount()
    expect(onLayoutChange).not.toHaveBeenCalled()
    await settle()
    // Seeding is a change: two panels were added and nothing stored them yet.
    expect(onLayoutChange).toHaveBeenCalledTimes(1)
    const layout = onLayoutChange.mock.calls[0]![0] as WorkspaceLayout
    expect(layout.version).toBe(1)
    expect(layout.kind).toBe("tradecn-workspace")
    expect(layout.boundaries).toEqual(WORKSPACE_PERSISTENCE_BOUNDARIES)
    expect(layout.panels).toEqual({ "book-1": { kind: "book", title: "book", state: { symbol: "ZN" } }, "chart-1": { kind: "chart", title: "chart", state: {} } })
    expect(Object.keys(layout.dockview.panels).sort()).toEqual(["book-1", "chart-1"])
    expect(parseWorkspaceLayout(JSON.stringify(layout))).toEqual(layout)
    expect(api.toLayout()).toEqual(layout)
  })

  it("reports a change of state or title once, and a patch that changes nothing not at all", async () => {
    const { api, onLayoutChange } = await mount()
    await settle()
    onLayoutChange.mockClear()
    fireEvent.click(screen.getByRole("button", { name: "same" }))
    fireEvent.click(screen.getByRole("button", { name: /^local/ }))
    await settle()
    expect(onLayoutChange).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "to ES" }))
    expect(screen.getByText("ES")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "rename" }))
    await settle()
    expect(onLayoutChange).toHaveBeenCalledTimes(1)
    const layout = onLayoutChange.mock.calls[0]![0] as WorkspaceLayout
    expect(layout.panels["book-1"]).toEqual({ kind: "book", title: "book!", state: { symbol: "ES" } })
    // The dock draws the title in places this item does not render, so it is told too.
    expect(layout.dockview.panels["book-1"]).toMatchObject({ title: "book!" })
    expect(screen.getByRole("button", { name: "Close book!" })).toBeInTheDocument()
    expect(api.getState("book-1")).toEqual({ symbol: "ES" })
  })

  it("restores a stored layout, records first, so a panel renders with its kept state", async () => {
    const first = await mount()
    fireEvent.click(screen.getByRole("button", { name: "to ES" }))
    await settle()
    const stored = JSON.stringify(first.api.toLayout())
    first.view.unmount()
    const seed = vi.fn()
    const { api, onLayoutChange, onLayoutError } = await mount({ defaultLayout: stored, seed })
    expect(seed).not.toHaveBeenCalled()
    expect(onLayoutError).not.toHaveBeenCalled()
    expect(screen.getByText("ES")).toBeInTheDocument()
    expect(api.panels().map((p) => p.id).sort()).toEqual(["book-1", "chart-1"])
    // Restoring is not a change.
    await settle()
    expect(onLayoutChange).not.toHaveBeenCalled()
  })

  it("falls through to the seed when the stored layout is not one, and says why", async () => {
    const seed = vi.fn((a: WorkspaceApi) => {
      a.addPanel({ kind: "chart" })
    })
    const { api, onLayoutError } = await mount({ defaultLayout: { version: 1, kind: "chart-workstation" }, seed })
    expect(seed).toHaveBeenCalledTimes(1)
    expect(onLayoutError).toHaveBeenCalledTimes(1)
    expect(api.panels().map((p) => p.id)).toEqual(["chart-1"])
  })

  it("loads over a running workspace without losing the records that share an id with the old panels", async () => {
    const { api } = await mount()
    const layout = api.toLayout()
    layout.panels["book-1"]!.state = { symbol: "TY" }
    let ok = false
    act(() => {
      ok = api.load(layout)
    })
    expect(ok).toBe(true)
    expect(screen.getByText("TY")).toBeInTheDocument()
    expect(api.panels().map((p) => p.id).sort()).toEqual(["book-1", "chart-1"])
  })

  it("draws a placeholder for a kind it was not given", async () => {
    const { api } = await mount()
    act(() => {
      api.addPanel({ kind: "news", title: "Wire" })
    })
    expect(screen.getByText("No panel is registered for the kind “news”.")).toBeInTheDocument()
    expect(document.querySelector("[data-workspace-panel='news-1'] > [data-slot='tradecn-panel']")).toHaveAttribute("data-hotkey-scope", "panel:news")
    expect(screen.getByRole("button", { name: "Close Wire" })).toBeInTheDocument()
  })

  it("opens an id once: asking again focuses what is there", async () => {
    const { api } = await mount()
    let id = ""
    act(() => {
      id = api.addPanel({ kind: "book", id: "book-1", state: { symbol: "NO" } })
    })
    expect(id).toBe("book-1")
    expect(api.panels()).toHaveLength(2)
    expect(screen.getByText("ZN")).toBeInTheDocument()
    expect(api.activePanel()).toBe("book-1")
    act(() => {
      id = api.addPanel({ kind: "book" })
    })
    expect(id).toBe("book-2")
  })

  it("closes from the tab, from the panel, and from the api, and forgets the record each time", async () => {
    const { api, onLayoutChange } = await mount()
    act(() => {
      api.addPanel({ kind: "book", id: "book-2" })
    })
    await settle()
    onLayoutChange.mockClear()
    fireEvent.click(screen.getByRole("button", { name: "Close chart" }))
    expect(document.querySelector("[data-chart]")).toBeNull()
    fireEvent.click(document.querySelector("[data-book='book-2']")!.querySelector("button[type=button]:last-of-type")!)
    expect(document.querySelector("[data-book='book-2']")).toBeNull()
    act(() => api.closePanel("book-1"))
    expect(api.panels()).toEqual([])
    expect(api.getState("book-1")).toBeUndefined()
    await settle()
    expect(onLayoutChange).toHaveBeenCalledTimes(1)
    expect((onLayoutChange.mock.calls[0]![0] as WorkspaceLayout).panels).toEqual({})
  })

  it("writes the last change out on the way out", async () => {
    const { onLayoutChange, view } = await mount()
    await settle()
    onLayoutChange.mockClear()
    fireEvent.click(screen.getByRole("button", { name: "to ES" }))
    view.unmount()
    expect(onLayoutChange).toHaveBeenCalledTimes(1)
    expect((onLayoutChange.mock.calls[0]![0] as WorkspaceLayout).panels["book-1"]!.state).toEqual({ symbol: "ES" })
  })

  it("tells the panel whether it is the active one", async () => {
    const { api } = await mount()
    act(() => api.focusPanel("book-1"))
    const book = document.querySelector("[data-book='book-1']")!
    expect(book).toHaveAttribute("data-active", "true")
    expect(book).toHaveAttribute("data-location", "grid")
    act(() => api.focusPanel("chart-1"))
    expect(book).toHaveAttribute("data-active", "false")
    expect(document.querySelector("[data-workspace-panel='chart-1'] > [data-slot='tradecn-panel']")).toHaveAttribute("data-state", "active")
    expect(document.querySelector("[data-workspace-panel='book-1'] > [data-slot='tradecn-panel']")).toHaveAttribute("data-state", "inactive")
  })

  it("moves through the panels in the dock's order", async () => {
    const { api } = await mount()
    act(() => api.focusPanel("book-1"))
    act(() => api.focusNext())
    expect(api.activePanel()).toBe("chart-1")
    expect(document.activeElement).toBe(document.querySelector("[data-workspace-panel='chart-1'] > [data-slot='tradecn-panel']"))
    act(() => api.focusNext(-1))
    expect(api.activePanel()).toBe("book-1")
  })
})

describe("useWorkspacePanel", () => {
  it("has to be inside a panel of a workspace", () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    expect(() => render(<Chart />)).toThrow(/inside a panel of a <Workspace>/)
  })
})
