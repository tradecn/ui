// Run the browser bench against a production build of the playground and print the numbers.
//   bun scripts/bench.ts [--machine "<name>"] [--rows N] [--visible N] [--cols N] [--updates N] [--seconds N] [--preset rfq] [--hold MS]
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
  longTasks: number
  cellsPaintedPerFrame: number
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
  p99FrameMs: number
  droppedFramesAllowed: number
  longTasksAllowed: number
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
}
const port = 5181
const playground = path.join(ROOT, "playground")

console.log("building playground")
const build = Bun.spawnSync(["bun", "run", "build"], { cwd: playground, stdout: "ignore", stderr: "inherit" })
if (build.exitCode !== 0) process.exit(build.exitCode)

const server = Bun.spawn(["bunx", "vite", "preview", "--port", String(port), "--strictPort", "--host", "127.0.0.1"], { cwd: playground, stdout: "ignore", stderr: "inherit" })
try {
  await waitFor(`http://127.0.0.1:${port}/`)
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
  const query = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)] as [string, string]))
  await page.goto(`http://127.0.0.1:${port}/bench?${query}`)
  await page.waitForFunction(() => (window as BenchWindow).__tradecnBench?.done === true, undefined, { timeout: (params.seconds + 30) * 1000 })
  const result = (await page.evaluate(() => (window as BenchWindow).__tradecnBench))!
  await browser.close()

  const rows: [string, string][] = [
    ["frames", String(result.frames)],
    ["p50 ms", result.p50.toFixed(2)],
    ["p99 ms", result.p99.toFixed(2)],
    ["max ms", result.max.toFixed(2)],
    ["mean ms", result.mean.toFixed(2)],
    ["dropped (>33.4 ms)", String(result.droppedFrames)],
    ["long tasks", String(result.longTasks)],
    ["cells painted / frame", result.cellsPaintedPerFrame.toFixed(0)],
  ]
  console.log(`\nbench ${params.rows} rows, ${params.visible} visible, ${params.cols} cols, ${params.updates} patches/frame, ${params.seconds}s, preset ${params.preset}`)
  for (const [k, v] of rows) console.log(`  ${k.padEnd(22)} ${v}`)

  if (!machine) {
    console.log("\nno --machine given: nothing written")
    process.exit(0)
  }
  const date = new Date().toISOString().slice(0, 10)
  const dir = path.join(ROOT, "bench/results", machine)
  mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `${date}-${params.preset}-${params.rows}x${params.cols}-u${params.updates}.json`)
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
      if (result.p99 > t.p99FrameMs) fails.push(`p99 ${result.p99.toFixed(2)} ms > ${t.p99FrameMs} ms`)
      if (result.droppedFrames > t.droppedFramesAllowed) fails.push(`dropped ${result.droppedFrames} > ${t.droppedFramesAllowed}`)
      if (result.longTasks > t.longTasksAllowed) fails.push(`long tasks ${result.longTasks} > ${t.longTasksAllowed}`)
      if (fails.length) {
        console.error(`\nthresholds (written ${t.writtenOn}) missed:\n  ` + fails.join("\n  "))
        process.exit(1)
      }
      console.log(`thresholds written ${t.writtenOn} met`)
    }
  }
} finally {
  server.kill()
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
