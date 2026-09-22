// Shared readers for the registry scripts. Bun runtime, no dependencies.
import { readFileSync, existsSync } from "node:fs"
import path from "node:path"

// `dirname`, not Bun's `dir`: the tests import this under Node, and Bun has both.
export const ROOT = path.resolve(import.meta.dirname, "../..")
export const REGISTRY_JSON = path.join(ROOT, "registry.json")
export const TOKENS_JSON = path.join(ROOT, "registry/tradecn/tokens.json")
export const DEPS_ALLOW_JSON = path.join(ROOT, "registry/tradecn/deps.allow.json")
export const BUILTINS_LOCK_JSON = path.join(ROOT, "registry/tradecn/builtins.lock.json")
export const LOCKED_STYLES = ["radix-nova", "base-mira", "base-vega"] as const

export interface RegistryFile {
  path: string
  type: string
  target?: string
}

export interface RegistryItem {
  name: string
  type: string
  title?: string
  description?: string
  dependencies?: string[]
  devDependencies?: string[]
  registryDependencies?: string[]
  files?: RegistryFile[]
  cssVars?: { theme?: Record<string, string>; light?: Record<string, string>; dark?: Record<string, string> }
  css?: Record<string, unknown>
  docs?: string
  categories?: string[]
  meta?: { components?: { title: string; description?: string; href?: string }[] } & Record<string, unknown>
}

export interface Registry {
  $schema?: string
  name: string
  homepage?: string
  items: RegistryItem[]
}

export interface Tokens {
  $comment?: string
  theme: Record<string, string>
  light: Record<string, string>
  dark: Record<string, string>
}

export interface BuiltinsLock {
  generatedAt: string
  styles: string[]
  items: Record<string, Record<string, { exports: string[]; dependencies: string[] }>>
}

export function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, "utf8")) as T
}

export function readRegistry(): Registry {
  return readJson<Registry>(REGISTRY_JSON)
}

export function readTokens(): Tokens {
  const t = readJson<Tokens>(TOKENS_JSON)
  return { theme: t.theme ?? {}, light: t.light ?? {}, dark: t.dark ?? {} }
}

export function readDepsAllow(): Record<string, string> {
  const d = readJson<Record<string, string>>(DEPS_ALLOW_JSON)
  delete d.$comment
  return d
}

export function readBuiltinsLock(): BuiltinsLock | null {
  return existsSync(BUILTINS_LOCK_JSON) ? readJson<BuiltinsLock>(BUILTINS_LOCK_JSON) : null
}

export function stableJson(value: unknown): string {
  return JSON.stringify(value, null, 2) + "\n"
}

/** Token names an item's source actually uses, as Tailwind utilities or CSS variables. */
export function tokensUsedIn(source: string, tokenNames: readonly string[]): Set<string> {
  const used = new Set<string>()
  for (const name of tokenNames) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const utility = new RegExp(`(?:^|[^\\w-])(?:[\\w]+:)*(?:bg|text|border|ring|outline|fill|stroke|shadow|from|to|via|decoration|accent|caret|divide|placeholder|inset-ring)-${escaped}(?![\\w-])`)
    const variable = new RegExp(`--(?:color-)?${escaped}(?![\\w-])`)
    if (utility.test(source) || variable.test(source)) used.add(name)
  }
  return used
}

/**
 * The typography tokens (docs/typography.md): font stacks, sizes, line heights, weights, and the numeric
 * variant. They are not colors, so the CLI writes them into `:root` and `.dark` as they are and adds no
 * `--color-*` alias for them.
 */
export const TYPOGRAPHY_TOKEN = /^tradecn-(font-|text-size-|line-height-|numeric-variant$)/
/** The one numeric variant every number in a tradecn item is set in. A theme may not change it (contract rule 14). */
export const NUMERIC_VARIANT = "lining-nums tabular-nums"
/** The token the numeric variant lives in. */
export const NUMERIC_VARIANT_TOKEN = "tradecn-numeric-variant"
/** The font tokens an item reads; using one brings the accessibility remap with it. */
export const FONT_TOKENS = ["tradecn-font-sans", "tradecn-font-mono", "tradecn-font-numeric"] as const
/** The smallest size tradecn draws text at, in px: the grid floor `--tradecn-text-size-grid-min` names (contract rule 14). */
export const TEXT_SIZE_FLOOR_PX = 12
// An arbitrary Tailwind size class, and an inline fontSize with a number in it. Tailwind's smallest named size, text-xs, is the floor itself.
const SIZE_CLASS = /(?<![\w-])(?:[\w-]+:)*text-\[(\d+(?:\.\d+)?)(px|rem|em|pt)\]/g
const SIZE_STYLE = /fontSize:\s*["']?(\d+(?:\.\d+)?)(px|rem|em|pt)?["']?/g
/** Every font size in a line of source that sits under the floor, as written; empty when the line is fine. */
export function fontSizesUnderFloor(line: string): string[] {
  const px = (value: number, unit: string | undefined) => (unit === "rem" || unit === "em" ? value * 16 : unit === "pt" ? value * (4 / 3) : value)
  const out: string[] = []
  for (const m of line.matchAll(SIZE_CLASS)) if (px(Number(m[1]), m[2]) < TEXT_SIZE_FLOOR_PX) out.push(m[0])
  for (const m of line.matchAll(SIZE_STYLE)) if (px(Number(m[1]), m[2]) < TEXT_SIZE_FLOOR_PX) out.push(m[0])
  return out
}
/** The tokens the accessibility remap points the font tokens at. */
export const ACCESSIBLE_TOKENS = ["tradecn-font-accessible", "tradecn-font-accessible-mono"] as const
/**
 * The accessibility mode: `data-accessibility="hyperlegible"` on the root (or any ancestor) swaps the sans and
 * the mono for the Atkinson Hyperlegible pair. Unlayered, and `:root[...]` first so it beats the `:root` block
 * that set the tokens when the attribute is on <html>, where a layered rule would lose to it whatever its specificity.
 */
export const ACCESSIBILITY_SELECTOR = ':root[data-accessibility="hyperlegible"], [data-accessibility="hyperlegible"]'
export const ACCESSIBILITY_REMAP: Record<string, string> = {
  "--tradecn-font-sans": "var(--tradecn-font-accessible)",
  "--tradecn-font-mono": "var(--tradecn-font-accessible-mono)",
}
/**
 * What a theme adds below its variables: the numeric variant on the root and on the hooks a consumer's own
 * markup can wear, in the base layer where a utility still beats it, and the accessibility remap.
 */
export const THEME_TYPOGRAPHY_CSS: Record<string, unknown> = {
  "@layer base": {
    ":root": { "font-variant-numeric": `var(--${NUMERIC_VARIANT_TOKEN})` },
    ".tradecn-num, [data-numeric]": { "font-variant-numeric": `var(--${NUMERIC_VARIANT_TOKEN})` },
  },
  [ACCESSIBILITY_SELECTOR]: ACCESSIBILITY_REMAP,
}

/** Whether the CLI would treat a value as a color and alias it as `--color-<token>` in `@theme inline`. Mirrors shadcn 4.21's isColorValue. */
export function isColorValue(value: string): boolean {
  return /^(hsl|rgb|#|oklch)/.test(value) || value.includes("--color-")
}

/** Every tradecn token a value refers to through var(--x). */
function referencedTokens(value: string, tokenNames: ReadonlySet<string>): string[] {
  return [...value.matchAll(/var\(--([\w-]+)\)/g)].map((m) => m[1]!).filter((name) => tokenNames.has(name))
}

/**
 * The tokens an item carries given the ones its files name: those, every token their values refer to
 * (`--tradecn-font-numeric` is `var(--tradecn-font-sans)`, so a file that names the first installs the second),
 * and the accessible pair whenever a font token is in, since the remap the item ships points at them.
 */
export function tokenClosure(used: ReadonlySet<string>, tokens: Tokens): Set<string> {
  const names = new Set(allTokenNames(tokens))
  const out = new Set([...used].filter((name) => names.has(name)))
  if (FONT_TOKENS.some((name) => out.has(name))) for (const name of ACCESSIBLE_TOKENS) out.add(name)
  const queue = [...out]
  while (queue.length) {
    const name = queue.pop()!
    for (const scope of [tokens.theme, tokens.light, tokens.dark]) {
      for (const ref of referencedTokens(scope[name] ?? "", names)) {
        if (!out.has(ref)) {
          out.add(ref)
          queue.push(ref)
        }
      }
    }
  }
  return out
}

/** The cssVars an item should carry, given the tokens its files use. */
export function cssVarsFor(used: Set<string>, tokens: Tokens): RegistryItem["cssVars"] | undefined {
  const all = tokenClosure(used, tokens)
  const pick = (scope: Record<string, string>) =>
    Object.fromEntries(
      Object.keys(scope)
        .filter((k) => all.has(k))
        .sort()
        .map((k) => [k, scope[k]!]),
    )
  const theme = pick(tokens.theme)
  const light = pick(tokens.light)
  const dark = pick(tokens.dark)
  const out: NonNullable<RegistryItem["cssVars"]> = {}
  if (Object.keys(theme).length) out.theme = theme
  if (Object.keys(light).length) out.light = light
  if (Object.keys(dark).length) out.dark = dark
  return Object.keys(out).length ? out : undefined
}

/**
 * The css an item should carry, given the tokens its files use and whatever it wrote by hand: the accessibility
 * remap rides with any item that reads a font token, so the mode works in a project that installed no theme.
 * Hand-written keys (keyframes, a third-party restyle) are kept as they are.
 */
export function cssFor(used: Set<string>, tokens: Tokens, current: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  const rest = Object.fromEntries(Object.entries(current ?? {}).filter(([key]) => key !== ACCESSIBILITY_SELECTOR))
  const remap = FONT_TOKENS.some((name) => tokenClosure(used, tokens).has(name))
  const out = remap ? { ...rest, [ACCESSIBILITY_SELECTOR]: ACCESSIBILITY_REMAP } : rest
  return Object.keys(out).length ? out : undefined
}

export function allTokenNames(tokens: Tokens): string[] {
  return [...new Set([...Object.keys(tokens.theme), ...Object.keys(tokens.light), ...Object.keys(tokens.dark)])]
}

export function readItemSources(item: RegistryItem): { file: RegistryFile; abs: string; source: string }[] {
  return (item.files ?? []).map((file) => {
    const abs = path.join(ROOT, file.path)
    return { file, abs, source: existsSync(abs) ? readFileSync(abs, "utf8") : "" }
  })
}
