import { cn } from "cn"
import { createContext, Fragment, useCallback, useContext, useEffect, useInsertionEffect, useRef, useState, useSyncExternalStore, type ComponentProps, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type Ref } from "react"
import { flushSync } from "react-dom"
import { Command, CommandDialog, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { useDeclaredHotkeyIds, useMaybeHotkeys } from "@/registry/tradecn/hooks/use-hotkeys"
import { formatKeys, matchesKeys, scopeChain, type HotkeyEntry, type HotkeyRegistry, type Platform } from "@/registry/tradecn/lib/hotkeys"

// Search and selection stay shared; callers own the dialog, groups and result markup.

export interface PaletteAction {
  id: string
  title: string
  /** Optional secondary search text for the caller to display. */
  subtitle?: string
  /** A hotkey scope, `panel:book`. The action is offered only when the palette is opened from inside that scope. Omit for everywhere. */
  scope?: string
  /** The panel instance that owns a scoped action: a getter for an element that CONTAINS wherever focus rests in that panel, the HotkeyScope element itself — `useHotkeyScope()` hands it over. A root inside the scope misses clicks that focus the scope div. With several panels sharing one scope, the containing instance runs; registrations without it fall back to the latest. */
  within?: (() => Element | null) | null
  keywords?: readonly string[]
  /** The heading the row sits under. */
  group?: string
  /** A hotkey binding whose current keys are exposed on the row. */
  bindingId?: string
  run: () => void
  /** Runs on Shift+Enter. Compose a CommandPaletteSecondary to make it discoverable. */
  secondary?: { title: string; run: () => void }
}

export interface SymbolResult {
  symbol: string
  name?: string
  exchange?: string
  /** Asset class or instrument type, exposed as row.badge. */
  kind?: string
}

export interface SymbolSearchAdapter {
  /** Reject or resolve as you like once `signal` aborts; a stale answer is dropped either way. */
  search(query: string, signal: AbortSignal): Promise<readonly SymbolResult[]>
  /** Default 1. */
  minLength?: number
  /** Default 150. */
  debounceMs?: number
}

export type PaletteRecent = { kind: "action"; id: string; scope?: string } | { kind: "symbol"; symbol: SymbolResult }

export interface ActionRegistry {
  /** Returns the unregister, which removes one copy of each action this call added. Same-id registrations stack; rows show the instance that answers. */
  register(actions: PaletteAction | readonly PaletteAction[]): () => void
  /** Stable array reference until something changes. */
  list(): readonly PaletteAction[]
  /** Most recent first. Stable array reference until something changes. */
  recents(): readonly PaletteRecent[]
  /** Move to the front of the recents. The palette calls this after a row runs. */
  touch(recent: PaletteRecent): void
  /** From the consumer's persistence. Does not notify `onRecentsChange`. */
  loadRecents(recents: readonly PaletteRecent[]): void
  onRecentsChange(cb: (recents: readonly PaletteRecent[]) => void): () => void
  subscribe(cb: () => void): () => void
}

const recentKey = (r: PaletteRecent) => (r.kind === "action" ? `action:${JSON.stringify([r.scope || null, r.id])}` : `symbol:${JSON.stringify([r.symbol.symbol, r.symbol.exchange || null])}`)

// A count or a delay a caller passes: a finite number at or above zero, or the default.
const countOr = (value: number | undefined, fallback: number) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback)

// A recent read back from storage the app may not validate: an action with an id, or a symbol with its symbol, its
// words text where it has them. Anything else is skipped, so stored data can't take the palette down while it renders.
const isText = (value: unknown) => value === undefined || value === null || typeof value === "string"
function isRecent(value: unknown): value is PaletteRecent {
  if (typeof value !== "object" || value === null) return false
  const entry = value as { kind?: unknown; id?: unknown; scope?: unknown; symbol?: unknown }
  if (entry.kind === "action") return typeof entry.id === "string" && isText(entry.scope)
  if (entry.kind !== "symbol" || typeof entry.symbol !== "object" || entry.symbol === null) return false
  const symbol = entry.symbol as Record<string, unknown>
  return typeof symbol.symbol === "string" && isText(symbol.name) && isText(symbol.exchange) && isText(symbol.kind)
}

export function createActionRegistry(options: { maxRecents?: number } = {}): ActionRegistry {
  // Infinity keeps every recent; NaN or a negative count keeps the default.
  const maxRecents = typeof options.maxRecents === "number" && options.maxRecents >= 0 ? Math.floor(options.maxRecents) : 8
  const actions = new Map<string, PaletteAction[]>()
  const listeners = new Set<() => void>()
  const recentListeners = new Set<(recents: readonly PaletteRecent[]) => void>()
  let snapshot: readonly PaletteAction[] | null = null
  let recents: readonly PaletteRecent[] = []

  function emit() {
    snapshot = null
    for (const cb of listeners) cb()
  }

  return {
    register(input) {
      const added = Array.isArray(input) ? (input as readonly PaletteAction[]) : [input as PaletteAction]
      for (const action of added) actions.set(action.id, [...(actions.get(action.id) ?? []), action])
      emit()
      let undone = false
      return () => {
        // Only what this call registered, once: another instance's registration under the
        // same id stays, and a second call is a no-op.
        if (undone) return
        undone = true
        let changed = false
        for (const action of added) {
          const instances = actions.get(action.id)
          if (!instances) continue
          // One copy per call: a shared action object registered twice keeps its other copy.
          const at = instances.lastIndexOf(action)
          if (at < 0) continue
          const rest = [...instances.slice(0, at), ...instances.slice(at + 1)]
          if (rest.length) actions.set(action.id, rest)
          else actions.delete(action.id)
          changed = true
        }
        if (changed) emit()
      }
    },
    list: () => (snapshot ??= [...actions.values()].flat()),
    recents: () => recents,
    touch(recent) {
      const key = recentKey(recent)
      // Running a scoped action retires the scope-less entry old versions persisted
      // for the same id — but only while no live unscoped registration owns that id,
      // since a current global action's entry is not a leftover.
      const leftover = recent.kind === "action" && !!recent.scope && !(actions.get(recent.id) ?? []).some((a) => !a.scope)
      const stale = (r: PaletteRecent) => recentKey(r) === key || (leftover && r.kind === "action" && r.id === recent.id && !r.scope)
      recents = [recent, ...recents.filter((r) => !stale(r))].slice(0, maxRecents)
      for (const cb of listeners) cb()
      for (const cb of recentListeners) cb(recents)
    },
    loadRecents(next) {
      recents = (Array.isArray(next) ? next : []).filter(isRecent).slice(0, maxRecents)
      for (const cb of listeners) cb()
    },
    onRecentsChange(cb) {
      recentListeners.add(cb)
      return () => recentListeners.delete(cb)
    },
    subscribe(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
  }
}

/**
 * How well an action answers a query, or -1 when it does not. Every word of the query must land
 * somewhere; a word that starts the title beats one inside it, which beats a keyword, which beats
 * letters in order.
 */
export function scorePaletteAction(action: PaletteAction, query: string): number {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return 0
  const title = action.title.toLowerCase()
  const rest = [action.subtitle, action.group, action.id, ...(action.keywords ?? [])].filter(Boolean).join(" ").toLowerCase()
  let total = 0
  for (const word of words) {
    let score = -1
    if (title === word) score = 100
    else if (title.startsWith(word)) score = 80
    else if (title.includes(` ${word}`)) score = 60
    else if (title.includes(word)) score = 40
    else if (rest.startsWith(word) || rest.includes(` ${word}`)) score = 30
    else if (rest.includes(word)) score = 20
    else if (isSubsequence(word, title)) score = 10
    if (score < 0) return -1
    total += score
  }
  return total
}

function isSubsequence(needle: string, haystack: string): boolean {
  let at = 0
  for (const ch of needle) {
    at = haystack.indexOf(ch, at)
    if (at < 0) return false
    at++
  }
  return true
}

export interface CommandPaletteLabels {
  /** The dialog's accessible name, and the go-bar's. */
  title: string
  description: string
  placeholder: string
  recent: string
  actions: string
  commands: string
  symbols: string
  /** The description of the binding the palette declares for itself. */
  hotkey: string
}

const PALETTE_LABELS: CommandPaletteLabels = {
  title: "Command palette",
  description: "Search for a command or a symbol",
  placeholder: "Type a command or a symbol…",
  recent: "Recent",
  actions: "Actions",
  commands: "Commands",
  symbols: "Symbols",
  hotkey: "Open the command palette",
}

const GO_BAR_LABELS: CommandPaletteLabels = { ...PALETTE_LABELS, title: "Command line", placeholder: "Symbol, function, or command", hotkey: "Focus the command line" }

export interface CommandPaletteProps {
  actions: ActionRegistry
  /** Dialog keyboard behavior or inline input/dropdown behavior. Compose the corresponding parts. */
  variant?: "palette" | "go-bar"
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  symbols?: SymbolSearchAdapter
  onSymbolSelect?: (symbol: SymbolResult) => void
  /** Shift+Enter on a symbol row, after `onSymbolSelect`'s usual work is yours to repeat or skip. */
  symbolSecondary?: { title: string; run: (symbol: SymbolResult) => void }
  /** Rows for what has been typed, `AAPL GP`. The first row is what Enter runs. */
  goBarGrammar?: (input: string) => readonly PaletteAction[]
  /** Defaults to the registry from `HotkeysProvider`, when there is one. `null` opts out. */
  hotkeys?: HotkeyRegistry | null
  /** Keys for the binding the palette declares for itself: `palette.open` (default `mod+k`) or `go-bar.focus` (default `/`). `false` declares nothing. */
  hotkey?: string | false
  labels?: Partial<CommandPaletteLabels>
  /** Compose a dialog or an inline content area. */
  children: ReactNode
}

export interface PaletteRow {
  key: string
  title: string
  subtitle?: string
  badge?: string
  keys?: string
  run: () => void
  secondary?: { title: string; run: () => void }
  recent: PaletteRecent | null
}

export interface PaletteGroup {
  id: string
  heading: string
  rows: readonly PaletteRow[]
}

type MutablePaletteGroup = PaletteGroup & { rows: PaletteRow[] }

const NO_SYMBOLS: readonly SymbolResult[] = []
const NO_ENTRIES: readonly HotkeyEntry[] = []
const AMBIENT_SCOPES = "editing global"
const SLOT = "tradecn-command-palette"

// Where focus last was outside any palette, as a scope chain. It decides which scoped actions are
// on offer, and it has to be read before the palette takes focus for itself.
let focusScopes = AMBIENT_SCOPES
// The focused element itself, for telling apart panel instances that share a scope name.
// Read when a row runs, never subscribed to.
let focusElement: Element | null = null
const focusListeners = new Set<() => void>()

function onFocusIn(event: globalThis.FocusEvent) {
  const target = event.target as Element | null
  if (target && typeof target.closest === "function" && target.closest(`[data-slot="${SLOT}"]`)) return
  focusElement = target
  const next = scopeChain(target).join(" ")
  if (next === focusScopes) return
  focusScopes = next
  for (const cb of focusListeners) cb()
}

function subscribeFocusScopes(cb: () => void) {
  if (!focusListeners.size) {
    // Nobody was listening, so whatever was remembered is stale. Start from where focus is now.
    const focused = document.activeElement
    const outside = focused?.closest(`[data-slot="${SLOT}"]`) ? null : focused
    focusElement = outside
    focusScopes = outside ? scopeChain(outside).join(" ") : AMBIENT_SCOPES
    document.addEventListener("focusin", onFocusIn)
  }
  focusListeners.add(cb)
  return () => {
    focusListeners.delete(cb)
    if (!focusListeners.size) document.removeEventListener("focusin", onFocusIn)
  }
}

const getFocusElement = () => focusElement
// The keys that move through the rows, handed to the list when they come from a popout window.
const ROW_KEYS: ReadonlySet<string> = new Set(["ArrowUp", "ArrowDown", "Home", "End"])

const getFocusScopes = () => focusScopes
const getServerFocusScopes = () => AMBIENT_SCOPES
const subscribeNothing = () => () => {}
const getNoEntries = () => NO_ENTRIES

function useSymbolSearch(adapter: SymbolSearchAdapter | undefined, query: string, enabled: boolean) {
  const [found, setFound] = useState<{ adapter?: SymbolSearchAdapter; query: string; results: readonly SymbolResult[]; signal?: AbortSignal }>({ query: "", results: NO_SYMBOLS })
  const active = enabled && adapter !== undefined && query.length >= countOr(adapter.minLength, 1)
  useEffect(() => {
    if (!adapter || !active) return
    const controller = new AbortController()
    const settle = (results: readonly SymbolResult[]) => {
      if (!controller.signal.aborted) setFound({ adapter, query, results, signal: controller.signal })
    }
    const timer = setTimeout(() => {
      Promise.resolve().then(() => {
        if (!controller.signal.aborted) return adapter.search(query, controller.signal)
        return NO_SYMBOLS
      }).then(settle, () => settle(NO_SYMBOLS))
    }, Math.min(countOr(adapter.debounceMs, 150), 2_147_483_647))
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [adapter, active, query])
  // Only answers to the query on screen. Enter on a row left over from three letters ago is how the wrong symbol gets loaded.
  const current = active && found.adapter === adapter && found.query === query && !found.signal?.aborted
  return { results: current ? found.results : NO_SYMBOLS, loading: active && !current }
}

interface PaletteRootState {
  options: CommandPaletteProps
  labels: CommandPaletteLabels
  hotkeys: HotkeyRegistry | null
  ownBindingId: string | null
  scopes: string
  capturedEl: Element | null
  open: boolean
  setOpen: (open: boolean) => void
  inputRef: { current: HTMLInputElement | null }
}

const RootContext = createContext<PaletteRootState | null>(null)

function usePaletteRoot() {
  const root = useContext(RootContext)
  if (!root) throw new Error("CommandPalette parts require CommandPalette")
  return root
}

export interface CommandPaletteState {
  groups: readonly PaletteGroup[]
  input: string
  setInput: (input: string) => void
  loading: boolean
  open: boolean
  setOpen: (open: boolean) => void
  platform?: Platform
  /** Select a currently offered row. Secondary falls back to primary when absent. */
  select: (row: PaletteRow, secondary?: boolean) => void
}

const ContentContext = createContext<CommandPaletteState | null>(null)
const ItemContext = createContext<{ row: PaletteRow; disabled: boolean } | null>(null)

/** Read the nearest content's search state without creating subscriptions or requests. */
export function useCommandPalette(): CommandPaletteState {
  const state = useContext(ContentContext)
  if (!state) throw new Error("useCommandPalette requires CommandPaletteContent")
  return state
}

function assignPaletteRef<T>(ref: Ref<T> | undefined, node: T | null) {
  if (typeof ref === "function") return ref(node)
  if (ref) ref.current = node
}

// Attach both refs to the actual node, including replacements made by the consumer's primitive.
function usePaletteRef<T>(localRef: { current: T | null }, forwardedRef: Ref<T> | undefined) {
  return useCallback((node: T | null) => {
    localRef.current = node
    const cleanup = assignPaletteRef(forwardedRef, node)
    return () => {
      localRef.current = null
      if (typeof cleanup === "function") cleanup()
      else assignPaletteRef(forwardedRef, null)
    }
  }, [localRef, forwardedRef])
}

export type CommandPaletteContentProps = Omit<ComponentProps<typeof Command>, "children" | "shouldFilter"> & { children: ReactNode }

export function CommandPaletteContent({ children, ref, className, onKeyDown: onKeyDownProp, onBlur, ...props }: CommandPaletteContentProps) {
  const { options, labels, hotkeys, ownBindingId, scopes, capturedEl, open, setOpen, inputRef } = usePaletteRoot()
  const { actions, symbols, onSymbolSelect, symbolSecondary, goBarGrammar, variant = "palette" } = options
  const root = useRef<HTMLDivElement>(null)
  const contentRef = usePaletteRef(root, ref)
  const onDone = () => {
    setOpen(false)
    if (variant === "go-bar") inputRef.current?.blur()
  }
  const [input, setInput] = useState("")
  const query = input.trim()
  const list = useSyncExternalStore(actions.subscribe, actions.list, actions.list)
  const recents = useSyncExternalStore(actions.subscribe, actions.recents, actions.recents)
  const entries = useSyncExternalStore(hotkeys?.subscribe ?? subscribeNothing, hotkeys?.list ?? getNoEntries, hotkeys?.list ?? getNoEntries)
  const search = useSymbolSearch(symbols, query, open)

  // Radix focuses the dialog in the commit that mounts it; Base UI does it a few milliseconds later.
  // Keys pressed in that gap land on the body, where a single-key hotkey would take them. Someone who
  // pressed mod+k is already working the palette, so until focus arrives its keys are the palette's:
  // text goes into the query, Enter runs the highlighted row, Escape closes, and nothing reaches the dispatcher.
  const early = useRef<{ enter: (shift: boolean) => void; escape: () => void }>({ enter: () => {}, escape: () => {} })
  useEffect(() => {
    if (variant !== "palette" || !open) return
    const inside = (node: EventTarget | null) => Boolean(node instanceof Node && root.current?.contains(node))
    if (inside(document.activeElement)) return
    const onFocus = (event: globalThis.FocusEvent) => {
      if (inside(event.target)) stop()
    }
    const onKey = (event: KeyboardEvent) => {
      if (inside(event.target)) return stop()
      if (event.isComposing) return
      event.stopPropagation()
      if (event.key === "Enter") early.current.enter(event.shiftKey)
      else if (event.key === "Escape") early.current.escape()
      else if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return
      else setInput((typed) => typed + event.key)
      event.preventDefault()
    }
    const timer = setTimeout(() => stop(), 1000)
    function stop() {
      clearTimeout(timer)
      document.removeEventListener("keydown", onKey, true)
      document.removeEventListener("focusin", onFocus, true)
    }
    document.addEventListener("keydown", onKey, true)
    document.addEventListener("focusin", onFocus, true)
    return stop
  }, [variant, open])

  // A key from a popout window opens the palette in the window that renders it, and the keyboard stays in the popout,
  // where this document's focus never reaches. While the palette is open, that window's keys are the palette's, as
  // they are here before focus arrives: text goes into the query, Enter runs the highlighted row and Escape closes
  // under any modifiers, the arrow, Home, and End keys move through the rows, and every other key stops here, so
  // none reaches the window's own bindings. Other keys with a modifier stay the window's, so the shortcut that opened
  // the palette closes it. A press in the popout closes the palette, since the person has gone back to that window.
  useEffect(() => {
    const away = variant === "palette" && open ? capturedEl?.ownerDocument : undefined
    if (!away || away === document) return
    const onKey = (event: KeyboardEvent) => {
      if (event.isComposing) return
      const modified = event.ctrlKey || event.metaKey || event.altKey
      if (modified && event.key !== "Enter" && event.key !== "Escape") return
      event.stopPropagation()
      event.preventDefault()
      const field = inputRef.current
      if (event.key === "Enter") early.current.enter(event.shiftKey)
      else if (event.key === "Escape") early.current.escape()
      else if (ROW_KEYS.has(event.key)) field?.dispatchEvent(new (field.ownerDocument.defaultView ?? window).KeyboardEvent("keydown", { key: event.key, bubbles: true, cancelable: true }))
      else if (event.key === "Backspace") setInput((typed) => typed.slice(0, -1))
      else if (event.key.length === 1) setInput((typed) => typed + event.key)
    }
    const onPress = () => early.current.escape()
    away.addEventListener("keydown", onKey, true)
    away.addEventListener("pointerdown", onPress, true)
    return () => {
      away.removeEventListener("keydown", onKey, true)
      away.removeEventListener("pointerdown", onPress, true)
    }
  }, [variant, open, capturedEl, inputRef])

  const active = new Set(scopes.split(" "))
  const keysOf = new Map(entries.map((e) => [e.id, e.keys]))
  const scopeLabel = (scope: string) => scope.replace(/^panel:/, "")

  // With several panel instances sharing a scope, the one whose within() contains the
  // element focus froze on at opening answers — the fence rule, applied to actions. A
  // fenced registration never answers outside its element; registrations without within
  // fall back latest-first. The whole row is built from the resolved instance, so its
  // label, keys, and secondary never belong to another panel.
  // An empty scope string means unscoped wherever scopes are compared or keyed.
  const scopeOf = (a: { scope?: string }) => a.scope || undefined
  const instanceOf = (action: PaletteAction): PaletteAction | null => {
    const instances = list.filter((a) => a.id === action.id && scopeOf(a) === scopeOf(action))
    if (capturedEl?.isConnected) for (let i = instances.length - 1; i >= 0; i--) {
      const root = instances[i]!.within?.()
      if (root?.contains(capturedEl)) return instances[i]!
    }
    for (let i = instances.length - 1; i >= 0; i--) if (!instances[i]!.within) return instances[i]!
    return null
  }
  const actionRow = (action: PaletteAction, prefix: string, recent: PaletteRecent | null): PaletteRow => ({
    // A scoped key is a JSON tuple behind its own marker, so no unscoped id can spell it.
    key: action.scope ? `${prefix}!${JSON.stringify([action.scope, action.id])}` : `${prefix}:${action.id}`,
    title: action.title,
    subtitle: action.subtitle,
    badge: action.scope ? scopeLabel(action.scope) : undefined,
    keys: (action.bindingId && keysOf.get(action.bindingId)) || undefined,
    run: action.run,
    secondary: action.secondary,
    recent,
  })
  const symbolRow = (symbol: SymbolResult, prefix: string): PaletteRow => ({
    // The same marked JSON spelling as scoped action rows: colons in a symbol or an
    // empty exchange cannot collide two instruments onto one key.
    key: `${prefix}!${JSON.stringify([symbol.symbol, symbol.exchange || null])}`,
    title: symbol.symbol,
    subtitle: [symbol.name, symbol.exchange].filter(Boolean).join(" · ") || undefined,
    badge: symbol.kind,
    run: () => onSymbolSelect?.(symbol),
    secondary: symbolSecondary && { title: symbolSecondary.title, run: () => symbolSecondary.run(symbol) },
    recent: { kind: "symbol", symbol },
  })

  // One row per action id and scope: the instance that answers, resolved once against
  // the frozen capture. An action fenced to panels that never contained it stays off.
  const seen = new Set<string>()
  const offered: PaletteAction[] = []
  for (const a of list) {
    if (a.scope && !active.has(a.scope)) continue
    const key = JSON.stringify([scopeOf(a) ?? null, a.id])
    if (seen.has(key)) continue
    seen.add(key)
    const resolved = instanceOf(a)
    if (resolved) offered.push(resolved)
  }
  const sections: MutablePaletteGroup[] = []
  if (!query) {
    const rows: PaletteRow[] = []
    const emittedRecents = new Set<string>()
    for (const recent of recents) {
      if (recent.kind === "symbol") {
        const row = symbolRow(recent.symbol, "recent-symbol")
        if (!emittedRecents.has(row.key)) {
          emittedRecents.add(row.key)
          rows.push(row)
        }
      }
      else {
        const action = offered.find((a) => a.id === recent.id && scopeOf(a) === scopeOf(recent)) ?? (scopeOf(recent) === undefined && !list.some((a) => a.id === recent.id && !a.scope) ? offered.find((a) => a.id === recent.id) : undefined)
        if (action) {
          // The row's identity is the resolved action's, so running a v1 scope-less
          // entry saves the scope it ran in and retires the old spelling.
          const row = actionRow(action, "recent", { kind: "action", id: action.id, scope: scopeOf(action) })
          if (!emittedRecents.has(row.key)) {
            emittedRecents.add(row.key)
            rows.push(row)
          }
        }
      }
    }
    if (rows.length) sections.push({ id: "recent", heading: labels.recent, rows })
    for (const action of offered) pushRow(sections, action.group ?? labels.actions, actionRow(action, "action", { kind: "action", id: action.id, scope: scopeOf(action) }))
  } else {
    const commands = goBarGrammar?.(query) ?? []
    if (commands.length) sections.push({ id: "commands", heading: labels.commands, rows: commands.map((c) => actionRow(c, "command", null)) })
    const scored = offered.map((action) => ({ action, score: scorePaletteAction(action, query) })).filter((s) => s.score >= 0)
    scored.sort((a, b) => b.score - a.score)
    for (const { action } of scored) pushRow(sections, action.group ?? labels.actions, actionRow(action, "action", { kind: "action", id: action.id, scope: scopeOf(action) }))
    if (search.results.length) sections.push({ id: "symbols", heading: labels.symbols, rows: search.results.map((s) => symbolRow(s, "symbol")) })
  }
  const rowsByKey = new Map(sections.flatMap((s) => s.rows).map((r) => [r.key, r]))

  const select = (requested: PaletteRow, secondary = false) => {
    const row = rowsByKey.get(requested.key)
    if (!row || !open) return
    const run = secondary && row.secondary ? row.secondary.run : row.run
    setInput("")
    onDone()
    if (row.recent) actions.touch(row.recent)
    run()
  }

  const secondaryDisabled = (item: Element | null | undefined) => Boolean(item?.querySelector("[data-secondary]:disabled"))

  // Swapped before any layout effect runs, as the shortcut's handler is.
  useInsertionEffect(() => {
    early.current = {
      enter(shift) {
        const selected = root.current?.querySelector('[cmdk-item][aria-selected="true"]:not([aria-disabled="true"])')
        const row = rowsByKey.get(selected?.getAttribute("data-row") ?? "")
        if (row && !(shift && row.secondary && secondaryDisabled(selected))) select(row, shift)
      },
      escape: onDone,
    }
  })

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    onKeyDownProp?.(event)
    if (event.defaultPrevented || event.nativeEvent.isComposing) return
    if (event.key === "Enter" && event.shiftKey) {
      const selected = event.currentTarget.querySelector('[cmdk-item][aria-selected="true"]:not([aria-disabled="true"])')
      const row = rowsByKey.get(selected?.getAttribute("data-row") ?? "")
      if (!row?.secondary) return
      event.preventDefault()
      if (!secondaryDisabled(selected)) select(row, true)
    } else if (variant === "go-bar" && event.key === "Escape") {
      event.preventDefault()
      setInput("")
      onDone()
    } else if (variant === "palette" && ownBindingId) {
      // The dispatcher stops at the dialog, so the key that opened the palette closes it from here.
      const own = keysOf.get(ownBindingId)
      if (!own || !matchesKeys(event.nativeEvent, own, hotkeys?.platform)) return
      event.preventDefault()
      onDone()
    }
  }

  return (
    <ContentContext value={{ groups: sections, input, setInput, loading: search.loading, open, setOpen, platform: hotkeys?.platform, select }}>
      <Command
        ref={contentRef}
        loop
        label={labels.title}
        {...props}
        data-slot="tradecn-command-palette"
        data-variant={variant}
        shouldFilter={false}
        className={cn("lining-nums tabular-nums", variant === "go-bar" && "relative h-auto overflow-visible bg-transparent p-0", className)}
        onKeyDown={onKeyDown}
        onBlur={(event) => {
          onBlur?.(event)
          if (!event.defaultPrevented && variant === "go-bar" && !event.currentTarget.contains(event.relatedTarget)) setOpen(false)
        }}
      >
        <div
          className="contents"
          onKeyDown={(event) => {
            // cmdk handles Enter and navigation at its root. Application controls keep their own keys.
            if (event.target === inputRef.current) return
            const own = ownBindingId && keysOf.get(ownBindingId)
            if (own && matchesKeys(event.nativeEvent, own, hotkeys?.platform)) return
            if (["Enter", "ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) || (event.ctrlKey && ["n", "j", "p", "k"].includes(event.key))) event.stopPropagation()
          }}
        >
          {children}
        </div>
      </Command>
    </ContentContext>
  )
}

function pushRow(groups: MutablePaletteGroup[], heading: string, row: PaletteRow) {
  const id = `actions:${heading}`
  const group = groups.find((group) => group.id === id)
  if (group) group.rows.push(row)
  else groups.push({ id, heading, rows: [row] })
}

export function CommandPalette(options: CommandPaletteProps) {
  const { actions, children, variant = "palette", open: openProp, defaultOpen = false, onOpenChange, hotkeys: hotkeysProp, hotkey, labels: labelsProp } = options
  if (!actions) throw new Error("CommandPalette requires actions")
  const fromContext = useMaybeHotkeys()
  const hotkeys = hotkeysProp === undefined ? fromContext : hotkeysProp
  const labels = { ...(variant === "palette" ? PALETTE_LABELS : GO_BAR_LABELS), ...labelsProp }
  const [uncontrolled, setUncontrolled] = useState(defaultOpen)
  const open = openProp ?? uncontrolled
  const inputRef = useRef<HTMLInputElement>(null)

  // Freeze where focus was at the moment of opening: a render later the palette itself has it.
  // The element itself freezes too, so a detour over the dialog's close button cannot change
  // which panel instance answers. A palette mounted already open reads the live document,
  // since the shared trackers only learn about focus once something subscribes.
  const liveScopes = useSyncExternalStore(subscribeFocusScopes, getFocusScopes, getServerFocusScopes)
  // The element a key opened the palette from. The shared tracker hears focus in this document only, and the key can
  // come from a popout window whose panel is the one that should answer.
  const [keyedFrom, setKeyedFrom] = useState<Element | null>(null)
  const [wasOpen, setWasOpen] = useState(open)
  const [frozen, setFrozen] = useState<{ scopes: string; el: Element | null }>(() => {
    if (!open || typeof document === "undefined") return { scopes: liveScopes, el: null }
    const focused = document.activeElement
    const outside = focused?.closest(`[data-slot="${SLOT}"]`) ? null : focused
    return { scopes: outside ? scopeChain(outside).join(" ") : AMBIENT_SCOPES, el: outside }
  })
  if (open !== wasOpen) {
    setWasOpen(open)
    const from = keyedFrom?.isConnected && !keyedFrom.closest(`[data-slot="${SLOT}"]`) ? keyedFrom : null
    if (open) setFrozen(from ? { scopes: scopeChain(from).join(" "), el: from } : { scopes: liveScopes, el: getFocusElement() })
    if (keyedFrom) setKeyedFrom(null)
  } else if (keyedFrom && !open) {
    // An open a controlled parent refused: the key's element must not stand in for a later click's.
    setKeyedFrom(null)
  }
  const scopes = frozen.scopes
  const capturedEl = frozen.el

  const setOpen = (next: boolean) => {
    if (openProp === undefined) setUncontrolled(next)
    onOpenChange?.(next)
  }

  const bindingId = variant === "palette" ? "palette.open" : "go-bar.focus"
  const keys = hotkey === false ? null : (hotkey ?? (variant === "palette" ? "mod+k" : "/"))
  const description = labels.hotkey
  const group = labels.title
  const onHotkey = useRef<(event: KeyboardEvent) => void>(() => {})
  // Swapped before any layout effect runs, as useHotkey's handler is: a key between a commit and its passive effects
  // reaches what that commit rendered.
  useInsertionEffect(() => {
    onHotkey.current = (event) => {
      if (variant !== "palette") return void inputRef.current?.focus()
      // Only a key from another document, a popout's, names its element: here the focus tracker already knows
      // where focus was, and keeps the last panel's offer when focus fell to the body.
      const target = event.target as Element | null
      if (!open && target && target.nodeType === 1 && target.ownerDocument !== document) {
        // React hears a key from another window as no event of its own, so it would render the opening a task later,
        // and the popout's next key could reach that window's bindings first. The opening renders now, and the
        // capture listens there before this handler returns.
        flushSync(() => {
          setKeyedFrom(target)
          setOpen(true)
        })
        return
      }
      setOpen(!open)
    }
  })
  // Keyed to the registry this palette actually uses: an explicit `hotkeys` registry ignores a
  // provider's declarations for its own, different registry.
  const declaredByProvider = useDeclaredHotkeyIds(hotkeys)
  useEffect(() => {
    if (!hotkeys || keys === null) return
    // A consumer that declared this id already owns its keys and its wording, whether it declared
    // on the registry before render or through the provider's bindings, whose effect runs after
    // this one and must not be mistaken for ours.
    const scope = variant === "palette" ? ("editing" as const) : ("global" as const)
    const declared = declaredByProvider.has(bindingId) || hotkeys.list().some((entry) => entry.id === bindingId)
    if (!declared) hotkeys.register({ id: bindingId, keys, scope, description, group })
    const unbind = hotkeys.bind(bindingId, (event) => onHotkey.current(event))
    return () => {
      unbind()
      if (declared) return
      // Ownership is the exact declaration this effect made: this spelling, wording, scope, and
      // group, with no behavior fields. A replacement differing anywhere is the consumer's to
      // keep, even one a subscriber registered during the register call above. A field-identical
      // redeclaration stays indistinguishable without a registration handle; it is the one shape
      // this cannot tell apart.
      const current = hotkeys.list().find((entry) => entry.id === bindingId)
      if (current && current.declaredKeys === keys && current.description === description && current.scope === scope && current.group === group && current.when === undefined && current.repeat === undefined && current.preventDefault === undefined) hotkeys.unregister(bindingId)
    }
  }, [hotkeys, keys, bindingId, variant, description, group, declaredByProvider])

  return <RootContext value={{ options, labels, hotkeys, ownBindingId: keys === null ? null : bindingId, scopes, capturedEl, open, setOpen, inputRef }}>{children}</RootContext>
}

export type CommandPaletteDialogProps = Omit<ComponentProps<typeof CommandDialog>, "open" | "defaultOpen" | "onOpenChange" | "children"> & { children: ReactNode }

export function CommandPaletteDialog({ children, ...props }: CommandPaletteDialogProps) {
  const { open, setOpen, labels } = usePaletteRoot()
  return <CommandDialog title={labels.title} description={labels.description} {...props} open={open} onOpenChange={setOpen}>{children}</CommandDialog>
}

export type CommandPaletteInputProps = Omit<ComponentProps<typeof CommandInput>, "value" | "defaultValue" | "onValueChange" | "onChange">

export function CommandPaletteInput({ ref, onFocus, ...props }: CommandPaletteInputProps) {
  const { input, setInput } = useCommandPalette()
  const { labels, options, setOpen, inputRef } = usePaletteRoot()
  const fieldRef = usePaletteRef(inputRef, ref)
  return (
    <CommandInput
      placeholder={labels.placeholder}
      {...props}
      ref={fieldRef}
      value={input}
      onValueChange={setInput}
      onFocus={(event) => {
        onFocus?.(event)
        if (!event.defaultPrevented && options.variant === "go-bar") setOpen(true)
      }}
    />
  )
}

export function CommandPaletteList({ className, onMouseDown, ...props }: ComponentProps<typeof CommandList>) {
  const { options, open } = usePaletteRoot()
  const inline = options.variant === "go-bar"
  if (inline && !open) return null
  return (
    <CommandList
      {...props}
      className={cn(inline && "absolute top-full right-0 left-0 z-50 mt-1 rounded-md border border-border bg-popover text-popover-foreground shadow-md", className)}
      onMouseDown={(event) => {
        onMouseDown?.(event)
        if (inline) event.preventDefault()
      }}
    />
  )
}

export function CommandPaletteEmpty(props: Omit<ComponentProps<typeof CommandEmpty>, "children"> & { children: ReactNode }) {
  return <CommandEmpty {...props} />
}

/** Optional group iterator. Use useCommandPalette for a different collection order or structure. */
export function CommandPaletteResults({ children }: { children: (group: PaletteGroup) => ReactNode }) {
  const { groups } = useCommandPalette()
  return groups.map((group) => <Fragment key={group.id}>{children(group)}</Fragment>)
}

export type CommandPaletteItemProps = Omit<ComponentProps<typeof CommandItem>, "value" | "onSelect" | "onClick" | "onPointerMove" | "children"> & { row: PaletteRow; children: ReactNode }

export function CommandPaletteItem({ row, children, disabled, ...props }: CommandPaletteItemProps) {
  const { select } = useCommandPalette()
  return (
    <ItemContext value={{ row, disabled: Boolean(disabled) }}>
      <CommandItem {...props} disabled={disabled} value={row.key} data-row={row.key} onSelect={() => { if (!disabled) select(row) }}>{children}</CommandItem>
    </ItemContext>
  )
}

export function CommandPaletteSecondary({ children, className, onClick, onMouseDown, ...props }: Omit<ComponentProps<"button">, "children"> & { children: ReactNode }) {
  const item = useContext(ItemContext)
  const { select } = useCommandPalette()
  if (!item) throw new Error("CommandPaletteSecondary requires CommandPaletteItem")
  const { row, disabled } = item
  if (!row.secondary) return null
  return (
    <button
      type="button"
      tabIndex={-1}
      className={cn("hidden items-center gap-1 in-data-[selected=true]:inline-flex disabled:opacity-50", className)}
      {...props}
      onMouseDown={(event) => {
        onMouseDown?.(event)
        event.preventDefault()
      }}
      data-secondary=""
      disabled={disabled || props.disabled}
      onClick={(event) => {
        event.stopPropagation()
        onClick?.(event)
        if (!event.defaultPrevented && !disabled) select(row, true)
      }}
    >
      {children}
    </button>
  )
}

export function CommandPaletteKeys({ keys, platform: platformProp, className, ...props }: Omit<ComponentProps<"span">, "children"> & { keys: string; platform?: Platform }) {
  const root = useContext(RootContext)
  return (
    <span {...props} className={cn("inline-flex items-center gap-1", className)}>
      {formatKeys(keys, platformProp ?? root?.hotkeys?.platform).map((caps, i) => (
        <KbdGroup key={i}>{caps.map((cap) => <Kbd key={cap} className="text-xs">{cap}</Kbd>)}</KbdGroup>
      ))}
    </span>
  )
}
