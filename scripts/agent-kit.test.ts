import { readFileSync, readdirSync, statSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { ITEMS_MD, cliVersion, renderItems } from "./agent-kit"
import { ROOT, readRegistry } from "./lib/registry"

// The agent kit's Markdown is a promise to a coding agent that can't see this repository: the files land where
// GitHub Copilot looks, the links between them resolve once installed, and every item and export the skill
// names exists at the tag. These tests hold it to that as the registry changes.

const registry = readRegistry()
const kit = registry.items.find((item) => item.name === "agent-kit")!
const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8")
const docs = (kit.files ?? []).filter((file) => file.path.endsWith(".md"))
const targetOf = (file: string) => docs.find((doc) => doc.path === file)?.target?.replace(/^~\//, "")

function frontmatter(source: string): Record<string, string> {
  const block = /^---\n([\s\S]*?)\n---\n/.exec(source)?.[1] ?? ""
  return Object.fromEntries(block.split("\n").map((line) => /^([\w-]+): (.*)$/.exec(line)).filter((m) => m !== null).map((m) => [m[1]!, m[2]!.replace(/^"(.*)"$/, "$1")]))
}

function* files(dir: string): Generator<string> {
  for (const name of readdirSync(path.join(ROOT, dir))) {
    const rel = `${dir}/${name}`
    if (statSync(path.join(ROOT, rel)).isDirectory()) yield* files(rel)
    else yield rel
  }
}

describe("the agent kit", () => {
  it("keeps its item index current with the registry; run `just agent-kit` after changing an item", () => {
    expect(read(ITEMS_MD)).toBe(renderItems(registry.items, read, cliVersion()))
    for (const item of registry.items) expect(read(ITEMS_MD), item.name).toContain(`(\`${item.name}\`)`)
  })

  it("installs every file under agents/ where Copilot looks for it", () => {
    const shipped = [...files("registry/tradecn/agents")].sort()
    expect(docs.map((doc) => doc.path).sort()).toEqual(shipped)
    for (const doc of docs) {
      expect(doc.type, doc.path).toBe("registry:file")
      const target = targetOf(doc.path)!
      const rel = doc.path.slice("registry/tradecn/agents/".length)
      if (rel.endsWith(".instructions.md")) expect(target).toBe(`.github/instructions/${rel}`)
      else if (rel.endsWith(".prompt.md")) expect(target).toBe(`.github/prompts/${rel}`)
      else expect(target).toBe(`.github/skills/${rel}`)
    }
  })

  it("names the skill after its directory, and says what it does and when, inside Copilot's limits", () => {
    const skill = frontmatter(read("registry/tradecn/agents/tradecn/SKILL.md"))
    expect(skill.name).toBe("tradecn")
    expect(skill.name).toMatch(/^[a-z0-9-]{1,64}$/)
    expect(skill.description?.length).toBeGreaterThan(100)
    expect(skill.description!.length).toBeLessThanOrEqual(1024)
    expect(skill.description).toMatch(/Use it when/)
    const instructions = frontmatter(read("registry/tradecn/agents/tradecn.instructions.md"))
    expect(instructions.applyTo).toBe("**/*.tsx")
    const prompt = frontmatter(read("registry/tradecn/agents/tradecn-review.prompt.md"))
    expect(prompt.name).toBe("tradecn-review")
    expect(prompt.agent).toBe("agent")
    expect(prompt.description).toBeTruthy()
  })

  it("links only to files the kit installs, by the paths they land at", () => {
    for (const doc of docs) {
      const from = path.posix.dirname(targetOf(doc.path)!)
      for (const [, href] of read(doc.path).matchAll(/\]\(([^)#\s]+)\)/g)) {
        if (/^https?:/.test(href!)) continue
        expect(docs.map((d) => targetOf(d.path)), `${doc.path} links ${href}`).toContain(path.posix.normalize(path.posix.join(from, href!)))
      }
    }
  })

  it("installs with the CLI the registry is tested with", () => {
    expect(read("registry/tradecn/agents/tradecn/SKILL.md")).toContain(`bun x shadcn@${cliVersion()} add -y -o -c <app dir> https://tradecn.dev/r/<tag>/<item>.json`)
  })

  it("names only items and exports the registry has", () => {
    const skill = read("registry/tradecn/agents/tradecn/SKILL.md")
    const sources = registry.items.flatMap((item) => item.files ?? []).filter((file) => /\.tsx?$/.test(file.path)).map((file) => read(file.path)).join("\n")
    const exported = (name: string) => new RegExp(`^export (?:async )?(?:function|const|class) ${name}\\b`, "m").test(sources)
    const names = ["NUMERIC_CLASS", "MONO_NUMERIC_CLASS", "numericFontClass", "createInstrumentFormatter", "formatNotional", "formatBps", "formatTicks", "formatSigned", "parsePrice", "createRowStore", "createFrameBatcher", "useRow", "useRowIds", "FlashCell", "useHotkey", "HotkeyScope", "RfqStack", "Workspace", "Panel", "DATA_GRID_PRESETS", "checkContract"]
    for (const name of names) {
      expect(skill, name).toContain(`\`${name}`)
      expect(exported(name), `${name} is exported by an item`).toBe(true)
    }
    const items = ["format", "use-hotkeys", "perf-monitor", "window-set", "layout-manager", "preferences", "feed-health", "session-calendar", "tradecn-slate", "tradecn-slate-east", "tradecn-amber"]
    for (const name of items) {
      expect(skill, name).toContain(`\`${name}\``)
      expect(registry.items.map((item) => item.name)).toContain(name)
    }
    const presets = /`DATA_GRID_PRESETS` \(([^)]*)\)/.exec(skill)?.[1]?.match(/`([\w-]+)`/g)?.map((name) => name.slice(1, -1))
    const block = /export const DATA_GRID_PRESETS[^{]*\{\n([\s\S]*?)\n\}/.exec(read("registry/tradecn/ui/data-grid.tsx"))?.[1] ?? ""
    expect(presets).toEqual([...block.matchAll(/^\s+"?([\w-]+)"?: \{/gm)].map((match) => match[1]))
  })
})
