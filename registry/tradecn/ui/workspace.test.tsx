import { act, fireEvent, render, screen } from "@testing-library/react"
import { createRef, useEffect, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { HotkeysProvider, useHotkey } from "@/registry/tradecn/hooks/use-hotkeys"
import type { HotkeyBinding } from "@/registry/tradecn/lib/hotkeys"
import { parseWorkspaceLayout, WORKSPACE_PERSISTENCE_BOUNDARIES, type WorkspaceLayout } from "@/registry/tradecn/lib/workspace-layout"
import { Workspace, WorkspaceTab, WorkspaceTabActions, WorkspaceTabClose, WorkspaceTabTitle, useWorkspacePanel, useWorkspaceTab, type WorkspaceApi, type WorkspaceProps, type WorkspaceTabHandle } from "@/registry/tradecn/ui/workspace"

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

function Tab() {
  return <WorkspaceTab><WorkspaceTabTitle /><WorkspaceTabClose>×</WorkspaceTabClose></WorkspaceTab>
}

beforeEach(() => {
  vi.useFakeTimers()
  fired.length = 0
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("Workspace", () => {
  it("unmounts overflow consumers when their popup closes, including repeated opens and panel removal", async () => {
    vi.useRealTimers()
    const live = new Set<string>()
    let sequence = 0
    function TrackedTab() {
      const panel = useWorkspaceTab()
      useEffect(() => {
        const key = `${panel.tabLocation}:${sequence++}`
        live.add(key)
        return () => { live.delete(key) }
      }, [panel.tabLocation])
      return <Tab />
    }
    const { api, view } = await mount({ tabComponent: TrackedTab, seed: (api) => api.addPanel({ kind: "book" }) })
    const anchor = document.createElement("div")
    anchor.className = "dv-popover-anchor"
    document.body.append(anchor)
    try {
      expect(live.size).toBe(1)
      for (let cycle = 0; cycle < 3; cycle++) {
        await act(async () => {
          const renderer = api.dockview.getPanel("book-1")!.view.createTabRenderer("headerOverflow")
          anchor.append(renderer.element)
        })
        expect(live.size).toBe(2)
        await act(async () => { anchor.replaceChildren(); await new Promise<void>((resolve) => setTimeout(resolve, 0)) })
        expect(live.size).toBe(1)
      }
      await act(async () => {
        const renderer = api.dockview.getPanel("book-1")!.view.createTabRenderer("headerOverflow")
        anchor.append(renderer.element)
      })
      expect(live.size).toBe(2)
      act(() => api.clear())
      expect(live.size).toBe(0)
      view.unmount()
      expect(live.size).toBe(0)
    } finally { anchor.remove() }
  })

  it("disposes overflow renderers closed before insertion and restores their panel factory on teardown", async () => {
    vi.useRealTimers()
    const mounts = vi.fn()
    const cleanups = vi.fn()
    function TrackedTab() {
      useEffect(() => { mounts(); return cleanups }, [])
      return <Tab />
    }
    const { api, view } = await mount({ tabComponent: TrackedTab, seed: (api) => api.addPanel({ kind: "book" }) })
    const model = api.dockview.getPanel("book-1")!.view
    const wrapped = model.createTabRenderer
    await act(async () => { model.createTabRenderer("headerOverflow") })
    expect(mounts.mock.calls.length - cleanups.mock.calls.length).toBe(1)
    view.unmount()
    expect(model.createTabRenderer).not.toBe(wrapped)
    expect(mounts.mock.calls.length).toBe(cleanups.mock.calls.length)
  })

  it("keeps close defaults for explicit undefined native props and accepts deliberate labels", async () => {
    function CustomTab() {
      return <WorkspaceTab><WorkspaceTabClose type={undefined} aria-label={undefined}>×</WorkspaceTabClose><WorkspaceTabClose aria-label="Dismiss">Dismiss</WorkspaceTabClose><span id="close-caption">Remove panel</span><WorkspaceTabClose aria-labelledby="close-caption">×</WorkspaceTabClose></WorkspaceTab>
    }
    await mount({ tabComponent: CustomTab, seed: (api) => api.addPanel({ kind: "book" }) })
    expect(screen.getByRole("button", { name: "Close book" })).toHaveAttribute("type", "button")
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Remove panel" })).not.toHaveAttribute("aria-label")
  })

  it("forwards portaled clicks without moving focus back into the owning tab", async () => {
    const click = vi.fn()
    function PortalTab() {
      return <WorkspaceTab onClick={click}><WorkspaceTabTitle />{createPortal(<button type="button">Outside tab</button>, document.body)}</WorkspaceTab>
    }
    await mount({ tabComponent: PortalTab, seed: (api) => api.addPanel({ kind: "book", focus: false }) })
    const button = screen.getByRole("button", { name: "Outside tab" })
    button.focus()
    fireEvent.click(button)
    expect(click).toHaveBeenCalledTimes(1)
    expect(button).toHaveFocus()
  })

  it("lets the caller arrange tab content and cancel focus or close, forwarding native props and refs", async () => {
    const root = createRef<HTMLDivElement>()
    const tab = createRef<HTMLDivElement>()
    const title = createRef<HTMLSpanElement>()
    const close = createRef<HTMLButtonElement>()
    const clicks = vi.fn()
    function CustomTab() {
      return <WorkspaceTab ref={tab} className="custom-tab" title="Details" onClick={(event) => { clicks(); event.preventDefault() }}>
        <WorkspaceTabClose ref={close} aria-label="Dismiss panel" onClick={(event) => event.preventDefault()}>Dismiss</WorkspaceTabClose>
        <em>Desk</em><WorkspaceTabTitle ref={title} className="custom-title" />
      </WorkspaceTab>
    }
    const { api } = await mount({ ref: root, tabComponent: CustomTab, seed: (api) => api.addPanel({ kind: "book", title: "Orders", focus: false }) })
    expect(root.current).toHaveAttribute("data-slot", "tradecn-workspace")
    expect(tab.current).toHaveClass("custom-tab")
    expect(tab.current).toHaveAttribute("title", "Details")
    expect(title.current).toHaveTextContent("Orders")
    expect(close.current).toHaveAccessibleName("Dismiss panel")
    expect(close.current).toHaveAttribute("type", "button")
    close.current!.focus()
    fireEvent.click(title.current!)
    expect(clicks).toHaveBeenCalledTimes(1)
    expect(document.activeElement).toBe(close.current)
    fireEvent.click(close.current!)
    expect(api.panels()).toHaveLength(1)
    expect(clicks).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("tab", { name: "Orders" })).toHaveAttribute("aria-controls")
    expect(tab.current).not.toHaveAttribute("role")
  })

  it("keeps static tab composition local while native title changes update both title and close name", async () => {
    const renders = vi.fn()
    function StaticTab() { renders(); return <Tab /> }
    const { api } = await mount({ tabComponent: StaticTab })
    const before = renders.mock.calls.length
    act(() => api.setState("book-1", { symbol: "ES" }))
    act(() => api.dockview.getPanel("book-1")!.api.setTitle("Native title"))
    expect(renders).toHaveBeenCalledTimes(before)
    expect(document.querySelector("[data-workspace-tab='book-1'] [data-slot='tradecn-workspace-tab-title']")).toHaveTextContent("Native title")
    expect(screen.getByRole("button", { name: "Close Native title" })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "Native title" })).toBeInTheDocument()
    // The workspace record remains authoritative on the next store write, as in the release.
    act(() => api.setState("book-1", { symbol: "ZB" }))
    expect(screen.getByRole("button", { name: "Close book" })).toBeInTheDocument()
    expect(renders).toHaveBeenCalledTimes(before)
  })

  it("subscribes custom readings to their panel and shares state, title and commands with the body", async () => {
    const handles = new Map<string, WorkspaceTabHandle>()
    const renders = new Map<string, number>()
    function ReadingTab() {
      const panel = useWorkspaceTab()
      handles.set(panel.id, panel)
      renders.set(panel.id, (renders.get(panel.id) ?? 0) + 1)
      return <WorkspaceTab><WorkspaceTabTitle /><output>{String(panel.state?.symbol ?? "Missing")}</output></WorkspaceTab>
    }
    const { api } = await mount({ tabComponent: ReadingTab })
    const chartRenders = renders.get("chart-1")
    expect(handles.get("book-1")!.tabLocation).toBe("header")
    act(() => handles.get("book-1")!.setState({ symbol: "ES" }))
    expect(api.getState("book-1")).toEqual({ symbol: "ES" })
    expect(renders.get("chart-1")).toBe(chartRenders)
    act(() => handles.get("book-1")!.setTitle("Treasuries"))
    expect(screen.getByRole("tab", { name: "Treasuries" })).toBeInTheDocument()
    act(() => handles.get("book-1")!.focus())
    expect(document.activeElement).toHaveAttribute("aria-label", "Treasuries")
    expect(handles.get("book-1")!.active).toBe(true)
    act(() => handles.get("book-1")!.float())
    expect(handles.get("book-1")!.location).toBe("floating")
    act(() => handles.get("book-1")!.setState({ symbol: undefined }))
    expect(handles.get("book-1")!.state).toEqual({})
    act(() => handles.get("book-1")!.close())
    expect(api.panels().map((panel) => panel.id)).toEqual(["chart-1"])
  })

  it("keeps raw panels outside managed state, body focus and persistence", async () => {
    const handles = new Map<string, WorkspaceTabHandle>()
    function ReadingTab() {
      const panel = useWorkspaceTab()
      handles.set(panel.id, panel)
      return <Tab />
    }
    const { api, onLayoutError } = await mount({ tabComponent: ReadingTab })
    render(<button type="button">Outside</button>)
    act(() => { api.dockview.addPanel({ id: "raw", title: "Raw", component: "tradecn-panel" }) })
    expect(handles.get("raw")!.kind).toBeUndefined()
    expect(handles.get("raw")!.state).toBeUndefined()
    expect(document.querySelector("[data-workspace-panel='raw']")).toBeNull()
    const updater = vi.fn(() => ({ symbol: "ES" }))
    act(() => { handles.get("raw")!.setState(updater); handles.get("raw")!.setTitle("Renamed") })
    expect(updater).not.toHaveBeenCalled()
    expect(api.getState("raw")).toBeUndefined()
    expect(screen.getByRole("tab", { name: "Raw" })).toBeInTheDocument()
    act(() => api.focusPanel("book-1"))
    screen.getByRole("button", { name: "Outside" }).focus()
    act(() => handles.get("raw")!.focus())
    expect(api.activePanel()).toBe("raw")
    expect(screen.getByRole("button", { name: "Outside" })).toHaveFocus()
    act(() => api.dockview.getPanel("raw")!.api.setTitle("Native raw"))
    expect(screen.getByRole("tab", { name: "Native raw" })).toBeInTheDocument()
    act(() => handles.get("raw")!.float())
    expect(handles.get("raw")!.location).toBe("floating")
    const rawLayout = api.toLayout()
    expect(parseWorkspaceLayout(rawLayout)).toBeNull()
    act(() => handles.get("raw")!.close())
    expect(screen.queryByRole("tab", { name: "Native raw" })).toBeNull()
    expect(parseWorkspaceLayout(api.toLayout())).not.toBeNull()
    act(() => { expect(api.load(rawLayout)).toBe(false) })
    expect(api.panels()).toEqual([])
    expect(onLayoutError).toHaveBeenCalledTimes(1)
  })

  it("keeps a custom tab's local draft through parent updates and restores custom tabs for unknown kinds", async () => {
    const mounts = vi.fn()
    function DraftTab() {
      const [draft, setDraft] = useState("")
      useEffect(() => { mounts() }, [])
      return <WorkspaceTab><WorkspaceTabTitle /><WorkspaceTabActions><input aria-label="Tab draft" value={draft} onChange={(event) => setDraft(event.target.value)} /></WorkspaceTabActions></WorkspaceTab>
    }
    const { api, view } = await mount({ tabComponent: DraftTab, seed: (api) => api.addPanel({ kind: "retired", title: "Old panel" }) })
    const input = screen.getByRole("textbox", { name: "Tab draft" })
    fireEvent.change(input, { target: { value: "Keep me" } })
    const before = mounts.mock.calls.length
    view.rerender(<HotkeysProvider bindings={BINDINGS}><Workspace panels={PANELS} tabComponent={DraftTab} watermark="Updated" /></HotkeysProvider>)
    expect(screen.getByRole("textbox", { name: "Tab draft" })).toBe(input)
    expect(input).toHaveValue("Keep me")
    expect(mounts).toHaveBeenCalledTimes(before)
    const saved = api.toLayout()
    act(() => { expect(api.load(saved)).toBe(true) })
    expect(screen.getByRole("tab", { name: "Old panel" })).toBeInTheDocument()
    expect(screen.getByText(/No panel is registered/)).toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: "Tab draft" })).toHaveValue("")
  })

  it.each([false, true])("isolates actions and releases the native drag guard when a child stops propagation: %s", async (stopChild) => {
    const targetPointer = vi.fn()
    const targetClick = vi.fn()
    const rootClick = vi.fn()
    const actionRef = createRef<HTMLDivElement>()
    function ActionTab() {
      return <WorkspaceTab onClick={rootClick}><WorkspaceTabTitle /><WorkspaceTabActions ref={actionRef}>
        <button type="button" onPointerDown={(event) => { targetPointer(); if (stopChild) event.stopPropagation() }} onClick={targetClick}>Custom action</button>
      </WorkspaceTabActions></WorkspaceTab>
    }
    const { view } = await mount({ tabComponent: ActionTab, seed: (api) => api.addPanel({ kind: "book", focus: false }) })
    expect(actionRef.current).toHaveAttribute("data-slot", "tradecn-workspace-tab-actions")
    const button = screen.getByRole("button", { name: "Custom action" })
    const outer = screen.getByRole("tab", { name: "book" })
    fireEvent.pointerDown(button)
    fireEvent.click(button)
    expect(targetPointer).toHaveBeenCalledTimes(1)
    expect(targetClick).toHaveBeenCalledTimes(1)
    expect(rootClick).not.toHaveBeenCalled()
    expect(fireEvent.dragStart(outer)).toBe(false)
    fireEvent.pointerUp(document)
    expect(fireEvent.dragStart(outer)).toBe(true)
    fireEvent.pointerDown(button)
    fireEvent.pointerCancel(document)
    expect(fireEvent.dragStart(outer)).toBe(true)
    fireEvent.pointerDown(button)
    view.unmount()
    const event = new Event("dragstart", { bubbles: true, cancelable: true })
    document.body.append(outer)
    outer.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
    outer.remove()
  })

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

  it.each(["keep", "blur", "refocus-then-blur"])("preserves focus ownership after a pending native pointer activation (%s)", async (intent) => {
    const { api } = await mount({ seed: (api) => {
      api.addPanel({ kind: "book", focus: false })
      api.addPanel({ kind: "chart", position: { reference: "book-1", direction: "within" }, focus: false })
    } })
    const frames = new Map<number, FrameRequestCallback>()
    let next = 0
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => { frames.set(++next, callback); return next })
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => { frames.delete(id) })
    const tab = screen.getByRole("tab", { name: "book" })
    fireEvent.pointerDown(tab, { button: 0 })
    fireEvent.click(tab.querySelector("span")!)
    expect(document.activeElement).toHaveAttribute("aria-label", "book")
    // A second command before the native frame must retain the pending recovery.
    act(() => api.focusPanel("book-1"))
    const body = document.activeElement as HTMLElement
    if (intent === "refocus-then-blur") {
      const [id, nativeActivation] = frames.entries().next().value!
      act(() => { frames.delete(id); nativeActivation(0) })
      body.focus()
    }
    if (intent !== "keep") body.blur()
    await act(async () => {})
    act(() => { for (const [id, callback] of [...frames]) { frames.delete(id); callback(0) } })
    if (intent !== "keep") expect(document.activeElement).toBe(document.body)
    else expect(document.activeElement).toHaveAttribute("aria-label", "book")
    expect(frames.size).toBe(0)
  })

  it.each(["outside", "outside-then-body", "direct-blur", "unmount"])("cancels pending body-focus recovery after %s", async (interruption) => {
    const { api, view } = await mount()
    render(<button type="button">Outside recovery</button>)
    const frames = new Map<number, FrameRequestCallback>()
    let next = 0
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => { frames.set(++next, callback); return next })
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => { frames.delete(id) })
    act(() => api.focusPanel("book-1"))
    expect(document.activeElement).toHaveAttribute("aria-label", "book")
    expect(frames.size).toBe(1)
    if (interruption === "unmount") view.unmount()
    else if (interruption === "direct-blur") (document.activeElement as HTMLElement).blur()
    else {
      const outside = screen.getByRole("button", { name: "Outside recovery" })
      outside.focus()
      if (interruption === "outside-then-body") outside.blur()
    }
    await act(async () => {})
    expect(frames.size).toBe(0)
    if (interruption === "outside") expect(screen.getByRole("button", { name: "Outside recovery" })).toHaveFocus()
    else expect(document.activeElement).toBe(document.body)
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

// These are compiled by the real project typecheck. They are never rendered by the test runner.
function publicTypes(children: ReactNode, condition: boolean) {
  const panels = { book: () => null }
  const minimal = <Workspace panels={panels} />
  const saved = <Workspace panels={panels} defaultLayout={null} onLayoutChange={() => {}} layoutChangeDelay={20} />
  const configured = <Workspace panels={panels} locked disableFloating popoutUrl="/dock.html" watermark={<p>Empty</p>} />
  const native = <Workspace panels={panels} className="h-64" aria-label="Desk" onKeyDown={() => {}} />
  const callbacks = <Workspace panels={panels} onLayoutError={() => {}} onReady={() => {}} seed={(api) => api.addPanel({ kind: "book" })} />
  const oldProps: WorkspaceProps = { panels, watermark: null }
  const structural = <Workspace {...oldProps} />
  const composed = <Workspace panels={panels} tabComponent={Tab} ref={createRef<HTMLDivElement>()} />
  const parts = <WorkspaceTab ref={createRef<HTMLDivElement>()}>{children}{condition && <WorkspaceTabTitle ref={createRef<HTMLSpanElement>()} />}<WorkspaceTabActions ref={createRef<HTMLDivElement>()}>{children}</WorkspaceTabActions><WorkspaceTabClose ref={createRef<HTMLButtonElement>()} aria-label="Close tab">{null}</WorkspaceTabClose></WorkspaceTab>
  // @ts-expect-error Tab markup is explicitly caller-owned.
  const emptyTab = <WorkspaceTab />
  // @ts-expect-error Actions require explicit content, including intentional null.
  const emptyActions = <WorkspaceTabActions />
  // @ts-expect-error The close control requires caller-owned content.
  const emptyClose = <WorkspaceTabClose />
  // @ts-expect-error Title is a reading; custom content belongs in an ordinary span.
  const titleChildren = <WorkspaceTabTitle>Custom title</WorkspaceTabTitle>
  const titleProps = { children: "Custom title" }
  // @ts-expect-error Structural spreads cannot replace the title reading either.
  const spreadTitle = <WorkspaceTabTitle {...titleProps} />
  void [minimal, saved, configured, native, callbacks, structural, composed, parts, emptyTab, emptyActions, emptyClose, titleChildren, spreadTitle]
}
void publicTypes
