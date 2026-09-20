// Re-initialize the playground under another shadcn base and style, e.g. `just style radix nova`.
// Rewrites components.json and index.css tokens and reinstalls the built-ins already present.
import path from "node:path"
import { ROOT } from "./lib/registry"

const [base, preset] = process.argv.slice(2)
if (!base || !preset) {
  console.error("usage: bun scripts/switch-style.ts <base|radix|aria> <nova|vega|maia|lyra|mira|luma|sera|rhea>")
  process.exit(2)
}
const playground = path.join(ROOT, "playground")
const proc = Bun.spawn(["bunx", "shadcn@4.21.0", "init", "-b", base, "-p", preset, "-y", "-f", "--reinstall", "--no-monorepo", "-c", playground], {
  stdout: "inherit",
  stderr: "inherit",
})
process.exit(await proc.exited)
