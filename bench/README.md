# bench

`just bench` builds the playground and measures a synthetic feed in headless Chromium.

The `/bench` page uses N rows, V visible rows and C numeric columns. It applies U random cell patches in one `applyDeltas` per animation frame, for S seconds after a warm-up. A seeded generator gives repeated runs the same data.

What it records:

- Frame pacing: rAF-to-rAF deltas (p50, p99, max, mean). Under vsync these are quantized to the display interval, so they say whether a frame was missed, not how much room was left.
- Dropped frames: the total count of intervals longer than 1.5 times the median frame, plus the index and length of the first 50.
- Script time per frame: building the batch, `applyDeltas`, and React's render and commit, measured to the microtask after React's. This is the headroom number. It excludes style, layout, and paint.
- Long tasks from `PerformanceObserver`, and patch hits in the visible rows plus eight overscan rows. Repeated hits on the same cell count separately.

Pass `--machine "<name>"` to save a run in `results/<machine>/`. Without it, the command only prints results. The updates scenario reads `thresholds/<machine>.json`; arrivals and chart read `thresholds/<machine>.arrivals.json` and `thresholds/<machine>.chart.json`. If the file contains thresholds for the run's shape, a missed threshold fails the run.

Write thresholds before the first run on a machine. Never edit them to make a run pass. If a threshold measures the wrong thing, move the original unchanged to a dated filename and write the replacement at the active filename above. Record its `writtenOn` date and the old file in `supersedes` before running again. The tool does not discover dated replacements.

## Apple M5 Max, 2026-09-20

128 GB, macOS 27.0, Playwright headless Chromium 153. 1,000 rows, 60 visible, 12 numeric columns, `rfq` preset, 10 s measured after 1 s of warm-up. Milliseconds.

| Patches per frame | Visible/overscan patch hits per frame | Frames | Dropped | Frame p99 | Script p50 | Script p99 | Script max |
|---|---|---|---|---|---|---|---|
| 2,000 | 136 | 601 | 0 | 16.8 | 2.7 | 3.0 | 3.2 |
| 5,000 | 341 | 600 | 1 | 16.8 | 3.9 | 7.4 | 8.0 |
| 10,000 | 682 | 500 | 101 | 33.4 | 6.3 | 10.5 | 12.1 |

At 2,000 patches per frame, every frame is one vsync and script p99 is 3 ms of a 16.7 ms frame. The recorded 5,000-patch run drops one frame out of 600, with script p99 at 7.4 ms.

At 10,000 patches, about one frame in five is late even though script p99 is below 16.7 ms. The 682 hits include repeats and overscan, so they do not count distinct changed cells. Script timing excludes style, layout, and paint; these runs do not isolate the cost of flash animations or establish the cause of the late frames.

The first threshold, preserved in `thresholds/m5-max.2026-09-20.json`, allowed frame p99 of at most 16.7 ms. The 2,000-patch run reported 16.8 ms and missed it. Timestamps were quantized to tenths of a millisecond, with single-vsync intervals of 16.6, 16.7 and 16.8 ms.

A second threshold took over on 2026-09-21, written before its run: script p99 at most 5 ms, no dropped frames and no long tasks. It removed the frame p99 limit because the dropped count already captures missed vsync intervals.

The same-shape run met that threshold: 601 frames, frame p99 16.8 ms, no dropped frames or long tasks, script p50 2.2 ms, script p99 2.5 ms and script max 2.6 ms.

Headless Chromium on a laptop is not a trading desk PC. These numbers say how the grid behaves under its own load on named hardware; the numbers that matter for a deployment come from that deployment's machines.

## Apple M5 Max, 2026-09-22: the arrival burst

On the same machine in headless Chromium, `just bench --scenario arrivals` starts with 1,000 open inquiries in `rfq-stack`, sorted by size then time left. It shows 60 rows with countdown cells, focuses one mid-screen row and marks another active. Then 2,000 inquiries arrive throughout the order during the first two seconds of a ten-second run.

The view re-sorts as rows arrive. Rows above the viewport shift the scroll by their height, and changed visible rows mount with their countdowns.

After every frame's commit, the run checks that the focused, active and first-visible row IDs hold. Timings below are milliseconds.

| Arrivals | Over | Frames | Dropped | Long tasks | Frame p99 | Script p50 | Script p99 | Script max | Focused held | Active held | First visible held |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 2,000 | 2 s | 601 | 0 | 0 | 16.8 | 0.1 | 4.1 | 7.6 | yes | yes | yes |

Every frame was one vsync. Script p50 reflects the quiet eight seconds, while p99 and max reflect the burst of about seventeen arrivals per frame. The maximum stayed under half a frame.

`thresholds/m5-max.arrivals.json` was written before the run: script p99 at most 8 ms, no dropped frames or long tasks, and all three IDs held. The first run met it, recorded in `results/m5-max/2026-09-22T1621-arrivals-1000x10-a2000-2000ms.json`.

A second rig, a WebView2 run on the Windows machine, is the next data point, not a verdict, and waits on time on that machine.

## Apple M5 Max, 2026-09-23: the tick chart

On the same machine in headless Chromium, `just bench --scenario chart` starts `price-chart` with 5,000 one-second bars. It folds 50 ticks per frame, about 3,000 per second, into the open bar through `foldTicks`. One `applyDeltas` updates the store each frame, and uPlot redraws once per batch.

After each commit, the run compares the header price with the last tick folded. Script time includes uPlot's redraw of every bar through `setData`. Rasterization is outside that measurement. Timings below are milliseconds.

| Run | Ticks per frame | Frames | Dropped | Long tasks | Frame p99 | Script p50 | Script p99 | Script max | Ticks folded | Header held |
|---|---|---|---|---|---|---|---|---|---|---|
| First | 50 | 602 | 0 | 0 | 16.8 | 0.4 | 0.6 | 0.7 | 33,100 | no |
| Second | 50 | 601 | 0 | 0 | 16.8 | 0.3 | 0.5 | 0.6 | 33,100 | yes |

The first run failed because the header showed the previous tick. That implementation updated React state from the store subscription, and its commit lagged the microtask where the benchmark read the DOM.

The correction used `useSyncExternalStore` through `useStoreMeta`, a memo keyed on the batch version and a layout effect to feed the canvas before paint. The second run used the same shape and held the header price.

`thresholds/m5-max.chart.json` was written before either run: script p99 at most 8 ms, no dropped frames or long tasks, and the header never behind. Both results remain: `results/m5-max/2026-09-23T0330-chart-line-5000-t50.json` and `results/m5-max/2026-09-23T0402-chart-line-5000-t50.json`.

Under a millisecond of script for five thousand bars redrawn sixty times a second is the number uPlot was chosen for. The candle kind (`--kind candles`) draws through a hook with a `fillRect` per bar instead of a path and has not been measured yet.
