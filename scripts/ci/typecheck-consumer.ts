// Typecheck a consumer project after `shadcn add` and sort the errors by whose file they are in.
//   bun scripts/ci/typecheck-consumer.ts <consumerDir>
// tradecn's files (what public/r installs, plus the smoke scenes and entry) must be clean. Anything
// else is the consumer's own shadcn code: printed so drift is visible, never counted against tradecn.
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { ROOT } from "../lib/registry"

const consumer = process.argv[2]
if (!consumer) {
  console.error("usage: bun scripts/ci/typecheck-consumer.ts <consumerDir>")
  process.exit(2)
}

const ours = new Set<string>(["src/main.tsx"])
const built = path.join(ROOT, "public/r")
for (const f of readdirSync(built)) {
  if (!f.endsWith(".json") || f === "registry.json") continue
  const item = JSON.parse(readFileSync(path.join(built, f), "utf8")) as { files?: { path: string; type: string }[] }
  for (const file of item.files ?? []) {
    const base = path.basename(file.path)
    const dir = file.type === "registry:ui" ? "src/components/ui" : file.type === "registry:hook" ? "src/hooks" : file.type === "registry:lib" ? "src/lib" : null
    if (dir) ours.add(`${dir}/${base}`)
  }
}

const tsc = Bun.spawnSync(["bunx", "tsc", "-p", "tsconfig.app.json", "--noEmit", "--pretty", "false"], { cwd: consumer, stdout: "pipe", stderr: "pipe" })
const lines = (tsc.stdout.toString() + tsc.stderr.toString()).split("\n").filter((l) => /\berror TS\d+/.test(l))
const mine: string[] = []
const upstream: string[] = []
for (const line of lines) {
  const file = line.split("(")[0]!.trim()
  if (ours.has(file) || file.startsWith("src/smoke/")) mine.push(line)
  else upstream.push(line)
}
if (upstream.length) console.log(`upstream type errors in the consumer's own files (not tradecn's, reported for visibility):\n  ` + upstream.join("\n  "))
if (mine.length) {
  console.error(`type errors in tradecn files:\n  ` + mine.join("\n  "))
  process.exit(1)
}
console.log(`tradecn files typecheck clean in ${path.basename(consumer)} (${ours.size} files checked${upstream.length ? `, ${upstream.length} upstream errors ignored` : ""})`)
