import { cn } from "cn"
import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ComponentProps, type ReactNode } from "react"
import { createFrameSampler, formatMs, type FrameReport, type FrameSampler } from "@/registry/tradecn/lib/frame-stats"

// One sampler and report subscription per monitor; one metadata subscription per lane. Readings
// share those snapshots while callers own the labels, collections, controls and surrounding markup.

/** What a lane shows, the shape a row store's meta already has. */
export interface LaneMeta {
  lane: "coalesced" | "ordered"
  size: number
  /** Counts batches applied. */
  version: number
  dropped: number
  seq: number | null
  gap: boolean
  /** Wall clock of the last batch, ms since the epoch. */
  lastBatchAt: number | null
}

/** What a lane reads: a row store, or anything with a meta subscription shaped like one. */
export interface MetaSource {
  getMeta(): LaneMeta
  subscribeMeta(cb: () => void): () => void
}

export interface PerfMonitorProps extends Omit<ComponentProps<"div">, "children" | "role" | "aria-label" | "aria-labelledby"> {
  children: ReactNode
  role?: never
  "aria-label"?: never
  "aria-labelledby"?: never
  /** Histogram marker and initial budget for an internally created sampler. Default 1000/60. */
  budgetMs?: number
  /** Frames retained by an internally created sampler. Default 600. */
  window?: number
  /** Report interval for an internally created sampler. Default 250ms. */
  refreshMs?: number
  /** Started while mounted and stopped on replacement or unmount. */
  sampler?: FrameSampler
  /** Current report after mount and each report-object change. */
  onReport?: (report: FrameReport) => void
  label?: string
}

const noop = () => () => {}
const ReportContext = createContext<FrameReport | null>(null)
const BudgetContext = createContext(1000 / 60)

/** The monitor's shared report; this hook adds no subscription or sampler. */
export function usePerfReport(): FrameReport {
  const report = useContext(ReportContext)
  if (!report) throw new Error("PerfMonitor readings must be inside PerfMonitor.")
  return report
}

export function PerfMonitor({ budgetMs = 1000 / 60, window: frames = 600, refreshMs = 250, sampler: given, onReport, label = "Frame health", children, className, ...props }: PerfMonitorProps) {
  const [own] = useState(() => given ?? createFrameSampler({ budgetMs, window: frames, refreshMs }))
  const sampler = given ?? own
  useEffect(() => {
    sampler.start()
    return () => sampler.stop()
  }, [sampler])
  const report = useSyncExternalStore(sampler.subscribe ?? noop, sampler.report, sampler.report)
  useEffect(() => {
    onReport?.(report)
    // Callback replacement alone must not publish the current report again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report])

  return (
    <BudgetContext.Provider value={budgetMs}>
      <ReportContext.Provider value={report}>
        <div {...props} role="group" aria-label={label} aria-labelledby={undefined} data-slot="tradecn-perf-monitor" data-dropped={report.dropped} data-frames={report.frames} className={cn("flex flex-col gap-1 font-(family-name:--tradecn-font-mono) text-xs lining-nums tabular-nums", className)}>
          {children}
        </div>
      </ReportContext.Provider>
    </BudgetContext.Provider>
  )
}

export type PerfMetric = "frames" | "p50" | "p99" | "max" | "mean" | "dropped" | "long"

export interface PerfMonitorValueProps extends Omit<ComponentProps<"span">, "children"> {
  metric: PerfMetric
  /** Null means long-task observation is unavailable. */
  format?: (value: number | null, report: FrameReport) => ReactNode
}

export function PerfMonitorValue({ metric, format, className, ...props }: PerfMonitorValueProps) {
  const report = usePerfReport()
  const value = metric === "long" ? (report.longTasksObserved ? report.longTasks : null) : report[metric]
  const text = value === null ? "n/a" : metric === "p50" || metric === "p99" || metric === "max" || metric === "mean" ? formatMs(value) : metric === "frames" ? value.toLocaleString() : String(value)
  return <span data-slot="tradecn-perf-monitor-value" data-numeric="" className={cn("lining-nums tabular-nums", className)} {...props}>{format ? format(value, report) : text}</span>
}

export interface PerfMonitorLaneProps {
  store: MetaSource
  children: ReactNode
}

export interface PerfLaneState {
  meta: LaneMeta
  rate: number
  age: number | null
}

const LaneContext = createContext<PerfLaneState | null>(null)

/** A lane's shared metadata and report-clock readings, without another subscription. */
export function usePerfLane(): PerfLaneState {
  const lane = useContext(LaneContext)
  if (!lane) throw new Error("PerfMonitor lane readings must be inside PerfMonitorLane.")
  return lane
}

/** Coordinates lane readings without adding markup, including inside a table or list. */
export function PerfMonitorLane({ store, children }: PerfMonitorLaneProps) {
  const { until: at } = usePerfReport()
  const meta = useSyncExternalStore(store.subscribeMeta, store.getMeta, store.getMeta)
  const [seen, setSeen] = useState({ store, at, version: meta.version, rate: 0 })
  if (seen.store !== store) {
    setSeen({ store, at, version: meta.version, rate: 0 })
  } else if (seen.at !== at) {
    const seconds = (at - seen.at) / 1000
    setSeen({ store, at, version: meta.version, rate: seconds > 0 ? Math.max(0, meta.version - seen.version) / seconds : 0 })
  }
  const age = meta.lastBatchAt === null ? null : Math.max(0, at - meta.lastBatchAt)
  const state = useMemo(() => ({ meta, rate: seen.rate, age }), [meta, seen.rate, age])
  return <LaneContext.Provider value={state}>{children}</LaneContext.Provider>
}

export type PerfLaneMetric = "kind" | "rows" | "rate" | "dropped" | "seq" | "gap" | "age"

export interface PerfMonitorLaneValueProps extends Omit<ComponentProps<"span">, "children"> {
  metric: PerfLaneMetric
  /** Customize a reading from the shared lane state. */
  format?: (state: PerfLaneState) => ReactNode
}

export function PerfMonitorLaneValue({ metric, format, className, ...props }: PerfMonitorLaneValueProps) {
  const state = usePerfLane()
  const { meta, rate, age } = state
  let text: string
  switch (metric) {
    case "kind": text = meta.lane; break
    case "rows": text = meta.size.toLocaleString(); break
    case "rate": text = rate.toFixed(0); break
    case "dropped": text = meta.dropped.toLocaleString(); break
    case "seq": text = meta.seq === null ? "–" : meta.seq.toLocaleString(); break
    case "gap": text = meta.gap ? "gap" : ""; break
    case "age": text = age === null ? "–" : formatMs(age); break
  }
  return <span data-slot="tradecn-perf-monitor-lane-value" data-numeric="" className={cn("lining-nums tabular-nums", metric === "gap" && "text-stale", className)} {...props}>{format ? format(state) : text}</span>
}

export type PerfMonitorHistogramProps = Omit<ComponentProps<"svg">, "children">

/** Frame gaps against the monitor's budget, with an accessible summary and per-bin titles. */
export function PerfMonitorHistogram({ className, ...props }: PerfMonitorHistogramProps) {
  const report = usePerfReport()
  const budgetMs = useContext(BudgetContext)
  const bins = report.histogram
  const width = 160
  const height = 28
  const gap = 1
  const barWidth = width / bins.length
  const peak = Math.max(1, ...bins)
  const budgetX = Math.min(width, (budgetMs / report.binMs) * barWidth)
  const end = report.binMs * (bins.length - 1)
  return (
    <svg role="img" aria-label={`Frame time histogram, ${report.binMs} ms bins to ${end} ms and over: p50 ${formatMs(report.p50)}, p99 ${formatMs(report.p99)}, ${report.dropped} dropped`} viewBox={`0 0 ${width} ${height + 10}`} width={width} height={height + 10} className={cn("shrink-0 overflow-visible", className)} data-perf-histogram {...props}>
      {bins.map((count, i) => {
        const h = count === 0 ? 0 : Math.max(1, Math.round((count / peak) * height))
        const from = i * report.binMs
        const label = i === bins.length - 1 ? `${from} ms and over: ${count} frames` : `${from} to ${from + report.binMs} ms: ${count} frames`
        return (
          <rect key={i} x={i * barWidth + gap / 2} y={height - h} width={Math.max(0.5, barWidth - gap)} height={h} rx={1} className="fill-primary" data-bin={i} data-count={count}>
            <title>{label}</title>
          </rect>
        )
      })}
      <line x1={budgetX} x2={budgetX} y1={0} y2={height} strokeDasharray="2 2" className="stroke-muted-foreground" strokeWidth={1} />
      <text x={Math.min(budgetX + 2, width - 34)} y={height + 9} className="fill-muted-foreground" fontSize={7} data-perf-budget>
        {formatMs(budgetMs)}
      </text>
    </svg>
  )
}
