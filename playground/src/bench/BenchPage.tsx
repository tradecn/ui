import { useEffect, useMemo, useRef, useState } from "react"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import { DataGrid, DATA_GRID_PRESETS, type ColumnDef, type DataGridPreset } from "@/registry/tradecn/ui/data-grid"
import { RfqStack, bySize, byTimeLeft, stackOrder, useRfqStackView, type RfqStackRow } from "@/registry/tradecn/ui/rfq-stack"

// The browser bench. Two scenarios. `updates` drives the grid the way a per-frame core would: one
// applyDeltas per animation frame with `updates` random cell patches, for `seconds`. `arrivals` is
// the burst at the close: a stack of open inquiries sorted by size then time left, a focused row and
// an active inquiry set mid-screen, then `arrivals` new inquiries spread over `burstMs`, with
// countdown cells in every visible row; it also checks that the focused row, the active inquiry, and
// the first visible row never move. Both record frame-to-frame time from rAF, long tasks from
// PerformanceObserver, and script time per frame. Results go on window.__tradecnBench for
// scripts/bench.ts to read. Nothing here writes a file.

export type BenchScenario = "updates" | "arrivals"

export interface BenchParams {
  scenario: BenchScenario
  rows: number
  visible: number
  cols: number
  updates: number
  seconds: number
  preset: DataGridPreset
  hold: number
  /** Milliseconds discarded at the start (page load, JIT warm-up). The load runs throughout. */
  warmupMs: number
  /** Arrivals scenario: how many new inquiries, over how long, from the end of the warm-up. */
  arrivals: number
  burstMs: number
}

export interface BenchInvariants {
  /** The focused row's id never changed. */
  focusedHeld: boolean
  /** The active inquiry's id never changed. */
  activeHeld: boolean
  /** The row at the top of the viewport never changed. */
  firstVisibleHeld: boolean
  /** How many inquiries arrived. */
  arrived: number
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
  /** A frame counts as dropped when it runs longer than this: 1.5 times the median frame. */
  droppedThresholdMs: number
  /** Index (after warm-up) and length of each dropped frame, to see whether drops cluster. */
  droppedAt: { frame: number; ms: number; scriptMs: number }[]
  longTasks: number
  cellsPaintedPerFrame: number
  /** Script time per frame: building the batch, applyDeltas, and React's render and commit. Excludes style, layout, paint. */
  scriptP50: number
  scriptP99: number
  scriptMax: number
  userAgent: string
  /** Arrivals scenario only. */
  invariants?: BenchInvariants
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
  return {
    scenario: q.get("scenario") === "arrivals" ? "arrivals" : "updates",
    rows: n("rows", 1000),
    visible: n("visible", 60),
    cols: n("cols", 12),
    updates: n("updates", 2000),
    seconds: n("seconds", 10),
    preset: preset in DATA_GRID_PRESETS ? preset : "rfq",
    hold: Number(q.get("hold") ?? 0),
    warmupMs: Number(q.get("warmupMs") ?? 1000),
    arrivals: n("arrivals", 2000),
    burstMs: n("burstMs", 2000),
  }
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

/** The frame recorder both scenarios share: rAF gaps, script time to the microtask after React's commit, long tasks, and the summary. */
function useFrameRun(params: BenchParams, work: (t: number, frame: number) => number, finish: () => Partial<BenchResult>, deps: unknown[]) {
  const [result, setResult] = useState<BenchResult | null>(null)
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    // Every frame is recorded with its timestamp and the warm-up is cut by timestamp at the end.
    // Nothing in the hot loop changes shape at the warm-up boundary: clearing arrays or reassigning
    // the end time mid-run deoptimizes the loop and shows up as one slow frame that is the bench's own.
    const deltas: number[] = []
    const stamps: number[] = []
    const script: number[] = []
    const hitsPerFrame: number[] = []
    const longTaskStarts: number[] = []
    let observer: PerformanceObserver | null = null
    try {
      observer = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) longTaskStarts.push(e.startTime)
      })
      observer.observe({ type: "longtask", buffered: false })
    } catch {
      observer = null
    }
    let last = -1
    let raf = 0
    let measureStart = 0
    let end = 0
    let frame = 0
    const tick = (t: number) => {
      const frameStart = performance.now()
      if (last < 0) {
        measureStart = t + params.warmupMs
        end = measureStart + params.seconds * 1000
        window.__tradecnBenchMeasureStart = measureStart
      } else {
        deltas.push(t - last)
        stamps.push(t)
      }
      last = t
      const hits = work(t, frame++)
      // React renders the woken rows in a microtask it queued during applyDeltas; this one runs after it.
      queueMicrotask(() => script.push(performance.now() - frameStart))
      hitsPerFrame.push(hits)
      if (t < end) {
        raf = requestAnimationFrame(tick)
        return
      }
      observer?.disconnect()
      // deltas[i] is the interval that ended at frame i+1; script[i] is the work of the frame before that interval.
      const from = Math.max(0, stamps.findIndex((s) => s >= measureStart))
      const measured = deltas.slice(from)
      const measuredScript = script.slice(from, from + measured.length)
      const measuredHits = hitsPerFrame.slice(from, from + measured.length)
      const sorted = [...measured].sort((a, b) => a - b)
      const droppedThresholdMs = percentile(sorted, 50) * 1.5
      const scriptSorted = [...measuredScript].sort((a, b) => a - b)
      const r: BenchResult = {
        done: true,
        params,
        frames: measured.length,
        p50: percentile(sorted, 50),
        p99: percentile(sorted, 99),
        max: sorted[sorted.length - 1] ?? 0,
        mean: measured.reduce((a, b) => a + b, 0) / Math.max(1, measured.length),
        droppedFrames: measured.filter((d) => d > droppedThresholdMs).length,
        droppedThresholdMs,
        droppedAt: measured.flatMap((d, i) => (d > droppedThresholdMs ? [{ frame: i, ms: d, scriptMs: measuredScript[i] ?? 0 }] : [])).slice(0, 50),
        longTasks: longTaskStarts.filter((s) => s >= measureStart).length,
        cellsPaintedPerFrame: measuredHits.reduce((a, b) => a + b, 0) / Math.max(1, measuredHits.length),
        scriptP50: percentile(scriptSorted, 50),
        scriptP99: percentile(scriptSorted, 99),
        scriptMax: scriptSorted[scriptSorted.length - 1] ?? 0,
        userAgent: navigator.userAgent,
        ...finish(),
      }
      window.__tradecnBench = r
      setResult(r)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return result
}

declare global {
  interface Window {
    __tradecnBenchMeasureStart?: number
  }
}

function Summary({ result }: { result: BenchResult | null }) {
  return result ? (
    <span data-testid="result" className="ml-auto">
      frames {result.frames} p50 {result.p50.toFixed(2)} p99 {result.p99.toFixed(2)} max {result.max.toFixed(2)} dropped {result.droppedFrames} long {result.longTasks} cells/frame {result.cellsPaintedPerFrame.toFixed(0)} script p50 {result.scriptP50.toFixed(2)} p99 {result.scriptP99.toFixed(2)}
      {result.invariants && ` held ${result.invariants.focusedHeld && result.invariants.activeHeld && result.invariants.firstVisibleHeld ? "yes" : "NO"} arrived ${result.invariants.arrived}`}
    </span>
  ) : (
    <span className="ml-auto text-muted-foreground">running</span>
  )
}

function UpdatesBench({ params }: { params: BenchParams }) {
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
  const ids = store.getIds()
  const visibleCount = Math.min(params.visible + 8, ids.length)
  const result = useFrameRun(
    params,
    () => {
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
      return hits
    },
    () => ({}),
    [store, params],
  )
  return (
    <main className="flex h-screen flex-col gap-2 p-3 font-(family-name:--tradecn-font-mono) text-xs">
      <div className="flex items-center gap-4">
        <h1 className="text-sm font-semibold">bench</h1>
        <span className="text-muted-foreground">
          {params.rows} rows, {params.visible} visible, {params.cols} cols, {params.updates} patches/frame, {params.seconds}s, preset {params.preset}
        </span>
        <Summary result={result} />
      </div>
      <div style={{ height: params.visible * rowHeight + rowHeight + 2 }}>
        <DataGrid store={store} columns={columns} preset={params.preset} reorderHoldMs={params.hold} label="Bench" announceRowCount="off" />
      </div>
    </main>
  )
}

const CLIENTS = ["ALPHA", "BETA", "GAMMA", "DELTA", "EPSILON", "ZETA", "THETA", "KAPPA"]
const INSTRUMENTS = ["T 4 1/8 05/15/34", "T 4 1/4 02/15/29", "T 3 7/8 08/15/33", "T 4 5/8 05/15/54", "T 4 1/2 11/15/26"]
const ORDER = stackOrder<RfqStackRow>(bySize, byTimeLeft)

function inquiryAt(i: number, now: number): RfqStackRow {
  const auto = rand() < 0.5
  return {
    id: `Q-${String(i).padStart(5, "0")}`,
    receivedAt: now - i * 50,
    expiresAt: now + 30_000 + Math.floor(rand() * 600_000),
    client: CLIENTS[i % CLIENTS.length],
    tier: `Tier ${1 + (i % 3)}`,
    instrument: INSTRUMENTS[i % INSTRUMENTS.length]!,
    side: rand() < 0.45 ? "buy" : rand() < 0.9 ? "sell" : "two-way",
    quantity: (1 + Math.floor(rand() * 50)) * 1_000_000,
    bid: 99.5 + Math.round((rand() - 0.5) * 32) / 64,
    ask: 99.515625 + Math.round((rand() - 0.5) * 32) / 64,
    status: "Open",
    auto,
  }
}

function ArrivalsBench({ params }: { params: BenchParams }) {
  const rowHeight = DATA_GRID_PRESETS.rfq.rowHeight
  // A lazy state, not a memo: the seed reads the clock, which the compiler's purity rule keeps out of a memo.
  const [store] = useState(() => {
    const s = createRowStore<RfqStackRow>({ getRowId: (r) => r.id, lane: "ordered" })
    const now = Date.now()
    s.applyDeltas({ upsert: Array.from({ length: params.rows }, (_, i) => inquiryAt(i, now)) })
    return s
  })
  const view = useRfqStackView(store, { comparator: ORDER })
  // Focus and the active mark sit mid-screen, on two different rows, so an arrival above either has something to move.
  const [focusedRowId, setFocusedRowId] = useState<string | null>(() => view.getIds()[Math.floor(params.visible / 2)] ?? null)
  const [activeId] = useState(() => view.getIds()[Math.floor(params.visible / 2) + 3] ?? null)
  const held = useRef({ focused: focusedRowId, active: activeId, firstVisible: null as string | null, focusedHeld: true, activeHeld: true, firstVisibleHeld: true, arrived: 0, total: params.rows })

  const result = useFrameRun(
    params,
    (t) => {
      const h = held.current
      const start = window.__tradecnBenchMeasureStart ?? Infinity
      let hits = 0
      if (t >= start && h.arrived < params.arrivals) {
        const due = Math.min(params.arrivals, Math.ceil((params.arrivals * (t - start)) / params.burstMs))
        const n = due - h.arrived
        if (n > 0) {
          const now = Date.now()
          store.applyDeltas({ upsert: Array.from({ length: n }, (_, k) => inquiryAt(h.total + k, now)) })
          h.total += n
          h.arrived += n
          hits = n
        }
      }
      // What must not move, read after React's commit: the row under the top of the viewport, the focused row, the active mark.
      queueMicrotask(() => {
        const scroller = document.querySelector<HTMLElement>("[data-slot='tradecn-rfq-stack'] [role='grid'] .overflow-auto")
        if (scroller) {
          const first = view.getIds()[Math.round(scroller.scrollTop / rowHeight)] ?? null
          if (h.firstVisible === null) h.firstVisible = first
          else if (first !== h.firstVisible) h.firstVisibleHeld = false
        }
        const focusedEl = document.querySelector<HTMLElement>("[data-slot='tradecn-rfq-stack'] [data-row-id][data-focused]")
        if (focusedEl && focusedEl.dataset.rowId !== h.focused) h.focusedHeld = false
        const activeEl = document.querySelector<HTMLElement>("[data-slot='tradecn-rfq-stack'] [data-row-id][data-state='active']")
        if (activeEl && activeEl.dataset.rowId !== h.active) h.activeHeld = false
      })
      return hits
    },
    () => {
      const h = held.current
      return { invariants: { focusedHeld: h.focusedHeld && focusedRowId === h.focused, activeHeld: h.activeHeld, firstVisibleHeld: h.firstVisibleHeld, arrived: h.arrived } }
    },
    [store, view, params],
  )
  return (
    <main className="flex h-screen flex-col gap-2 p-3 font-(family-name:--tradecn-font-mono) text-xs">
      <div className="flex items-center gap-4">
        <h1 className="text-sm font-semibold">bench: arrivals</h1>
        <span className="text-muted-foreground">
          {params.rows} open inquiries, {params.visible} visible, {params.arrivals} arriving over {params.burstMs} ms, {params.seconds}s, preset rfq
        </span>
        <Summary result={result} />
      </div>
      <div style={{ height: params.visible * rowHeight + rowHeight + 2 }}>
        <RfqStack store={store} view={view} activeId={activeId} focusedRowId={focusedRowId} onFocusedRowChange={setFocusedRowId} label="Bench" announceRowCount="off" />
      </div>
    </main>
  )
}

export function BenchPage() {
  const params = useMemo(() => readParams(), [])
  return params.scenario === "arrivals" ? <ArrivalsBench params={params} /> : <UpdatesBench params={params} />
}
