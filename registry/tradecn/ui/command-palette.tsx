import { cn } from "cn"
import { createContext, Fragment, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type ComponentProps, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type Ref } from "react"
import { Command, CommandDialog, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { useMaybeHotkeys } from "@/registry/tradecn/hooks/use-hotkeys"
import { formatKeys, matchesKeys, scopeChain, type HotkeyEntry, type HotkeyRegistry, type Platform } from "@/registry/tradecn/lib/hotkeys"

// Search and selection stay shared; callers own the dialog, groups and result markup.

export interface PaletteAction {
  id: string
  title: string
  /** Optional secondary search text for the caller to display. */
  subtitle?: string
  /** A hotkey scope, `panel:book`. The action is offered only when the palette is opened from inside that scope. Omit for everywhere. */
  scope?: string
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

export type PaletteRecent = { kind: "action"; id: string } | { kind: "symbol"; symbol: SymbolResult }

export interface ActionRegistry {
  /** Returns the unregister. An action with an id already present replaces it. */
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

const recentKey = (r: PaletteRecent) => (r.kind === "action" ? `action:${r.id}` : `symbol:${r.symbol.symbol}:${r.symbol.exchange ?? ""}`)

export function createActionRegistry(options: { maxRecents?: number } = {}): ActionRegistry {
  const maxRecents = options.maxRecents ?? 8
  const actions = new Map<string, PaletteAction>()
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
      for (const action of added) actions.set(action.id, action)
      emit()
      return () => {
        // Only what this call registered: a later registration under the same id is someone else's.
        let changed = false
        for (const action of added) if (actions.get(action.id) === action) changed = actions.delete(action.id) || changed
        if (changed) emit()
      }
    },
    list: () => (snapshot ??= [...actions.values()]),
    recents: () => recents,
    touch(recent) {
      const key = recentKey(recent)
      recents = [recent, ...recents.filter((r) => recentKey(r) !== key)].slice(0, maxRecents)
      for (const cb of listeners) cb()
      for (const cb of recentListeners) cb(recents)
    },
    loadRecents(next) {
      recents = next.slice(0, maxRecents)
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
  rows: PaletteRow[]
}

const NO_SYMBOLS: readonly SymbolResult[] = []
const NO_ENTRIES: readonly HotkeyEntry[] = []
const AMBIENT_SCOPES = "editing global"
const SLOT = "tradecn-command-palette"

// Where focus last was outside any palette, as a scope chain. It decides which scoped actions are
// on offer, and it has to be read before the palette takes focus for itself.
let focusScopes = AMBIENT_SCOPES
const focusListeners = new Set<() => void>()

function onFocusIn(event: globalThis.FocusEvent) {
  const target = event.target as Element | null
  if (target && typeof target.closest === "function" && target.closest(`[data-slot="${SLOT}"]`)) return
  const next = scopeChain(target).join(" ")
  if (next === focusScopes) return
  focusScopes = next
  for (const cb of focusListeners) cb()
}

function subscribeFocusScopes(cb: () => void) {
  if (!focusListeners.size) {
    // Nobody was listening, so whatever was remembered is stale. Start from where focus is now.
    const focused = document.activeElement
    focusScopes = focused?.closest(`[data-slot="${SLOT}"]`) ? AMBIENT_SCOPES : scopeChain(focused).join(" ")
    document.addEventListener("focusin", onFocusIn)
  }
  focusListeners.add(cb)
  return () => {
    focusListeners.delete(cb)
    if (!focusListeners.size) document.removeEventListener("focusin", onFocusIn)
  }
}

const getFocusScopes = () => focusScopes
const getServerFocusScopes = () => AMBIENT_SCOPES
const subscribeNothing = () => () => {}
const getNoEntries = () => NO_ENTRIES

function useSymbolSearch(adapter: SymbolSearchAdapter | undefined, query: string, enabled: boolean) {
  const [found, setFound] = useState<{ adapter?: SymbolSearchAdapter; query: string; results: readonly SymbolResult[]; signal?: AbortSignal }>({ query: "", results: NO_SYMBOLS })
  const active = enabled && adapter !== undefined && query.length >= (adapter.minLength ?? 1)
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
    }, adapter.debounceMs ?? 150)
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
  const { options, labels, hotkeys, ownBindingId, scopes, open, setOpen, inputRef } = usePaletteRoot()
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

  const active = new Set(scopes.split(" "))
  const keysOf = new Map(entries.map((e) => [e.id, e.keys]))
  const scopeLabel = (scope: string) => scope.replace(/^panel:/, "")

  const actionRow = (action: PaletteAction, prefix: string, recent: PaletteRecent | null): PaletteRow => ({
    key: `${prefix}:${action.id}`,
    title: action.title,
    subtitle: action.subtitle,
    badge: action.scope ? scopeLabel(action.scope) : undefined,
    keys: (action.bindingId && keysOf.get(action.bindingId)) || undefined,
    run: action.run,
    secondary: action.secondary,
    recent,
  })
  const symbolRow = (symbol: SymbolResult, prefix: string): PaletteRow => ({
    key: `${prefix}:${symbol.symbol}:${symbol.exchange ?? ""}`,
    title: symbol.symbol,
    subtitle: [symbol.name, symbol.exchange].filter(Boolean).join(" · ") || undefined,
    badge: symbol.kind,
    run: () => onSymbolSelect?.(symbol),
    secondary: symbolSecondary && { title: symbolSecondary.title, run: () => symbolSecondary.run(symbol) },
    recent: { kind: "symbol", symbol },
  })

  const offered = list.filter((a) => !a.scope || active.has(a.scope))
  const sections: PaletteGroup[] = []
  if (!query) {
    const rows: PaletteRow[] = []
    for (const recent of recents) {
      if (recent.kind === "symbol") rows.push(symbolRow(recent.symbol, "recent-symbol"))
      else {
        const action = offered.find((a) => a.id === recent.id)
        if (action) rows.push(actionRow(action, "recent", recent))
      }
    }
    if (rows.length) sections.push({ id: "recent", heading: labels.recent, rows })
    for (const action of offered) pushRow(sections, action.group ?? labels.actions, actionRow(action, "action", { kind: "action", id: action.id }))
  } else {
    const commands = goBarGrammar?.(query) ?? []
    if (commands.length) sections.push({ id: "commands", heading: labels.commands, rows: commands.map((c) => actionRow(c, "command", null)) })
    const scored = offered.map((action) => ({ action, score: scorePaletteAction(action, query) })).filter((s) => s.score >= 0)
    scored.sort((a, b) => b.score - a.score)
    for (const { action } of scored) pushRow(sections, action.group ?? labels.actions, actionRow(action, "action", { kind: "action", id: action.id }))
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

  useEffect(() => {
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

function pushRow(groups: PaletteGroup[], heading: string, row: PaletteRow) {
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
  const liveScopes = useSyncExternalStore(subscribeFocusScopes, getFocusScopes, getServerFocusScopes)
  const [wasOpen, setWasOpen] = useState(open)
  const [scopes, setScopes] = useState(liveScopes)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setScopes(liveScopes)
  }

  const setOpen = (next: boolean) => {
    if (openProp === undefined) setUncontrolled(next)
    onOpenChange?.(next)
  }

  const bindingId = variant === "palette" ? "palette.open" : "go-bar.focus"
  const keys = hotkey === false ? null : (hotkey ?? (variant === "palette" ? "mod+k" : "/"))
  const description = labels.hotkey
  const group = labels.title
  const onHotkey = useRef(() => {})
  useEffect(() => {
    onHotkey.current = () => {
      if (variant === "palette") setOpen(!open)
      else inputRef.current?.focus()
    }
  })
  useEffect(() => {
    if (!hotkeys || keys === null) return
    // A consumer that declared this id already owns its keys and its wording.
    const declared = hotkeys.list().some((entry) => entry.id === bindingId)
    if (!declared) hotkeys.register({ id: bindingId, keys, scope: variant === "palette" ? "editing" : "global", description, group })
    const unbind = hotkeys.bind(bindingId, () => onHotkey.current())
    return () => {
      unbind()
      if (!declared) hotkeys.unregister(bindingId)
    }
  }, [hotkeys, keys, bindingId, variant, description, group])

  return <RootContext value={{ options, labels, hotkeys, ownBindingId: keys === null ? null : bindingId, scopes, open, setOpen, inputRef }}>{children}</RootContext>
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
      className={cn("hidden items-center gap-1 in-data-[selected=true]:inline-flex", className)}
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
        <KbdGroup key={i}>{caps.map((cap) => <Kbd key={cap}>{cap}</Kbd>)}</KbdGroup>
      ))}
    </span>
  )
}
