import { cn } from "cn"
import { useMemo, useState, type KeyboardEvent } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { useHotkeyList, useHotkeys } from "@/registry/tradecn/hooks/use-hotkeys"
import { formatKeys, keysFromEvent, type HotkeyConflict, type HotkeyEntry, type HotkeyOverrides } from "@/registry/tradecn/lib/hotkeys"

// The settings screen for the hotkey registry: every binding, grouped, with its keys in force, and
// three ways to change one. Press the new shortcut on a row, type a chord as text, or take it back to
// its default. Conflicts are said under the row they touch, in words. The registry does the work and
// tells the consumer's persistence through its own onChange; this only draws the list and asks.

export interface HotkeyEditorLabels {
  title: string
  search: string
  change: string
  pressKeys: string
  edit: string
  unbound: string
  reset: string
  resetAll: string
  export: string
  import: string
  remapped: string
  keysFor: string
  notKeys: string
  empty: string
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
  resetAll: "Reset all",
  export: "Export",
  import: "Import",
  remapped: "changed",
  keysFor: "Keys for",
  notKeys: "Not a shortcut. Write keys joined by +, steps of a chord separated by a space: mod+k, g b.",
  empty: "No shortcut matches.",
  duplicate: "same keys as",
  prefix: "starts the chord of",
  shadow: "hides, while focus is in this panel,",
  cancelHint: "Escape cancels, Backspace unbinds",
}

export interface HotkeyEditorProps {
  /** Show the Export button; called with the overrides as the registry holds them. */
  onExport?: (overrides: HotkeyOverrides) => void
  /** Show the Import button; you open your picker and call `registry.load`. */
  onImport?: () => void
  /** Hide a binding from the list. */
  hide?: (entry: HotkeyEntry) => boolean
  labels?: Partial<HotkeyEditorLabels>
  className?: string
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

function Keys({ keys, platform, unbound }: { keys: string; platform: "mac" | "other"; unbound: string }) {
  if (!keys) return <span className="text-muted-foreground">{unbound}</span>
  const steps = formatKeys(keys, platform)
  return (
    <span className="inline-flex items-center gap-1">
      {steps.map((caps, i) => (
        <KbdGroup key={i}>
          {caps.map((cap) => (
            <Kbd key={cap}>{cap}</Kbd>
          ))}
        </KbdGroup>
      ))}
    </span>
  )
}

interface RowProps {
  entry: HotkeyEntry
  conflicts: HotkeyConflict[]
  byId: Map<string, HotkeyEntry>
  labels: HotkeyEditorLabels
}

function Row({ entry, conflicts, byId, labels }: RowProps) {
  const registry = useHotkeys()
  const [mode, setMode] = useState<"idle" | "capture" | "text">("idle")
  const [text, setText] = useState("")
  const [problem, setProblem] = useState<string | null>(null)

  function commit(keys: string) {
    try {
      registry.remap(entry.id, keys)
      setProblem(null)
      setMode("idle")
    } catch {
      setProblem(labels.notKeys)
    }
  }

  // The keydown is ours: preventDefault keeps the registry's own listener out of it.
  function capture(event: KeyboardEvent<HTMLButtonElement>) {
    event.preventDefault()
    event.stopPropagation()
    if (event.key === "Escape") return setMode("idle")
    if (event.key === "Backspace" || event.key === "Delete") return commit("")
    const keys = keysFromEvent(event.nativeEvent)
    if (keys) commit(keys)
  }

  function typed(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault()
      commit(text)
    } else if (event.key === "Escape") {
      event.preventDefault()
      setMode("idle")
      setProblem(null)
    }
  }

  const other = (c: HotkeyConflict) => byId.get(c.ids[0] === entry.id ? c.ids[1] : c.ids[0])
  return (
    <div className="flex flex-col gap-1 border-b border-border py-1.5 last:border-b-0" data-hotkey-row={entry.id} data-remapped={entry.remapped || undefined}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1">
          {entry.description}
          {entry.remapped && (
            <Badge variant="outline" className="ml-2 h-4 px-1 text-[10px]">
              {labels.remapped}
            </Badge>
          )}
        </span>
        {mode === "capture" ? (
          <Button type="button" variant="outline" size="sm" className="h-6 px-2 text-xs" autoFocus aria-pressed data-hotkey-capture onKeyDown={capture} onBlur={() => setMode("idle")}>
            {labels.pressKeys}
            <span className="sr-only">, {labels.cancelHint}</span>
          </Button>
        ) : mode === "text" ? (
          <Input autoFocus value={text} aria-label={`${labels.keysFor} ${entry.description}`} aria-invalid={problem ? true : undefined} spellCheck={false} autoComplete="off" className="h-6 w-36 px-1.5 font-mono text-xs md:text-xs" onChange={(event) => setText(event.target.value)} onKeyDown={typed} onBlur={() => setMode("idle")} />
        ) : (
          <span data-hotkey-keys={entry.keys}>
            <Keys keys={entry.keys} platform={registry.platform} unbound={labels.unbound} />
          </span>
        )}
        <span className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="sm" className="h-6 px-1.5 text-xs" aria-label={`${labels.change}: ${entry.description}`} disabled={mode !== "idle"} onClick={() => setMode("capture")}>
            {labels.change}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-xs"
            aria-label={`${labels.edit}: ${entry.description}`}
            disabled={mode !== "idle"}
            onClick={() => {
              setText(entry.keys)
              setProblem(null)
              setMode("text")
            }}
          >
            {labels.edit}
          </Button>
          {entry.remapped && (
            <Button type="button" variant="ghost" size="sm" className="h-6 px-1.5 text-xs" aria-label={`${labels.reset}: ${entry.description}`} onClick={() => registry.reset(entry.id)}>
              {labels.reset}
            </Button>
          )}
        </span>
      </div>
      {problem && (
        <p className="text-destructive" data-hotkey-problem>
          {problem}
        </p>
      )}
      {conflicts.length > 0 && (
        <ul className="text-stale" data-hotkey-conflicts>
          {conflicts.map((c, i) => {
            const o = other(c)
            return (
              <li key={i}>
                {c.kind === "duplicate" ? labels.duplicate : c.kind === "prefix" ? labels.prefix : labels.shadow} {o ? `"${o.description}"` : c.ids.join(", ")}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export function HotkeyEditor({ onExport, onImport, hide, labels: labelsProp, className }: HotkeyEditorProps) {
  const labels = { ...DEFAULT_HOTKEY_EDITOR_LABELS, ...labelsProp }
  const registry = useHotkeys()
  const entries = useHotkeyList()
  // The list's identity changes exactly when the registry emits, and the conflicts change with it.
  const conflicts = useMemo(() => {
    void entries
    return registry.conflicts()
  }, [registry, entries])
  const [query, setQuery] = useState("")
  const shown = useMemo(() => entries.filter((e) => !hide?.(e) && matchesQuery(e, query, registry.platform)), [entries, hide, query, registry.platform])
  // Named groups first, in order; then the groups a scope gave its name to.
  const groups = useMemo(() => {
    const map = new Map<string, HotkeyEntry[]>()
    const rank = (e: HotkeyEntry) => (e.group ? 0 : 1)
    for (const entry of [...shown].sort((a, b) => rank(a) - rank(b) || groupOf(a).localeCompare(groupOf(b)) || a.description.localeCompare(b.description))) {
      const g = groupOf(entry)
      map.set(g, [...(map.get(g) ?? []), entry])
    }
    return [...map.entries()]
  }, [shown])
  const byId = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries])
  const remapped = entries.filter((e) => e.remapped).length
  return (
    <div role="region" aria-label={labels.title} data-slot="tradecn-hotkey-editor" data-remapped={remapped} className={cn("flex flex-col gap-2 text-xs", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Input value={query} aria-label={labels.search} placeholder={labels.search} spellCheck={false} autoComplete="off" className="h-7 max-w-64 font-mono text-xs md:text-xs" onChange={(event) => setQuery(event.target.value)} />
        <span className="ml-auto flex items-center gap-1">
          {onImport && (
            <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={onImport}>
              {labels.import}
            </Button>
          )}
          {onExport && (
            <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => onExport(registry.overrides())}>
              {labels.export}
            </Button>
          )}
          <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={remapped === 0} onClick={() => registry.reset()}>
            {labels.resetAll}
          </Button>
        </span>
      </div>
      {groups.length === 0 && <p className="text-muted-foreground">{labels.empty}</p>}
      {groups.map(([group, list]) => (
        <section key={group} aria-label={group} data-hotkey-group={group}>
          <h3 className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{group}</h3>
          {list.map((entry) => (
            <Row key={entry.id} entry={entry} conflicts={conflicts.filter((c) => c.ids.includes(entry.id))} byId={byId} labels={labels} />
          ))}
        </section>
      ))}
    </div>
  )
}
