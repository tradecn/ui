# bench

`just bench` builds the playground, opens `/bench` in headless Chromium, and prints frame timing for a synthetic per-frame feed: N rows, V visible, C numeric columns, U random cell patches applied in one `applyDeltas` per animation frame, for S seconds after a warm-up. The values come from a seeded generator, so two runs see the same data.

What it records:

- Frame pacing: rAF-to-rAF deltas (p50, p99, max, mean). Under vsync these are quantized to the display interval, so they say whether a frame was missed, not how much room was left.
- Dropped frames: intervals longer than 1.5 times the median frame, with the index and length of each.
- Script time per frame: building the batch, `applyDeltas`, and React's render and commit, measured to the microtask after React's. This is the headroom number. It excludes style, layout, and paint.
- Long tasks from `PerformanceObserver`, and how many patched cells landed in the visible window.

Nothing is written unless you pass `--machine "<name>"`. Then the run lands in `results/<machine>/` and, if `thresholds/<machine>.json` exists for that shape, the run fails when it misses a threshold. Thresholds are written before the first run on a machine and are never edited to make a run pass. A threshold that turns out to measure the wrong thing is replaced by a new file with its own date, and the old file stays beside it, unedited.

## Apple M5 Max, 2026-09-20

128 GB, macOS 27.0, Playwright headless Chromium 153. 1,000 rows, 60 visible, 12 numeric columns, `rfq` preset, 10 s measured after 1 s of warm-up. Milliseconds.

| Patches per frame | Visible cells changed per frame | Frames | Dropped | Frame p99 | Script p50 | Script p99 | Script max |
|---|---|---|---|---|---|---|---|
| 2,000 | 136 | 601 | 0 | 16.8 | 2.7 | 3.0 | 3.2 |
| 5,000 | 341 | 600 | 1 | 16.8 | 3.9 | 7.4 | 8.0 |
| 10,000 | 682 | 500 | 101 | 33.4 | 6.3 | 10.5 | 12.1 |

At 2,000 patches per frame every frame is one vsync and the script work is about 3 ms of a 16.7 ms frame. 5,000 is the edge on this machine: across the day's runs it was clean more often than not, and when it dropped, it dropped one to five frames in six hundred. At 10,000, nearly every visible cell is changing on every frame and one frame in five is late; script time is still inside the budget there, so the cost is the hundreds of concurrent flash animations, not React.

The first threshold file for this machine said frame p99 at most 16.7 ms, and the 2,000 run reported 16.8, so that run is recorded as a miss. The line was drawn at the vsync interval itself: timestamps are quantized to a tenth of a millisecond and a perfect run alternates 16.6, 16.7, and 16.8. That file stays as written, at `thresholds/m5-max.2026-09-20.json`. On 2026-09-21 a second file took over as the gate, written before the run it judged: script p99 at most 5 ms, no dropped frames, no long tasks, and no frame p99 limit, because under vsync that number only says whether a frame was missed and the dropped count already says that. The run that day, same shape: 601 frames, frame p99 16.8 again, 0 dropped, 0 long tasks, script p50 2.2 ms, script p99 2.5 ms, script max 2.6 ms, which meets it.

Headless Chromium on a laptop is not a trading desk PC. These numbers say how the grid behaves under its own load on named hardware; the numbers that matter for a deployment come from that deployment's machines.

## Apple M5 Max, 2026-09-22: the arrival burst

Same machine, headless Chromium. The `arrivals` scenario (`just bench --scenario arrivals`): 1,000 open inquiries in the `rfq-stack` sorted by size then time left, 60 visible with a countdown cell in each, the focus on one mid-screen row and the active inquiry on another, then 2,000 new inquiries spread over the first two seconds of a ten-second run, landing throughout the order. A burst of new rows is a different load from updates to old ones: the view re-sorts, rows arriving above the viewport shift the scroll by exactly their height, the visible rows that changed mount with their countdowns, and the focused row, the active mark, and the first visible row must not move. The run checks the three ids after every frame's commit. Milliseconds.

| Arrivals | Over | Frames | Dropped | Long tasks | Frame p99 | Script p50 | Script p99 | Script max | Focused held | Active held | First visible held |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 2,000 | 2 s | 601 | 0 | 0 | 16.8 | 0.1 | 4.1 | 7.6 | yes | yes | yes |

Every frame was one vsync. The script p50 is the quiet eight seconds; the p99 and the max are what a frame with about seventeen arrivals cost, and it stayed under half a frame. The threshold was written before the run, in `thresholds/m5-max.arrivals.json`: script p99 at most 8 ms, no dropped frames, no long tasks, the three ids held. Met on the first run; the result is `results/m5-max/2026-09-22T1621-arrivals-1000x10-a2000-2000ms.json`.

A second rig, a WebView2 run on the Windows machine, is the next data point, not a verdict, and waits on time on that machine.

## Apple M5 Max, 2026-09-23: the tick chart

Same machine, headless Chromium. The `chart` scenario (`just bench --scenario chart`): `price-chart` over five thousand one-second bars of history, then fifty ticks a frame, three thousand a second, folded into the open bar through the store with `foldTicks`, one `applyDeltas` a frame, the canvas redrawn once per batch by uPlot. After every frame's commit the run reads the price the header prints and compares it with the last tick folded, because a chart whose picture is a frame ahead of its own readout is lying to one of them. Script time here includes uPlot's redraw of every bar, since `setData` runs on the store's batch; rasterization is the frame's. Milliseconds.

| Run | Ticks per frame | Frames | Dropped | Long tasks | Frame p99 | Script p50 | Script p99 | Script max | Ticks folded | Header held |
|---|---|---|---|---|---|---|---|---|---|---|
| First | 50 | 602 | 0 | 0 | 16.8 | 0.4 | 0.6 | 0.7 | 33,100 | no |
| Second | 50 | 601 | 0 | 0 | 16.8 | 0.3 | 0.5 | 0.6 | 33,100 | yes |

The first run missed on the one thing that was not a number: the header. The chart's first cut kept its columns in a plain React state set from the store's subscription, and React commits such a state a scheduler task later than a `useSyncExternalStore` update, so when the run read the DOM after the store's microtask the header still printed the previous tick. Every other item reads its store through `useSyncExternalStore` and commits in that microtask; the chart now does too (`useStoreMeta` and a memo keyed on the batch version, the canvas fed in a layout effect before paint), and the second run, same shape, held. The threshold was written before the first run, in `thresholds/m5-max.chart.json`: script p99 at most 8 ms, no dropped frames, no long tasks, the header never behind. The first result stays as the record at `results/m5-max/2026-09-23T0330-chart-line-5000-t50.json`; the second is `results/m5-max/2026-09-23T0402-chart-line-5000-t50.json`.

Under a millisecond of script for five thousand bars redrawn sixty times a second is the number uPlot was chosen for. The candle kind (`--kind candles`) draws through a hook with a `fillRect` per bar instead of a path and has not been measured yet.
