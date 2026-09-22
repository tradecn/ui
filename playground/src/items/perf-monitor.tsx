import { useEffect, useMemo, useState } from "react"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import { DataGrid, type ColumnDef } from "@/registry/tradecn/ui/data-grid"
import { PerfMonitor } from "@/registry/tradecn/ui/perf-monitor"

// A grid under a load you set, with the monitor reading the frames above it. Turn the patches per
// frame up until the p99 crosses the budget and the dropped count moves: that is the number this
// machine can take, and the monitor only shows it.

interface Row {
  id: string
  [k: `c${number}`]: number
}

const COLS = 12
let seed = 0x9e3779b9
function rand(): number {
  seed = (seed * 1664525 + 1013904223) >>> 0
  return seed / 2 ** 32
}

export function PerfMonitorScene() {
  const store = useMemo(() => {
    const s = createRowStore<Row>({ getRowId: (r) => r.id, lane: "coalesced" })
    s.applyDeltas({
      upsert: Array.from({ length: 1000 }, (_, i) => {
        const r: Row = { id: `R${String(i).padStart(4, "0")}` }
        for (let c = 0; c < COLS; c++) r[`c${c}`] = 100 + rand()
        return r
      }),
    })
    return s
  }, [])
  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
      { key: "id", header: "Id", width: 90, frozen: "left", accessor: (r) => r.id },
      ...Array.from({ length: COLS }, (_, c) => ({ key: `c${c}`, header: `C${c}`, width: 80, numeric: true, accessor: (r: Row) => r[`c${c}`], format: (v: unknown) => (v as number).toFixed(3) })),
    ],
    [],
  )
  const [patches, setPatches] = useState(500)
  // One applyDeltas per animation frame with `patches` random cell changes, the way a per-frame core drives a grid.
  useEffect(() => {
    const ids = store.getIds()
    let raf = 0
    const tick = () => {
      const patch: { id: string; fields: Partial<Row> }[] = []
      for (let i = 0; i < patches; i++) {
        const id = ids[Math.floor(rand() * ids.length)]!
        const c = Math.floor(rand() * COLS)
        patch.push({ id, fields: { [`c${c}`]: store.getRow(id)![`c${c}`]! + (rand() - 0.5) * 0.01 } as Partial<Row> })
      }
      if (patch.length) store.applyDeltas({ patch, meta: { lane: "coalesced", dropped: patches > 2000 ? 1 : 0 } })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [store, patches])
  return (
    <main className="mx-auto flex h-screen max-w-5xl flex-col gap-3 p-6 font-mono text-xs">
      <h1 className="text-sm font-semibold">perf-monitor</h1>
      <p className="text-muted-foreground">A thousand rows, twelve columns, one batch of patches per animation frame. Turn the patches up until the p99 crosses the dashed budget line and the dropped count moves. The monitor reads the frames and the lane; it decides nothing.</p>
      <label className="flex items-center gap-2">
        <span className="text-muted-foreground">patches per frame</span>
        <input type="range" min={0} max={4000} step={100} value={patches} onChange={(event) => setPatches(Number(event.target.value))} className="w-64" />
        <span className="tabular-nums">{patches}</span>
      </label>
      <PerfMonitor lanes={[{ label: "Quotes", store }]} readouts={[{ label: "patches/frame", value: String(patches) }]} />
      <div className="min-h-0 flex-1">
        <DataGrid store={store} columns={columns} preset="watchlist" label="Quotes" announceRowCount="off" />
      </div>
    </main>
  )
}
