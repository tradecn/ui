import { useEffect, useMemo, useState } from "react"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import { DataGrid, type ColumnDef } from "@/registry/tradecn/ui/data-grid"
import { PerfMonitor } from "@/registry/tradecn/ui/perf-monitor"

// A grid under a load you set, with the monitor reading the frames above it.
interface Row {
  id: string
  [k: `c${number}`]: number
}

const COLS = 8
let seed = 0x9e3779b9
function rand(): number {
  seed = (seed * 1664525 + 1013904223) >>> 0
  return seed / 2 ** 32
}

export default function PerfMonitorDemo() {
  const store = useMemo(() => {
    const s = createRowStore<Row>({ getRowId: (r) => r.id, lane: "coalesced" })
    s.applyDeltas({
      upsert: Array.from({ length: 300 }, (_, i) => {
        const r: Row = { id: `R${String(i).padStart(3, "0")}` }
        for (let c = 0; c < COLS; c++) r[`c${c}`] = 100 + rand()
        return r
      }),
    })
    return s
  }, [])
  const columns = useMemo<ColumnDef<Row>[]>(() => [{ key: "id", header: "Id", width: 72, frozen: "left", accessor: (r) => r.id }, ...Array.from({ length: COLS }, (_, c) => ({ key: `c${c}`, header: `C${c}`, width: 76, numeric: true, accessor: (r: Row) => r[`c${c}`], format: (v: unknown) => (v as number).toFixed(3) }))], [])
  const [patches, setPatches] = useState(300)
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
      if (patch.length) store.applyDeltas({ patch })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [store, patches])
  return (
    <div className="space-y-2 font-mono text-xs">
      <label className="flex items-center gap-2">
        <span className="text-muted-foreground">patches per frame</span>
        <input type="range" min={0} max={3000} step={100} value={patches} onChange={(event) => setPatches(Number(event.target.value))} className="w-48" />
        <span className="tabular-nums">{patches}</span>
      </label>
      <PerfMonitor lanes={[{ label: "Quotes", store }]} readouts={[{ label: "patches/frame", value: String(patches) }]} />
      <div className="h-48">
        <DataGrid store={store} columns={columns} preset="watchlist" label="Quotes" announceRowCount="off" />
      </div>
      <p className="text-muted-foreground">Turn the patches up until the p99 crosses the budget line. The monitor shows the number; what it means is decided on the machine that matters, against a threshold written before the run.</p>
    </div>
  )
}
