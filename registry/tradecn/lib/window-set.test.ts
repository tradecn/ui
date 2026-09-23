import { describe, expect, it, vi } from "vitest"
import { createPreferences, getSlot } from "@/registry/tradecn/lib/preferences"
import { WINDOW_SET_BOUNDARIES, WINDOW_SET_KIND, WINDOW_SET_SLOT, WINDOW_SET_VERSION, createWindowSet, defaultWindowUrl, mainWindow, parseWindowRecord, parseWindowSet, readWindowSet, windowSetOf, writeWindowSet, type WindowAdapter, type WindowBounds, type WindowRecord } from "@/registry/tradecn/lib/window-set"

const MAIN: WindowRecord = { id: "main", layoutId: "desk", bounds: { x: 0, y: 0, width: 1600, height: 1000 }, display: "DELL U2723QE", main: true }
const SIDE: WindowRecord = { id: "side", layoutId: "blotters", bounds: { x: 1600, y: 0, width: 800, height: 1000 } }
const THIRD: WindowRecord = { id: "third", layoutId: "charts" }

/** A pretend shell: windows as a map, closes it can fire itself, bounds it can be told. */
function fakeShell(boundsOf: Record<string, WindowBounds> = {}) {
  const windows = new Map<string, string>()
  const closed = new Set<(id: string) => void>()
  const calls: string[] = []
  const adapter: WindowAdapter = {
    open: vi.fn((id: string, url: string) => {
      calls.push(`open ${id} ${url}`)
      windows.set(id, url)
    }),
    close: vi.fn((id: string) => {
      calls.push(`close ${id}`)
      windows.delete(id)
    }),
    onClosed: vi.fn((cb: (id: string) => void) => {
      closed.add(cb)
      return () => closed.delete(cb)
    }),
    bounds: vi.fn((id: string) => boundsOf[id] ?? null),
  }
  const shellCloses = (id: string) => {
    windows.delete(id)
    for (const cb of closed) cb(id)
  }
  return { adapter, windows, calls, shellCloses, listeners: closed }
}

describe("the set as data", () => {
  it("makes a set from records, dropping a duplicate id and every main mark but the first", () => {
    const set = windowSetOf([MAIN, SIDE, { ...SIDE, layoutId: "again" }, { ...THIRD, main: true }])
    expect(set.version).toBe(WINDOW_SET_VERSION)
    expect(set.kind).toBe(WINDOW_SET_KIND)
    expect(set.windows.map((w) => w.id)).toEqual(["main", "side", "third"])
    expect(set.windows[0]?.main).toBe(true)
    expect(set.windows[2]?.main).toBeUndefined()
    expect(set.windows[1]?.layoutId).toBe("blotters")
    expect(set.boundaries).toBe(WINDOW_SET_BOUNDARIES)
    // Copies, not the records handed in.
    expect(set.windows[0]).not.toBe(MAIN)
    expect(set.windows[0]).toEqual(MAIN)
    expect(windowSetOf().windows).toEqual([])
  })

  it("names the main window, else the first", () => {
    expect(mainWindow(windowSetOf([SIDE, MAIN]))).toEqual(MAIN)
    expect(mainWindow(windowSetOf([SIDE, THIRD]))?.id).toBe("side")
    expect(mainWindow(windowSetOf([]))).toBeUndefined()
  })

  it("parses a record on no trust: an id and a layout id or nothing, bounds only when whole", () => {
    expect(parseWindowRecord(MAIN)).toEqual(MAIN)
    expect(parseWindowRecord({ id: "a", layoutId: "b", bounds: { x: 0, y: 0, width: 0, height: 10 }, display: "", main: "yes" })).toEqual({ id: "a", layoutId: "b" })
    expect(parseWindowRecord({ id: "a", layoutId: "b", bounds: { x: 1, y: 2, width: 3 } })).toEqual({ id: "a", layoutId: "b" })
    expect(parseWindowRecord({ id: "", layoutId: "b" })).toBeNull()
    expect(parseWindowRecord({ id: "a" })).toBeNull()
    expect(parseWindowRecord("a")).toBeNull()
    expect(parseWindowRecord(null)).toBeNull()
  })

  it("parses a stored set from an object or text, drops the malformed records, keeps the rest, and refuses anything else", () => {
    const set = windowSetOf([MAIN, SIDE])
    expect(parseWindowSet(set)).toEqual(set)
    expect(parseWindowSet(JSON.stringify(set))).toEqual(set)
    const loose = parseWindowSet({ version: 1, kind: WINDOW_SET_KIND, windows: [MAIN, { id: "x" }, 4, { id: "side", layoutId: "b" }, { id: "side", layoutId: "c" }], boundaries: { template: ["a"], user: [], session: [] } })
    expect(loose?.windows.map((w) => w.id)).toEqual(["main", "side"])
    expect(loose?.windows[1]?.layoutId).toBe("b")
    expect(loose?.boundaries).toEqual({ template: ["a"], user: [], session: [] })
    // Boundaries that are not lists of words fall back to this file's.
    expect(parseWindowSet({ version: 1, kind: WINDOW_SET_KIND, windows: [], boundaries: { template: "a" } })?.boundaries).toBe(WINDOW_SET_BOUNDARIES)
    expect(parseWindowSet({ version: 2, kind: WINDOW_SET_KIND, windows: [] })).toBeNull()
    expect(parseWindowSet({ version: 1, kind: "tradecn-workspace", windows: [] })).toBeNull()
    expect(parseWindowSet({ version: 1, kind: WINDOW_SET_KIND, windows: {} })).toBeNull()
    expect(parseWindowSet("{not json")).toBeNull()
    expect(parseWindowSet(null)).toBeNull()
  })

  it("travels in a preferences slot", () => {
    const set = windowSetOf([MAIN, SIDE])
    const prefs = writeWindowSet(createPreferences({ template: [WINDOW_SET_SLOT] }), set)
    expect(getSlot(prefs, WINDOW_SET_SLOT)?.version).toBe(WINDOW_SET_VERSION)
    expect(readWindowSet(prefs)).toEqual(set)
    expect(readWindowSet(createPreferences())).toBeNull()
    expect(readWindowSet(writeWindowSet(createPreferences(), set, "desk-windows"), "desk-windows")).toEqual(set)
  })

  it("builds the default url on the document's path", () => {
    expect(defaultWindowUrl({ id: "side 2", layoutId: "blotters/eu" })).toBe(`${location.pathname}?window=side%202&layout=blotters%2Feu`)
  })
})

describe("the controller", () => {
  it("restores a set main first, opening each window at its url, skipping the ones already open, and says what it opened", async () => {
    const shell = fakeShell()
    const set = createWindowSet(shell.adapter, { url: (w) => `app://${w.id}/${w.layoutId}` })
    const heard = vi.fn()
    set.subscribe(heard)
    expect(await set.open(SIDE)).toBe(true)
    expect(heard).toHaveBeenCalledTimes(1)
    const opened = await set.restore(windowSetOf([SIDE, THIRD, MAIN]))
    expect(opened.map((w) => w.id)).toEqual(["main", "third"])
    expect(shell.calls).toEqual(["open side app://side/blotters", "open main app://main/desk", "open third app://third/charts"])
    expect(set.windows().map((w) => w.id)).toEqual(["side", "main", "third"])
    expect(set.isOpen("main")).toBe(true)
    expect(heard).toHaveBeenCalledTimes(3)
    // Open again: nothing happens.
    expect(await set.open(MAIN)).toBe(false)
    expect(shell.adapter.open).toHaveBeenCalledTimes(3)
    expect(heard).toHaveBeenCalledTimes(3)
  })

  it("closes through the shell, hears a close the shell made on its own, and closes everything", async () => {
    const shell = fakeShell()
    const set = createWindowSet(shell.adapter)
    const heard = vi.fn()
    set.subscribe(heard)
    await set.restore(windowSetOf([MAIN, SIDE, THIRD]))
    heard.mockClear()
    expect(await set.close("side")).toBe(true)
    expect(shell.calls.at(-1)).toBe("close side")
    expect(set.isOpen("side")).toBe(false)
    expect(heard).toHaveBeenCalledTimes(1)
    expect(await set.close("side")).toBe(false)
    expect(heard).toHaveBeenCalledTimes(1)
    // The person presses the X on the third window: the shell says so, the set follows, nothing is closed twice.
    shell.shellCloses("third")
    expect(set.windows().map((w) => w.id)).toEqual(["main"])
    expect(heard).toHaveBeenCalledTimes(2)
    shell.shellCloses("never-open")
    expect(heard).toHaveBeenCalledTimes(2)
    await set.closeAll()
    expect(set.windows()).toEqual([])
    expect(shell.adapter.close).toHaveBeenCalledTimes(2)
  })

  it("snapshots the open windows with the bounds the shell reports now, keeping a record's own where the shell has none", async () => {
    const shell = fakeShell({ main: { x: 10, y: 20, width: 1500, height: 900 } })
    const set = createWindowSet(shell.adapter, { boundaries: { template: ["t"], user: ["u"], session: [] } })
    await set.restore(windowSetOf([MAIN, SIDE]))
    const snap = await set.snapshot()
    expect(snap.kind).toBe(WINDOW_SET_KIND)
    expect(snap.windows).toEqual([{ ...MAIN, bounds: { x: 10, y: 20, width: 1500, height: 900 } }, SIDE])
    expect(snap.boundaries).toEqual({ template: ["t"], user: ["u"], session: [] })
    expect(parseWindowSet(JSON.stringify(snap))).toEqual(snap)
    // Without a bounds function the records stand as they were opened.
    const bare = createWindowSet({ ...shell.adapter, bounds: undefined })
    await bare.open(SIDE)
    expect((await bare.snapshot()).windows).toEqual([SIDE])
  })

  it("stops listening to the shell on dispose, and closes nothing", async () => {
    const shell = fakeShell()
    const set = createWindowSet(shell.adapter)
    await set.open(MAIN)
    expect(shell.listeners.size).toBe(1)
    set.dispose()
    expect(shell.listeners.size).toBe(0)
    expect(set.isOpen("main")).toBe(true)
    expect(shell.adapter.close).not.toHaveBeenCalled()
  })
})
