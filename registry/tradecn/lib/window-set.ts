import { readSlot, setSlot, type Preferences } from "@/registry/tradecn/lib/preferences"

// For shells whose windows are separate JavaScript contexts, a webview per window in a Rust-hosted shell or a
// BrowserWindow per window in a Node-hosted one, the recipe in docs/workspace.md (one Workspace per window)
// becomes data and a driver. The set is the data: which windows a desk has, which layout each shows, and where
// each sits. The controller drives the consumer's adapter over the shell's own calls: open a window, close one,
// hear one close, ask where one is. No shell package is imported; the shell is the consumer's, behind four
// functions, and the layouts themselves live wherever the consumer keeps them, keyed by `layoutId`.

export const WINDOW_SET_KIND = "tradecn-window-set"
export const WINDOW_SET_VERSION = 1
/** The preferences slot a set travels in. */
export const WINDOW_SET_SLOT = "windows"

/** What a set carries, and for whom, in the language `preferences` and the workspace layout already use. */
export const WINDOW_SET_BOUNDARIES = {
  /** Travels as a desk template: which windows there are, which layout each shows, which is the main one. */
  template: ["window-ids", "layout-ids", "main-window"],
  /** The person's own: where each window sits, and on which display. */
  user: ["bounds", "display"],
  /** Stored by nobody: what is open right now comes from the shell every launch. */
  session: ["open-state", "focus"],
} as const

export type WindowSetBoundary = keyof typeof WINDOW_SET_BOUNDARIES
export type WindowSetBoundaries = { readonly [K in WindowSetBoundary]: readonly string[] }
const BOUNDARY_KEYS: readonly WindowSetBoundary[] = ["template", "user", "session"]

export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface WindowRecord {
  /** The shell's name for the window: a Tauri label, an Electron window's key in your own map. */
  id: string
  /** The layout this window shows, keyed however you keep layouts: a `layout-manager` template's id, a file name. */
  layoutId: string
  bounds?: WindowBounds
  /** The display the window sits on, as the shell names it. */
  display?: string
  /** The one window that opens first and whose close ends the desk. At most one; the first wins. */
  main?: boolean
}

export interface WindowSet {
  version: typeof WINDOW_SET_VERSION
  kind: typeof WINDOW_SET_KIND
  windows: WindowRecord[]
  /** What the writer put in and what it kept out, at the time it wrote. */
  boundaries: WindowSetBoundaries
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function parseBounds(value: unknown): WindowBounds | undefined {
  if (!isObject(value)) return undefined
  const { x, y, width, height } = value
  return isFinite(x) && isFinite(y) && isFinite(width) && isFinite(height) && width > 0 && height > 0 ? { x, y, width, height } : undefined
}

/** One record, taken on no trust: an id and a layout id, or nothing; bounds and display only when whole. */
export function parseWindowRecord(value: unknown): WindowRecord | null {
  if (!isObject(value)) return null
  const { id, layoutId, bounds, display, main } = value
  if (typeof id !== "string" || id.trim() === "" || typeof layoutId !== "string" || layoutId.trim() === "") return null
  const record: WindowRecord = { id, layoutId }
  const box = parseBounds(bounds)
  if (box) record.bounds = box
  if (typeof display === "string" && display !== "") record.display = display
  if (main === true) record.main = true
  return record
}

function readBoundaries(value: unknown): WindowSetBoundaries {
  if (!isObject(value)) return WINDOW_SET_BOUNDARIES
  const out: Partial<Record<WindowSetBoundary, readonly string[]>> = {}
  for (const key of BOUNDARY_KEYS) {
    const list = value[key]
    if (!Array.isArray(list) || !list.every((entry) => typeof entry === "string")) return WINDOW_SET_BOUNDARIES
    out[key] = list
  }
  return { template: out.template ?? [], user: out.user ?? [], session: out.session ?? [] }
}

/** Records made into a set: duplicate ids dropped after the first, one main at most (the first keeps it), records copied. */
function normalize(records: readonly WindowRecord[]): WindowRecord[] {
  const seen = new Set<string>()
  let main = false
  const out: WindowRecord[] = []
  for (const record of records) {
    if (seen.has(record.id)) continue
    seen.add(record.id)
    const copy: WindowRecord = { ...record }
    if (copy.main) {
      if (main) delete copy.main
      main = true
    } else delete copy.main
    out.push(copy)
  }
  return out
}

/** A set from records, with the boundaries this file names unless told otherwise. */
export function windowSetOf(windows: readonly WindowRecord[] = [], boundaries: WindowSetBoundaries = WINDOW_SET_BOUNDARIES): WindowSet {
  return { version: WINDOW_SET_VERSION, kind: WINDOW_SET_KIND, windows: normalize(windows), boundaries }
}

/** A stored set, as an object or as JSON text, taken on no trust. A malformed record is dropped and the rest kept; anything but a set is null. */
export function parseWindowSet(value: unknown): WindowSet | null {
  let raw: unknown = value
  if (typeof value === "string") {
    try {
      raw = JSON.parse(value)
    } catch {
      return null
    }
  }
  if (!isObject(raw) || raw.kind !== WINDOW_SET_KIND || raw.version !== WINDOW_SET_VERSION || !Array.isArray(raw.windows)) return null
  const records: WindowRecord[] = []
  for (const entry of raw.windows) {
    const record = parseWindowRecord(entry)
    if (record) records.push(record)
  }
  return windowSetOf(records, readBoundaries(raw.boundaries))
}

/** The window that opens first and whose close ends the desk: the one marked main, else the first. */
export function mainWindow(set: WindowSet): WindowRecord | undefined {
  return set.windows.find((w) => w.main) ?? set.windows[0]
}

/** The set kept in a `preferences` envelope, or null when the slot is empty or holds something else. */
export function readWindowSet(prefs: Preferences, slot: string = WINDOW_SET_SLOT): WindowSet | null {
  return parseWindowSet(readSlot(prefs, slot))
}

/** The envelope with the set written to its slot. */
export function writeWindowSet(prefs: Preferences, set: WindowSet, slot: string = WINDOW_SET_SLOT): Preferences {
  return setSlot(prefs, slot, set, WINDOW_SET_VERSION)
}

/** The shell, behind four functions. Yours: a Tauri `WebviewWindow`, an Electron `BrowserWindow` through a preload bridge, anything that opens a window. */
export interface WindowAdapter {
  /** Open a window with this id at this url. Resolve when the window exists. */
  open(id: string, url: string, record: WindowRecord): void | Promise<void>
  close(id: string): void | Promise<void>
  /** Hear the shell close a window, by the person or by the system; returns what stops listening. */
  onClosed(cb: (id: string) => void): () => void
  /** Where a window is now, for a snapshot. Null or undefined leaves the record's own bounds in place. */
  bounds?(id: string): WindowBounds | null | undefined | Promise<WindowBounds | null | undefined>
}

export interface WindowSetOptions {
  /** The url a window opens at. Default `defaultWindowUrl`: the document's own path with `?window=<id>&layout=<layoutId>`. */
  url?: (record: WindowRecord) => string
  /** The boundaries a snapshot carries. */
  boundaries?: WindowSetBoundaries
}

export interface WindowSetController {
  /** Open every window of the set that is not open, the main one first. Resolves to the records it opened. */
  restore(set: WindowSet): Promise<WindowRecord[]>
  /** Open one window. False when it was open already. */
  open(record: WindowRecord): Promise<boolean>
  /** Close one window through the shell. False when it was not open. */
  close(id: string): Promise<boolean>
  closeAll(): Promise<void>
  /** The open windows, in the order they opened. */
  windows(): readonly WindowRecord[]
  isOpen(id: string): boolean
  /** The set as it stands: the open windows, each with the bounds the shell reports now. */
  snapshot(): Promise<WindowSet>
  /** Hear a window open or close. */
  subscribe(cb: () => void): () => void
  /** Stop listening to the shell. Closes nothing. */
  dispose(): void
}

/** `?window=<id>&layout=<layoutId>` on the document's own path, so every window loads the same app and reads the query to know which it is. */
export function defaultWindowUrl(record: WindowRecord): string {
  const path = typeof location === "object" && location !== null && typeof location.pathname === "string" ? location.pathname : ""
  return `${path}?window=${encodeURIComponent(record.id)}&layout=${encodeURIComponent(record.layoutId)}`
}

export function createWindowSet(adapter: WindowAdapter, options: WindowSetOptions = {}): WindowSetController {
  const url = options.url ?? defaultWindowUrl
  const boundaries = options.boundaries ?? WINDOW_SET_BOUNDARIES
  const open = new Map<string, WindowRecord>()
  const listeners = new Set<() => void>()
  const notify = () => {
    for (const cb of listeners) cb()
  }
  // The shell closed one: the person pressed its X, or the system took it. It leaves the set the same way.
  const stop = adapter.onClosed((id) => {
    if (open.delete(id)) notify()
  })
  const controller: WindowSetController = {
    async open(record) {
      if (open.has(record.id)) return false
      const copy: WindowRecord = { ...record }
      await adapter.open(copy.id, url(copy), copy)
      open.set(copy.id, copy)
      notify()
      return true
    },
    async restore(set) {
      const main = mainWindow(set)
      const order = main ? [main, ...set.windows.filter((w) => w !== main)] : [...set.windows]
      const opened: WindowRecord[] = []
      for (const record of order) if (await controller.open(record)) opened.push(record)
      return opened
    },
    async close(id) {
      if (!open.has(id)) return false
      await adapter.close(id)
      if (open.delete(id)) notify()
      return true
    },
    async closeAll() {
      for (const id of [...open.keys()]) await controller.close(id)
    },
    windows: () => [...open.values()],
    isOpen: (id) => open.has(id),
    async snapshot() {
      const records: WindowRecord[] = []
      for (const record of open.values()) {
        const box = adapter.bounds ? await adapter.bounds(record.id) : undefined
        records.push(box ? { ...record, bounds: box } : { ...record })
      }
      return windowSetOf(records, boundaries)
    },
    subscribe(cb) {
      listeners.add(cb)
      return () => {
        listeners.delete(cb)
      }
    },
    dispose() {
      stop()
      listeners.clear()
    },
  }
  return controller
}
