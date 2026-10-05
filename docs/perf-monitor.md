# PerfMonitor

Composable frame statistics, histograms, and store lane readings.

## Usage

```tsx
import { type ReactNode } from "react"
import { PerfMonitor, PerfMonitorHistogram, PerfMonitorValue } from "@/components/ui/perf-monitor"

export function FrameReadings({ children }: { children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 lining-nums tabular-nums" data-numeric="">
      <span data-perf="frames"><span className="text-muted-foreground">frames </span><PerfMonitorValue metric="frames" /></span>
      <span data-perf="p50"><span className="text-muted-foreground">p50 </span><PerfMonitorValue metric="p50" /></span>
      <span data-perf="p99"><span className="text-muted-foreground">p99 </span><PerfMonitorValue metric="p99" /></span>
      <span data-perf="max"><span className="text-muted-foreground">max </span><PerfMonitorValue metric="max" /></span>
      <span data-perf="dropped"><span className="text-muted-foreground">dropped </span><PerfMonitorValue metric="dropped" /></span>
      <span data-perf="long"><span className="text-muted-foreground">long </span><PerfMonitorValue metric="long" /></span>
      {children}
    </div>
  )
}

export default function PerfMonitorDemo() {
  return (
    <PerfMonitor className="w-80 max-w-full">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <PerfMonitorHistogram />
        <FrameReadings />
      </div>
    </PerfMonitor>
  )
}
```

Mount the monitor in the view you want to measure. It starts sampling after mount and reports four times a second, so an initial empty reading fills in as frames arrive. Animation frames pause while the tab is hidden, and the first frame back records the whole pause as one gap: it counts as dropped and skews the percentiles and max until it leaves the window, so stop the sampler around a deliberate hide when that matters. In a popout, the default sampler ticks on the opener's frames; pass a sampler created with the popout window's own `requestAnimationFrame` and `cancelAnimationFrame`, its timers through `setTimer` and `clearTimer`, and `observe: false` — the long-task observer is built from the opener's realm and would count the opener's tasks — to measure the popout, or stop cancels through the wrong window and the report throttles while the opener hides.

The histogram and numbers show measurements from your browser. The width here lets the readouts wrap on narrow screens.

The monitor stops its sampler on unmount. It needs no row store, feed or load generator for ordinary frame measurements.

## Composition

Use the following composition to build a `PerfMonitor`:

```text
PerfMonitor
├── PerfMonitorHistogram
├── PerfMonitorValue
└── PerfMonitorLane
    └── PerfMonitorLaneValue
```

Place labels, readings, controls, and application content in your own markup. `PerfMonitorLane` adds no element, so it can coordinate readings inside a native table row. Omit `PerfMonitorHistogram` for a compact strip.

## Measuring a grid

Save [Usage](#usage) as `perf-monitor.tsx` beside this example, outside `components/ui` so it cannot overwrite the installed component, to reuse `FrameReadings`, and install [`data-grid`](data-grid.md) separately; it also supplies `row-store`.

The load starts paused. **Patches per frame** applies one batch per animation frame to a fixed set of 300 rows. **Reset measurements** clears retained gaps and long-task counts without changing the load.

<!-- demo: perf-monitor-load -->

## Custom layout

Compose native tables, reorder lane readings, and place a reset control beside the heading. Install [`row-store`](row-store.md) separately for this example.

<!-- demo: perf-monitor-layout -->

## API Reference

### Props

`PerfMonitor` accepts native `div` props and a ref, except `role`, `aria-label`, and `aria-labelledby`. The root always uses `role="group"`, with `label` owning the accessible name.

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `children` | `ReactNode` | Required | Readings and caller-owned markup; conditional content is supported. |
| `budgetMs` | `number` | `1000 / 60` | Histogram marker and initial budget for an internally created sampler. |
| `window` | `number` | `600` | Recent frame gaps retained by an internally created sampler. |
| `refreshMs` | `number` | `250` | Report interval in milliseconds for an internally created sampler. |
| `sampler` | `FrameSampler` | Created internally | Sampler to start, subscribe to, and stop. |
| `onReport` | `(report: FrameReport) => void` | Omitted | Current report after mount and on report-object changes. |
| `label` | `string` | `"Frame health"` | Accessible name of the outer group. |
| `className` | `string` | Omitted | Classes on the outer group. |

### PerfMonitorValue

A native `span` showing one frame reading. It accepts native props, a ref, and classes; place its label in your composition.

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `metric` | `PerfMetric` | Required | `frames`, `p50`, `p99`, `max`, `mean`, `dropped`, or `long`. |
| `format` | `(value: number \| null, report: FrameReport) => ReactNode` | Built-in formatting | Replace the value's content. `null` means long-task observation is unavailable. |

Milliseconds use one decimal place and an `ms` suffix. Frame counts use locale separators; dropped and long-task counts use plain digits. Unavailable long-task observation displays `n/a`.

### PerfMonitorHistogram

An SVG with native props, a ref, and classes. It reads the same report and budget as the other parts; it creates no sampler.

Its default accessible name describes the bins and summary statistics. Supply an `aria-label` or `aria-labelledby` if your composition needs another name.

### PerfMonitorLane

A provider with no DOM wrapper. Each instance owns one store metadata subscription and calculates the lane's rate and age from the monitor's report clock.

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `store` | `MetaSource` | Required | Store whose metadata the readings share. |
| `children` | `ReactNode` | Required | Caller-owned lane markup and readings. |

### PerfMonitorLaneValue

A native `span` with native props, a ref, and classes. Labels and the choice of readings belong to the composition.

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `metric` | `PerfLaneMetric` | Required | `kind`, `rows`, `rate`, `dropped`, `seq`, `gap`, or `age`. |
| `format` | `(state: PerfLaneState) => ReactNode` | Built-in formatting | Replace the value's content using the shared metadata, rate, and age. |

`gap` prints the word only when true. Choose `dropped` for coalesced lanes or `seq` and `gap` for ordered lanes, as `LaneReadings` does in [Measuring a grid](#measuring-a-grid). Save that example as `perf-monitor-load.tsx` to reuse its lane composition.

### Hooks

`usePerfReport()` returns the current `FrameReport` within `PerfMonitor`. `usePerfLane()` returns `{ meta: LaneMeta, rate: number, age: number | null }` within `PerfMonitorLane`; this shape is exported as `PerfLaneState`. Both reuse the existing context without adding subscriptions or lifecycle effects, and throw outside their provider.

The group retains `data-slot="tradecn-perf-monitor"`, `data-frames`, and `data-dropped`. Value spans carry `tradecn-perf-monitor-value` or `tradecn-perf-monitor-lane-value` slots.

The histogram retains `data-perf-histogram`, `data-perf-budget`, and its bin/count marks. Application selectors such as `data-perf` and `data-perf-lane` belong to the copied compositions.

Readings do not announce each refresh. Keep labels beside values, give custom controls accessible names, and use native row and column headers for tables. Controls retain their native keyboard behavior.

### What it measures

A frame gap is the difference between consecutive `requestAnimationFrame` timestamps. `PerfMonitorValue` prints any one `FrameReport` reading: retained gaps, p50, p99, maximum, mean, dropped count, or observed long-task count. The strip in [Usage](#usage) composes six of them. Gaps are measured in milliseconds; the default budget displays as 16.7 ms.

`dropped` counts gaps strictly greater than 1.5 times the sampler's budget: over 25 ms by default. It counts qualifying gaps, not the number of missed display refreshes. A gap over budget but at or below this threshold does not count as dropped.

The sampler retains at most `window` gaps, about ten seconds at 60 Hz by default. Its first animation frame establishes a timestamp without adding a gap.

Long tasks accumulate across sampling until `reset()`; they do not roll out with the frame window. The long-task reading prints `n/a` when observation is unavailable or disabled.

### The histogram

The chart uses one hue and a dashed, labeled budget marker. The default histogram has 20 bins: `[0, 2)`, `[2, 4)`, through `[36, 38)`, then 38 ms and over. `maxMs: 40` determines the bin count, so the final bin starts at 38 ms and includes all larger gaps.

Each bar's hover title names its range and count. The chart's accessible name includes the bin width, overflow boundary, p50, p99, and dropped count; the Usage example places the same summary readings beside it.

A supplied sampler determines the bins, while the monitor's `budgetMs` sets the marker, clamped to the chart's right edge. Keep that prop aligned with the sampler's budget. The marker's label reads to its right, or to its left once the marker passes the middle of the chart, so it stays inside the chart at any budget.

### The lanes

Pass a [`row-store`](row-store.md) or another `MetaSource` to each `PerfMonitorLane`. Choose stable keys when mapping lanes; their labels and order belong to your composition.

| `MetaSource` member | Type | Contract |
|---|---|---|
| `getMeta` | `() => LaneMeta` | Returns a stable snapshot until metadata changes. |
| `subscribeMeta` | `(cb: () => void) => () => void` | Notifies subscribers when metadata changes; returns an unsubscribe function. |

All `LaneMeta` fields are required:

| Field | Type | Purpose |
|---|---|---|
| `lane` | `"coalesced" \| "ordered"` | Lane kind, reaching your readings through `usePerfLane().meta`. |
| `size` | `number` | Current row count. |
| `version` | `number` | Counter used to calculate batches per second. |
| `dropped` | `number` | Producer's dropped-message count. The grid example shows it for coalesced lanes. |
| `seq` | `number \| null` | Latest sequence; `null` prints as `–`. The grid example shows it for ordered lanes. |
| `gap` | `boolean` | Its own reading, printing `gap` when true; the grid example renders it beside `seq`. |
| `lastBatchAt` | `number \| null` | Last batch's wall-clock timestamp in milliseconds since the epoch; `null` prints its age as `–`. |

Lanes subscribe directly to their stores and can redraw between frame reports. Batches per second starts at zero, then uses the nonnegative change in `version` divided by elapsed report time, rounded to a whole number for display.

It updates when `report.until` changes; if that timestamp moves backward, the rate resets to zero. Replacing the lane source resets its rate to zero.

A row store increments `version` on both `applyDeltas()` and `clear()`, so a clear also counts toward that rate.

Age is `max(0, report.until - lastBatchAt)` in milliseconds, using the report's timestamp even when fresh metadata arrives between reports. Lane drops describe producer messages; the frame `dropped` reading describes frame gaps. Add your own IPC batch size, queue depth, or socket state as children.

### What it costs

After the first frame following a start or reset, each animation frame writes one gap to a bounded typed-array ring. The report timer copies and sorts the retained gaps to calculate statistics and notifies subscribers, four times a second by default.

The root owns one report subscription; each lane owns one metadata subscription shared by its readings. Static child content does not consume either context.

Frame ticks do not themselves trigger renders; store notifications and parent updates can still cause renders between reports.

### The report

Import `createFrameSampler` and the `FrameReport` and `FrameSampler` types from `@/lib/frame-stats`. Pass a sampler to the monitor when a test script, replay gate, or screenshot script also needs `report()`.

| `FrameReport` field | Type | Meaning |
|---|---|---|
| `frames` | `number` | Number of retained gaps. |
| `p50`, `p99` | `number` | Nearest-rank percentiles of retained gaps, in milliseconds; zero when empty. |
| `max`, `mean` | `number` | Maximum and arithmetic mean gap in milliseconds; zero when empty. The Usage strip omits `mean`. |
| `dropped` | `number` | Retained gaps strictly greater than `droppedAboveMs`. |
| `droppedAboveMs` | `number` | Sampler budget multiplied by 1.5. |
| `longTasks` | `number` | Number of browser long-task entries observed since construction or reset, retained across stop/start. |
| `longTasksObserved` | `boolean` | Whether long-task observation was established. Initially false. |
| `histogram` | `number[]` | Gap counts in bins from zero; the final bin includes all overflow. |
| `binMs` | `number` | Width of each ordinary bin in milliseconds. |
| `since` | `number` | Sampler's latest start or reset time, initially its construction time, in milliseconds since the epoch. |
| `until` | `number` | Report refresh time in milliseconds since the epoch, initially its construction time. |

`since` is not the timestamp of the oldest retained gap and does not advance when the ring fills. The report contains frame statistics only; lane metadata and custom readouts are separate.

`createFrameSampler(options)` accepts `window`, `budgetMs`, and `refreshMs` with the same defaults as the monitor. It also accepts `binMs` (default `2`), `maxMs` (default `40`), and `observe` (default `true`; set false to disable long-task observation). Tests can inject `raf`, `caf`, `now`, `setTimer`, and `clearTimer`.

| `FrameSampler` member | Behavior |
|---|---|
| `start()` | Starts animation frames, the report timer, and optional long-task observation. Does nothing if already running. |
| `stop()` | Cancels sampling, disconnects observation, and publishes a final report. Does nothing if already stopped. |
| `reset()` | Clears gaps and long-task count, resets `since`, and publishes a report without changing whether sampling is running. |
| `report()` | Returns the cached `FrameReport`; it does not take a fresh sample. |
| `subscribe(cb)` | Notifies on reports from the timer, `reset()`, or an active `stop()`; returns an unsubscribe function. |
| `running` | Readonly boolean indicating whether sampling is running. |

Stopping and restarting retains gaps and the long-task count. Restarting resets `since` and the previous animation-frame timestamp, so the pause does not become a gap.

Call `reset()` for a fresh measurement. `report()` returns the same object until the next report is published; `start()` alone does not publish one.

The monitor starts its selected sampler after mount, stops it on unmount, and stops the old sampler before starting a replacement. This applies to supplied samplers too, so avoid sharing one across monitors with independent lifetimes. The initial sampler is retained as the fallback if `sampler` is later omitted.

An internally created sampler captures `window`, `budgetMs`, and `refreshMs` on the first render. Changing those props does not reconfigure it; remount or provide a new sampler.

A supplied sampler owns its configuration. In either case, changing the monitor's `budgetMs` still moves the chart marker.

`onReport` runs after mount with the current snapshot, which can be the initial empty report, and after report-object changes. Replacing the callback alone does not invoke it. React development effect replay can repeat the initial callback.

`percentile(sorted, p)`, `histogram(values, binMs, maxMs)`, and `summarize(gaps, options)` expose the arithmetic as pure functions. `percentile` expects sorted values and returns zero for an empty array; `summarize` sorts its own copy. `formatMs(ms)` formats one decimal place with an `ms` suffix.

### What it does not do

The monitor shows measurements without deciding pass or fail. Set thresholds before a run and measure on the target machine.

Frame gaps do not identify their cause or measure script time inside your work; time that work separately and render it in your composition. Long-task counts depend on the browser's reporting support.

### Tokens

The install adds the `stale` token if absent, with the mono and accessible font tokens and the hyperlegible remap its readings use.
