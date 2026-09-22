// The item contract, checked mechanically. Lists every problem and exits 1 if there are any.
// What it enforces is written up in docs/contract.md; keep the two in step.
import { existsSync, readdirSync, statSync } from "node:fs"
import path from "node:path"
import { Node, Project, SyntaxKind } from "ts-morph"
import {
  ACCESSIBILITY_REMAP,
  ACCESSIBILITY_SELECTOR,
  ACCESSIBLE_TOKENS,
  LOCKED_STYLES,
  NUMERIC_VARIANT,
  NUMERIC_VARIANT_TOKEN,
  ROOT,
  TEXT_SIZE_FLOOR_PX,
  THEME_TYPOGRAPHY_CSS,
  TYPOGRAPHY_TOKEN,
  allTokenNames,
  cssFor,
  cssVarsFor,
  fontSizesUnderFloor,
  isColorValue,
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
const CATEGORIES = new Set(["grid", "feed", "format", "palette", "hotkeys", "layout", "blotter", "ticket", "watchlist", "chrome", "theme", "rfq"])
const FORBIDDEN_PACKAGES = [/^radix-ui$/, /^@radix-ui\//, /^@base-ui\//, /^@base-ui-components\//, /^cmdk$/, /^react-resizable-panels$/]
const PEERS = new Set(["react", "react-dom"])
const CSS_KEYS = [/^@keyframes tradecn-[\w-]+$/, /^@layer components$/]
// A class string that sets tabular figures without lining ones, or reaches a font through Tailwind's own
// stack instead of a tradecn token (contract rule 14). Line by line, so the message can point at one.
const TABULAR = /\btabular-nums\b/
const LINING = /\blining-nums\b/
const TAILWIND_FONT = /(?<![\w-])(?:[\w-]+:)*font-(?:mono|sans|serif)(?![\w-])/
// The classes a `@layer components` restyle may start from: dockview's.
const CSS_RESTYLE_SELECTORS = [/^\.dockview-theme-tradecn\b/, /^\.dv-[\w-]+/]
const FORBIDDEN_JSX_ATTRS = new Set(["asChild", "render", "nativeButton"])
const SOURCE_DIRS = ["ui", "hooks", "lib", "blocks"]

const registry = readRegistry()
const tokens = readTokens()
const tokenNames = allTokenNames(tokens)
const depsAllow = readDepsAllow()
const lock = readBuiltinsLock()
const project = new Project({ tsConfigFilePath: path.join(ROOT, "playground/tsconfig.app.json"), skipAddingFilesFromTsConfig: true })
const problems: string[] = []
const fail = (item: string, msg: string) => problems.push(`${item}: ${msg}`)

/**
 * A token's value, by what the token is. A color is oklch() or var(--color-<shadcn token>), the two forms the
 * CLI turns into utilities. A typography token is a font stack, a px size, a unitless line height, a weight, or
 * the numeric variant, and never a color. The numeric variant is the one value the contract fixes (rule 14).
 * The accessible stacks name their fallbacks in full: the remap sets --tradecn-font-sans to var(--tradecn-font-accessible)
 * on the same element, and a var(--tradecn-font-sans) inside the accessible stack would close a cycle there.
 */
function checkToken(where: string, k: string, v: string, fail: (msg: string) => void) {
  if (k === "radius") return
  if (!TYPOGRAPHY_TOKEN.test(k)) {
    if (!/^oklch\(/.test(v) && !/^var\(--color-[\w-]+\)$/.test(v)) fail(`${where}.${k} must be oklch(...) or var(--color-<shadcn token>), got "${v}"`)
    return
  }
  if (!v.trim()) fail(`${where}.${k} is empty`)
  if (isColorValue(v)) fail(`${where}.${k} is a typography token and cannot hold a color, got "${v}"`)
  if (k === NUMERIC_VARIANT_TOKEN && v !== NUMERIC_VARIANT) fail(`${where}.${k} must be "${NUMERIC_VARIANT}" (contract rule 14), got "${v}"`)
  if (/^tradecn-text-size-/.test(k) && !/^\d+(\.\d+)?px$/.test(v)) fail(`${where}.${k} must be a px size, got "${v}"`)
  if (/^tradecn-line-height-/.test(k) && !/^\d+(\.\d+)?$/.test(v)) fail(`${where}.${k} must be a unitless line height, got "${v}"`)
  if (/^tradecn-font-weight-/.test(k) && !/^[1-9]00$|^[1-9]\d0$/.test(v)) fail(`${where}.${k} must be a weight from 100 to 900, got "${v}"`)
  if ((ACCESSIBLE_TOKENS as readonly string[]).includes(k) && /var\(/.test(v)) fail(`${where}.${k} names its fallbacks itself; a var() here would cycle with the accessibility remap, got "${v}"`)
}

// tokens.json itself.
for (const scope of ["light", "dark"] as const) {
  for (const [k, v] of Object.entries(tokens[scope])) checkToken(`tokens.json ${scope}`, k, v, (msg) => fail("tokens.json", msg))
  if (!(NUMERIC_VARIANT_TOKEN in tokens[scope])) fail("tokens.json", `${scope} has no ${NUMERIC_VARIANT_TOKEN}`)
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
    if ((item.type === "registry:ui" || item.type === "registry:block") && file.path === primary && !source.includes(`data-slot="tradecn-${id}"`)) fail(id, `${file.path} must put data-slot="tradecn-${id}" on its root element`)

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
    // Rule 14: every number is set in lining tabular figures, every font comes from a tradecn token, and nothing is
    // drawn under the 12 px floor.
    source.split("\n").forEach((line, index) => {
      if (TABULAR.test(line) && !LINING.test(line)) fail(id, `${file.path}:${index + 1} sets tabular-nums without lining-nums; write "lining-nums tabular-nums" (contract rule 14)`)
      if (TAILWIND_FONT.test(line)) fail(id, `${file.path}:${index + 1} uses Tailwind's font-mono/font-sans; write font-(family-name:--tradecn-font-mono) so a consumer's --tradecn-font-* governs it (contract rule 14)`)
      for (const size of fontSizesUnderFloor(line)) fail(id, `${file.path}:${index + 1} sets ${size}, under the ${TEXT_SIZE_FLOOR_PX} px floor; text-xs is the smallest size an item draws (contract rule 14)`)
    })
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

  // A theme is its cssVars and nothing else, so an empty one is an item that installs nothing. It is
  // the explicit reset, which means it sets every tradecn token in both modes: a token added later
  // and left out of a theme would keep the value tuned for whatever background the theme replaced.
  if (item.type === "registry:theme") {
    if (files.length) fail(id, "a theme has no files")
    for (const scope of ["light", "dark"] as const) {
      const vars = item.cssVars?.[scope]
      if (!vars || !Object.keys(vars).length) {
        fail(id, `a theme needs cssVars.${scope}`)
        continue
      }
      for (const t of tokenNames) if (!(t in vars)) fail(id, `cssVars.${scope} does not set the "${t}" token; a theme sets every tradecn token`)
      for (const [k, v] of Object.entries(vars)) checkToken(`cssVars.${scope}`, k, v, (msg) => fail(id, msg))
    }
    // Below its variables a theme carries the typography base, exactly: the numeric variant on the root and the
    // consumer hooks in @layer base, and the accessibility remap unlayered. Nothing else, and nothing less.
    if (JSON.stringify(item.css ?? null) !== JSON.stringify(THEME_TYPOGRAPHY_CSS)) fail(id, `a theme's css is the typography base and nothing else (THEME_TYPOGRAPHY_CSS in scripts/lib/registry.ts)`)
  }

  // css: keyframes and third-party restyles only, plus the accessibility remap `just tokens` writes for any
  // item that reads a font token. A restyle names a class of the third-party package, never an element, a
  // shadcn class, or a tradecn slot: those are styled from the source files.
  if (item.type !== "registry:theme") {
    const expectedCss = cssFor(used, tokens, item.css)
    if (JSON.stringify(expectedCss ?? null) !== JSON.stringify(item.css ?? null)) fail(id, "css is out of date; run `just tokens`")
  }
  for (const [key, value] of Object.entries(item.css ?? {})) {
    if (item.type === "registry:theme") break
    if (key === ACCESSIBILITY_SELECTOR) {
      if (JSON.stringify(value) !== JSON.stringify(ACCESSIBILITY_REMAP)) fail(id, "the accessibility remap is written by `just tokens`; do not edit it")
      continue
    }
    if (!CSS_KEYS.some((re) => re.test(key))) fail(id, `css key "${key}" is not allowed (only @keyframes tradecn-* and @layer components)`)
    if (key === "@layer components") {
      for (const selector of Object.keys((value ?? {}) as Record<string, unknown>)) {
        if (!CSS_RESTYLE_SELECTORS.some((re) => re.test(selector))) fail(id, `css @layer components selector "${selector}" does not name a class of an allowed third-party package (${CSS_RESTYLE_SELECTORS.map(String).join(", ")})`)
      }
    }
  }

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

// orphans: every source file belongs to at least one item. Blocks nest one directory per block.
function* sourceFiles(dir: string): Generator<string> {
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f)
    if (statSync(p).isDirectory()) yield* sourceFiles(p)
    else if (/\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f)) yield p
  }
}
for (const dir of SOURCE_DIRS) {
  const abs = path.join(ROOT, "registry/tradecn", dir)
  if (!existsSync(abs)) continue
  for (const p of sourceFiles(abs)) {
    const rel = path.relative(ROOT, p)
    if (!referenced.has(rel)) fail("registry", `${rel} is not referenced by any item`)
  }
}

if (problems.length) {
  console.error(`validate-registry: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n  ` + problems.join("\n  "))
  process.exit(1)
}
console.log(`validate-registry: ${registry.items.length} item${registry.items.length === 1 ? "" : "s"} pass the contract`)
