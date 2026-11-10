import { describe, expect, it } from "vitest"
import { readRegistry } from "../lib/registry"
import { itemsImported, sourceFindings, typeErrorsOf } from "./grade"
import { FRAME, promptFor, readTasks } from "./tasks"

// The agent kit eval's graders and tasks. The page grader is checkContract, which the kit's own tests and the smoke
// scene hold; these hold what the eval adds around it.

describe("the agent kit eval", () => {
  const items = new Set(readRegistry().items.map((item) => item.name))

  it("reads each source rule the validator enforces, and counts hand-formatted numbers", () => {
    const findings = sourceFindings([
      {
        file: "src/App.tsx",
        source: ['<span className="text-[10px] font-mono tabular-nums">{px.toFixed(2)}</span>', '<span className="text-xs lining-nums tabular-nums">{formatPrice(px)}</span>'].join("\n"),
      },
      { file: "src/notes.md", source: "text-[9px]" },
    ])
    expect(findings).toEqual({
      floor: ["src/App.tsx:1: text-[10px]"],
      font: ["src/App.tsx:1: font-mono"],
      tabular: ["src/App.tsx:1: tabular-nums without lining-nums"],
      handFormatted: ["src/App.tsx:1: .toFixed("],
    })
  })

  it("reads a stylesheet as it reads a className, and in a changed file only the lines the agent added", () => {
    const findings = sourceFindings([
      { file: "src/desk.css", source: ".price {\n  @apply font-mono text-[11px];\n}" },
      // The consumer's index.css already applies font-sans; the agent added the .tag rule.
      { file: "src/index.css", original: "html {\n  @apply font-sans;\n}", source: "html {\n  @apply font-sans;\n}\n.tag {\n  @apply text-[10px];\n}" },
    ])
    expect(findings).toEqual({
      floor: ["src/desk.css:2: text-[11px]", "src/index.css:5: text-[10px]"],
      font: ["src/desk.css:2: font-mono"],
      tabular: [],
      handFormatted: [],
    })
  })

  it("counts a type error in what the agent wrote or in the config, and fails a compiler that never finished", () => {
    const output = [
      "src/App.tsx(3,7): error TS2322: Type 'string' is not assignable to type 'number'.",
      "src/components/ui/data-grid.tsx(9,1): error TS2307: Cannot find module 'x'.",
      "error TS5058: The specified path does not exist: 'tsconfig.app.json'.",
    ].join("\n")
    const touched = new Set(["src/App.tsx"])
    expect(typeErrorsOf({ ok: false, timedOut: false, output }, touched)).toEqual([
      "src/App.tsx(3,7): error TS2322: Type 'string' is not assignable to type 'number'.",
      "error TS5058: The specified path does not exist: 'tsconfig.app.json'.",
    ])
    expect(typeErrorsOf({ ok: true, timedOut: false, output: "" }, touched)).toEqual([])
    expect(typeErrorsOf({ ok: false, timedOut: true, output: "" }, touched)).toEqual(["tsc did not finish"])
    expect(typeErrorsOf({ ok: false, timedOut: false, output: "bunx: command not found: tsc" }, touched)).toEqual(["tsc failed without a diagnostic: bunx: command not found: tsc"])
  })

  it("names the tradecn items a screen imports, and nothing it only mentions or wrote itself", () => {
    const installed = new Set([
      "src/components/ui/data-grid.tsx",
      "src/lib/format.ts",
      "src/components/ticket.tsx",
      "src/components/ui/button.tsx",
      "src/hooks/use-hotkeys.ts",
      "src/components/ui/sparkline.tsx",
      "src/components/ui/watchlist.tsx",
    ])
    const source = [
      'import { DataGrid } from "@/components/ui/data-grid"',
      'import { formatSigned } from "./lib/format"',
      'import { Ticket } from "@/components/ticket"',
      'import { Button } from "@/components/ui/button"',
      'const hotkeys = import("@/hooks/use-hotkeys")',
      // An import in a comment is a mention, and the agent's own ./components/watchlist is not the item,
      // however it names the file.
      '// import { Sparkline } from "@/components/ui/sparkline"',
      'import { Watchlist } from "./components/watchlist"',
    ].join("\n")
    expect(itemsImported([{ file: "src/App.tsx", source }], items, installed)).toEqual(["data-grid", "format", "ticket", "use-hotkeys"])
  })

  it("asks for each screen in words that name no rule, and expects only items the registry has", () => {
    const tasks = readTasks()
    expect(tasks.map((task) => task.name)).toEqual(["positions", "rfq", "status", "ticket", "watchlist"])
    for (const task of tasks) {
      for (const name of task.expects) expect([...items], `${task.name} expects ${name}`).toContain(name)
      // The contract's own words would hand the bare arm what the kit is there to teach.
      expect(promptFor(task), task.name).not.toMatch(/tabular|lining|12 ?px|floor|contract|data-direction|accessible name|aria-/i)
      expect(promptFor(task).endsWith(FRAME), task.name).toBe(true)
    }
  })
})
