import { describe, expect, it } from "vitest"
import { readRegistry } from "../lib/registry"
import { itemsImported, sourceFindings } from "./grade"
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

  it("names the tradecn items a screen imports, and nothing else it imports", () => {
    const source = [
      'import { DataGrid } from "@/components/ui/data-grid"',
      'import { formatSigned } from "./lib/format"',
      'import { Ticket } from "@/components/ticket"',
      'import { Button } from "@/components/ui/button"',
      'const hotkeys = import("@/hooks/use-hotkeys")',
    ].join("\n")
    expect(itemsImported([{ file: "src/App.tsx", source }], items)).toEqual(["data-grid", "format", "ticket", "use-hotkeys"])
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
