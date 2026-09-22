import { useState } from "react"
import type { GridRules } from "@/registry/tradecn/lib/grid-rules"
import { boundaryOf, createPreferences, diffPreferences, exportPreferences, setSlot, type Preferences } from "@/registry/tradecn/lib/preferences"
import type { ColumnState } from "@/registry/tradecn/ui/data-grid"

// One envelope carrying what a desk changes without a build: a workspace layout, two grids' column
// states, hotkey overrides, rules, and a threshold. The boundaries say which of them a desk template
// carries, which are one person's, and which never leave the session.

const LAYOUT = { version: 1, kind: "tradecn-workspace", dockview: { grid: { root: { type: "branch", data: [] } }, panels: {} }, panels: {}, boundaries: {} }
const BLOTTER: ColumnState = { order: ["symbol", "side", "qty", "px"], widths: { px: 120 }, hidden: ["account"] }
const STACK: ColumnState = { order: [], widths: {}, hidden: ["auto"] }
const RULES: GridRules = { columns: [{ id: "rich", column: "px", when: { op: "gt", value: "100-00" }, tone: "up", label: "Rich to the market" }] }

function desk(): Preferences {
  let prefs = createPreferences({ template: ["layout", "rules", "columns:blotter", "columns:stack"], user: ["hotkeys"], session: ["threshold"] })
  prefs = setSlot(prefs, "layout", LAYOUT)
  prefs = setSlot(prefs, "columns:blotter", BLOTTER)
  prefs = setSlot(prefs, "columns:stack", STACK)
  prefs = setSlot(prefs, "hotkeys", { "rfq.send": "mod+shift+enter" })
  prefs = setSlot(prefs, "rules", RULES)
  prefs = setSlot(prefs, "threshold", 5_000_000)
  return prefs
}

export default function PreferencesDemo() {
  const [prefs, setPrefs] = useState(desk)
  const [saved] = useState(desk)
  const diff = diffPreferences(saved, prefs)
  return (
    <div className="grid gap-4 font-(family-name:--tradecn-font-mono) text-xs lining-nums tabular-nums lg:grid-cols-2">
      <div className="space-y-2">
        <table className="w-full">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-1 text-left font-medium">slot</th>
              <th className="py-1 text-left font-medium">boundary</th>
              <th className="py-1 text-right font-medium">version</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(prefs.slots).map(([name, slot]) => (
              <tr key={name} className="border-t border-border" data-slot-row={name}>
                <td className="py-1">{name}</td>
                <td className="py-1 text-muted-foreground">{boundaryOf(prefs, name)}</td>
                <td className="py-1 text-right">{slot.version}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="rounded border border-border px-2 py-0.5" onClick={() => setPrefs((p) => setSlot(p, "threshold", 10_000_000))}>
            threshold to 10mm
          </button>
          <button type="button" className="rounded border border-border px-2 py-0.5" onClick={() => setPrefs((p) => setSlot(p, "columns:blotter", { ...BLOTTER, hidden: [...BLOTTER.hidden, "qty"] }))}>
            hide qty in the blotter
          </button>
          <button type="button" className="rounded border border-border px-2 py-0.5" onClick={() => setPrefs(saved)}>
            back to saved
          </button>
        </div>
        <p className="text-muted-foreground">
          since the save: {diff.changed.length ? `changed ${diff.changed.join(", ")}` : "nothing changed"}
          {diff.added.length ? `, added ${diff.added.join(", ")}` : ""}
          {diff.removed.length ? `, removed ${diff.removed.join(", ")}` : ""}
        </p>
      </div>
      <div className="space-y-2">
        <p className="text-muted-foreground">a desk template: the template slots alone</p>
        <pre className="max-h-40 overflow-auto rounded-md border border-border bg-card p-2">{exportPreferences(prefs, { boundary: "template" })}</pre>
        <p className="text-muted-foreground">my export: those and my own, never the session's threshold</p>
        <pre className="max-h-40 overflow-auto rounded-md border border-border bg-card p-2">{exportPreferences(prefs)}</pre>
      </div>
    </div>
  )
}
