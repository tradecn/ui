// Run the browser bench against a production build of the playground and print the numbers.
//   bun scripts/bench.ts [--machine "<name>"] [--rows N] [--visible N] [--cols N] [--updates N] [--seconds N] [--warmup-ms MS] [--preset rfq] [--hold MS] [--no-build]
// Without --machine nothing is written. With it, results land in bench/results/<machine>/<date>.json and,
// if bench/thresholds/<machine>.json exists, the run fails when it misses a threshold written before the run.
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { chromium } from "@playwright/test"
import { ROOT, readJson } from "./lib/registry"

interface BenchResult {
  done: boolean
  frames: number
  p50: number
  p99: number
  max: number
  mean: number
  droppedFrames: number
  droppedThresholdMs: number
  droppedAt: { frame: number; ms: number; scriptMs: number }[]
  longTasks: number
  cellsPaintedPerFrame: number
  scriptP50: number
  scriptP99: number
  scriptMax: number
  userAgent: string
}
type BenchWindow = Window & { __tradecnBench?: BenchResult }

interface Thresholds {
  machine: string
  writtenOn: string
  rows: number
  visible: number
  columns: number
  updatesPerFrame: number
  seconds: number
  /** Frame p99 under vsync is quantized to the display interval, so a limit here says only whether a frame was missed. The first m5-max file used it; later files gate script time instead. */
  p99FrameMs?: number
  /** Script time per frame at p99: the headroom number. */
  scriptP99Ms?: number
  droppedFramesAllowed: number
  longTasksAllowed: number
  /** The file this one replaced. A superseded file is kept beside it, unedited, as the record. */
  supersedes?: string
}

const args = process.argv.slice(2)
const opt = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : undefined
}
const machine = opt("machine")
const params = {
  rows: Number(opt("rows") ?? 1000),
  visible: Number(opt("visible") ?? 60),
  cols: Number(opt("cols") ?? 12),
  updates: Number(opt("updates") ?? 2000),
  seconds: Number(opt("seconds") ?? 10),
  preset: opt("preset") ?? "rfq",
  hold: Number(opt("hold") ?? 0),
  warmupMs: Number(opt("warmup-ms") ?? 1000),
}
const port = 5181
const playground = path.join(ROOT, "playground")

if (!args.includes("--no-build")) {
  console.log("building playground")
  const build = Bun.spawnSync(["bun", "run", "build"], { cwd: playground, stdout: "ignore", stderr: "inherit" })
  if (build.exitCode !== 0) process.exit(build.exitCode)
}

// Spawn vite itself with no inherited pipes: killing a wrapper leaves the server holding stderr open and the script never exits.
const server = Bun.spawn([path.join(ROOT, "node_modules/.bin/vite"), "preview", "--port", String(port), "--strictPort", "--host", "127.0.0.1"], { cwd: playground, stdin: "ignore", stdout: "ignore", stderr: "ignore" })
let exitCode = 0
try {
  await waitFor(`http://127.0.0.1:${port}/`)
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
  const query = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)] as [string, string]))
  await page.goto(`http://127.0.0.1:${port}/bench?${query}`)
  await page.waitForFunction(() => (window as BenchWindow).__tradecnBench?.done === true, undefined, { timeout: (params.seconds + params.warmupMs / 1000 + 30) * 1000 })
  const result = (await page.evaluate(() => (window as BenchWindow).__tradecnBench))!
  await browser.close()

  const rows: [string, string][] = [
    ["frames", String(result.frames)],
    ["p50 ms", result.p50.toFixed(2)],
    ["p99 ms", result.p99.toFixed(2)],
    ["max ms", result.max.toFixed(2)],
    ["mean ms", result.mean.toFixed(2)],
    [`dropped (>${result.droppedThresholdMs.toFixed(1)} ms)`, String(result.droppedFrames)],
    ["long tasks", String(result.longTasks)],
    ["cells painted / frame", result.cellsPaintedPerFrame.toFixed(0)],
    ["script p50 ms", result.scriptP50.toFixed(2)],
    ["script p99 ms", result.scriptP99.toFixed(2)],
    ["script max ms", result.scriptMax.toFixed(2)],
  ]
  console.log(`\nbench ${params.rows} rows, ${params.visible} visible, ${params.cols} cols, ${params.updates} patches/frame, ${params.seconds}s, preset ${params.preset}`)
  for (const [k, v] of rows) console.log(`  ${k.padEnd(22)} ${v}`)
  if (result.droppedAt.length) console.log("  dropped at             " + result.droppedAt.slice(0, 12).map((d) => `#${d.frame} ${d.ms.toFixed(1)}ms (script ${d.scriptMs.toFixed(1)})`).join(", "))

  if (!machine) {
    console.log("\nno --machine given: nothing written")
  } else {
    exitCode = record(result)
  }
} finally {
  server.kill("SIGKILL")
}
process.exit(exitCode)

function record(result: BenchResult): number {
  if (!machine) return 0
  const now = new Date()
  const date = now.toISOString().slice(0, 10)
  const time = now.toISOString().slice(11, 16).replace(":", "")
  const dir = path.join(ROOT, "bench/results", machine)
  mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `${date}T${time}-${params.preset}-${params.rows}x${params.cols}-u${params.updates}.json`)
  writeFileSync(file, JSON.stringify({ machine, date, ...result, userAgent: result.userAgent }, null, 2) + "\n")
  console.log(`\nwrote ${path.relative(ROOT, file)}`)

  const thresholdsFile = path.join(ROOT, "bench/thresholds", `${machine}.json`)
  if (existsSync(thresholdsFile)) {
    const t = readJson<Thresholds>(thresholdsFile)
    const applies = t.rows === params.rows && t.visible === params.visible && t.columns === params.cols && t.updatesPerFrame === params.updates
    if (!applies) {
      console.log(`thresholds in ${path.relative(ROOT, thresholdsFile)} are for a different shape; not compared`)
    } else {
      const fails: string[] = []
      if (t.p99FrameMs !== undefined && result.p99 > t.p99FrameMs) fails.push(`p99 ${result.p99.toFixed(2)} ms > ${t.p99FrameMs} ms`)
      if (t.scriptP99Ms !== undefined && result.scriptP99 > t.scriptP99Ms) fails.push(`script p99 ${result.scriptP99.toFixed(2)} ms > ${t.scriptP99Ms} ms`)
      if (result.droppedFrames > t.droppedFramesAllowed) fails.push(`dropped ${result.droppedFrames} > ${t.droppedFramesAllowed}`)
      if (result.longTasks > t.longTasksAllowed) fails.push(`long tasks ${result.longTasks} > ${t.longTasksAllowed}`)
      if (fails.length) {
        console.error(`\nthresholds (written ${t.writtenOn}) missed:\n  ` + fails.join("\n  "))
        return 1
      }
      console.log(`thresholds written ${t.writtenOn} met`)
    }
  }
  return 0
}

async function waitFor(url: string) {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(url)
      if (r.ok) return
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`server at ${url} did not come up`)
}
