import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  createWorkspacePanelStore,
  debounce,
  nextPanelId,
  parseWorkspaceLayout,
  toPanelState,
  unknownPanelKinds,
  WORKSPACE_PERSISTENCE_BOUNDARIES,
  type WorkspaceLayout,
} from "@/registry/tradecn/lib/workspace-layout"

// The smallest dock the parser accepts: one group holding two panels.
function dock(ids: string[]) {
  return {
    grid: { root: { type: "leaf", data: { views: ids, activeView: ids[0], id: "g1" } }, width: 800, height: 600, orientation: "HORIZONTAL" },
    panels: Object.fromEntries(ids.map((id) => [id, { id, contentComponent: "tradecn-panel", title: id }])),
    activeGroup: "g1",
  }
}

function layout(ids: string[], records?: Record<string, unknown>): unknown {
  return {
    version: 1,
    kind: "tradecn-workspace",
    dockview: dock(ids),
    panels: records ?? Object.fromEntries(ids.map((id) => [id, { kind: id.replace(/-\d+$/, ""), title: id, state: {} }])),
    boundaries: WORKSPACE_PERSISTENCE_BOUNDARIES,
  }
}

describe("parseWorkspaceLayout", () => {
  it("takes the object or its JSON text and hands back a copy", () => {
    const source = layout(["book-1", "chart-1"]) as WorkspaceLayout
    const fromObject = parseWorkspaceLayout(source)!
    const fromText = parseWorkspaceLayout(JSON.stringify(source))!
    expect(fromObject).toEqual(source)
    expect(fromText).toEqual(source)
    expect(fromObject).not.toBe(source)
    expect(fromObject.dockview).not.toBe(source.dockview)
    expect(fromObject.panels["book-1"]).not.toBe(source.panels["book-1"])
  })

  it("refuses anything that is not a version 1 tradecn workspace", () => {
    expect(parseWorkspaceLayout(null)).toBeNull()
    expect(parseWorkspaceLayout("not json")).toBeNull()
    expect(parseWorkspaceLayout("[]")).toBeNull()
    expect(parseWorkspaceLayout({ ...(layout(["a-1"]) as object), version: 2 })).toBeNull()
    expect(parseWorkspaceLayout({ ...(layout(["a-1"]) as object), kind: "chart-workstation" })).toBeNull()
    expect(parseWorkspaceLayout({ ...(layout(["a-1"]) as object), dockview: { grid: {}, panels: {} } })).toBeNull()
    expect(parseWorkspaceLayout({ ...(layout(["a-1"]) as object), dockview: { grid: { root: {} }, panels: [] } })).toBeNull()
    expect(parseWorkspaceLayout({ ...(layout(["a-1"]) as object), panels: null })).toBeNull()
  })

  it("needs a record with a kind for every docked panel", () => {
    expect(parseWorkspaceLayout(layout(["book-1", "chart-1"], { "book-1": { kind: "book" } }))).toBeNull()
    expect(parseWorkspaceLayout(layout(["book-1"], { "book-1": { kind: "" } }))).toBeNull()
    expect(parseWorkspaceLayout(layout(["book-1"], { "book-1": { kind: 7 } }))).toBeNull()
    expect(parseWorkspaceLayout(layout(["book-1"], { "book-1": "book" }))).toBeNull()
  })

  it("drops a record whose panel is not in the dock, fills a missing title with the kind, and cleans the state", () => {
    const parsed = parseWorkspaceLayout(layout(["book-1"], { "book-1": { kind: "book", state: { symbol: "ZN", fn: () => 1, gone: undefined } }, "ghost-1": { kind: "ghost" } }))!
    expect(Object.keys(parsed.panels)).toEqual(["book-1"])
    expect(parsed.panels["book-1"]).toEqual({ kind: "book", title: "book", state: { symbol: "ZN" } })
  })

  it("keeps the boundaries the writer recorded, and uses today's when they are malformed", () => {
    const recorded = { autosave: ["dock-arrangement"], workspaceScoped: [], globalScoped: ["theme"], excluded: ["market-data"] }
    expect(parseWorkspaceLayout({ ...(layout(["a-1"]) as object), boundaries: recorded })!.boundaries).toEqual(recorded)
    expect(parseWorkspaceLayout({ ...(layout(["a-1"]) as object), boundaries: { autosave: "everything" } })!.boundaries).toEqual(WORKSPACE_PERSISTENCE_BOUNDARIES)
    expect(parseWorkspaceLayout({ ...(layout(["a-1"]) as object), boundaries: undefined })!.boundaries).toEqual(WORKSPACE_PERSISTENCE_BOUNDARIES)
  })
})

describe("WORKSPACE_PERSISTENCE_BOUNDARIES", () => {
  it("puts each thing in one place", () => {
    const all = Object.values(WORKSPACE_PERSISTENCE_BOUNDARIES).flat()
    expect(new Set(all).size).toBe(all.length)
    expect(Object.keys(WORKSPACE_PERSISTENCE_BOUNDARIES)).toEqual(["autosave", "workspaceScoped", "globalScoped", "excluded"])
  })
})

describe("toPanelState", () => {
  it("is what JSON would store, or nothing", () => {
    expect(toPanelState({ a: 1, b: [1, "x", null], c: { d: true }, e: undefined, f: () => 1 })).toEqual({ a: 1, b: [1, "x", null], c: { d: true } })
    expect(toPanelState(null)).toEqual({})
    expect(toPanelState([1])).toEqual({})
    expect(toPanelState("x")).toEqual({})
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(toPanelState(cyclic)).toEqual({})
  })
})

describe("unknownPanelKinds and nextPanelId", () => {
  it("names the kinds a layout wants that the workspace lacks, once each, sorted", () => {
    const parsed = parseWorkspaceLayout(layout(["book-1", "book-2", "chart-1", "news-1"]))!
    expect(unknownPanelKinds(parsed, ["book"])).toEqual(["chart", "news"])
    expect(unknownPanelKinds(parsed, ["book", "chart", "news"])).toEqual([])
  })

  it("gives the lowest free number", () => {
    expect(nextPanelId("book", [])).toBe("book-1")
    expect(nextPanelId("book", ["book-1", "book-2"])).toBe("book-3")
    expect(nextPanelId("book", ["book-2", "chart-1"])).toBe("book-1")
  })
})

describe("createWorkspacePanelStore", () => {
  it("keeps a record's identity until that record changes", () => {
    const store = createWorkspacePanelStore()
    store.set("book-1", { kind: "book", title: "Book", state: { symbol: "ZN" } })
    store.set("chart-1", { kind: "chart", title: "Chart", state: {} })
    const book = store.get("book-1")
    store.setState("chart-1", { range: "1d" })
    expect(store.get("book-1")).toBe(book)
    store.setState("book-1", { symbol: "ES" })
    expect(store.get("book-1")).not.toBe(book)
    expect(store.get("book-1")).toEqual({ kind: "book", title: "Book", state: { symbol: "ES" } })
  })

  it("merges a patch, takes a function of the state before, removes undefined keys, and stays quiet when nothing changed", () => {
    const store = createWorkspacePanelStore()
    const changes = vi.fn()
    store.subscribe(changes)
    store.set("book-1", { kind: "book", title: "Book", state: { symbol: "ZN", group: 1 } })
    store.setState("book-1", { group: 2 })
    expect(store.get("book-1")!.state).toEqual({ symbol: "ZN", group: 2 })
    store.setState("book-1", (state) => ({ symbol: `${state.symbol}Z` }))
    expect(store.get("book-1")!.state).toEqual({ symbol: "ZNZ", group: 2 })
    store.setState("book-1", { group: undefined })
    expect(store.get("book-1")!.state).toEqual({ symbol: "ZNZ" })
    expect(changes).toHaveBeenCalledTimes(4)
    store.setState("book-1", { symbol: "ZNZ" })
    store.setTitle("book-1", "Book")
    store.setTitle("book-1", "")
    store.setState("ghost", { a: 1 })
    store.delete("ghost")
    expect(changes).toHaveBeenCalledTimes(4)
  })

  it("stores JSON only", () => {
    const store = createWorkspacePanelStore()
    store.set("book-1", { kind: "book", title: "", state: { fn: () => 1, ok: 1 } as never })
    expect(store.get("book-1")).toEqual({ kind: "book", title: "book", state: { ok: 1 } })
    store.setState("book-1", { when: new Date(0) } as never)
    expect(store.get("book-1")!.state.when).toBe("1970-01-01T00:00:00.000Z")
  })

  it("replaces everything for a load, and snapshots copies", () => {
    const store = createWorkspacePanelStore()
    store.set("old-1", { kind: "old", title: "Old", state: {} })
    store.replace({ "book-1": { kind: "book", title: "Book", state: { symbol: "ZN" } } })
    expect(store.ids()).toEqual(["book-1"])
    const snapshot = store.snapshot()
    snapshot["book-1"]!.state.symbol = "ES"
    expect(store.get("book-1")!.state.symbol).toBe("ZN")
  })
})

describe("debounce", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it("runs once after the burst goes quiet, and flush runs a waiting call now", () => {
    const fn = vi.fn()
    const d = debounce(fn, 100)
    d()
    vi.advanceTimersByTime(60)
    d()
    vi.advanceTimersByTime(60)
    expect(fn).not.toHaveBeenCalled()
    expect(d.pending()).toBe(true)
    vi.advanceTimersByTime(40)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(d.pending()).toBe(false)
    d.flush()
    expect(fn).toHaveBeenCalledTimes(1)
    d()
    d.flush()
    expect(fn).toHaveBeenCalledTimes(2)
    d()
    d.cancel()
    vi.advanceTimersByTime(200)
    expect(fn).toHaveBeenCalledTimes(2)
  })
})
