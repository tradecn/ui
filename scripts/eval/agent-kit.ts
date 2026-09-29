// The agent kit eval: does a coding agent build screens that keep the item contract more often with the kit
// installed than without it? Each trial copies a consumer with every tradecn item installed, the kit's files in one
// arm and not the other, hands Copilot CLI a screen to build, and grades what it leaves (bench/agent-kit/README.md).
//   bun scripts/eval/agent-kit.ts [--models a,b] [--tasks a,b] [--arms kit,bare] [--trials N] [--jobs N]
//     [--style base-mira] [--timeout-min N] [--machine <name>] [--no-build] [--keep]
// Without --machine nothing is written to the repository. With it, the run lands in
// bench/agent-kit/results/<machine>/<stamp>.json with the verdict bench/agent-kit/expectations.json defines.
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { chromium, type Browser } from "@playwright/test"
import { CONTRACT_RULES, type ContractRule } from "../../registry/tradecn/lib/agent-kit"
import { ROOT, readJson } from "../lib/registry"
import { gradePage, itemsImported, sourceFindings, type PageGrade } from "./grade"
import { FRAME, promptFor, readTasks, type Task } from "./tasks"

type Arm = "kit" | "bare"
const GRADES = ["builds", "types", "renders", "contract", "source", "items"] as const
type Grade = (typeof GRADES)[number]

const argv = process.argv.slice(2)
const option = (name: string) => {
  const index = argv.indexOf(`--${name}`)
  return index >= 0 ? argv[index + 1] : undefined
}
const list = (name: string, fallback: string) => (option(name) ?? fallback).split(",").map((value) => value.trim()).filter(Boolean)

const models = list("models", "gpt-5.6-sol,gpt-5.6-terra,gemini-3.8-flash")
const arms = list("arms", "kit,bare") as Arm[]
const trials = Number(option("trials") ?? 2)
const jobs = Number(option("jobs") ?? 3)
const style = option("style") ?? "base-mira"
const timeoutMs = Number(option("timeout-min") ?? 20) * 60_000
const machine = option("machine")
const allTasks = readTasks()
const wanted = option("tasks")?.split(",")
const tasks = wanted ? allTasks.filter((task) => wanted.includes(task.name)) : allTasks
if (!tasks.length || arms.some((arm) => arm !== "kit" && arm !== "bare")) {
  console.error("usage: bun scripts/eval/agent-kit.ts [--models a,b] [--tasks a,b] [--arms kit,bare] [--trials N] [--jobs N] [--style base-mira] [--timeout-min N] [--machine <name>] [--no-build] [--keep]")
  process.exit(2)
}

function run(cmd: string[], cwd: string, timeout = 600_000, env: Record<string, string | undefined> = process.env) {
  const result = Bun.spawnSync(cmd, { cwd, stdout: "pipe", stderr: "pipe", timeout, env })
  return { ok: result.exitCode === 0, output: result.stdout.toString() + result.stderr.toString() }
}
function must(cmd: string[], cwd: string, what: string) {
  const result = run(cmd, cwd)
  if (!result.ok) throw new Error(`${what} failed:\n${result.output.slice(-2000)}`)
  return result.output
}

// The version the trials run: with auto-update off and a fresh COPILOT_HOME, the installed binary, not a newer one the
// runner's own sessions may have cached.
const probeHome = path.join(os.tmpdir(), `tradecn-agent-kit-eval-probe-${process.pid}`)
const copilot = run(["copilot", "--version"], ROOT, 60_000, { PATH: process.env.PATH, HOME: probeHome, COPILOT_HOME: path.join(probeHome, ".copilot"), COPILOT_AUTO_UPDATE: "false" })
rmSync(probeHome, { recursive: true, force: true })
if (!copilot.ok) throw new Error("copilot is not on PATH: install GitHub Copilot CLI first")
const cliVersion = /\d+\.\d+\.\d+(?:-[\w.]*\w)?/.exec(copilot.output)?.[0] ?? copilot.output.trim()
const token = run(["gh", "auth", "token"], ROOT).output.trim()
if (!token) throw new Error("gh has no token: run `gh auth login` first")
const shadcn = `shadcn@${readJson<{ devDependencies: Record<string, string> }>(path.join(ROOT, "package.json")).devDependencies.shadcn}`

if (!argv.includes("--no-build")) must(["bun", "run", "registry:build"], ROOT, "registry build")
const built = path.join(ROOT, "public/r")
const itemFiles = readdirSync(built).filter((file) => file.endsWith(".json") && file !== "registry.json")
const items = itemFiles.map((file) => ({ file: path.join(built, file), ...readJson<{ name: string; type: string }>(path.join(built, file)) }))
const itemNames = new Set(items.map((item) => item.name))
if (!itemNames.has("agent-kit")) throw new Error("public/r has no agent-kit item: build the registry from a branch that has the kit")

const stamp = new Date().toISOString().slice(0, 16).replace(":", "")
const runDir = path.join(os.tmpdir(), "tradecn-agent-kit-eval", stamp)
mkdirSync(runDir, { recursive: true })
const count = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`
console.log(`agent kit eval: ${count(models.length, "model")}, ${count(tasks.length, "task")}, arms ${arms.join(" and ")}, ${count(trials, "trial")} each, in ${runDir}`)

// A consumer as the fixture commits it, every item but the themes installed through the real CLI, and the kit in
// the kit arm only. The stub App renders nothing, so a trial that leaves it alone renders nothing and fails.
function prepareTemplate(arm: Arm): string {
  const dir = path.join(runDir, "templates", arm)
  const fixture = `fixtures/consumers/${style}`
  // From HEAD, not the working tree: the consumer matrix installs into the fixture in place while it runs.
  for (const file of must(["git", "ls-files", fixture], ROOT, "listing the fixture").split("\n").filter(Boolean)) {
    const to = path.join(dir, path.relative(fixture, file))
    mkdirSync(path.dirname(to), { recursive: true })
    const shown = Bun.spawnSync(["git", "show", `HEAD:${file}`], { cwd: ROOT, stdout: "pipe" })
    if (shown.exitCode !== 0) throw new Error(`reading ${file} from HEAD failed`)
    writeFileSync(to, shown.stdout)
  }
  must(["bun", "install", "--frozen-lockfile"], dir, `${arm}: bun install`)
  const install = items.filter((item) => item.type !== "registry:theme" && (arm === "kit" || item.name !== "agent-kit")).map((item) => item.file)
  let added = run(["bunx", shadcn, "add", "-y", "-o", "-c", dir, ...install], ROOT)
  for (let attempt = 1; !added.ok && attempt < 3; attempt++) added = run(["bunx", shadcn, "add", "-y", "-o", "-c", dir, ...install], ROOT)
  if (!added.ok) throw new Error(`${arm}: shadcn add failed:\n${added.output.slice(-2000)}`)
  writeFileSync(path.join(dir, ".gitignore"), "node_modules\ndist\n")
  writeFileSync(path.join(dir, "src/App.tsx"), "export default function App() {\n  return null\n}\n")
  writeFileSync(
    path.join(dir, "src/main.tsx"),
    'import { StrictMode } from "react"\nimport { createRoot } from "react-dom/client"\nimport App from "./App"\nimport "./index.css"\n\ncreateRoot(document.getElementById("root")!).render(\n  <StrictMode>\n    <App />\n  </StrictMode>,\n)\n',
  )
  must(["bunx", "vite", "build", "--logLevel", "error"], dir, `${arm}: building the stub`)
  const kitFiles = existsSync(path.join(dir, ".github/skills/tradecn/SKILL.md"))
  if (kitFiles !== (arm === "kit")) throw new Error(`${arm}: the kit's skill is ${kitFiles ? "present" : "missing"}`)
  rmSync(path.join(dir, "dist"), { recursive: true, force: true })
  return dir
}

const SKIP = new Set(["node_modules", "dist", ".git"])
function snapshot(dir: string): Map<string, string> {
  const out = new Map<string, string>()
  const walk = (at: string) => {
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      if (SKIP.has(entry.name)) continue
      const full = path.join(at, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile()) out.set(path.relative(dir, full), createHash("sha1").update(readFileSync(full)).digest("hex"))
    }
  }
  walk(dir)
  return out
}

// On macOS, what runs an agent or its code runs in a sandbox that refuses writes under the real home: the agent
// itself, and the build and typecheck that execute its vite.config.ts and read its tsconfig.
const realHome = process.env.HOME ?? os.homedir()
const sandboxed = (cmd: string[]) => (process.platform === "darwin" ? ["sandbox-exec", "-p", `(version 1)(allow default)(deny file-write* (subpath ${JSON.stringify(realHome)}))`, ...cmd] : cmd)

function killTree(pid: number) {
  const children = Bun.spawnSync(["pgrep", "-P", String(pid)]).stdout.toString().split("\n").filter(Boolean).map(Number)
  for (const child of children) killTree(child)
  try {
    process.kill(pid, "SIGKILL")
  } catch {
    // Already gone: a child can exit between pgrep and the kill.
  }
}

interface Trial {
  id: string
  model: string
  task: Task
  arm: Arm
  n: number
}

interface TrialRecord {
  id: string
  model: string
  task: string
  arm: Arm
  trial: number
  agent: { exitCode: number | null; timedOut: boolean; minutes: number; premiumRequests: number | null; modelId: string | null }
  files: { added: string[]; changed: string[] }
  typeErrors: string[]
  source: ReturnType<typeof sourceFindings>
  items: string[]
  page: PageGrade | null
  passes: Record<Grade, boolean>
}

// Copilot reads its skills and instructions from the working directory once it trusts it (COPILOT_ALLOW_ALL=true),
// and nothing of the person running the eval: its own HOME and COPILOT_HOME, the token passed in and hidden from
// the agent's shell, and no GitHub MCP server.
async function runAgent(trial: Trial, work: string, meta: string) {
  const home = path.join(meta, "home")
  for (const dir of [home, path.join(meta, "logs"), path.join(meta, "tmp")]) mkdirSync(dir, { recursive: true })
  const env = {
    PATH: process.env.PATH ?? "",
    LANG: process.env.LANG ?? "en_US.UTF-8",
    HOME: home,
    COPILOT_HOME: path.join(home, ".copilot"),
    COPILOT_ALLOW_ALL: "true",
    COPILOT_AUTO_UPDATE: "false",
    NO_COLOR: "1",
    TMPDIR: path.join(meta, "tmp"),
    GH_TOKEN: token,
  }
  const agent = ["copilot", "-p", promptFor(trial.task), "--allow-all-tools", "--disable-builtin-mcps", "--no-auto-update", "--secret-env-vars=GH_TOKEN", "--model", trial.model, "--output-format", "json", "--log-dir", path.join(meta, "logs")]
  const started = Date.now()
  const proc = Bun.spawn(sandboxed(agent), { cwd: work, env, stdout: Bun.file(path.join(meta, "session.jsonl")), stderr: Bun.file(path.join(meta, "session.err")) })
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    killTree(proc.pid)
  }, timeoutMs)
  const exitCode = await proc.exited
  clearTimeout(timer)
  const events = readFileSync(path.join(meta, "session.jsonl"), "utf8")
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as { type?: string; usage?: { premiumRequests?: number }; data?: { model?: string; modelCacheState?: { modelId?: string }[] } }]
      } catch {
        return []
      }
    })
  const result = events.find((event) => event.type === "result")
  // The model that answered, as the session reports it: on each message, or in the usage checkpoint.
  const modelId = events.find((event) => event.data?.model)?.data?.model ?? events.flatMap((event) => event.data?.modelCacheState ?? []).find((state) => state.modelId)?.modelId ?? null
  return { exitCode: timedOut ? null : exitCode, timedOut, minutes: (Date.now() - started) / 60_000, premiumRequests: result?.usage?.premiumRequests ?? null, modelId }
}

async function runTrial(trial: Trial, template: string, browser: Browser): Promise<TrialRecord> {
  const root = path.join(runDir, "trials", trial.id)
  const work = path.join(root, "work")
  const meta = path.join(root, "meta")
  mkdirSync(root, { recursive: true })
  // An APFS clone where the platform has one, so node_modules costs nothing to copy.
  if (!run(["cp", "-cR", template, work], ROOT).ok) must(["cp", "-R", template, work], ROOT, "copying the template")
  mkdirSync(meta, { recursive: true })
  const before = snapshot(work)
  const agent = await runAgent(trial, work, meta)
  const after = snapshot(work)
  const added = [...after.keys()].filter((file) => !before.has(file)).sort()
  const changed = [...after.keys()].filter((file) => before.has(file) && before.get(file) !== after.get(file)).sort()
  const authored = [...added, ...changed].filter((file) => /\.(tsx?|jsx?|css)$/.test(file) && !file.startsWith(".github/")).map((file) => ({ file, source: readFileSync(path.join(work, file), "utf8") }))

  rmSync(path.join(work, "dist"), { recursive: true, force: true })
  const graderEnv = { ...process.env, HOME: path.join(meta, "home"), TMPDIR: path.join(meta, "tmp") }
  const build = run(sandboxed(["bunx", "vite", "build", "--logLevel", "error"]), work, 300_000, graderEnv)
  const tsc = run(sandboxed(["bunx", "tsc", "-p", "tsconfig.app.json", "--noEmit", "--pretty", "false"]), work, 300_000, graderEnv)
  const mine = new Set(authored.map((file) => file.file))
  const typeErrors = tsc.output.split("\n").filter((line) => /\berror TS\d+/.test(line) && mine.has(line.split("(")[0]!.trim()))
  const source = sourceFindings(authored)
  const used = itemsImported(authored, itemNames)
  const page = build.ok ? await gradePage(path.join(work, "dist"), browser, { screenshot: path.join(meta, "screen.png") }) : null
  const findings = page ? CONTRACT_RULES.reduce((sum, rule) => sum + page.findings[rule], 0) : 0
  const passes: Record<Grade, boolean> = {
    builds: build.ok,
    types: typeErrors.length === 0,
    renders: Boolean(page?.rendered) && page!.pageErrors.length === 0,
    // A clean page that checked no text at all is an empty page, not a pass.
    contract: Boolean(page?.rendered) && findings === 0 && page!.checked.floor > 0,
    source: source.floor.length + source.font.length + source.tabular.length === 0,
    items: trial.task.expects.some((name) => used.includes(name)),
  }
  const record: TrialRecord = { id: trial.id, model: trial.model, task: trial.task.name, arm: trial.arm, trial: trial.n, agent, files: { added, changed }, typeErrors, source, items: used, page, passes }
  writeFileSync(path.join(meta, "record.json"), JSON.stringify(record, null, 2))
  if (!argv.includes("--keep")) rmSync(work, { recursive: true, force: true })
  return record
}

async function pool<T, R>(inputs: T[], size: number, fn: (input: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(inputs.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(size, inputs.length) }, async () => {
      while (next < inputs.length) {
        const index = next++
        out[index] = await fn(inputs[index]!)
      }
    }),
  )
  return out
}

const templates = Object.fromEntries(arms.map((arm) => [arm, prepareTemplate(arm)])) as Record<Arm, string>
const queue: Trial[] = []
for (let n = 1; n <= trials; n++) for (const task of tasks) for (const model of models) for (const arm of arms) queue.push({ id: `${model}-${task.name}-${arm}-${n}`, model, task, arm, n })

const browser = await chromium.launch()
const browserVersion = browser.version()
let done = 0
const records = await pool(queue, jobs, async (trial) => {
  const record = await runTrial(trial, templates[trial.arm], browser)
  done++
  const found = record.page ? CONTRACT_RULES.filter((rule) => record.page!.findings[rule]).map((rule) => `${rule} ${record.page!.findings[rule]}`).join(", ") || "none" : "no page"
  const failed = GRADES.filter((grade) => !record.passes[grade])
  console.log(`[${done}/${queue.length}] ${trial.id}: ${failed.length ? `fails ${failed.join(", ")}` : "passes all"}; findings ${found}; ${record.agent.timedOut ? "timed out" : `${record.agent.minutes.toFixed(1)} min`}, ${record.agent.premiumRequests ?? "?"} requests`)
  return record
})
await browser.close()

// Rates per model and arm, and the verdict the expectations file defines.
interface Summary {
  screens: number
  rates: Record<Grade, number>
  meanFindings: Record<ContractRule, number>
  meanHandFormatted: number
  meanVisibleCueDirection: number
  timedOut: number
  meanMinutes: number
  premiumRequests: number
}
function summarize(of: TrialRecord[]): Summary {
  const rate = (grade: Grade) => (of.length ? of.filter((record) => record.passes[grade]).length / of.length : 0)
  const pages = of.filter((record) => record.page?.rendered)
  const mean = (value: (record: TrialRecord) => number, from: TrialRecord[]) => (from.length ? from.reduce((sum, record) => sum + value(record), 0) / from.length : 0)
  return {
    screens: of.length,
    rates: Object.fromEntries(GRADES.map((grade) => [grade, rate(grade)])) as Record<Grade, number>,
    meanFindings: Object.fromEntries(CONTRACT_RULES.map((rule) => [rule, mean((record) => record.page!.findings[rule], pages)])) as Record<ContractRule, number>,
    meanHandFormatted: mean((record) => record.source.handFormatted.length, of),
    meanVisibleCueDirection: mean((record) => record.page!.visibleCueDirection, pages),
    timedOut: of.filter((record) => record.agent.timedOut).length,
    meanMinutes: mean((record) => record.agent.minutes, of),
    premiumRequests: of.reduce((sum, record) => sum + (record.agent.premiumRequests ?? 0), 0),
  }
}

interface Expectations {
  writtenOn: string
  claim: string
  helps: { higher: Grade; noLower: Grade[] }
}
const expectations = readJson<Expectations>(path.join(ROOT, "bench/agent-kit/expectations.json"))
const summary: Record<string, Partial<Record<Arm, Summary>>> = {}
const verdict: Record<string, { helps: boolean; why: string }> = {}
const pct = (value: number) => `${Math.round(value * 100)}%`
for (const model of models) {
  summary[model] = {}
  for (const arm of arms) summary[model][arm] = summarize(records.filter((record) => record.model === model && record.arm === arm))
  const kit = summary[model].kit
  const bare = summary[model].bare
  if (kit && bare) {
    const higher = kit.rates[expectations.helps.higher] > bare.rates[expectations.helps.higher]
    const lower = expectations.helps.noLower.filter((grade) => kit.rates[grade] < bare.rates[grade])
    verdict[model] = {
      helps: higher && lower.length === 0,
      why: `${expectations.helps.higher} ${pct(kit.rates[expectations.helps.higher])} with the kit against ${pct(bare.rates[expectations.helps.higher])} without${lower.length ? `; lower with the kit: ${lower.join(", ")}` : ""}`,
    }
  }
}

console.log("")
for (const model of models) {
  console.log(`${model}${verdict[model] ? `: ${verdict[model].helps ? "the kit helps" : "the kit does not help"} (${verdict[model].why})` : ""}`)
  for (const arm of arms) {
    const s = summary[model]![arm]!
    console.log(`  ${arm.padEnd(4)} ${s.screens} screens | ${GRADES.map((grade) => `${grade} ${pct(s.rates[grade])}`).join(" | ")} | findings per page ${CONTRACT_RULES.map((rule) => `${rule} ${s.meanFindings[rule].toFixed(1)}`).join(" ")} | hand-formatted ${s.meanHandFormatted.toFixed(1)} | ${s.meanMinutes.toFixed(1)} min | ${s.premiumRequests} requests${s.timedOut ? ` | ${s.timedOut} timed out` : ""}`)
  }
}

const result = { writtenAt: new Date().toISOString(), machine: machine ?? null, agent: { cli: "copilot", version: cliVersion }, browser: `Chromium ${browserVersion}`, frame: FRAME, style, trials, tasks: tasks.map((task) => task.name), arms, models, expectations, summary, verdict, records }
writeFileSync(path.join(runDir, "result.json"), JSON.stringify(result, null, 2))
if (machine) {
  const out = path.join(ROOT, "bench/agent-kit/results", machine)
  mkdirSync(out, { recursive: true })
  const file = path.join(out, `${stamp}.json`)
  writeFileSync(file, JSON.stringify(result, null, 2) + "\n")
  console.log(`\nwrote ${path.relative(ROOT, file)}`)
} else console.log(`\nnothing written to the repository without --machine; the run is at ${path.join(runDir, "result.json")}`)
