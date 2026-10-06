import { cn } from "cn"
import { createContext, useCallback, useContext, useId, useLayoutEffect, useMemo, useRef, useState, type ComponentProps, type Dispatch, type ReactNode, type Ref, type SetStateAction } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { readSlot, setSlot, type Preferences } from "@/registry/tradecn/lib/preferences"
import { parseWorkspaceLayout, unknownPanelKinds, type WorkspaceLayout } from "@/registry/tradecn/lib/workspace-layout"

export interface LayoutTemplate {
  id: string
  name: string
  layout: WorkspaceLayout
  /** When it was saved, ms since the epoch. */
  savedAt: number
}

export const LAYOUT_TEMPLATES_SLOT = "layouts"
export const LAYOUT_TEMPLATES_VERSION = 1

export interface LayoutManagerLabels {
  title: string
  /** The save field's placeholder and name. */
  saveName: string
  /** The import form's name field. */
  importName: string
  save: string
  /** Said under the field when a name is taken. `{name}`. */
  taken: string
  load: string
  loadAnyway: string
  rename: string
  duplicate: string
  /** The name of a copy. `{name}`. */
  copyOf: string
  delete: string
  deleteAnyway: string
  export: string
  import: string
  /** The import field's placeholder. */
  pasteLayout: string
  add: string
  /** Said when the pasted text is not a layout. */
  notALayout: string
  reset: string
  /** `{n}` panels. */
  panels: string
  /** `{kinds}` the kinds a layout asks for that the workspace does not have. */
  unknownKinds: string
  empty: string
  /** Said of the loaded template. */
  active: string
}

export const DEFAULT_LAYOUT_MANAGER_LABELS: LayoutManagerLabels = {
  title: "Layouts",
  saveName: "Layout name",
  importName: "Imported layout name",
  save: "Save current",
  taken: "A layout named {name} exists. Save replaces it.",
  load: "Load",
  loadAnyway: "Load anyway?",
  rename: "Rename",
  duplicate: "Duplicate",
  copyOf: "Copy of {name}",
  delete: "Delete",
  deleteAnyway: "Delete?",
  export: "Export",
  import: "Import",
  pasteLayout: "Paste a layout's JSON",
  add: "Add",
  notALayout: "That is not a workspace layout.",
  reset: "Reset to default",
  panels: "{n} panels",
  unknownKinds: "Needs {kinds}",
  empty: "No saved layouts. Save the current one under a name.",
  active: "loaded",
}

const fill = (template: string, values: Record<string, string>) => template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "")

let clockFormat: Intl.DateTimeFormat | null = null
const localTime = (ms: number) => (clockFormat ??= new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })).format(ms)

/** `t-1`, then `t-2`: the lowest number not taken. */
function nextId(taken: Iterable<string>): string {
  const used = new Set(taken)
  let n = 1
  while (used.has(`t-${n}`)) n += 1
  return `t-${n}`
}

/** A stored list read back, taking nothing on trust: a template whose layout does not parse is dropped, and what comes back is a copy. */
export function parseLayoutTemplates(value: unknown): LayoutTemplate[] {
  let raw = value
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw)
    } catch {
      return []
    }
  }
  const list = Array.isArray(raw) ? raw : typeof raw === "object" && raw !== null && Array.isArray((raw as { templates?: unknown }).templates) ? (raw as { templates: unknown[] }).templates : []
  const out: LayoutTemplate[] = []
  for (const entry of list) {
    if (typeof entry !== "object" || entry === null) continue
    const t = entry as Record<string, unknown>
    const layout = parseWorkspaceLayout(t.layout)
    if (!layout || typeof t.id !== "string" || !t.id || typeof t.name !== "string" || !t.name) continue
    // A stored timestamp beyond the Date range would throw in toISOString and the formatter
    // the moment it renders; such a value reads as never saved.
    const savedAt = typeof t.savedAt === "number" && Number.isFinite(t.savedAt) && Math.abs(t.savedAt) <= 8.64e15 ? t.savedAt : 0
    out.push({ id: t.id, name: t.name, layout, savedAt })
  }
  return out
}

/** The templates in a preferences envelope's slot, `layouts` by default. */
export function readLayoutTemplates(prefs: Preferences, slot: string = LAYOUT_TEMPLATES_SLOT): LayoutTemplate[] {
  return parseLayoutTemplates(readSlot(prefs, slot))
}

/** The envelope with the templates written to the slot. */
export function writeLayoutTemplates(prefs: Preferences, templates: readonly LayoutTemplate[], slot: string = LAYOUT_TEMPLATES_SLOT): Preferences {
  return setSlot(prefs, slot, { version: LAYOUT_TEMPLATES_VERSION, templates }, LAYOUT_TEMPLATES_VERSION)
}

/** The list with `layout` saved under `name`: a new template, or the one already named that replaced. */
export function saveTemplate(templates: readonly LayoutTemplate[], name: string, layout: WorkspaceLayout, savedAt: number): LayoutTemplate[] {
  const trimmed = name.trim()
  const existing = templates.find((t) => t.name === trimmed)
  if (existing) return templates.map((t) => (t === existing ? { ...t, layout, savedAt } : t))
  return [...templates, { id: nextId(templates.map((t) => t.id)), name: trimmed, layout, savedAt }]
}

export function renameTemplate(templates: readonly LayoutTemplate[], id: string, name: string): LayoutTemplate[] {
  const trimmed = name.trim()
  if (!trimmed) return [...templates]
  return templates.map((t) => (t.id === id ? { ...t, name: trimmed } : t))
}

/** A copy beside the original, named `Copy of <name>` unless a name is given. */
export function duplicateTemplate(templates: readonly LayoutTemplate[], id: string, savedAt: number, name?: string, labels: LayoutManagerLabels = DEFAULT_LAYOUT_MANAGER_LABELS): LayoutTemplate[] {
  const i = templates.findIndex((t) => t.id === id)
  if (i < 0) return [...templates]
  const source = templates[i]!
  const copy: LayoutTemplate = { id: nextId(templates.map((t) => t.id)), name: name?.trim() || fill(labels.copyOf, { name: source.name }), layout: parseWorkspaceLayout(source.layout) ?? source.layout, savedAt }
  return [...templates.slice(0, i + 1), copy, ...templates.slice(i + 1)]
}

export function deleteTemplate(templates: readonly LayoutTemplate[], id: string): LayoutTemplate[] {
  return templates.filter((t) => t.id !== id)
}

/** The layout as JSON text, for a file or the clipboard. */
export function exportTemplate(template: LayoutTemplate, indent = 2): string {
  return JSON.stringify(template.layout, null, indent)
}

/** The list with a pasted layout added under `name`, or null when the text is not a layout. */
export function importTemplate(templates: readonly LayoutTemplate[], text: string, name: string, savedAt: number): LayoutTemplate[] | null {
  const layout = parseWorkspaceLayout(text)
  if (!layout) return null
  return saveTemplate(templates, name, layout, savedAt)
}

export interface LayoutManagerProps extends Omit<ComponentProps<"section">, "onLoad" | "onReset"> {
  children: ReactNode
  templates: readonly LayoutTemplate[]
  onTemplatesChange: (templates: LayoutTemplate[]) => void
  current?: WorkspaceLayout | null
  onLoad: (layout: WorkspaceLayout, template: LayoutTemplate) => void
  kinds?: Iterable<string>
  activeId?: string | null
  now?: () => number
  labels?: Partial<LayoutManagerLabels>
}

export interface LayoutManagerState {
  templates: readonly LayoutTemplate[]
  labels: LayoutManagerLabels
  saveName: string
  setSaveName: (name: string) => void
  canSave: boolean
  nameTaken: boolean
  takenId: string
  save: () => void
  importing: boolean
  setImporting: (open: boolean, trigger?: HTMLElement) => void
  importText: string
  setImportText: (text: string) => void
  importName: string
  setImportName: (name: string) => void
  importProblem: string | null
  importProblemId: string
  importContentId: string
  add: () => void
}

type Confirmation = { id: string; layout: string; action: "load" | "delete" }
interface ManagerContextValue extends LayoutManagerState {
  known: string[]
  activeId: string | null
  asking: Confirmation | null
  setAsking: (asking: Confirmation | null) => void
  editingId: string | null
  setEditingId: Dispatch<SetStateAction<string | null>>
  change: (templates: LayoutTemplate[]) => void
  onLoad: LayoutManagerProps["onLoad"]
  clock: () => number
}

const ManagerContext = createContext<ManagerContextValue | null>(null)
const FocusContext = createContext<(() => void) | null>(null)

function useManagerContext() {
  const value = useContext(ManagerContext)
  if (!value) throw new Error("Layout manager parts must be inside LayoutManager")
  return value
}

export function useLayoutManager(): LayoutManagerState {
  return useManagerContext()
}

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === "function") return ref(value)
  if (ref) ref.current = value
}

function useManagerRef<T>(localRef: { current: T | null }, forwarded: Ref<T> | undefined) {
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

export function LayoutManager({ templates, onTemplatesChange, current = null, onLoad, kinds, activeId = null, now = Date.now, labels: labelsProp, children, className, ref, ...props }: LayoutManagerProps) {
  const labels = { ...DEFAULT_LAYOUT_MANAGER_LABELS, ...labelsProp }
  const [saveName, setSaveName] = useState("")
  const [asking, setAsking] = useState<Confirmation | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [importing, setImportOpen] = useState(false)
  const [importText, setText] = useState("")
  const [importName, setImportName] = useState("")
  const [invalidImport, setInvalidImport] = useState(false)
  const takenId = useId()
  const importProblemId = useId()
  const importContentId = useId()
  const root = useRef<HTMLElement>(null)
  const rootRef = useManagerRef(root, ref)
  const importOrigin = useRef<HTMLElement | null>(null)
  const wasImporting = useRef(false)
  const focusFallback = useCallback(() => {
    const node = root.current
    if (!node?.isConnected) return
    const target = node.querySelector<HTMLElement>("[data-layout-save-name]:not(:disabled)") ?? node
    target.focus({ preventScroll: true })
  }, [])
  // Preferences readers may copy the list on every render. Compare the target's content, not its identity.
  const target = asking ? templates.find((template) => template.id === asking.id) : null
  const targetLayout = target?.layout
  const targetSource = useMemo(() => targetLayout ? JSON.stringify(targetLayout, null, 2) : null, [targetLayout])
  const confirmation = target && asking?.layout === targetSource ? asking : null
  if (asking && !confirmation) setAsking(null)
  if (editingId && !templates.some((template) => template.id === editingId)) setEditingId(null)

  useLayoutEffect(() => {
    const node = root.current
    if (!node) return
    if (wasImporting.current && !importing) {
      const active = node.ownerDocument.activeElement
      if (active === node.ownerDocument.body || node.querySelector("[data-layout-import-content]")?.contains(active)) {
        const trigger = importOrigin.current
        if (trigger?.isConnected && !trigger.matches(":disabled, [aria-disabled=true]")) trigger.focus({ preventScroll: true })
        else focusFallback()
      }
    }
    wasImporting.current = importing
  }, [importing, focusFallback])

  const canSave = Boolean(current && saveName.trim())
  const state: ManagerContextValue = {
    templates, labels, saveName, setSaveName, canSave, takenId,
    nameTaken: templates.some((template) => template.name === saveName.trim()),
    save: () => {
      if (!current || !saveName.trim()) return
      onTemplatesChange(saveTemplate(templates, saveName, current, now()))
      setSaveName("")
    },
    importing,
    setImporting: (open, trigger) => {
      if (open) importOrigin.current = trigger ?? null
      setImportOpen(open)
    },
    importText, importName, setImportName, importProblemId, importContentId,
    importProblem: invalidImport ? labels.notALayout : null,
    setImportText: (text) => { setText(text); setInvalidImport(false) },
    add: () => {
      if (!importText.trim()) return
      const time = now()
      const next = importTemplate(templates, importText, importName.trim() || `Imported ${localTime(time)}`, time)
      if (!next) { setInvalidImport(true); return }
      onTemplatesChange(next)
      setText("")
      setImportName("")
      setInvalidImport(false)
      setImportOpen(false)
    },
    known: [...(kinds ?? [])], activeId, asking: confirmation, setAsking, editingId, setEditingId,
    change: onTemplatesChange, onLoad, clock: now,
  }
  return <ManagerContext value={state}><FocusContext value={focusFallback}>
    <section tabIndex={-1} aria-label={props["aria-labelledby"] ? undefined : labels.title} data-slot="tradecn-layout-manager" className={cn("flex min-w-0 flex-col gap-2 text-xs lining-nums tabular-nums", className)} {...props} ref={rootRef}>{children}</section>
  </FocusContext></ManagerContext>
}

type InputProps = Omit<ComponentProps<typeof Input>, "value" | "defaultValue">
type ButtonProps = ComponentProps<typeof Button>
type ReadingProps<T extends "span" | "p" | "time"> = Omit<ComponentProps<T>, "children">

export function LayoutManagerSaveName({ className, onChange, onKeyDown, "aria-describedby": describedBy, ...props }: InputProps) {
  const { labels, saveName, setSaveName, save, nameTaken, takenId } = useLayoutManager()
  return <Input aria-label={labels.saveName} placeholder={labels.saveName} autoComplete="off" spellCheck={false} data-layout-save-name="" aria-describedby={[describedBy, nameTaken ? takenId : null].filter(Boolean).join(" ") || undefined} className={cn("h-7 min-w-0 rounded-sm px-2 py-0 text-xs md:text-xs", className)} {...props} value={saveName} onChange={(event) => {
    onChange?.(event)
    if (!event.defaultPrevented) setSaveName(event.target.value)
  }} onKeyDown={(event) => {
    onKeyDown?.(event)
    if (!event.defaultPrevented && event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); save() }
  }} />
}

export function LayoutManagerSave({ className, children, disabled, onClick, ref, ...props }: ButtonProps) {
  const { labels, canSave, save } = useLayoutManager()
  const focusFallback = useContext(FocusContext)!
  const button = useRef<HTMLButtonElement>(null)
  const buttonRef = useManagerRef(button, ref)
  useLayoutEffect(() => {
    const node = button.current
    if ((disabled || !canSave) && node && node.ownerDocument.activeElement === node) focusFallback()
  }, [disabled, canSave, focusFallback])
  return <Button type="button" variant="outline" size="sm" data-layout-save="" className={cn("h-7 px-2 text-xs", className)} {...props} ref={buttonRef} disabled={disabled || !canSave} onClick={(event) => {
    onClick?.(event)
    if (!event.defaultPrevented) save()
  }}>{children ?? labels.save}</Button>
}

export function LayoutManagerTaken({ className, ...props }: Omit<ReadingProps<"p">, "id">) {
  const { labels, nameTaken, saveName, takenId } = useLayoutManager()
  return nameTaken ? <p data-layout-taken="" className={cn("text-muted-foreground", className)} {...props} id={takenId}>{fill(labels.taken, { name: saveName.trim() })}</p> : null
}

export function LayoutManagerImportTrigger({ className, children, onClick, ...props }: ButtonProps) {
  const { labels, importing, setImporting, importContentId } = useLayoutManager()
  return <Button type="button" variant="ghost" size="sm" data-layout-import="" className={cn("h-7 px-2 text-xs", className)} {...props} aria-expanded={importing} aria-controls={importing ? importContentId : undefined} onClick={(event) => {
    onClick?.(event)
    if (!event.defaultPrevented) setImporting(!importing, event.currentTarget)
  }}>{children ?? labels.import}</Button>
}

export function LayoutManagerImportContent({ className, children, ...props }: Omit<ComponentProps<"div">, "id"> & { children: ReactNode }) {
  const { importing, importContentId } = useLayoutManager()
  return importing ? <div data-layout-import-content="" className={cn("flex flex-col gap-2 rounded-md border border-border p-2", className)} {...props} id={importContentId}>{children}</div> : null
}

export function LayoutManagerImportText({ className, onChange, "aria-describedby": describedBy, ...props }: Omit<ComponentProps<"textarea">, "value" | "defaultValue">) {
  const { labels, importText, setImportText, importProblem, importProblemId } = useLayoutManager()
  return <textarea aria-label={labels.pasteLayout} placeholder={labels.pasteLayout} spellCheck={false} rows={4} className={cn("w-full rounded-sm border border-input bg-background px-2 py-1 font-(family-name:--tradecn-font-mono) text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40", className)} {...props} aria-invalid={importProblem ? true : undefined} aria-describedby={[describedBy, importProblem ? importProblemId : null].filter(Boolean).join(" ") || undefined} value={importText} onChange={(event) => {
    onChange?.(event)
    if (!event.defaultPrevented) setImportText(event.target.value)
  }} />
}

export function LayoutManagerImportName({ className, onChange, ...props }: InputProps) {
  const { labels, importName, setImportName } = useLayoutManager()
  return <Input aria-label={labels.importName} placeholder={labels.importName} autoComplete="off" spellCheck={false} className={cn("h-7 min-w-0 rounded-sm px-2 py-0 text-xs md:text-xs", className)} {...props} value={importName} onChange={(event) => {
    onChange?.(event)
    if (!event.defaultPrevented) setImportName(event.target.value)
  }} />
}

export function LayoutManagerImportSubmit({ className, children, disabled, onClick, ref, ...props }: ButtonProps) {
  const { labels, importText, add } = useLayoutManager()
  const focusFallback = useContext(FocusContext)!
  const button = useRef<HTMLButtonElement>(null)
  const buttonRef = useManagerRef(button, ref)
  const canAdd = Boolean(importText.trim())
  useLayoutEffect(() => {
    const node = button.current
    if ((disabled || !canAdd) && node && node.ownerDocument.activeElement === node) focusFallback()
  }, [disabled, canAdd, focusFallback])
  return <Button type="button" variant="outline" size="sm" data-layout-add="" className={cn("h-7 px-2 text-xs", className)} {...props} ref={buttonRef} disabled={disabled || !canAdd} onClick={(event) => {
    onClick?.(event)
    if (!event.defaultPrevented) add()
  }}>{children ?? labels.add}</Button>
}

export function LayoutManagerImportProblem({ className, ...props }: Omit<ReadingProps<"p">, "id">) {
  const { importProblem, importProblemId } = useLayoutManager()
  return importProblem ? <p role="alert" data-layout-import-problem="" className={cn("text-destructive", className)} {...props} id={importProblemId}>{importProblem}</p> : null
}

export interface LayoutManagerItemState {
  template: LayoutTemplate
  active: boolean
  panelCount: number
  missingKinds: readonly string[]
  asking: "load" | "delete" | null
  renaming: boolean
  name: string
  setName: (name: string) => void
  rename: (trigger?: HTMLElement) => void
  commitRename: (options?: { restoreFocus?: boolean }) => void
  cancelRename: () => void
  load: () => void
  duplicate: () => void
  remove: () => void
}

const ItemContext = createContext<LayoutManagerItemState | null>(null)
function useItemContext() {
  const value = useContext(ItemContext)
  if (!value) throw new Error("Template readings and controls must be inside LayoutManagerItem")
  return value
}
export function useLayoutManagerItem(): LayoutManagerItemState { return useItemContext() }

export interface LayoutManagerItemProps extends ComponentProps<"div"> {
  templateId: string
  children: ReactNode
}

export function LayoutManagerItem({ templateId, ...props }: LayoutManagerItemProps) {
  const { templates } = useLayoutManager()
  const template = templates.find((entry) => entry.id === templateId)
  return template ? <Item key={templateId} template={template} {...props} /> : null
}

function Item({ template, className, ref, onFocusCapture, onBlurCapture, ...props }: Omit<LayoutManagerItemProps, "templateId"> & { template: LayoutTemplate }) {
  const manager = useManagerContext()
  const focusFallback = useContext(FocusContext)!
  const root = useRef<HTMLDivElement>(null)
  const rootRef = useManagerRef(root, ref)
  const origin = useRef<HTMLElement | null>(null)
  const restoreFocus = useRef(true)
  const wasRenaming = useRef(false)
  const lastFocused = useRef<HTMLElement | null>(null)
  const committing = useRef(false)
  const [session, setSession] = useState<{ source: string; name: string } | null>(null)
  const editing = session !== null && manager.editingId === template.id
  const source = useMemo(() => editing ? JSON.stringify([template.name, template.layout]) : null, [editing, template.name, template.layout])
  const current = editing && session?.source === source ? session : null
  if (session && !current) setSession(null)
  const renaming = current !== null
  const missingKinds = manager.known.length ? unknownPanelKinds(template.layout, manager.known) : []
  const asking = manager.asking?.id === template.id ? manager.asking.action : null

  useLayoutEffect(() => {
    const node = root.current
    if (!node) return
    const active = node.ownerDocument.activeElement
    if (renaming && !wasRenaming.current) node.querySelector<HTMLElement>("[data-layout-rename-field]")?.focus()
    if (!renaming && wasRenaming.current && restoreFocus.current && (active === node.ownerDocument.body || node.contains(active))) {
      const target = origin.current
      if (target?.isConnected && !target.matches(":disabled, [aria-disabled=true]")) target.focus({ preventScroll: true })
      else node.focus({ preventScroll: true })
    }
    const focused = lastFocused.current
    if (focused && (!focused.isConnected || focused.matches(":disabled")) && (node.ownerDocument.activeElement === node.ownerDocument.body || node.ownerDocument.activeElement === focused)) node.focus({ preventScroll: true })
    wasRenaming.current = renaming
  })
  useLayoutEffect(() => {
    const node = root.current
    return () => { if (node?.contains(node.ownerDocument.activeElement)) focusFallback() }
  }, [focusFallback])

  const cancelRename = () => {
    setSession(null)
    manager.setEditingId((id) => id === template.id ? null : id)
  }
  const commitRename = (options?: { restoreFocus?: boolean }) => {
    if (!current || committing.current) return
    committing.current = true
    restoreFocus.current = options?.restoreFocus ?? true
    // Blur can commit while activeElement is still body, before its destination receives focus.
    if (!restoreFocus.current) lastFocused.current = null
    manager.change(renameTemplate(manager.templates, template.id, current.name))
    cancelRename()
  }
  const state: LayoutManagerItemState = {
    template, active: template.id === manager.activeId, panelCount: Object.keys(template.layout.panels).length, missingKinds, asking, renaming,
    name: current?.name ?? template.name,
    setName: (name) => { if (current) setSession({ ...current, name }) },
    rename: (trigger) => {
      if (current) return
      origin.current = trigger ?? root.current
      restoreFocus.current = true
      committing.current = false
      manager.setEditingId(template.id)
      setSession({ source: JSON.stringify([template.name, template.layout]), name: template.name })
    },
    commitRename, cancelRename,
    load: () => {
      if (missingKinds.length && asking !== "load") { manager.setAsking({ id: template.id, layout: exportTemplate(template), action: "load" }); return }
      manager.setAsking(null)
      manager.onLoad(template.layout, template)
    },
    duplicate: () => manager.change(duplicateTemplate(manager.templates, template.id, manager.clock(), undefined, manager.labels)),
    remove: () => {
      if (asking !== "delete") { manager.setAsking({ id: template.id, layout: exportTemplate(template), action: "delete" }); return }
      manager.setAsking(null)
      manager.change(deleteTemplate(manager.templates, template.id))
    },
  }
  return <ItemContext value={state}>
    <div role="group" tabIndex={-1} aria-label={props["aria-labelledby"] ? undefined : template.name} data-slot="tradecn-layout-manager-item" data-layout-template={template.id} data-active={template.id === manager.activeId || undefined} data-unknown-kinds={missingKinds.length || undefined} className={cn("flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1", className)} {...props} ref={rootRef} onFocusCapture={(event) => {
      lastFocused.current = event.target
      onFocusCapture?.(event)
    }} onBlurCapture={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) lastFocused.current = null
      onBlurCapture?.(event)
    }} />
  </ItemContext>
}

export function LayoutManagerName({ className, ...props }: ReadingProps<"span">) {
  const { template, renaming } = useLayoutManagerItem()
  return renaming ? null : <span data-layout-name="" className={cn("min-w-0 break-words font-medium", className)} {...props}>{template.name}</span>
}
export function LayoutManagerActive({ className, ...props }: Omit<ComponentProps<typeof Badge>, "children">) {
  const { active } = useLayoutManagerItem()
  const { labels } = useLayoutManager()
  return active ? <Badge variant="outline" data-layout-active="" className={cn("h-4 px-1 text-xs", className)} {...props}>{labels.active}</Badge> : null
}
export function LayoutManagerPanelCount({ className, ...props }: ReadingProps<"span">) {
  const { panelCount } = useLayoutManagerItem()
  const { labels } = useLayoutManager()
  return <span data-layout-panels={panelCount} className={cn("text-muted-foreground lining-nums tabular-nums", className)} {...props}>{fill(labels.panels, { n: String(panelCount) })}</span>
}
export function LayoutManagerSavedAt({ className, ...props }: Omit<ReadingProps<"time">, "dateTime">) {
  const { template } = useLayoutManagerItem()
  // The parser's range, applied to templates handed in directly too: a timestamp
  // toISOString would throw on reads as never saved instead of unmounting the manager.
  const savedAt = Number.isFinite(template.savedAt) && Math.abs(template.savedAt) <= 8.64e15 ? template.savedAt : 0
  return savedAt > 0 ? <time className={cn("text-muted-foreground lining-nums tabular-nums", className)} {...props} dateTime={new Date(savedAt).toISOString()}>{localTime(savedAt)}</time> : null
}
export function LayoutManagerUnknownKinds({ className, ...props }: Omit<ComponentProps<typeof Badge>, "children">) {
  const { missingKinds } = useLayoutManagerItem()
  const { labels } = useLayoutManager()
  return missingKinds.length ? <Badge variant="outline" data-layout-unknown={missingKinds.join(" ")} className={cn("h-auto whitespace-normal px-1 text-xs text-stale", className)} {...props}>{fill(labels.unknownKinds, { kinds: missingKinds.join(", ") })}</Badge> : null
}

export function LayoutManagerRenameField({ className, onChange, onKeyDown, onBlur, ...props }: InputProps) {
  const { template, renaming, name, setName, commitRename, cancelRename } = useItemContext()
  const { labels } = useLayoutManager()
  if (!renaming) return null
  return <Input aria-label={`${labels.rename}: ${template.name}`} autoComplete="off" spellCheck={false} data-layout-rename-field="" className={cn("h-6 w-40 max-w-full rounded-sm px-1.5 py-0 text-xs md:text-xs", className)} {...props} value={name} onChange={(event) => {
    onChange?.(event)
    if (!event.defaultPrevented) setName(event.target.value)
  }} onKeyDown={(event) => {
    onKeyDown?.(event)
    if (event.defaultPrevented) return
    if (event.nativeEvent.isComposing) return
    if (event.key === "Enter" || event.key === "Escape") {
      event.stopPropagation()
      event.preventDefault()
      if (event.key === "Enter") commitRename()
      else cancelRename()
    }
  }} onBlur={(event) => {
    onBlur?.(event)
    if (!event.defaultPrevented) commitRename({ restoreFocus: false })
  }} />
}

export function LayoutManagerLoad({ className, children, onClick, ...props }: ButtonProps) {
  const { asking, load } = useLayoutManagerItem()
  const { labels } = useLayoutManager()
  return <Button type="button" variant={asking === "load" ? "default" : "outline"} size="sm" data-layout-load="" className={cn("h-6 px-2 text-xs", className)} {...props} onClick={(event) => {
    onClick?.(event)
    if (!event.defaultPrevented) load()
  }}>{children ?? (asking === "load" ? labels.loadAnyway : labels.load)}</Button>
}
export function LayoutManagerRename({ className, children, onClick, ...props }: ButtonProps) {
  const { template, rename } = useLayoutManagerItem()
  const { labels } = useLayoutManager()
  return <Button type="button" variant="ghost" size="sm" aria-label={`${labels.rename}: ${template.name}`} className={cn("h-6 px-2 text-xs", className)} {...props} onClick={(event) => {
    onClick?.(event)
    if (!event.defaultPrevented) rename(event.currentTarget)
  }}>{children ?? labels.rename}</Button>
}
export function LayoutManagerDuplicate({ className, children, onClick, ...props }: ButtonProps) {
  const { template, duplicate } = useLayoutManagerItem()
  const { labels } = useLayoutManager()
  return <Button type="button" variant="ghost" size="sm" aria-label={`${labels.duplicate}: ${template.name}`} className={cn("h-6 px-2 text-xs", className)} {...props} onClick={(event) => {
    onClick?.(event)
    if (!event.defaultPrevented) duplicate()
  }}>{children ?? labels.duplicate}</Button>
}
export function LayoutManagerDelete({ className, children, onClick, ...props }: ButtonProps) {
  const { template, asking, remove } = useLayoutManagerItem()
  const { labels } = useLayoutManager()
  const label = asking === "delete" ? labels.deleteAnyway : labels.delete
  return <Button type="button" variant={asking === "delete" ? "destructive" : "ghost"} size="sm" aria-label={`${label}: ${template.name}`} data-layout-delete={asking === "delete" ? "asking" : ""} className={cn("h-6 px-2 text-xs", className)} {...props} onClick={(event) => {
    onClick?.(event)
    if (!event.defaultPrevented) remove()
  }}>{children ?? label}</Button>
}
