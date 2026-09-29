#!/usr/bin/env bun
// The index the agent kit ships as the skill's references/items.md: every item in registry.json, by kind, with
// what it is for, what it exports, and how it installs. It is written from the registry and the items' own files,
// so a coding agent reads what the tag has. `just agent-kit` writes it, and scripts/agent-kit.test.ts fails when a
// change to the registry leaves it stale.
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { ROOT, readJson, readRegistry, type RegistryItem } from "./lib/registry"

/** Where the index lives in the checkout. The kit installs it at .github/skills/tradecn/references/items.md. */
export const ITEMS_MD = "registry/tradecn/agents/tradecn/references/items.md"

const KINDS: [string, (item: RegistryItem) => boolean][] = [
  ["Components", (item) => item.type === "registry:ui" || item.type === "registry:block"],
  ["Hooks", (item) => item.type === "registry:hook"],
  ["Utilities", (item) => item.type === "registry:lib"],
  ["Themes", (item) => item.type === "registry:theme"],
]

const VALUE_EXPORT = /^export (?:async )?(?:function|const|class|enum) (\w+)/gm

/** The CLI the registry is tested with, from package.json, so the install line says the version CI ran. */
export function cliVersion(): string {
  return readJson<{ devDependencies: Record<string, string> }>(path.join(ROOT, "package.json")).devDependencies.shadcn!
}

const primaryOf = (item: RegistryItem) => item.files?.find((file) => file.type === item.type)?.path

/**
 * The index as Markdown. An item's exports are the ones its meta names, or else the values its own files export. A
 * file another item leads with is that item's, so a lib bundled into a component is listed once, under the lib.
 */
export function renderItems(items: readonly RegistryItem[], read: (file: string) => string, cli: string): string {
  const primaries = new Set(items.map(primaryOf).filter(Boolean))
  const exportsOf = (item: RegistryItem) => {
    const named = item.meta?.components?.map((component) => component.title)
    if (named?.length) return named
    const own = (item.files ?? []).filter((file) => /\.tsx?$/.test(file.path) && (file.path === primaryOf(item) || !primaries.has(file.path)))
    return [...new Set(own.flatMap((file) => [...read(file.path).matchAll(VALUE_EXPORT)].map((match) => match[1]!)))]
  }
  const lines = [
    "# Items",
    "",
    `Every tradecn item at this tag, by kind. Install one with \`bun x shadcn@${cli} add -y -o -c <app dir> https://tradecn.dev/r/<tag>/<name>.json\`, one URL per argument, and read its page at \`https://tradecn.dev/<tag>/docs/<name>/\`. The list is generated from the registry, so it names what the tag has.`,
  ]
  for (const [kind, isKind] of KINDS) {
    const group = items.filter(isKind).sort((a, b) => (a.title ?? a.name).localeCompare(b.title ?? b.name, "en"))
    if (!group.length) continue
    lines.push("", `## ${kind}`)
    for (const item of group) {
      lines.push("", `### ${item.title ?? item.name} (\`${item.name}\`)`, "", item.description?.trim() ?? "")
      const names = exportsOf(item)
      if (names.length) lines.push("", `Exports: ${names.map((name) => `\`${name}\``).join(", ")}.`)
    }
  }
  return `${lines.join("\n")}\n`
}

if (import.meta.main) {
  const { items } = readRegistry()
  writeFileSync(path.join(ROOT, ITEMS_MD), renderItems(items, (file) => readFileSync(path.join(ROOT, file), "utf8"), cliVersion()))
  console.log(`agent-kit: ${ITEMS_MD} lists ${items.length} items`)
}
