import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import type { EditChange } from "@/registry/tradecn/ui/data-grid"
import { ParameterGrid, type ParameterDef, type ParameterRow } from "@/registry/tradecn/ui/parameter-grid"

// A pricing sheet over a pretend server. The server owns every value: an edit goes out as a command,
// the cell waits, and the row comes back with the value, or the server refuses and says why. Another
// hand on the sheet (a colleague, an auto-calibration) shows as a change with the mark and a flash.

interface Sheet extends ParameterRow {
  skew: number | null
  width: number
  maxSize: number
  minSize: number
  hedge: number
  note: string
}

const PARAMETERS: ParameterDef<Sheet>[] = [
  { key: "skew", header: "Skew", width: 88, accessor: (r) => r.skew, step: 0.25, min: -5, max: 5 },
  { key: "width", header: "Width", width: 88, accessor: (r) => r.width, step: 0.5, min: 0.5 },
  { key: "minSize", header: "Min size", width: 88, accessor: (r) => r.minSize, decimals: 0, step: 1, min: 0 },
  { key: "maxSize", header: "Max size", width: 88, accessor: (r) => r.maxSize, decimals: 0, step: 5, min: 0, validate: (v, row) => (typeof v === "number" && v < row.minSize ? { problem: `Below the minimum size of ${row.minSize}.` } : null) },
  { key: "hedge", header: "Hedge ratio", width: 96, accessor: (r) => r.hedge, decimals: 3, readOnly: true },
  { key: "note", header: "Note", width: 160, accessor: (r) => r.note, numeric: false, parse: (t) => t.trim() },
]

const INSTRUMENTS = ["TU", "3Y", "FV", "TY", "UXY", "US", "WN", "TUF", "TUT", "FYT", "NOB", "NOL"]

function seed(now: number): Sheet[] {
  return INSTRUMENTS.map((name, i) => ({
    id: name,
    name,
    enabled: i % 5 !== 4,
    allowedActions: i === INSTRUMENTS.length - 1 ? [] : i % 7 === 6 ? ["edit"] : ["toggle", "edit"],
    skew: i % 4 === 3 ? null : ((i % 5) - 2) * 0.25,
    width: 0.5 + (i % 6) * 0.5,
    minSize: 1 + (i % 3),
    maxSize: [200, 100, 50, 25, 20, 10][i % 6]!,
    hedge: Number((0.25 + i * 0.1).toFixed(3)),
    note: i % 3 === 0 ? "" : i % 3 === 1 ? "tighter on the run" : "wide into the number",
    updatedAt: now - (INSTRUMENTS.length - i) * 600_000,
    updatedBy: i % 2 ? "desk" : "auto",
  }))
}

export function ParameterGridScene() {
  const [openedAt] = useState(() => Date.now())
  // A lazy state, not a memo: Date.now() in a memo trips the compiler's purity rule.
  const [store] = useState(() => {
    const s = createRowStore<Sheet>({ getRowId: (r) => r.id })
    const now = Date.now()
    s.applyDeltas({ upsert: seed(now), meta: { producedAt: now } })
    return s
  })
  const [latency, setLatency] = useState(400)
  const [log, setLog] = useState<string[]>([])
  const say = (line: string) => setLog((l) => [line, ...l].slice(0, 8))

  // The pretend server: a width over 8 is refused by risk, everything else is written back after the latency.
  const onEdit = (change: EditChange<Sheet>) =>
    new Promise<void>((resolve, reject) => {
      setTimeout(() => {
        if (change.key === "width" && typeof change.value === "number" && change.value > 8) {
          say(`${change.rowId} ${change.key} ${String(change.value)}: refused`)
          return reject(new Error("Risk declined a width over 8"))
        }
        const now = Date.now()
        store.applyDeltas({ patch: [{ id: change.rowId, fields: { [change.key]: change.value, updatedAt: now, updatedBy: "you" } as Partial<Sheet> }], meta: { producedAt: now } })
        say(`${change.rowId} ${change.key} ${String(change.previous)} → ${String(change.value)}`)
        resolve()
      }, latency)
    })

  // Another hand: every few seconds a row's width moves on the server.
  useEffect(() => {
    const t = setInterval(() => {
      const ids = store.getIds()
      const id = ids[Math.floor(Math.random() * ids.length)]!
      const row = store.getRow(id)!
      const now = Date.now()
      store.applyDeltas({ patch: [{ id, fields: { width: Math.max(0.5, row.width + (Math.random() < 0.5 ? -0.5 : 0.5)), updatedAt: now, updatedBy: "auto" } }], meta: { producedAt: now } })
    }, 6000)
    return () => clearInterval(t)
  }, [store])

  return (
    <main className="flex h-screen flex-col gap-3 p-4 font-(family-name:--tradecn-font-mono) text-xs">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-sm font-semibold">parameter-grid</h1>
        <span className="text-muted-foreground">Enter, F2, a double click, or typing opens a cell; Enter commits, Escape reverts, Tab moves, the arrows step. The server answers after the latency; a width over 8 is refused. The last row allows nothing.</span>
        <label className="ml-auto flex items-center gap-2">
          latency {latency} ms
          <input type="range" min={0} max={2000} step={100} value={latency} onChange={(e) => setLatency(Number(e.target.value))} />
        </label>
        <Button type="button" variant="outline" size="sm" onClick={() => store.applyDeltas({ upsert: seed(Date.now()), meta: { producedAt: Date.now() } })}>
          Reset sheet
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        <ParameterGrid store={store} parameters={PARAMETERS} onEdit={onEdit} changedSince={openedAt} />
      </div>
      <pre className="h-28 overflow-auto rounded-md border border-border bg-card p-2 text-muted-foreground">{log.join("\n") || "the server's log"}</pre>
    </main>
  )
}
