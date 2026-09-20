// Shared readers for the registry scripts. Bun runtime, no dependencies.
import { readFileSync, existsSync } from "node:fs"
import path from "node:path"

export const ROOT = path.resolve(import.meta.dir, "../..")
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

/** The cssVars an item should carry, given the tokens its files use. */
export function cssVarsFor(used: Set<string>, tokens: Tokens): RegistryItem["cssVars"] | undefined {
  const pick = (scope: Record<string, string>) =>
    Object.fromEntries(
      Object.keys(scope)
        .filter((k) => used.has(k))
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

export function allTokenNames(tokens: Tokens): string[] {
  return [...new Set([...Object.keys(tokens.theme), ...Object.keys(tokens.light), ...Object.keys(tokens.dark)])]
}

export function readItemSources(item: RegistryItem): { file: RegistryFile; abs: string; source: string }[] {
  return (item.files ?? []).map((file) => {
    const abs = path.join(ROOT, file.path)
    return { file, abs, source: existsSync(abs) ? readFileSync(abs, "utf8") : "" }
  })
}
