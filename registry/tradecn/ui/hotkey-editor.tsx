import { cn } from "cn"
import { createContext, useCallback, useContext, useId, useLayoutEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode, type Ref } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { useHotkeyList, useHotkeys } from "@/registry/tradecn/hooks/use-hotkeys"
import { formatKeys, keysFromEvent, type HotkeyConflict, type HotkeyEntry, type HotkeyRegistry } from "@/registry/tradecn/lib/hotkeys"

export interface HotkeyEditorLabels {
  title: string
  search: string
  change: string
  pressKeys: string
  edit: string
  unbound: string
  reset: string
  keysFor: string
  notKeys: string
  duplicate: string
  prefix: string
  shadow: string
  cancelHint: string
}

export const DEFAULT_HOTKEY_EDITOR_LABELS: HotkeyEditorLabels = {
  title: "Keyboard shortcuts",
  search: "Find a shortcut",
  change: "Change",
  pressKeys: "Press the new shortcut",
  edit: "Type it",
  unbound: "unbound",
  reset: "Reset",
  keysFor: "Keys for",
  notKeys: "Not a shortcut. Write keys joined by +, steps of a chord separated by a space: mod+k, g b.",
  duplicate: "same keys as",
  prefix: "starts the chord of",
  shadow: "hides, while focus is in this panel,",
  cancelHint: "Escape cancels, Backspace unbinds",
}

export interface HotkeyEditorProps extends ComponentProps<"div"> {
  children: ReactNode
  hide?: (entry: HotkeyEntry) => boolean
  labels?: Partial<HotkeyEditorLabels>
}

export interface HotkeyEditorGroup {
  name: string
  entries: readonly HotkeyEntry[]
}

export interface HotkeyEditorState {
  registry: HotkeyRegistry
  entries: readonly HotkeyEntry[]
  groups: readonly HotkeyEditorGroup[]
  conflicts: readonly HotkeyConflict[]
  remapped: number
  query: string
  setQuery: (query: string) => void
  labels: HotkeyEditorLabels
}

const EditorContext = createContext<HotkeyEditorState | null>(null)
const FocusContext = createContext<(() => void) | null>(null)

export function useHotkeyEditor(): HotkeyEditorState {
  const value = useContext(EditorContext)
  if (!value) throw new Error("Hotkey editor parts must be inside HotkeyEditor")
  return value
}

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === "function") return ref(value)
  if (ref) ref.current = value
}

function useEditorRef<T>(localRef: { current: T | null }, forwarded: Ref<T> | undefined) {
  return useCallback((node: T | null) => {
    localRef.current = node
    const cleanup = assignRef(forwarded, node)
    return () => {
      localRef.current = null
      if (typeof cleanup === "function") cleanup()
      else assignRef(forwarded, null)
    }
  }, [localRef, forwarded])
}
/** The word for a scope on a row: "global", "editing", or a panel's kind. */
export function scopeWord(scope: string): string {
  return scope.startsWith("panel:") ? scope.slice("panel:".length) : scope
}

/** The group a binding is listed under: its own, else its scope. */
export function groupOf(entry: HotkeyEntry): string {
  return entry.group ?? scopeWord(entry.scope)
}

/** True when the query lands in the description, the group, the id, or the keys as shown. */
export function matchesQuery(entry: HotkeyEntry, query: string, platform: "mac" | "other"): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const caps = entry.keys ? formatKeys(entry.keys, platform).flat().join(" ").toLowerCase() : ""
  return [entry.description, groupOf(entry), entry.id, entry.keys, caps].some((s) => s.toLowerCase().includes(q))
}

export function HotkeyEditor({ hide, labels: labelsProp, className, children, ref, ...props }: HotkeyEditorProps) {
  const registry = useHotkeys()
  const entries = useHotkeyList()
  const [query, setQuery] = useState("")
  const root = useRef<HTMLDivElement>(null)
  const rootRef = useEditorRef(root, ref)
  const focusFallback = useCallback(() => {
    const node = root.current
    if (!node?.isConnected) return
    const search = node.querySelector<HTMLInputElement>("[data-hotkey-search]:not(:disabled)")
    const target = search ?? node
    target.focus()
  }, [])
  const conflicts = useMemo(() => {
    void entries
    return registry.conflicts()
  }, [registry, entries])
  const groups = useMemo(() => {
    const shown = entries.filter((entry) => !hide?.(entry) && matchesQuery(entry, query, registry.platform))
    const rank = (entry: HotkeyEntry) => entry.group ? 0 : 1
    shown.sort((a, b) => rank(a) - rank(b) || groupOf(a).localeCompare(groupOf(b)) || a.description.localeCompare(b.description))
    const grouped = new Map<string, HotkeyEntry[]>()
    for (const entry of shown) {
      const name = groupOf(entry)
      const group = grouped.get(name)
      if (group) group.push(entry)
      else grouped.set(name, [entry])
    }
    return [...grouped].map(([name, entries]) => ({ name, entries }))
  }, [entries, hide, query, registry.platform])
  const labels = { ...DEFAULT_HOTKEY_EDITOR_LABELS, ...labelsProp }
  const remapped = entries.filter((entry) => entry.remapped).length
  return (
    <EditorContext value={{ registry, entries, groups, conflicts, remapped, query, setQuery, labels }}>
      <FocusContext value={focusFallback}>
        <div role="region" tabIndex={-1} aria-label={props["aria-labelledby"] ? undefined : labels.title} data-slot="tradecn-hotkey-editor" data-remapped={remapped} className={cn("flex min-w-0 flex-col gap-2 text-xs lining-nums tabular-nums", className)} {...props} ref={rootRef}>
          {children}
        </div>
      </FocusContext>
    </EditorContext>
  )
}

type InputProps = Omit<ComponentProps<typeof Input>, "value" | "defaultValue">
type ActionProps = Omit<ComponentProps<typeof Button>, "children"> & { children: ReactNode }

export function HotkeyEditorSearch({ onChange, className, ...props }: InputProps) {
  const { query, setQuery, labels } = useHotkeyEditor()
  return <Input aria-label={labels.search} placeholder={labels.search} spellCheck={false} autoComplete="off" data-hotkey-search="" className={cn("h-7 max-w-64 font-(family-name:--tradecn-font-mono) text-xs md:text-xs", className)} {...props} value={query} onChange={(event) => {
    onChange?.(event)
    if (!event.defaultPrevented) setQuery(event.target.value)
  }} />
}

export type HotkeyEditorMode = "idle" | "capture" | "text"
export interface HotkeyEditorItemState {
  entry: HotkeyEntry
  mode: HotkeyEditorMode
  draft: string
  setDraft: (draft: string) => void
  problem: string | null
  problemId: string
  conflicts: readonly HotkeyConflict[]
  startCapture: (trigger?: HTMLElement) => void
  startEdit: (trigger?: HTMLElement) => void
  commit: (keys: string) => void
  cancel: () => void
  reset: () => void
}
const ItemContext = createContext<HotkeyEditorItemState | null>(null)
export function useHotkeyEditorItem(): HotkeyEditorItemState {
  const value = useContext(ItemContext)
  if (!value) throw new Error("Shortcut readings and controls must be inside HotkeyEditorItem")
  return value
}

export interface HotkeyEditorItemProps extends ComponentProps<"div"> {
  bindingId: string
  children: ReactNode
}

export function HotkeyEditorItem({ bindingId, ...props }: HotkeyEditorItemProps) {
  const { entries } = useHotkeyEditor()
  const entry = entries.find((entry) => entry.id === bindingId)
  return entry ? <Item key={bindingId} entry={entry} {...props} /> : null
}

interface EditSession {
  registry: HotkeyRegistry
  entry: HotkeyEntry
  mode: "capture" | "text"
  draft: string
  problem: string | null
}

function sameBinding(a: HotkeyEntry, b: HotkeyEntry): boolean {
  return a.id === b.id && a.keys === b.keys && a.defaultKeys === b.defaultKeys && a.scope === b.scope && a.description === b.description && a.group === b.group && a.when === b.when && a.repeat === b.repeat && a.preventDefault === b.preventDefault
}

function Item({ entry, className, ref, onFocusCapture, ...props }: ComponentProps<"div"> & { entry: HotkeyEntry }) {
  const { registry, conflicts, labels } = useHotkeyEditor()
  const focusFallback = useContext(FocusContext)!
  const root = useRef<HTMLDivElement>(null)
  const rootRef = useEditorRef(root, ref)
  const origin = useRef<HTMLElement | null>(null)
  const lastFocused = useRef<HTMLElement | null>(null)
  const previousMode = useRef<HotkeyEditorMode>("idle")
  const [session, setSession] = useState<EditSession | null>(null)
  const current = session?.registry === registry && sameBinding(session.entry, entry) ? session : null
  if (session && !current) setSession(null)
  const mode = current?.mode ?? "idle"
  const problemId = useId()

  useLayoutEffect(() => {
    const node = root.current
    if (!node) return
    const active = node.ownerDocument.activeElement
    if (mode !== "idle" && mode !== previousMode.current) {
      node.querySelector<HTMLElement>(mode === "capture" ? "[data-hotkey-capture]" : "[data-hotkey-input]")?.focus()
    } else if (mode === "idle" && previousMode.current !== "idle" && (active === node.ownerDocument.body || node.contains(active))) {
      const target = origin.current
      if (target?.isConnected && !target.matches(":disabled, [aria-disabled=true]")) target.focus()
      else node.focus()
    }
    if (node.ownerDocument.activeElement === node.ownerDocument.body && lastFocused.current && !lastFocused.current.isConnected) node.focus()
    previousMode.current = mode
  })
  useLayoutEffect(() => {
    const node = root.current
    return () => {
      if (node?.contains(node.ownerDocument.activeElement)) focusFallback()
    }
  }, [focusFallback])

  const start = (mode: "capture" | "text", trigger?: HTMLElement) => {
    if (current) return
    origin.current = trigger ?? root.current
    setSession({ registry, entry, mode, draft: entry.keys, problem: null })
  }
  const cancel = () => setSession(null)
  const state: HotkeyEditorItemState = {
    entry, mode, problemId,
    draft: current?.draft ?? entry.keys,
    problem: current?.problem ?? null,
    conflicts: conflicts.filter((conflict) => conflict.ids.includes(entry.id)),
    setDraft: (draft) => { if (current) setSession({ ...current, draft }) },
    startCapture: (trigger) => start("capture", trigger),
    startEdit: (trigger) => start("text", trigger),
    cancel,
    commit: (keys) => {
      if (!current) return
      try {
        registry.remap(entry.id, keys)
        cancel()
      } catch {
        setSession({ ...current, problem: labels.notKeys })
      }
    },
    reset: () => { registry.reset(entry.id); cancel() },
  }
  return <ItemContext value={state}><div role="group" tabIndex={-1} aria-label={props["aria-labelledby"] ? undefined : entry.description} data-slot="tradecn-hotkey-editor-item" data-hotkey-row={entry.id} data-remapped={entry.remapped || undefined} data-mode={mode} className={cn("flex min-w-0 flex-col gap-1.5", className)} {...props} ref={rootRef} onFocusCapture={(event) => {
    lastFocused.current = event.target
    onFocusCapture?.(event)
  }} /></ItemContext>
}

export function HotkeyEditorKeys({ className, ...props }: ComponentProps<"span">) {
  const { entry } = useHotkeyEditorItem()
  const { registry, labels } = useHotkeyEditor()
  const steps = entry.keys ? formatKeys(entry.keys, registry.platform) : []
  return <span data-hotkey-keys={entry.keys} className={cn("inline-flex flex-wrap items-center gap-1", className)} {...props}>
    {steps.length ? steps.map((caps, index) => <KbdGroup key={index}>{caps.map((cap) => <Kbd key={cap}>{cap}</Kbd>)}</KbdGroup>) : <span className="text-muted-foreground">{labels.unbound}</span>}
  </span>
}

export function HotkeyEditorChange({ onClick, disabled, className, ...props }: ActionProps) {
  const { entry, mode, startCapture } = useHotkeyEditorItem()
  const { labels } = useHotkeyEditor()
  return <Button type="button" variant="ghost" size="sm" aria-label={`${labels.change}: ${entry.description}`} className={cn("h-6 px-1.5 text-xs", className)} {...props} disabled={disabled || mode !== "idle"} onClick={(event) => {
    onClick?.(event)
    if (!event.defaultPrevented) startCapture(event.currentTarget)
  }} />
}

export function HotkeyEditorEdit({ onClick, disabled, className, ...props }: ActionProps) {
  const { entry, mode, startEdit } = useHotkeyEditorItem()
  const { labels } = useHotkeyEditor()
  return <Button type="button" variant="ghost" size="sm" aria-label={`${labels.edit}: ${entry.description}`} className={cn("h-6 px-1.5 text-xs", className)} {...props} disabled={disabled || mode !== "idle"} onClick={(event) => {
    onClick?.(event)
    if (!event.defaultPrevented) startEdit(event.currentTarget)
  }} />
}

export function HotkeyEditorReset({ onClick, disabled, className, ...props }: ActionProps) {
  const { entry, reset } = useHotkeyEditorItem()
  const { labels } = useHotkeyEditor()
  return <Button type="button" variant="ghost" size="sm" aria-label={`${labels.reset}: ${entry.description}`} className={cn("h-6 px-1.5 text-xs", className)} {...props} disabled={disabled || !entry.remapped} onClick={(event) => {
    onClick?.(event)
    if (!event.defaultPrevented) reset()
  }} />
}

export function HotkeyEditorResetAll({ onClick, disabled, className, ...props }: ActionProps) {
  const { registry, remapped } = useHotkeyEditor()
  return <Button type="button" variant="outline" size="sm" className={cn("h-7 px-2 text-xs", className)} {...props} disabled={disabled || remapped === 0} onClick={(event) => {
    onClick?.(event)
    if (!event.defaultPrevented) registry.reset()
  }} />
}

export function HotkeyEditorCapture({ onKeyDown, onBlur, className, children, "aria-describedby": describedBy, ...props }: ComponentProps<typeof Button>) {
  const { mode, commit, cancel, problem, problemId } = useHotkeyEditorItem()
  const { labels } = useHotkeyEditor()
  const hintId = useId()
  if (mode !== "capture") return null
  return <><Button type="button" variant="outline" size="sm" aria-pressed aria-invalid={problem ? true : undefined} aria-describedby={[describedBy, hintId, problem ? problemId : null].filter(Boolean).join(" ")} data-hotkey-capture="" className={cn("h-auto min-h-7 self-start whitespace-normal px-2 text-start text-xs", className)} {...props} onKeyDown={(event) => {
    onKeyDown?.(event)
    if (event.defaultPrevented) return
    event.preventDefault()
    event.stopPropagation()
    if (event.key === "Escape") return cancel()
    if (event.key === "Backspace" || event.key === "Delete") return commit("")
    const keys = keysFromEvent(event.nativeEvent)
    if (keys) commit(keys)
  }} onBlur={(event) => {
    onBlur?.(event)
    if (!event.defaultPrevented) cancel()
  }}>
    {children ?? labels.pressKeys}
  </Button><span id={hintId} className="sr-only">{labels.cancelHint}</span></>
}

export function HotkeyEditorInput({ onChange, onKeyDown, onBlur, className, "aria-describedby": describedBy, ...props }: InputProps) {
  const { entry, mode, draft, setDraft, commit, cancel, problem, problemId } = useHotkeyEditorItem()
  const { labels } = useHotkeyEditor()
  if (mode !== "text") return null
  return <Input aria-label={`${labels.keysFor} ${entry.description}`} aria-invalid={problem ? true : undefined} aria-describedby={[describedBy, problem ? problemId : null].filter(Boolean).join(" ") || undefined} spellCheck={false} autoComplete="off" data-hotkey-input="" className={cn("h-7 w-40 font-(family-name:--tradecn-font-mono) text-xs md:text-xs", className)} {...props} value={draft} onChange={(event) => {
    onChange?.(event)
    if (!event.defaultPrevented) setDraft(event.target.value)
  }} onKeyDown={(event) => {
    onKeyDown?.(event)
    if (event.defaultPrevented) return
    // Editing keys stay out of application hotkeys, including editing-scope bindings.
    event.stopPropagation()
    if (event.key === "Enter" || event.key === "Escape") {
      event.preventDefault()
      if (event.key === "Enter") commit(draft)
      else cancel()
    }
  }} onBlur={(event) => {
    onBlur?.(event)
    if (!event.defaultPrevented) cancel()
  }} />
}

export function HotkeyEditorProblem({ className, ...props }: Omit<ComponentProps<"p">, "id">) {
  const { problem, problemId } = useHotkeyEditorItem()
  return problem ? <p role="alert" data-hotkey-problem="" className={cn("text-destructive", className)} {...props} id={problemId}>{problem}</p> : null
}

export function HotkeyEditorConflicts({ className, ...props }: ComponentProps<"ul">) {
  const { entry, conflicts } = useHotkeyEditorItem()
  const { entries, labels } = useHotkeyEditor()
  if (!conflicts.length) return null
  return <ul data-hotkey-conflicts="" className={cn("text-stale", className)} {...props}>
    {conflicts.map((conflict, index) => {
      const other = entries.find((candidate) => candidate.id === (conflict.ids[0] === entry.id ? conflict.ids[1] : conflict.ids[0]))
      return <li key={index}>{labels[conflict.kind]} {other ? `"${other.description}"` : conflict.ids.join(", ")}</li>
    })}
  </ul>
}
