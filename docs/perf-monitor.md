# PerfMonitor

The frame rate on the screen it measures: the numbers a per-frame core is judged by, a histogram of frame gaps against the budget, and a line per lane from its store.

## Usage

```tsx
import { PerfMonitor } from "@/components/ui/perf-monitor"
import { createFrameSampler } from "@/lib/frame-stats"
```

```tsx
<PerfMonitor lanes={[{ label: "Market data", store: quotes }, { label: "Inquiries", store: inquiries }]} readouts={[{ label: "ipc batch", value: `${lastBatchRows} rows` }]} onReport={(report) => log.write(report)} />
```

## API Reference

### What it measures

A frame gap is the time from one animation frame to the next, read off `requestAnimationFrame`. That is the number a trader feels: a gap past the budget is a frame that did not paint on time, whatever caused it. The strip prints how many frames are in the window, the p50, the p99, the max, how many were dropped (a gap past one and a half budgets, which is a frame that missed its slot), and how many long tasks the browser reported while sampling, or `n/a` where it cannot report them. The budget is `budgetMs`, 16.7 ms by default, and the window is `window` frames, ten seconds at 60 Hz by default.

### The histogram

One series, one hue: the frame gaps in two-millisecond bins, the last bin taking everything past 40 ms, drawn against a dashed line at the budget with its value under it. Each bar names its bin and its count on hover, and the chart's accessible name carries the p50, the p99, and the dropped count, so the numbers beside it are its table. `compact` leaves the chart out.

### The lanes

Each lane reads its store's meta on the report's beat: the rows it holds, the batches applied a second, and what its kind of lane worries about, the drop count on a coalesced lane, the sequence and an open gap on an ordered one, and the age of the last batch. Anything with `getMeta()` and `subscribeMeta()` is a lane; a [`row-store`](row-store.md) is one. `readouts` prints numbers of your own beside the frame numbers, an IPC batch size or a socket's state, as given.

### What it costs

The sampler pushes one number into a ring per frame and reports on a timer, so watching costs a push into a typed array per frame and a small render four times a second, never a render per frame. The lanes read their meta on the same beat. Sampling stops when the monitor unmounts.

### The report

`onReport` fires with each `FrameReport` as it lands, for a log. Make the sampler yourself with `createFrameSampler` from `frame-stats` and pass it as `sampler` to read `report()` from a test harness, a replay gate, or a screenshot script; the monitor starts it while mounted and stops it after. `percentile`, `histogram`, and `summarize` are the arithmetic as pure functions.

### What it does not do

It does not say pass or fail. A number that means anything is read on the machine that matters, against a threshold written down before the run, and this shows the number. It does not measure script time inside your own work (wrap that yourself and pass it as a readout), and it reports long tasks only where the browser does.
