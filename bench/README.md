# bench

`just bench` builds the playground, opens `/bench` in headless Chromium, and prints frame timing for a synthetic per-frame feed: N rows, V visible, C numeric columns, U random cell patches per animation frame, for S seconds. The page records rAF-to-rAF deltas (p50, p99, max, mean), frames over 33.4 ms, long tasks from `PerformanceObserver`, and how many patched cells landed in the visible window.

Nothing is written unless you pass `--machine "<name>"`. Then the run lands in `results/<machine>/<date>-<preset>-<rows>x<cols>-u<updates>.json`, and if `thresholds/<machine>.json` exists for that shape the run fails when it misses a threshold. Thresholds are written before the first run on a machine and are never edited to make a run pass.

Headless Chromium on a laptop is not a trading desk PC. These numbers say how the grid behaves under its own load on named hardware; the numbers that matter for a deployment come from that deployment's machines.
