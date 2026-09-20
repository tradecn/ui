# bench

`just bench` builds the playground, opens `/bench` in headless Chromium, and prints frame timing for a synthetic per-frame feed: N rows, V visible, C numeric columns, U random cell patches applied in one `applyDeltas` per animation frame, for S seconds after a warm-up. The values come from a seeded generator, so two runs see the same data.

What it records:

- Frame pacing: rAF-to-rAF deltas (p50, p99, max, mean). Under vsync these are quantized to the display interval, so they say whether a frame was missed, not how much room was left.
- Dropped frames: intervals longer than 1.5 times the median frame, with the index and length of each.
- Script time per frame: building the batch, `applyDeltas`, and React's render and commit, measured to the microtask after React's. This is the headroom number. It excludes style, layout, and paint.
- Long tasks from `PerformanceObserver`, and how many patched cells landed in the visible window.

Nothing is written unless you pass `--machine "<name>"`. Then the run lands in `results/<machine>/` and, if `thresholds/<machine>.json` exists for that shape, the run fails when it misses a threshold. Thresholds are written before the first run on a machine and are never edited to make a run pass.

## Apple M5 Max, 2026-09-20

128 GB, macOS 27.0, Playwright headless Chromium 153. 1,000 rows, 60 visible, 12 numeric columns, `rfq` preset, 10 s measured after 1 s of warm-up. Milliseconds.

| Patches per frame | Visible cells changed per frame | Frames | Dropped | Frame p99 | Script p50 | Script p99 | Script max |
|---|---|---|---|---|---|---|---|
| 2,000 | 136 | 601 | 0 | 16.8 | 2.7 | 3.0 | 3.2 |
| 5,000 | 341 | 600 | 1 | 16.8 | 3.9 | 7.4 | 8.0 |
| 10,000 | 682 | 500 | 101 | 33.4 | 6.3 | 10.5 | 12.1 |

At 2,000 patches per frame every frame is one vsync and the script work is about 3 ms of a 16.7 ms frame. 5,000 is the edge on this machine: across the day's runs it was clean more often than not, and when it dropped, it dropped one to five frames in six hundred. At 10,000, nearly every visible cell is changing on every frame and one frame in five is late; script time is still inside the budget there, so the cost is the hundreds of concurrent flash animations, not React.

The threshold file for this machine says frame p99 at most 16.7 ms, and the 2,000 run reports 16.8, so the run is recorded as a miss. The line was drawn at the vsync interval itself: timestamps are quantized to a tenth of a millisecond and a perfect run alternates 16.6, 16.7, and 16.8. The file stays as written. A threshold that measures what it meant to (no dropped frames, no long tasks, script p99 under a stated number) is a separate decision.

Headless Chromium on a laptop is not a trading desk PC. These numbers say how the grid behaves under its own load on named hardware; the numbers that matter for a deployment come from that deployment's machines.
