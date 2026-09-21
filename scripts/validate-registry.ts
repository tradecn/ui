// The item contract, checked mechanically. Lists every problem and exits 1 if there are any.
// What it enforces is written up in docs/contract.md; keep the two in step.
import { existsSync, readdirSync, statSync } from "node:fs"
import path from "node:path"
import { Node, Project, SyntaxKind } from "ts-morph"
import {
  LOCKED_STYLES,
  ROOT,
  allTokenNames,
  cssVarsFor,
  readBuiltinsLock,
  readDepsAllow,
  readItemSources,
  readRegistry,
  readTokens,
  tokensUsedIn,
} from "./lib/registry"

const ITEM_TYPES = new Set(["registry:ui", "registry:hook", "registry:lib", "registry:block", "registry:theme"])
const DIR_TYPES: Record<string, string[]> = {
  ui: ["registry:ui"],
  hooks: ["registry:hook"],
  lib: ["registry:lib"],
  blocks: ["registry:block", "registry:page", "registry:component", "registry:file"],
}
const CATEGORIES = new Set(["grid", "feed", "format", "palette", "hotkeys", "layout", "blotter", "ticket", "watchlist", "chrome", "theme"])
const FORBIDDEN_PACKAGES = [/^radix-ui$/, /^@radix-ui\//, /^@base-ui\//, /^@base-ui-components\//, /^cmdk$/, /^react-resizable-panels$/]
const PEERS = new Set(["react", "react-dom"])
const CSS_KEYS = [/^@keyframes tradecn-[\w-]+$/, /^@layer components$/]
const FORBIDDEN_JSX_ATTRS = new Set(["asChild", "render", "nativeButton"])
const SOURCE_DIRS = ["ui", "hooks", "lib"]

const registry = readRegistry()
const tokens = readTokens()
const tokenNames = allTokenNames(tokens)
const depsAllow = readDepsAllow()
const lock = readBuiltinsLock()
const project = new Project({ tsConfigFilePath: path.join(ROOT, "playground/tsconfig.app.json"), skipAddingFilesFromTsConfig: true })
const problems: string[] = []
const fail = (item: string, msg: string) => problems.push(`${item}: ${msg}`)

// tokens.json itself: only forms the shadcn CLI turns into utilities.
for (const scope of ["light", "dark"] as const) {
  for (const [k, v] of Object.entries(tokens[scope])) {
    if (!/^oklch\(/.test(v) && !/^var\(--color-[\w-]+\)$/.test(v)) fail("tokens.json", `${scope}.${k} must be oklch(...) or var(--color-<shadcn token>), got "${v}"`)
  }
}

const seen = new Set<string>()
const referenced = new Set<string>()

for (const item of registry.items) {
  const id = item.name ?? "(unnamed)"
  if (!/^[a-z][a-z0-9-]*$/.test(id)) fail(id, "name must be kebab-case")
  if (seen.has(id)) fail(id, "duplicate name")
  seen.add(id)
  if (!ITEM_TYPES.has(item.type)) fail(id, `type ${item.type} is not used by tradecn`)
  if (!item.title?.trim()) fail(id, "title is required")
  if (!item.description?.trim()) fail(id, "description is required")
  if (!item.categories?.length) fail(id, "categories are required")
  for (const c of item.categories ?? []) if (!CATEGORIES.has(c)) fail(id, `category "${c}" is not in the allowlist`)

  // dependencies: name@range, range pinned by the allowlist
  const depNames = new Map<string, string>()
  for (const dep of item.dependencies ?? []) {
    const m = /^(@?[^@]+)@(.+)$/.exec(dep)
    if (!m) {
      fail(id, `dependency "${dep}" must be name@range`)
      continue
    }
    const [, name, range] = m
    depNames.set(name!, range!)
    if (!(name! in depsAllow)) fail(id, `dependency "${name}" is not in registry/tradecn/deps.allow.json`)
    else if (depsAllow[name!] !== range) fail(id, `dependency "${name}" must use range ${depsAllow[name!]} (allowlist), got ${range}`)
  }
  if (item.devDependencies?.length) fail(id, "devDependencies are not used by tradecn items")

  // registryDependencies: bare shadcn built-ins only, present in the lock
  for (const dep of item.registryDependencies ?? []) {
    if (/[/@:.]/.test(dep)) fail(id, `registryDependency "${dep}" must be a bare shadcn built-in name (tradecn items bundle their own files; a #ref is not inherited across dependencies)`)
    else if (lock && !lock.items[dep]) fail(id, `registryDependency "${dep}" is not in builtins.lock.json; run \`just lock-builtins\``)
  }

  // files: exist, live under registry/tradecn/<dir>, carry the type of their dir, primary file named after the item
  const files = item.files ?? []
  if (!files.length && item.type !== "registry:theme") fail(id, "files are required")
  const filePaths = new Set(files.map((f) => f.path))
  let primary: string | undefined
  for (const f of files) {
    referenced.add(f.path)
    const m = /^registry\/tradecn\/([^/]+)\/(.+)$/.exec(f.path)
    if (!m) {
      fail(id, `file ${f.path} must live under registry/tradecn/`)
      continue
    }
    const dir = m[1]!
    const allowed = DIR_TYPES[dir]
    if (!allowed) fail(id, `file ${f.path}: unknown directory ${dir}`)
    else if (!allowed.includes(f.type)) fail(id, `file ${f.path} has type ${f.type}; files under ${dir}/ are ${allowed.join(" or ")}`)
    if (!existsSync(path.join(ROOT, f.path))) fail(id, `file ${f.path} does not exist`)
    if (f.type === item.type && !primary) primary = f.path
    if ((f.type === "registry:page" || f.type === "registry:file") && !f.target) fail(id, `file ${f.path} needs a target`)
  }
  if (primary && path.basename(primary).replace(/\.tsx?$/, "") !== id) fail(id, `primary file ${primary} must be named ${id}`)

  // No two files in one item share a basename. When the CLI rewrites an import it gathers every file
  // in the item whose name matches, sorts .tsx ahead of .ts, and only then prefers the path that was
  // asked for. So `lib/x.ts` beside `ui/x.tsx` installs a component that imports itself.
  const byBasename = new Map<string, string[]>()
  for (const f of files) {
    const base = path.basename(f.path).replace(/\.[^.]+$/, "")
    byBasename.set(base, [...(byBasename.get(base) ?? []), f.path])
  }
  for (const [base, paths] of byBasename) {
    if (paths.length > 1) fail(id, `files ${paths.join(" and ")} share the basename "${base}"; the CLI resolves an item's own imports by basename and would point one at the other. Rename one`)
  }

  // source rules
  let exportsOfPrimary = new Set<string>()
  let usesCn = false
  const importedPackages = new Set<string>()
  for (const { file, abs, source } of readItemSources(item)) {
    if (!source) continue
    const sf = project.addSourceFileAtPath(abs)
    if (file.path === primary) exportsOfPrimary = new Set(sf.getExportedDeclarations().keys())
    if (item.type === "registry:ui" && file.path === primary && !source.includes(`data-slot="tradecn-${id}"`)) fail(id, `${file.path} must put data-slot="tradecn-${id}" on its root element`)

    const specifiers = [
      ...sf.getImportDeclarations().map((d) => ({ spec: d.getModuleSpecifierValue(), names: d.getNamedImports().map((n) => n.getName()), node: d })),
      ...sf.getExportDeclarations().filter((d) => d.getModuleSpecifierValue()).map((d) => ({ spec: d.getModuleSpecifierValue()!, names: d.getNamedExports().map((n) => n.getName()), node: d })),
    ]
    for (const { spec, names } of specifiers) {
      const where = `${file.path} imports "${spec}"`
      if (spec.startsWith(".")) {
        fail(id, `${where}: relative imports do not survive shadcn add; use @/registry/tradecn/* or @/components/ui/*`)
      } else if (spec === "@/lib/utils" || /^@\/registry\/[^/]+\/lib\/utils$/.test(spec)) {
        fail(id, `${where}: import { cn } from "cn" instead`)
      } else if (/^@\/registry\/tradecn\/(ui|hooks|lib)\/[\w-]+$/.test(spec)) {
        const rel = spec.replace(/^@\//, "")
        const target = [`${rel}.ts`, `${rel}.tsx`].find((p) => existsSync(path.join(ROOT, p)))
        if (!target) fail(id, `${where}: no such registry file`)
        else if (!filePaths.has(target)) fail(id, `${where}: ${target} must be listed in this item's files[] (items never depend on each other through the registry)`)
      } else if (spec.startsWith("@/registry/")) {
        fail(id, `${where}: only @/registry/tradecn/{ui,hooks,lib}/* is allowed`)
      } else if (/^@\/components\/ui\/[\w-]+$/.test(spec)) {
        const name = spec.slice("@/components/ui/".length)
        if (!item.registryDependencies?.includes(name)) fail(id, `${where}: "${name}" must be in registryDependencies`)
        if (lock?.items[name]) {
          for (const style of LOCKED_STYLES) {
            const exp = lock.items[name]?.[style]?.exports ?? []
            for (const n of names) if (!exp.includes(n)) fail(id, `${where}: "${n}" is not exported by the ${style} ${name} item`)
          }
        }
      } else if (spec.startsWith("@/")) {
        fail(id, `${where}: unknown alias; use @/registry/tradecn/* or @/components/ui/*`)
      } else if (spec === "cn") {
        usesCn = true
        if (names.some((n) => n !== "cn")) fail(id, `${where}: only { cn } may be imported from "cn"`)
        if (!depNames.has("cn")) fail(id, `${where}: add "cn@${depsAllow.cn}" to dependencies`)
      } else {
        const pkg = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0]!
        if (PEERS.has(pkg)) continue
        if (FORBIDDEN_PACKAGES.some((re) => re.test(pkg))) fail(id, `${where}: ${pkg} is forbidden; compose the consumer's shadcn components instead`)
        else if (!depNames.has(pkg)) fail(id, `${where}: "${pkg}" must be declared in dependencies (and be in deps.allow.json)`)
        importedPackages.add(pkg)
      }
    }
    sf.forEachDescendant((node) => {
      if (Node.isJsxAttribute(node)) {
        const name = node.getNameNode().getText()
        if (FORBIDDEN_JSX_ATTRS.has(name)) fail(id, `${file.path}:${node.getStartLineNumber()} uses ${name}; it is base-specific. Style the trigger with className or children`)
      }
    })
    if (sf.getDescendantsOfKind(SyntaxKind.JsxElement).length + sf.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement).length > 0 && file.type === "registry:lib") fail(id, `${file.path} is registry:lib and must not contain JSX`)
  }
  for (const [name] of depNames) {
    if (name === "cn" ? !usesCn : !importedPackages.has(name)) fail(id, `dependency "${name}" is declared but never imported`)
  }

  // cssVars: generated, and only from tokens the files use
  const used = new Set<string>()
  for (const { source } of readItemSources(item)) for (const t of tokensUsedIn(source, tokenNames)) used.add(t)
  const expected = item.type === "registry:theme" ? item.cssVars : cssVarsFor(used, tokens)
  if (JSON.stringify(expected ?? null) !== JSON.stringify(item.cssVars ?? null)) fail(id, "cssVars are out of date; run `just tokens`")

  // css: keyframes and third-party restyles only
  for (const key of Object.keys(item.css ?? {})) if (!CSS_KEYS.some((re) => re.test(key))) fail(id, `css key "${key}" is not allowed (only @keyframes tradecn-* and @layer components)`)

  // docs when the item touches the consumer's stylesheet or adds a package
  const needsDocs = Boolean(item.css) || Boolean(item.cssVars) || [...depNames.keys()].some((d) => d !== "cn")
  if (needsDocs && !item.docs?.trim()) fail(id, "docs are required when an item has css, cssVars, or a dependency beyond cn")

  // meta.components must name real exports of the primary file
  for (const c of item.meta?.components ?? []) if (primary && !exportsOfPrimary.has(c.title)) fail(id, `meta.components "${c.title}" is not exported by ${primary}`)

  // built output, when present: nothing the CLI cannot rewrite
  const built = path.join(ROOT, "public/r", `${id}.json`)
  if (existsSync(built)) {
    const json = JSON.parse(await Bun.file(built).text()) as { files?: { path: string; content?: string }[] }
    for (const f of json.files ?? []) {
      for (const m of f.content?.matchAll(/from\s+"(@\/registry\/[^"]+)"/g) ?? []) {
        if (!/^@\/registry\/tradecn\/(ui|hooks|lib)\//.test(m[1]!)) fail(id, `built ${f.path} imports ${m[1]}, which the CLI cannot rewrite`)
      }
    }
  }
}

// orphans: every source file belongs to at least one item
for (const dir of SOURCE_DIRS) {
  const abs = path.join(ROOT, "registry/tradecn", dir)
  if (!existsSync(abs)) continue
  for (const f of readdirSync(abs)) {
    const p = path.join(abs, f)
    if (!statSync(p).isFile() || !/\.tsx?$/.test(f) || /\.test\.tsx?$/.test(f)) continue
    const rel = path.relative(ROOT, p)
    if (!referenced.has(rel)) fail("registry", `${rel} is not referenced by any item`)
  }
}

if (problems.length) {
  console.error(`validate-registry: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n  ` + problems.join("\n  "))
  process.exit(1)
}
console.log(`validate-registry: ${registry.items.length} item${registry.items.length === 1 ? "" : "s"} pass the contract`)
