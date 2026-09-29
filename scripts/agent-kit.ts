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

// Where a registry file is imported from once the CLI installs it.
const importPath = (file: string) => file.replace(/^registry\/tradecn\/ui\//, "@/components/ui/").replace(/^registry\/tradecn\/(hooks|lib)\//, "@/$1/").replace(/\.tsx?$/, "")

/**
 * The index as Markdown. An item's exports are the ones its meta names, or else the values its primary file exports,
 * then the values of each file it alone bundles. A file another item leads with is that item's, so a lib bundled into
 * a component is listed once, under the lib. A file several items bundle and none leads with is listed once, under
 * Shared, with the items that install it, so the index an agent reads whole doesn't repeat a hook under each of them.
 */
export function renderItems(items: readonly RegistryItem[], read: (file: string) => string, cli: string): string {
  const primaries = new Set(items.map(primaryOf).filter(Boolean))
  const bundlers = new Map<string, RegistryItem[]>()
  for (const item of items)
    for (const file of item.files ?? []) if (/\.tsx?$/.test(file.path) && file.path !== primaryOf(item) && !primaries.has(file.path)) bundlers.set(file.path, [...(bundlers.get(file.path) ?? []), item])
  const valuesOf = (files: string[]) => [...new Set(files.flatMap((file) => [...read(file).matchAll(VALUE_EXPORT)].map((match) => match[1]!)))]
  const exportsOf = (item: RegistryItem) => {
    const primary = primaryOf(item)
    const named = item.meta?.components?.map((component) => component.title)
    const alone = [...bundlers].filter(([, by]) => by.length === 1 && by[0] === item).map(([file]) => file)
    return [...new Set([...(named?.length ? named : valuesOf(primary ? [primary] : [])), ...valuesOf(alone)])]
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
  const shared = [...bundlers].filter(([, by]) => by.length > 1).sort(([a], [b]) => importPath(a).localeCompare(importPath(b), "en"))
  if (shared.length) {
    lines.push("", "## Shared", "", "Files no item leads with, installed with every item that bundles them.")
    for (const [file, by] of shared) {
      lines.push("", `### \`${importPath(file)}\``, "", `Installed with ${by.map((item) => item.name).sort((a, b) => a.localeCompare(b, "en")).map((name) => `\`${name}\``).join(", ")}.`)
      const names = valuesOf([file])
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
