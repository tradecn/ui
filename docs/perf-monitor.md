# PerfMonitor

Show frame-gap statistics, a histogram against your frame budget, and each store's lane health. Add application readouts and send reports to a log or test harness.

## Usage

```tsx
import { PerfMonitor } from "@/components/ui/perf-monitor"
import { createFrameSampler } from "@/lib/frame-stats"
```

```tsx
<PerfMonitor lanes={[{ label: "Market data", store: quotes }, { label: "Inquiries", store: inquiries }]} readouts={[{ label: "ipc batch", value: `${lastBatchRows} rows` }]} onReport={(report) => log.write(report)} />
```

## API Reference

### Props

`PerfMonitorProps` accepts these optional inputs:

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `lanes` | `readonly PerfMonitorLane[]` | Omitted | Labeled stores to display below the frame statistics. |
| `budgetMs` | `number` | `1000 / 60` | Frame budget in milliseconds; positions the histogram marker and configures an internally created sampler. |
| `window` | `number` | `600` | Number of recent frame gaps retained by an internally created sampler. |
| `refreshMs` | `number` | `250` | Report interval in milliseconds for an internally created sampler. |
| `sampler` | `FrameSampler` | Created internally | Sampler to start, subscribe to, and stop. |
| `readouts` | `readonly PerfReadout[]` | Omitted | Extra values beside the frame statistics; each has a `label: string` and `value: string`, printed as given. |
| `onReport` | `(report: FrameReport) => void` | Omitted | Receives the current report after mount and when the report object changes. |
| `compact` | `boolean` | `false` | Hides the histogram; keeps frame statistics, readouts, and lanes. |
| `label` | `string` | `"Frame health"` | Accessible name of the outer `group`. |
| `className` | `string` | Omitted | Classes on the outer group. |

### What it measures

A frame gap is the difference between consecutive `requestAnimationFrame` timestamps. The strip shows the number of gaps retained, p50, p99, maximum, dropped count, and observed long-task count. Gaps are measured in milliseconds; the default budget displays as 16.7 ms.

`dropped` counts gaps strictly greater than 1.5 times the sampler's budget: over 25 ms by default. It counts qualifying gaps, not the number of missed display refreshes. A gap over budget but at or below this threshold does not count as dropped.

The sampler retains at most `window` gaps, about ten seconds at 60 Hz by default. Its first animation frame establishes a timestamp without adding a gap. Long tasks accumulate across sampling until `reset()`; they do not roll out with the frame window. The strip shows `n/a` when long-task observation is unavailable or disabled.

### The histogram

The chart uses one hue and a dashed, labeled budget marker. The default histogram has 20 bins: `[0, 2)`, `[2, 4)`, through `[36, 38)`, then 38 ms and over. `maxMs: 40` determines the bin count, so the final bin starts at 38 ms and includes all larger gaps.

Each bar's hover title names its range and count. The chart's accessible name includes the bin width, overflow boundary, p50, p99, and dropped count; the same summary statistics appear beside it. A supplied sampler determines the bins, while the monitor's `budgetMs` sets the marker, clamped to the chart's right edge. Keep that prop aligned with the sampler's budget.

### The lanes

Each `PerfMonitorLane` has a `label: string` and `store: MetaSource`. A [`row-store`](row-store.md) meets the contract. Use distinct lane labels and distinct readout labels: each list uses its labels as React keys.

| `MetaSource` member | Type | Contract |
|---|---|---|
| `getMeta` | `() => LaneMeta` | Returns a stable snapshot until metadata changes. |
| `subscribeMeta` | `(cb: () => void) => () => void` | Notifies subscribers when metadata changes; returns an unsubscribe function. |

All `LaneMeta` fields are required:

| Field | Type | Display |
|---|---|---|
| `lane` | `"coalesced" \| "ordered"` | Lane kind beside its label. |
| `size` | `number` | Current row count. |
| `version` | `number` | Counter used to calculate batches per second. |
| `dropped` | `number` | Producer's dropped-message count, shown only for coalesced lanes. |
| `seq` | `number \| null` | Latest sequence, shown only for ordered lanes; `null` displays as `–`. |
| `gap` | `boolean` | Adds `gap` beside an ordered lane's sequence when true. |
| `lastBatchAt` | `number \| null` | Last batch's wall-clock timestamp in milliseconds since the epoch; `null` displays age as `–`. |

Lanes subscribe directly to their stores and can redraw between frame reports. Batches per second starts at zero, then uses the nonnegative change in `version` divided by elapsed report time, rounded to a whole number for display. It updates when `report.until` changes; if that timestamp moves backward, the rate resets to zero. A row store increments `version` on both `applyDeltas()` and `clear()`, so a clear also counts toward that rate.

Age is `max(0, report.until - lastBatchAt)` in milliseconds, using the report's timestamp even when fresh metadata arrives between reports. Lane drops describe producer messages; the frame strip's dropped count describes frame gaps. `readouts` can show your own IPC batch size, queue depth, or socket state.

### What it costs

After the first frame following a start or reset, each animation frame writes one gap to a bounded typed-array ring. The report timer copies and sorts the retained gaps to calculate statistics and notifies subscribers, four times a second by default. Frame ticks do not themselves trigger renders; store notifications and parent updates can still cause renders between reports.

### The report

Import `createFrameSampler` and the `FrameReport` and `FrameSampler` types from `@/lib/frame-stats`. Pass a sampler to the monitor when a test harness, replay gate, or screenshot script also needs `report()`.

| `FrameReport` field | Type | Meaning |
|---|---|---|
| `frames` | `number` | Number of retained gaps. |
| `p50`, `p99` | `number` | Nearest-rank percentiles of retained gaps, in milliseconds; zero when empty. |
| `max`, `mean` | `number` | Maximum and arithmetic mean gap in milliseconds; zero when empty. The strip omits `mean`. |
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

Stopping and restarting retains gaps and the long-task count. Restarting resets `since` and the previous animation-frame timestamp, so the pause does not become a gap. Call `reset()` for a fresh measurement. `report()` returns the same object until the next report is published; `start()` alone does not publish one.

The monitor starts its selected sampler after mount, stops it on unmount, and stops the old sampler before starting a replacement. This applies to supplied samplers too, so avoid sharing one across monitors with independent lifetimes. The initial sampler is retained as the fallback if `sampler` is later omitted.

An internally created sampler captures `window`, `budgetMs`, and `refreshMs` on the first render. Changing those props does not reconfigure it; remount or provide a new sampler. A supplied sampler owns its configuration. In either case, changing the monitor's `budgetMs` still moves the chart marker.

`onReport` runs after mount with the current snapshot, which can be the initial empty report, and after report-object changes. Replacing the callback alone does not invoke it. React development effect replay can repeat the initial callback.

`percentile(sorted, p)`, `histogram(values, binMs, maxMs)`, and `summarize(gaps, options)` expose the arithmetic as pure functions. `percentile` expects sorted values and returns zero for an empty array; `summarize` sorts its own copy. `formatMs(ms)` formats one decimal place with an `ms` suffix.

### What it does not do

The monitor shows measurements without deciding pass or fail. Set thresholds before a run and measure on the target machine. Frame gaps do not identify their cause or measure script time inside your work; time that work separately and pass it as a readout. Long-task counts depend on the browser's reporting support.
