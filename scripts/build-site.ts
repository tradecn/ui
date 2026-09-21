#!/usr/bin/env bun
// Render the tradecn.dev landing page from a registry.json and a version.txt.
//   bun scripts/build-site.ts [--registry registry.json] [--version version.txt] [--theme registry.json] [--out site/dist]
// The page says what a release ships, so the release job points --registry and --version at the
// tag's checkout while the templates in site/, this script, and the palette come from main. The
// palette is main's because a tag from before the theme existed has none to give.
import { mkdir } from "node:fs/promises"
import { join, resolve } from "node:path"
import { parseArgs } from "node:util"

export const SITE_URL = "https://tradecn.dev"
export const REPO_URL = "https://github.com/tradecn/ui"

/** The page takes its colors from this theme, so it looks like the product without a palette of its own. */
export const THEME_ITEM = "tradecn-terminal"
const PALETTE = [
  "background",
  "foreground",
  "card",
  "card-foreground",
  "border",
  "muted",
  "muted-foreground",
  "primary",
  "primary-foreground",
  "up",
  "down",
  "radius",
] as const

export type RegistryItem = {
  name: string
  type: string
  title?: string
  description?: string
  cssVars?: { theme?: Record<string, string>; light?: Record<string, string>; dark?: Record<string, string> }
}
export type Registry = { name: string; items: RegistryItem[] }

const ENTITIES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ENTITIES[c] ?? c)
}

/** Every value a template may use. Items and version come from `registry`, the palette from `themeSource`. */
export function templateValues(registry: Registry, version: string, themeSource: Registry = registry): Record<string, string> {
  const tag = `v${version}`
  const theme = themeSource.items.find((item) => item.name === THEME_ITEM)
  const light = theme?.cssVars?.light
  if (!theme || !light) throw new Error(`${THEME_ITEM} has no cssVars.light and the page takes its palette from it`)
  const palette = PALETTE.map((token) => {
    const value = light[token]
    if (!value) throw new Error(`${THEME_ITEM} sets no ${token} token`)
    return `  --${token}: ${value};`
  }).join("\n")
  const font = theme.cssVars?.theme?.["font-sans"] ?? "ui-monospace, monospace"
  const items = registry.items
    .map((item) => {
      const kind = item.type.replace(/^registry:/, "")
      const docs = `${REPO_URL}/blob/${tag}/docs/${item.name}.md`
      return `      <tr><td><a href="${docs}"><code>${escapeHtml(item.name)}</code></a></td><td class="kind">${escapeHtml(kind)}</td><td>${escapeHtml(item.description ?? "")}</td></tr>`
    })
    .join("\n")
  return {
    version,
    tag,
    palette,
    font,
    items,
    itemCount: String(registry.items.length),
    siteUrl: SITE_URL,
    repoUrl: REPO_URL,
  }
}

/** Fill `{{key}}` placeholders. A key the builder does not set is an error, not an empty string. */
export function render(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = values[key]
    if (value === undefined) throw new Error(`template uses {{${key}}}, which the builder does not set`)
    return value
  })
}

export const PAGES = ["index.html", "404.html"] as const
export const FAVICON = "favicon.svg"

async function main() {
  const root = resolve(import.meta.dirname, "..")
  const { values: args } = parseArgs({
    options: {
      registry: { type: "string", default: "registry.json" },
      version: { type: "string", default: "version.txt" },
      theme: { type: "string", default: join(root, "registry.json") },
      out: { type: "string", default: "site/dist" },
    },
  })
  const registry = (await Bun.file(resolve(args.registry)).json()) as Registry
  const themeSource = (await Bun.file(resolve(args.theme)).json()) as Registry
  const version = (await Bun.file(resolve(args.version)).text()).trim()
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`${args.version} holds "${version}", which is not a version`)
  const values = templateValues(registry, version, themeSource)
  const out = resolve(args.out)
  await mkdir(out, { recursive: true })
  for (const page of PAGES) {
    const template = await Bun.file(join(root, "site", page)).text()
    await Bun.write(join(out, page), render(template, values))
  }
  // The amber mark: readable on a dark tab strip, and the same file the README shows in dark mode.
  await Bun.write(join(out, FAVICON), Bun.file(join(root, "assets", "logo-dark.svg")))
  console.log(`site: ${registry.items.length} items at v${version} -> ${out}`)
}

if (import.meta.main) await main()
