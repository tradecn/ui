import { useEffect, useMemo, useRef, useState } from "react"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import { DataGrid, DATA_GRID_PRESETS, type ColumnDef, type DataGridPreset } from "@/registry/tradecn/ui/data-grid"

// The browser bench. Drives the grid the way a per-frame core would: one applyDeltas per animation
// frame with `updates` random cell patches, for `seconds`. Records frame-to-frame time from rAF,
// long tasks from PerformanceObserver, and how many patched cells landed in the visible window.
// Results go on window.__tradecnBench for scripts/bench.ts to read. Nothing here writes a file.

export interface BenchParams {
  rows: number
  visible: number
  cols: number
  updates: number
  seconds: number
  preset: DataGridPreset
  hold: number
}

export interface BenchResult {
  done: boolean
  params: BenchParams
  frames: number
  p50: number
  p99: number
  max: number
  mean: number
  droppedFrames: number
  longTasks: number
  cellsPaintedPerFrame: number
  userAgent: string
}

declare global {
  interface Window {
    __tradecnBench?: BenchResult
  }
}

interface Row {
  id: string
  [k: `c${number}`]: number
}

function readParams(): BenchParams {
  const q = new URLSearchParams(window.location.search)
  const n = (k: string, d: number) => {
    const v = Number(q.get(k))
    return Number.isFinite(v) && v > 0 ? v : d
  }
  const preset = (q.get("preset") ?? "rfq") as DataGridPreset
  return { rows: n("rows", 1000), visible: n("visible", 60), cols: n("cols", 12), updates: n("updates", 2000), seconds: n("seconds", 10), preset: preset in DATA_GRID_PRESETS ? preset : "rfq", hold: Number(q.get("hold") ?? 0) }
}

// Deterministic values so two runs see the same data.
let seed = 0x9e3779b9
function rand(): number {
  seed = (seed * 1664525 + 1013904223) >>> 0
  return seed / 2 ** 32
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[i]!
}

export function BenchPage() {
  const params = useMemo(() => readParams(), [])
  const rowHeight = DATA_GRID_PRESETS[params.preset].rowHeight
  const store = useMemo(() => {
    const s = createRowStore<Row>({ getRowId: (r) => r.id })
    s.applyDeltas({
      upsert: Array.from({ length: params.rows }, (_, i) => {
        const r: Row = { id: `R${String(i).padStart(5, "0")}` }
        for (let c = 0; c < params.cols; c++) r[`c${c}`] = 100 + rand()
        return r
      }),
    })
    return s
  }, [params])
  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
      { key: "id", header: "Id", width: 90, frozen: "left", accessor: (r) => r.id },
      ...Array.from({ length: params.cols }, (_, c) => ({
        key: `c${c}`,
        header: `C${c}`,
        width: 80,
        numeric: true,
        accessor: (r: Row) => r[`c${c}`],
        format: (v: unknown) => (v as number).toFixed(3),
      })),
    ],
    [params.cols],
  )
  const [result, setResult] = useState<BenchResult | null>(null)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    const ids = store.getIds()
    const deltas: number[] = []
    let painted = 0
    let longTasks = 0
    let observer: PerformanceObserver | null = null
    try {
      observer = new PerformanceObserver((list) => {
        longTasks += list.getEntries().length
      })
      observer.observe({ type: "longtask", buffered: false })
    } catch {
      observer = null
    }
    let last = -1
    let raf = 0
    const visibleCount = Math.min(params.visible + 8, ids.length)
    const end = performance.now() + params.seconds * 1000
    const tick = (t: number) => {
      if (last >= 0) deltas.push(t - last)
      last = t
      const patch: { id: string; fields: Partial<Row> }[] = []
      let hits = 0
      for (let i = 0; i < params.updates; i++) {
        const idx = Math.floor(rand() * ids.length)
        const c = Math.floor(rand() * params.cols)
        const id = ids[idx]!
        const cur = store.getRow(id)![`c${c}`]!
        patch.push({ id, fields: { [`c${c}`]: cur + (rand() - 0.5) * 0.01 } as Partial<Row> })
        if (idx < visibleCount) hits++
      }
      store.applyDeltas({ patch })
      painted += hits
      if (t < end) {
        raf = requestAnimationFrame(tick)
        return
      }
      observer?.disconnect()
      const sorted = [...deltas].sort((a, b) => a - b)
      const r: BenchResult = {
        done: true,
        params,
        frames: deltas.length,
        p50: percentile(sorted, 50),
        p99: percentile(sorted, 99),
        max: sorted[sorted.length - 1] ?? 0,
        mean: deltas.reduce((a, b) => a + b, 0) / Math.max(1, deltas.length),
        droppedFrames: deltas.filter((d) => d > 33.4).length,
        longTasks,
        cellsPaintedPerFrame: painted / Math.max(1, deltas.length),
        userAgent: navigator.userAgent,
      }
      window.__tradecnBench = r
      setResult(r)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [store, params])

  return (
    <main className="flex h-screen flex-col gap-2 p-3 font-mono text-xs">
      <div className="flex items-center gap-4">
        <h1 className="text-sm font-semibold">bench</h1>
        <span className="text-muted-foreground">
          {params.rows} rows, {params.visible} visible, {params.cols} cols, {params.updates} patches/frame, {params.seconds}s, preset {params.preset}
        </span>
        {result ? (
          <span data-testid="result" className="ml-auto">
            frames {result.frames} p50 {result.p50.toFixed(2)} p99 {result.p99.toFixed(2)} max {result.max.toFixed(2)} dropped {result.droppedFrames} long {result.longTasks} cells/frame {result.cellsPaintedPerFrame.toFixed(0)}
          </span>
        ) : (
          <span className="ml-auto text-muted-foreground">running</span>
        )}
      </div>
      <div style={{ height: params.visible * rowHeight + rowHeight + 2 }}>
        <DataGrid store={store} columns={columns} preset={params.preset} reorderHoldMs={params.hold} label="Bench" announceRowCount="off" />
      </div>
    </main>
  )
}
