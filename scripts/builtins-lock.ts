// Records the exported symbols of every shadcn built-in tradecn composes, per locked style,
// by fetching ui.shadcn.com. `--check` refetches and fails on any change: that is the one class
// of shadcn update that could break a tradecn consumer, caught before a consumer finds it.
import { writeFileSync } from "node:fs"
import { Project, ScriptKind } from "ts-morph"
import { BUILTINS_LOCK_JSON, LOCKED_STYLES, readBuiltinsLock, readRegistry, stableJson, type BuiltinsLock } from "./lib/registry"

const check = process.argv.includes("--check")
const extra = process.argv.filter((a) => !a.startsWith("--")).slice(2)
const registry = readRegistry()
const previous = readBuiltinsLock()
const names = new Set<string>([
  ...registry.items.flatMap((i) => i.registryDependencies ?? []),
  ...Object.keys(previous?.items ?? {}),
  ...extra,
])

if (!names.size) {
  console.log("no built-ins to lock yet (no registryDependencies in registry.json)")
  process.exit(0)
}

const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { jsx: 4 } })
const lock: BuiltinsLock = { generatedAt: new Date().toISOString().slice(0, 10), styles: [...LOCKED_STYLES], items: {} }

for (const name of [...names].sort()) {
  lock.items[name] = {}
  for (const style of LOCKED_STYLES) {
    const url = `https://ui.shadcn.com/r/styles/${style}/${name}.json`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`)
    const item = (await res.json()) as { dependencies?: string[]; files?: { path: string; content?: string }[] }
    const exports = new Set<string>()
    for (const file of item.files ?? []) {
      if (!file.content) continue
      const sf = project.createSourceFile(`${style}/${name}/${file.path.split("/").pop()}`, file.content, {
        overwrite: true,
        scriptKind: file.path.endsWith(".tsx") ? ScriptKind.TSX : ScriptKind.TS,
      })
      for (const [exportName] of sf.getExportedDeclarations()) exports.add(exportName)
    }
    lock.items[name][style] = { exports: [...exports].sort(), dependencies: [...(item.dependencies ?? [])].sort() }
  }
}

if (check) {
  if (!previous) {
    console.error("no builtins.lock.json to check against; run `just lock-builtins` first")
    process.exit(1)
  }
  const diffs: string[] = []
  for (const [name, byStyle] of Object.entries(lock.items)) {
    for (const [style, now] of Object.entries(byStyle)) {
      const was = previous.items[name]?.[style]
      if (!was) {
        diffs.push(`${name} (${style}): not in lock`)
        continue
      }
      const gone = was.exports.filter((e) => !now.exports.includes(e))
      const added = now.exports.filter((e) => !was.exports.includes(e))
      if (gone.length) diffs.push(`${name} (${style}): exports removed upstream: ${gone.join(", ")}`)
      if (added.length) diffs.push(`${name} (${style}): exports added upstream: ${added.join(", ")}`)
    }
  }
  if (diffs.length) {
    console.error("upstream drift:\n  " + diffs.join("\n  "))
    process.exit(1)
  }
  console.log(`builtins lock matches upstream (${names.size} items, ${LOCKED_STYLES.length} styles)`)
} else {
  writeFileSync(BUILTINS_LOCK_JSON, stableJson(lock))
  console.log(`locked ${names.size} built-ins for ${LOCKED_STYLES.join(", ")}`)
}
