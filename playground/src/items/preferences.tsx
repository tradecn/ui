import { useState } from "react"
import type { GridRules } from "@/registry/tradecn/lib/grid-rules"
import { boundaryOf, createPreferences, diffPreferences, exportPreferences, importPreferences, migratePreferences, parsePreferences, readSlot, setSlot, type PreferenceMigrators, type Preferences } from "@/registry/tradecn/lib/preferences"
import type { ColumnState } from "@/registry/tradecn/ui/data-grid"

// The envelope end to end: build one from the items' own shapes, change a slot and watch the diff,
// export it two ways, paste an export back in under a boundary, and bring an old slot up through a
// migrator. Everything on this page is the lib; nothing is stored anywhere but React state.

const LAYOUT = { version: 1, kind: "tradecn-workspace", dockview: { grid: { root: { type: "branch", data: [] } }, panels: {} }, panels: {}, boundaries: {} }
const BLOTTER: ColumnState = { order: ["symbol", "side", "qty", "px"], widths: { px: 120 }, hidden: ["account"] }
const STACK: ColumnState = { order: [], widths: {}, hidden: ["auto"] }
const RULES: GridRules = { columns: [{ id: "rich", column: "px", when: { op: "gt", value: "100-00" }, tone: "up", label: "Rich to the market" }] }

// A build that once kept a grid's widths as a list of pairs reads them back through this.
const MIGRATORS: PreferenceMigrators = {
  "columns:blotter": {
    version: 2,
    migrate: (value, from) => (from === 1 && typeof value === "object" && value !== null && !Array.isArray(value) ? { ...value, widths: Object.fromEntries((value.widths as [string, number][]) ?? []) } : null),
  },
}

function desk(): Preferences {
  let prefs = createPreferences({ template: ["layout", "rules", "columns:blotter", "columns:stack"], user: ["hotkeys"], session: ["threshold"] })
  prefs = setSlot(prefs, "layout", LAYOUT)
  prefs = setSlot(prefs, "columns:blotter", BLOTTER, 2)
  prefs = setSlot(prefs, "columns:stack", STACK)
  prefs = setSlot(prefs, "hotkeys", { "rfq.send": "mod+shift+enter" })
  prefs = setSlot(prefs, "rules", RULES)
  prefs = setSlot(prefs, "threshold", 5_000_000)
  return prefs
}

const OLD_EXPORT = JSON.stringify({ tradecn: "preferences", version: 1, slots: { "columns:blotter": { version: 1, value: { order: [], widths: [["px", 140]], hidden: [] } }, hotkeys: { version: 1, value: { "go.blotter": "g b" } } }, boundaries: { template: ["columns:blotter"], user: ["hotkeys"], session: [] } }, null, 2)

export function PreferencesScene() {
  const [prefs, setPrefs] = useState(desk)
  const [saved, setSaved] = useState(desk)
  const [text, setText] = useState(OLD_EXPORT)
  const [note, setNote] = useState("")
  const diff = diffPreferences(saved, prefs)
  const blotter = readSlot<ColumnState>(prefs, "columns:blotter", MIGRATORS["columns:blotter"])
  const doImport = (boundary: "template" | "user") => {
    const parsed = parsePreferences(text)
    if (!parsed) return setNote("not an envelope")
    const merged = importPreferences(prefs, parsed, { boundary })
    if (!merged) return setNote("not an envelope")
    const moved = migratePreferences(merged, MIGRATORS)
    setPrefs(moved)
    setNote(`imported as ${boundary}: ${diffPreferences(prefs, moved).changed.concat(diffPreferences(prefs, moved).added).join(", ") || "nothing new"}`)
  }
  return (
    <main className="mx-auto max-w-6xl space-y-4 p-6 font-(family-name:--tradecn-font-mono) text-xs lining-nums tabular-nums">
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-sm font-semibold">preferences</h1>
        <span className="text-muted-foreground">One envelope, six slots, three boundaries. Change a slot, export it two ways, paste an old export back in, and watch a version-1 grid state come up to version 2.</span>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-2">
          <table className="w-full" data-prefs-slots={Object.keys(prefs.slots).length}>
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-1 text-left font-medium">slot</th>
                <th className="py-1 text-left font-medium">boundary</th>
                <th className="py-1 pr-2 text-right font-medium">version</th>
                <th className="py-1 text-left font-medium">value</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(prefs.slots).map(([name, slot]) => (
                <tr key={name} className="border-t border-border align-top" data-slot-row={name} data-slot-version={slot.version}>
                  <td className="py-1 pr-2">{name}</td>
                  <td className="py-1 pr-2 text-muted-foreground">{boundaryOf(prefs, name)}</td>
                  <td className="py-1 pr-2 text-right">{slot.version}</td>
                  <td className="max-w-64 truncate py-1 text-muted-foreground" title={JSON.stringify(slot.value)}>
                    {JSON.stringify(slot.value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="rounded border border-border px-2 py-0.5" onClick={() => setPrefs((p) => setSlot(p, "threshold", (readSlot<number>(p, "threshold") ?? 0) + 5_000_000))}>
              threshold +5mm
            </button>
            <button type="button" className="rounded border border-border px-2 py-0.5" onClick={() => setPrefs((p) => setSlot(p, "columns:blotter", { ...(readSlot<ColumnState>(p, "columns:blotter") ?? BLOTTER), hidden: ["account", "qty"] }, 2))}>
              hide qty in the blotter
            </button>
            <button type="button" className="rounded border border-border px-2 py-0.5" onClick={() => setSaved(prefs)}>
              save
            </button>
            <button type="button" className="rounded border border-border px-2 py-0.5" onClick={() => setPrefs(saved)}>
              back to saved
            </button>
          </div>
          <p className="text-muted-foreground" data-prefs-diff={diff.changed.concat(diff.added, diff.removed).join(",")}>
            since the save: {diff.changed.length + diff.added.length + diff.removed.length === 0 ? "nothing changed" : [diff.changed.length && `changed ${diff.changed.join(", ")}`, diff.added.length && `added ${diff.added.join(", ")}`, diff.removed.length && `removed ${diff.removed.join(", ")}`].filter(Boolean).join("; ")}
          </p>
          <p className="text-muted-foreground">the blotter's widths as the grid reads them: {JSON.stringify(blotter?.widths)}</p>
        </section>
        <section className="space-y-2">
          <p className="text-muted-foreground">a desk template: the template slots alone</p>
          <pre className="max-h-40 overflow-auto rounded-md border border-border bg-card p-2" data-prefs-template>
            {exportPreferences(prefs, { boundary: "template" })}
          </pre>
          <p className="text-muted-foreground">my export: those and my own, never the session's threshold</p>
          <pre className="max-h-40 overflow-auto rounded-md border border-border bg-card p-2" data-prefs-export>
            {exportPreferences(prefs)}
          </pre>
          <p className="text-muted-foreground">paste an export to import it (this one is from an older build: its blotter widths are a list of pairs)</p>
          <textarea className="h-32 w-full rounded-md border border-border bg-background p-2" value={text} spellCheck={false} onChange={(event) => setText(event.target.value)} aria-label="an envelope to import" />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="rounded border border-border px-2 py-0.5" onClick={() => doImport("template")}>
              import as a template
            </button>
            <button type="button" className="rounded border border-border px-2 py-0.5" onClick={() => doImport("user")}>
              import as mine
            </button>
            <span className="text-muted-foreground" data-prefs-note>
              {note}
            </span>
          </div>
        </section>
      </div>
    </main>
  )
}
