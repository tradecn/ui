import { cn } from "cn"
import { useEffect, useRef, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { readSlot, setSlot, type Preferences } from "@/registry/tradecn/lib/preferences"
import { parseWorkspaceLayout, unknownPanelKinds, type WorkspaceLayout } from "@/registry/tradecn/lib/workspace-layout"

// Named layouts for a workspace. The workspace hands its layout back and stores nothing; a desk needs
// templates: save the current layout under a name, load one, rename, duplicate, delete with an
// ask-again, import and export the JSON, and go back to the default. The templates are a list the
// consumer keeps, in a `preferences` slot or wherever else, and every change here is a new list handed
// to `onTemplatesChange`. Loading is a request to the consumer, who owns the workspace's api; a layout
// asking for a panel kind the workspace does not have is said before it opens.

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
    out.push({ id: t.id, name: t.name, layout, savedAt: typeof t.savedAt === "number" ? t.savedAt : 0 })
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

export interface LayoutManagerProps {
  templates: readonly LayoutTemplate[]
  /** Every change is a whole new list: save it where you keep it, a preferences slot for one. */
  onTemplatesChange: (templates: LayoutTemplate[]) => void
  /** The workspace's layout as it last handed it over. What `Save current` captures; null disables the button. */
  current?: WorkspaceLayout | null
  /** The trader wants this layout open: hand it to the workspace's `api.load`. */
  onLoad: (layout: WorkspaceLayout, template: LayoutTemplate) => void
  /** The workspace's panel kinds. A template asking for others is said before it opens, and Load asks again. */
  kinds?: Iterable<string>
  /** The template that is open, marked in the list. */
  activeId?: string | null
  /** Given a template's JSON text when its Export is pressed. No button without it. */
  onExport?: (text: string, template: LayoutTemplate) => void
  /** Reset to default: seed the workspace again. No button without it. */
  onReset?: () => void
  /** The clock, for tests. */
  now?: () => number
  labels?: Partial<LayoutManagerLabels>
  className?: string
}

export function LayoutManager({ templates, onTemplatesChange, current = null, onLoad, kinds, activeId = null, onExport, onReset, now, labels: labelsProp, className }: LayoutManagerProps) {
  const labels = { ...DEFAULT_LAYOUT_MANAGER_LABELS, ...labelsProp }
  const clock = now ?? Date.now
  const known = [...(kinds ?? [])]
  const [saveName, setSaveName] = useState("")
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)
  // The ask-again: the id whose destructive or doubtful action was pressed once. Any other press withdraws it.
  const [asking, setAsking] = useState<{ id: string; action: "delete" | "load" } | null>(null)
  const [importing, setImporting] = useState(false)
  const [importText, setImportText] = useState("")
  const [importName, setImportName] = useState("")
  const [importProblem, setImportProblem] = useState<string | null>(null)
  const latest = useRef({ onTemplatesChange, onLoad, onExport, onReset })
  useEffect(() => {
    latest.current = { onTemplatesChange, onLoad, onExport, onReset }
  })
  const change = (next: LayoutTemplate[]) => latest.current.onTemplatesChange(next)
  const nameTaken = templates.some((t) => t.name === saveName.trim())

  const save = () => {
    if (!current || !saveName.trim()) return
    change(saveTemplate(templates, saveName, current, clock()))
    setSaveName("")
  }
  const load = (template: LayoutTemplate) => {
    const missing = known.length ? unknownPanelKinds(template.layout, known) : []
    if (missing.length && !(asking?.id === template.id && asking.action === "load")) {
      setAsking({ id: template.id, action: "load" })
      return
    }
    setAsking(null)
    latest.current.onLoad(template.layout, template)
  }
  const remove = (template: LayoutTemplate) => {
    if (!(asking?.id === template.id && asking.action === "delete")) {
      setAsking({ id: template.id, action: "delete" })
      return
    }
    setAsking(null)
    change(deleteTemplate(templates, template.id))
  }
  const commitRename = () => {
    if (!renaming) return
    change(renameTemplate(templates, renaming.id, renaming.name))
    setRenaming(null)
  }
  const add = () => {
    const next = importTemplate(templates, importText, importName.trim() || `Imported ${localTime(clock())}`, clock())
    if (!next) return setImportProblem(labels.notALayout)
    change(next)
    setImportText("")
    setImportName("")
    setImportProblem(null)
    setImporting(false)
  }

  return (
    <section data-slot="tradecn-layout-manager" aria-label={labels.title} className={cn("flex flex-col gap-2 text-xs lining-nums tabular-nums", className)}>
      <div className="flex items-center gap-1">
        <Input
          value={saveName}
          aria-label={labels.saveName}
          placeholder={labels.saveName}
          autoComplete="off"
          spellCheck={false}
          className="h-7 flex-1 rounded-sm px-2 py-0 text-xs md:text-xs"
          onChange={(event) => setSaveName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") save()
          }}
        />
        <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={!current || !saveName.trim()} data-layout-save="" onClick={save}>
          {labels.save}
        </Button>
        {onReset && (
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" data-layout-reset="" onClick={() => latest.current.onReset?.()}>
            {labels.reset}
          </Button>
        )}
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" aria-expanded={importing} data-layout-import="" onClick={() => setImporting((v) => !v)}>
          {labels.import}
        </Button>
      </div>
      {nameTaken && (
        <p data-layout-taken="" className="text-muted-foreground">
          {fill(labels.taken, { name: saveName.trim() })}
        </p>
      )}
      {importing && (
        <div className="flex flex-col gap-1 rounded-md border border-border p-2">
          <textarea
            value={importText}
            aria-label={labels.pasteLayout}
            placeholder={labels.pasteLayout}
            spellCheck={false}
            rows={4}
            className="w-full rounded-sm border border-input bg-background px-2 py-1 font-(family-name:--tradecn-font-mono) text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            onChange={(event) => {
              setImportText(event.target.value)
              setImportProblem(null)
            }}
          />
          <div className="flex items-center gap-1">
            <Input value={importName} aria-label={labels.saveName} placeholder={labels.saveName} autoComplete="off" spellCheck={false} className="h-7 flex-1 rounded-sm px-2 py-0 text-xs md:text-xs" onChange={(event) => setImportName(event.target.value)} />
            <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={!importText.trim()} data-layout-add="" onClick={add}>
              {labels.add}
            </Button>
          </div>
          {importProblem && (
            <p role="alert" data-layout-import-problem="" className="text-destructive">
              {importProblem}
            </p>
          )}
        </div>
      )}
      {templates.length === 0 ? (
        <p className="text-muted-foreground">{labels.empty}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
          {templates.map((template) => {
            const missing = known.length ? unknownPanelKinds(template.layout, known) : []
            const count = Object.keys(template.layout.panels).length
            const active = template.id === activeId
            const askingHere = asking?.id === template.id ? asking.action : null
            return (
              <li key={template.id} data-layout-template={template.id} data-active={active || undefined} data-unknown-kinds={missing.length || undefined} className="flex flex-wrap items-center gap-x-2 gap-y-1 px-2 py-1.5">
                {renaming?.id === template.id ? (
                  <Input
                    value={renaming.name}
                    aria-label={`${labels.rename}: ${template.name}`}
                    autoFocus
                    autoComplete="off"
                    spellCheck={false}
                    className="h-6 w-40 rounded-sm px-1.5 py-0 text-xs md:text-xs"
                    onChange={(event) => setRenaming({ id: template.id, name: event.target.value })}
                    onBlur={commitRename}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") commitRename()
                      if (event.key === "Escape") setRenaming(null)
                    }}
                  />
                ) : (
                  <span className="min-w-0 truncate font-medium" data-layout-name="">
                    {template.name}
                  </span>
                )}
                {active && (
                  <Badge variant="outline" className="h-4 px-1 text-xs" data-layout-active="">
                    {labels.active}
                  </Badge>
                )}
                <span className="text-muted-foreground" data-layout-panels={count}>
                  {fill(labels.panels, { n: String(count) })}
                </span>
                {template.savedAt > 0 && (
                  <time dateTime={new Date(template.savedAt).toISOString()} className="text-muted-foreground">
                    {localTime(template.savedAt)}
                  </time>
                )}
                {missing.length > 0 && (
                  <Badge variant="outline" className="h-4 px-1 text-xs text-stale" data-layout-unknown={missing.join(" ")}>
                    {fill(labels.unknownKinds, { kinds: missing.join(", ") })}
                  </Badge>
                )}
                <span className="ml-auto flex items-center gap-0.5">
                  <Button type="button" variant={askingHere === "load" ? "default" : "outline"} size="sm" className="h-6 px-2 text-xs" data-layout-load="" onClick={() => load(template)}>
                    {askingHere === "load" ? labels.loadAnyway : labels.load}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" aria-label={`${labels.rename}: ${template.name}`} onClick={() => setRenaming({ id: template.id, name: template.name })}>
                    {labels.rename}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" aria-label={`${labels.duplicate}: ${template.name}`} onClick={() => change(duplicateTemplate(templates, template.id, clock(), undefined, labels))}>
                    {labels.duplicate}
                  </Button>
                  {onExport && (
                    <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" aria-label={`${labels.export}: ${template.name}`} onClick={() => latest.current.onExport?.(exportTemplate(template), template)}>
                      {labels.export}
                    </Button>
                  )}
                  <Button type="button" variant={askingHere === "delete" ? "destructive" : "ghost"} size="sm" className="h-6 px-2 text-xs" aria-label={`${askingHere === "delete" ? labels.deleteAnyway : labels.delete}: ${template.name}`} data-layout-delete={askingHere === "delete" ? "asking" : ""} onClick={() => remove(template)}>
                    {askingHere === "delete" ? labels.deleteAnyway : labels.delete}
                  </Button>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
