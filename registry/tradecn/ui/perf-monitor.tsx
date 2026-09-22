import { cn } from "cn"
import { useEffect, useState, useSyncExternalStore } from "react"
import { createFrameSampler, formatMs, type FrameReport, type FrameSampler } from "@/registry/tradecn/lib/frame-stats"

// The frame rate, on the screen it measures. A strip of numbers a per-frame core is judged by (frames
// in the window, p50, p99, max, dropped, long tasks), a histogram of frame gaps against the budget,
// and one line per lane from its store's meta: rows, batches a second, drops, sequence, gap, age.
//
// It costs almost nothing to watch. The sampler pushes one number into a ring per animation frame
// and reports on a timer, so this component re-renders four times a second and never per frame, and
// the lanes read their store's meta on the same beat. It decides nothing: the numbers are the numbers,
// read on the machine that matters, and pass or fail is written down somewhere else, beforehand.

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

export interface PerfMonitorLane {
  label: string
  store: MetaSource
}

export interface PerfReadout {
  label: string
  /** Printed as given: an IPC batch size, a queue depth, a socket's state. */
  value: string
}

export interface PerfMonitorProps {
  /** Stores whose lanes to show. */
  lanes?: readonly PerfMonitorLane[]
  /** The frame budget the histogram marks. Default 1000/60. */
  budgetMs?: number
  /** Frames kept. Default 600, ten seconds at 60 Hz. */
  window?: number
  /** How often the strip redraws. Default 250. */
  refreshMs?: number
  /** Your own sampler, for a report you read elsewhere or write to a log. Made here otherwise. Started while mounted, stopped after. */
  sampler?: FrameSampler
  /** Numbers of your own beside the frame numbers. */
  readouts?: readonly PerfReadout[]
  /** Each report as it lands, for a log. */
  onReport?: (report: FrameReport) => void
  /** The numbers alone, no histogram. */
  compact?: boolean
  label?: string
  className?: string
}

const noop = () => () => {}

function useMeta(source: MetaSource): LaneMeta {
  return useSyncExternalStore(source.subscribeMeta, source.getMeta, source.getMeta)
}

interface LaneProps {
  lane: PerfMonitorLane
  /** The report's clock: when the strip last redrew. */
  at: number
}

function Lane({ lane, at }: LaneProps) {
  const meta = useMeta(lane.store)
  // Batches a second between two redraws: derived state, settled during render.
  const [seen, setSeen] = useState({ at, version: meta.version, rate: 0 })
  if (seen.at !== at) {
    const seconds = (at - seen.at) / 1000
    setSeen({ at, version: meta.version, rate: seconds > 0 ? Math.max(0, meta.version - seen.version) / seconds : 0 })
  }
  const age = meta.lastBatchAt === null ? null : Math.max(0, at - meta.lastBatchAt)
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 lining-nums tabular-nums" data-perf-lane={lane.label} data-lane={meta.lane} data-numeric="">
      <span className="font-medium">{lane.label}</span>
      <span className="text-muted-foreground">{meta.lane}</span>
      <span>
        <span className="text-muted-foreground">rows </span>
        {meta.size.toLocaleString()}
      </span>
      <span>
        <span className="text-muted-foreground">batches/s </span>
        {seen.rate.toFixed(0)}
      </span>
      {meta.lane === "coalesced" && (
        <span data-perf-dropped>
          <span className="text-muted-foreground">drop </span>
          {meta.dropped.toLocaleString()}
        </span>
      )}
      {meta.lane === "ordered" && (
        <span data-perf-seq>
          <span className="text-muted-foreground">seq </span>
          {meta.seq === null ? "–" : meta.seq.toLocaleString()}
          {meta.gap && <span className="text-stale"> gap</span>}
        </span>
      )}
      <span>
        <span className="text-muted-foreground">age </span>
        {age === null ? "–" : formatMs(age)}
      </span>
    </div>
  )
}

interface HistogramProps {
  report: FrameReport
  budgetMs: number
}

// One series, one hue: how the frame gaps fell against the budget. The budget is a labeled line, the
// numbers beside the chart are its table.
function Histogram({ report, budgetMs }: HistogramProps) {
  const bins = report.histogram
  const width = 160
  const height = 28
  const gap = 1
  const barWidth = width / bins.length
  const peak = Math.max(1, ...bins)
  const budgetX = Math.min(width, (budgetMs / report.binMs) * barWidth)
  const end = report.binMs * (bins.length - 1)
  return (
    <svg role="img" aria-label={`Frame time histogram, ${report.binMs} ms bins to ${end} ms and over: p50 ${formatMs(report.p50)}, p99 ${formatMs(report.p99)}, ${report.dropped} dropped`} viewBox={`0 0 ${width} ${height + 10}`} width={width} height={height + 10} className="shrink-0 overflow-visible" data-perf-histogram>
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

export function PerfMonitor({ lanes, budgetMs = 1000 / 60, window: frames = 600, refreshMs = 250, sampler: given, readouts, onReport, compact = false, label = "Frame health", className }: PerfMonitorProps) {
  const [own] = useState(() => given ?? createFrameSampler({ budgetMs, window: frames, refreshMs }))
  const sampler = given ?? own
  useEffect(() => {
    sampler.start()
    return () => sampler.stop()
  }, [sampler])
  const report = useSyncExternalStore(sampler.subscribe ?? noop, sampler.report, sampler.report)
  useEffect(() => {
    onReport?.(report)
    // The report is what changed; the callback is read as it is then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report])

  const readout = (key: string, name: string, value: string) => (
    <span data-perf={key}>
      <span className="text-muted-foreground">{name} </span>
      {value}
    </span>
  )

  return (
    <div role="group" aria-label={label} data-slot="tradecn-perf-monitor" data-dropped={report.dropped} data-frames={report.frames} className={cn("flex flex-col gap-1 font-(family-name:--tradecn-font-mono) text-xs lining-nums tabular-nums", className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {!compact && <Histogram report={report} budgetMs={budgetMs} />}
        <div className="flex flex-wrap items-baseline gap-x-2 lining-nums tabular-nums" data-numeric="">
          {readout("frames", "frames", report.frames.toLocaleString())}
          {readout("p50", "p50", formatMs(report.p50))}
          {readout("p99", "p99", formatMs(report.p99))}
          {readout("max", "max", formatMs(report.max))}
          {readout("dropped", "dropped", String(report.dropped))}
          {readout("long", "long", report.longTasksObserved ? String(report.longTasks) : "n/a")}
          {readouts?.map((r) => (
            <span key={r.label} data-perf-readout={r.label}>
              <span className="text-muted-foreground">{r.label} </span>
              {r.value}
            </span>
          ))}
        </div>
      </div>
      {lanes?.map((lane) => <Lane key={lane.label} lane={lane} at={report.until} />)}
    </div>
  )
}
