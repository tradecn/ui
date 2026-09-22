// Frame timing, measured the way a per-frame core is judged: the gap between one animation frame and
// the next, how many frames missed their slot, how long the longest tasks ran. Pure functions over
// the numbers, and a sampler that collects them from requestAnimationFrame and a PerformanceObserver
// into a bounded ring, reporting on a timer rather than on every frame, so watching the frame rate
// costs almost none of it.

export interface FrameReport {
  /** Frames in the window. */
  frames: number
  p50: number
  p99: number
  max: number
  mean: number
  /** Frames longer than `droppedAboveMs`. */
  dropped: number
  droppedAboveMs: number
  /** Long tasks (over 50 ms) seen while sampling, where the browser reports them. */
  longTasks: number
  /** Whether long tasks could be observed at all. */
  longTasksObserved: boolean
  /** Counts per bin, `binMs` wide from zero; the last bin holds everything past the end. */
  histogram: number[]
  binMs: number
  /** When the window started and ended, ms since the epoch. */
  since: number
  until: number
}

export interface FrameSamplerOptions {
  /** Frames kept. Default 600, ten seconds at 60 Hz. */
  window?: number
  /** The frame budget. Default 1000/60. A frame past 1.5 times it counts as dropped. */
  budgetMs?: number
  /** Histogram bin width. Default 2. */
  binMs?: number
  /** Histogram end; the last bin takes everything past it. Default 40. */
  maxMs?: number
  /** How often subscribers hear a new report. Default 250. */
  refreshMs?: number
  /** Injectable for tests. */
  raf?: (cb: (t: number) => void) => number
  caf?: (id: number) => void
  now?: () => number
  setTimer?: (cb: () => void, ms: number) => unknown
  clearTimer?: (id: unknown) => void
  observe?: boolean
}

export interface FrameSampler {
  start(): void
  stop(): void
  /** Forget every frame so far. */
  reset(): void
  /** The latest report; the same object until the next refresh. */
  report(): FrameReport
  /** Wakes on each refresh while running. */
  subscribe(cb: () => void): () => void
  readonly running: boolean
}

export function percentile(sorted: readonly number[], p: number): number {
  if (!sorted.length) return 0
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[i]!
}

/** Counts per `binMs`-wide bin from zero to `maxMs`, the last bin taking everything past the end. */
export function histogram(values: readonly number[], binMs: number, maxMs: number): number[] {
  const bins = Math.max(1, Math.ceil(maxMs / binMs))
  const counts = new Array<number>(bins).fill(0)
  for (const v of values) {
    if (!Number.isFinite(v) || v < 0) continue
    counts[Math.min(bins - 1, Math.floor(v / binMs))]!++
  }
  return counts
}

export interface SummarizeOptions {
  budgetMs: number
  binMs: number
  maxMs: number
  longTasks: number
  longTasksObserved: boolean
  since: number
  until: number
}

/** A report from frame gaps. Dropped is a gap past 1.5 times the budget: the frame missed its slot. */
export function summarize(gaps: readonly number[], o: SummarizeOptions): FrameReport {
  const sorted = [...gaps].sort((a, b) => a - b)
  const droppedAboveMs = o.budgetMs * 1.5
  return {
    frames: sorted.length,
    p50: percentile(sorted, 50),
    p99: percentile(sorted, 99),
    max: sorted[sorted.length - 1] ?? 0,
    mean: sorted.length ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0,
    dropped: sorted.filter((d) => d > droppedAboveMs).length,
    droppedAboveMs,
    longTasks: o.longTasks,
    longTasksObserved: o.longTasksObserved,
    histogram: histogram(sorted, o.binMs, o.maxMs),
    binMs: o.binMs,
    since: o.since,
    until: o.until,
  }
}

/** "16.7 ms", "3.2 ms". */
export function formatMs(ms: number): string {
  return `${ms.toFixed(1)} ms`
}

export function createFrameSampler(options: FrameSamplerOptions = {}): FrameSampler {
  const size = options.window ?? 600
  const budgetMs = options.budgetMs ?? 1000 / 60
  const binMs = options.binMs ?? 2
  const maxMs = options.maxMs ?? 40
  const refreshMs = options.refreshMs ?? 250
  const raf = options.raf ?? ((cb) => requestAnimationFrame(cb))
  const caf = options.caf ?? ((id) => cancelAnimationFrame(id))
  const now = options.now ?? (() => Date.now())
  const setTimer = options.setTimer ?? ((cb, ms) => setInterval(cb, ms))
  const clearTimer = options.clearTimer ?? ((id) => clearInterval(id as ReturnType<typeof setInterval>))
  const observe = options.observe ?? true

  // A ring of the last `size` gaps; `head` is the next slot, `count` how many are filled.
  const ring = new Float64Array(size)
  let head = 0
  let count = 0
  let last = -1
  let frame = 0
  let timer: unknown = null
  let observer: PerformanceObserver | null = null
  let longTasks = 0
  let observed = false
  let since = now()
  let running = false
  const listeners = new Set<() => void>()
  let current: FrameReport = summarize([], { budgetMs, binMs, maxMs, longTasks: 0, longTasksObserved: false, since, until: since })

  function gaps(): number[] {
    const out: number[] = new Array(count)
    const start = (head - count + size) % size
    for (let i = 0; i < count; i++) out[i] = ring[(start + i) % size]!
    return out
  }

  function refresh() {
    current = summarize(gaps(), { budgetMs, binMs, maxMs, longTasks, longTasksObserved: observed, since, until: now() })
    for (const cb of listeners) cb()
  }

  const tick = (t: number) => {
    if (last >= 0) {
      ring[head] = t - last
      head = (head + 1) % size
      if (count < size) count++
    }
    last = t
    frame = raf(tick)
  }

  return {
    get running() {
      return running
    },
    start() {
      if (running) return
      running = true
      last = -1
      since = now()
      frame = raf(tick)
      timer = setTimer(refresh, refreshMs)
      if (observe && typeof PerformanceObserver !== "undefined") {
        try {
          observer = new PerformanceObserver((list) => {
            longTasks += list.getEntries().length
          })
          observer.observe({ type: "longtask", buffered: false })
          observed = true
        } catch {
          observer = null
          observed = false
        }
      }
    },
    stop() {
      if (!running) return
      running = false
      caf(frame)
      if (timer !== null) clearTimer(timer)
      timer = null
      observer?.disconnect()
      observer = null
      refresh()
    },
    reset() {
      head = 0
      count = 0
      last = -1
      longTasks = 0
      since = now()
      refresh()
    },
    report: () => current,
    subscribe(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
  }
}
