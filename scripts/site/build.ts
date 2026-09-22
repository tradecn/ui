#!/usr/bin/env bun
// Render tradecn.dev: the opening page, the site's own docs pages (site/docs/*.md), one page per docs/*.md,
// and one embedded preview per item.
//   bun scripts/site/build.ts [--registry registry.json] [--version version.txt] [--docs docs] [--changelog CHANGELOG.md]
//                             [--theme registry.json] [--demos playground/src/demos] [--embed playground/dist/embed] [--out site/dist]
// The pages say what a release ships, so the release job points --registry, --version, --docs, --changelog, --demos,
// and --embed at the tag's checkout while the templates in site/, the site's own pages, this script, and the palette
// come from main. The palette is main's because a tag from before the theme existed has none to give. A tag from
// before the previews existed has no embed build, and its pages go out without them.
// The pages have a light and a dark mode, both sides of the amber theme: warm paper by day, near-black by night, set
// in the two faces its typography tokens name. site/theme.js puts the mode on <html>, from the reader's choice or the system,
// and the theme beside it: the header's menu offers every theme in the registry, and a page carries each one's palette.
import { cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { parseArgs } from "node:util"
import { Marked } from "marked"
import { isColorValue } from "../lib/registry"

export const SITE_URL = "https://tradecn.dev"
export const REPO_URL = "https://github.com/tradecn/ui"

/** The pages take their colors, both sides, and their type from this theme, so they look like the product without a palette of their own. */
export const THEME_ITEM = "tradecn-amber"
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
  "ring",
  "destructive",
  "up",
  "down",
  "radius",
] as const
export type PaletteToken = (typeof PALETTE)[number]

/**
 * The pages' two faces are the ones the theme's typography tokens name, Inter and JetBrains Mono, self-hosted the
 * way the previews' bundle self-hosts them: `site/fonts.css` declares them under /fonts/, and the builder copies the
 * files there from Fontsource's static packages (the ones the playground installs). Latin and Latin Extended, in the
 * three weights the stylesheet uses. The site's policy allows fonts from 'self' alone, so a third-party stylesheet
 * would be blocked; these are not.
 */
export const FONTS_STYLES = "fonts.css"
export const FONTS_PATH = "fonts"
export const FONT_WEIGHTS = [400, 500, 600] as const
export const FONT_SUBSETS = ["latin-ext", "latin"] as const
export const FONT_PACKAGES = [
  { family: "Inter", package: "inter" },
  { family: "JetBrains Mono", package: "jetbrains-mono" },
] as const
/** Every font file the pages serve: its Fontsource package and its name, the same under `files/` there and `/fonts/` here. */
export const fontFiles = () => FONT_PACKAGES.flatMap(({ package: pkg }) => FONT_SUBSETS.flatMap((subset) => FONT_WEIGHTS.map((weight) => ({ package: pkg, file: `${pkg}-${subset}-${weight}-normal.woff2` }))))

export type RegistryFile = { path: string; type: string; target?: string }
export type RegistryItem = {
  name: string
  type: string
  title?: string
  description?: string
  dependencies?: string[]
  registryDependencies?: string[]
  files?: RegistryFile[]
  cssVars?: { theme?: Record<string, string>; light?: Record<string, string>; dark?: Record<string, string> }
  css?: Record<string, unknown>
}
export type Registry = { name: string; items: RegistryItem[] }

const ENTITIES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ENTITIES[c] ?? c)
}

/** An item's kind as the pages print it: `ui`, `hook`, `lib`, `block`, `theme`. */
export const kindOf = (item: RegistryItem) => item.type.replace(/^registry:/, "")

/** The sidebar's groups, in the order the sidebar, the pager, and the search list them. */
export const GROUPS = ["Get Started", "Components", "Hooks", "Utilities", "Themes"] as const
export type Group = (typeof GROUPS)[number]

/**
 * Which group a page is in. The site's own pages and the contract open the docs; every item sits with its
 * kind, so a hook, a utility, and a theme are never listed as components. A block is a component the reader
 * installs to `components/` rather than `components/ui/`, so it stays with them.
 */
export function groupOf(item?: RegistryItem): Group {
  if (!item) return "Get Started"
  switch (item.type) {
    case "registry:hook":
      return "Hooks"
    case "registry:lib":
      return "Utilities"
    case "registry:theme":
      return "Themes"
    default:
      return "Components"
  }
}

/** The items the Components page indexes: the `ui` items and the blocks, in registry order. */
export const componentItems = (registry: Registry) => registry.items.filter((item) => groupOf(item) === "Components")

/** The item's own page when the tag ships a doc for it, the file on GitHub otherwise. */
export const docHref = (item: RegistryItem, tag: string, docSlugs: ReadonlySet<string>) =>
  docSlugs.has(item.name) ? `/docs/${item.name}/` : `${REPO_URL}/blob/${tag}/docs/${item.name}.md`

const MARK = `<svg viewBox="0 0 256 256" fill="none" aria-hidden="true"><path d="M104 108L24 188M233 68L153 148M104.5 108.5L152.5 148" stroke="currentColor" stroke-width="32" stroke-linecap="round" stroke-linejoin="round"/></svg>`

/** The sections the header names; a page says which one it is in. */
export type Section = "docs" | "components" | "changelog"

const SEARCH_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>`

/**
 * The search button in the header. It opens the dialog below; so does mod+k, and site.js writes the key
 * for the reader's platform into the kbd. Without a script it does nothing, so the stylesheet hides it.
 */
export const SEARCH_BUTTON = `<button type="button" class="search-button" aria-label="Search the docs" aria-keyshortcuts="Meta+K Control+K">${SEARCH_ICON}<span>Search the docs</span><kbd>⌘K</kbd></button>`

/** A circle, half filled: the one mark for both modes, as shadcn's site draws it. */
const MODE_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 3v18a9 9 0 0 0 0-18z" fill="currentColor" stroke="none"/></svg>`

/**
 * The mode button at the end of the header: one press switches light and dark, and theme.js writes what the
 * next press would do into the label. Without a script it switches nothing, so the stylesheet hides it, and
 * the page follows the system through its palette alone.
 */
export const MODE_BUTTON = `<button type="button" class="mode-toggle" aria-label="Toggle theme">${MODE_ICON}</button>`

/** The themes the pages can wear, from the theme source: the site's own first, which is what a page wears until the reader picks another. */
export function siteThemes(themeSource: Registry): RegistryItem[] {
  const themes = themeSource.items.filter((item) => item.type === "registry:theme")
  const site = themes.find((item) => item.name === THEME_ITEM)
  if (!site) throw new Error(`${THEME_ITEM} is not in the theme source and the page takes its palette from it`)
  return [site, ...themes.filter((item) => item !== site)]
}

/** The meta theme.js reads the themes from, before it runs: their names in this order, the first the default a page wears with no choice made. */
export const THEMES_META = "tradecn-themes"
export const themesMeta = (themes: RegistryItem[]) => `<meta name="${THEMES_META}" content="${themes.map((theme) => escapeHtml(theme.name)).join(" ")}">`

const CHEVRON_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>`

/**
 * The theme menu, beside the mode button: a native select of the registry's themes by title, the site's own first
 * and selected. theme.js puts the choice on <html> as data-theme, which the page's palette blocks and the previews'
 * are keyed on, and remembers it beside the mode. Without a script it would change nothing, so the stylesheet hides
 * it, and the page wears the default.
 */
export function themePicker(themes: RegistryItem[]): string {
  if (!themes.length) return ""
  const options = themes.map((theme, index) => `<option value="${escapeHtml(theme.name)}"${index === 0 ? " selected" : ""}>${escapeHtml(theme.title ?? theme.name)}</option>`).join("")
  return `<span class="theme-pick"><select class="theme-select" aria-label="Theme">${options}</select>${CHEVRON_ICON}</span>`
}

/**
 * The search dialog, on the opening page and every docs page, closed until the button or mod+k opens it.
 * A native dialog: the browser gives it the top layer, the backdrop, Escape, and focus back to the button.
 * The results are written by site.js from /search.json, one option per hit, grouped by page.
 */
export function searchDialog(): string {
  return [
    `<dialog class="search" aria-label="Search the docs">`,
    `<div class="search-box">${SEARCH_ICON}<input type="search" placeholder="Search the docs" aria-label="Search the docs" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="true" aria-autocomplete="list" aria-controls="search-results"><button type="button" class="search-close" aria-label="Close">Esc</button></div>`,
    `<div class="search-results" id="search-results" role="listbox" aria-label="Results"></div>`,
    `</dialog>`,
  ].join("\n")
}

/**
 * The header on every page: the mark, the three sections, the search, the links out, the theme menu, and the mode
 * button. `current` marks the section a page is in, `page` that it is the section's own page, and `picker` is
 * `themePicker()` of the themes the page carries, left of the mode button.
 */
export function siteHeader(tag: string, current: Section | null = null, page = false, picker = ""): string {
  const link = (section: Section, href: string, text: string) =>
    `<a href="${href}"${section === current ? ` aria-current="${page ? "page" : "true"}"` : ""}>${text}</a>`
  return [
    `<header class="site-header">`,
    `<div class="wrap">`,
    `<a class="name" href="/">${MARK}<span>tradecn<span class="slash">/</span>ui</span></a>`,
    `<nav aria-label="Sections">${link("docs", "/docs/", "Docs")}${link("components", "/docs/components/", "Components")}${link("changelog", "/docs/changelog/", "Changelog")}</nav>`,
    `<nav class="side" aria-label="Links">${SEARCH_BUTTON}<a href="${REPO_URL}">GitHub</a><a href="/r/registry.json">registry.json</a><span class="tag">${escapeHtml(tag)}</span>${picker}${MODE_BUTTON}</nav>`,
    `</div>`,
    `</header>`,
  ].join("\n")
}

/**
 * The pages' palette, both modes in one block: each token is a `light-dark()` pair of the theme's light and dark
 * values, or one value when they agree (the radius lives in `:root` alone). `color-scheme` picks the side: `light dark`
 * here follows the system, and the stylesheet forces one under the class theme.js puts on <html>. So the 404 page,
 * which has no script, still has both modes, from this alone.
 */
export function pagePalette(theme: RegistryItem): string {
  return ["  color-scheme: light dark;", ...paletteLines(theme)].join("\n")
}

/** The pages' dozen tokens for one theme, each a `light-dark()` pair or one value where the sides agree. */
function paletteLines(theme: RegistryItem): string[] {
  const light = theme.cssVars?.light
  const dark = theme.cssVars?.dark
  if (!light || !dark) throw new Error(`${theme.name} has no cssVars.light and cssVars.dark, and the page takes its palette from both`)
  return PALETTE.map((token) => {
    const day = light[token]
    const night = dark[token] ?? day
    if (!day || !night) throw new Error(`${theme.name} sets no ${token} token`)
    return `  --${token}: ${day === night ? day : `light-dark(${day}, ${night})`};`
  })
}

/**
 * The other themes' palettes for the pages, a block each keyed on the data-theme theme.js writes, the same pairs as
 * the default's. The default stays on `:root` itself, so a page with no script, or a reader who has not chosen, wears it.
 */
export function themePalettes(themes: RegistryItem[]): string {
  return themes.slice(1).map((theme) => `:root[data-theme="${escapeHtml(theme.name)}"] {\n${paletteLines(theme).join("\n")}\n}`).join("\n")
}

/** The pages' two faces: the theme's sans for prose and its mono for code, the same tokens every item reads. */
export function pageFonts(theme: RegistryItem): { fontSans: string; fontMono: string } {
  const light = theme.cssVars?.light ?? {}
  const fontSans = light["tradecn-font-sans"]
  const fontMono = light["tradecn-font-mono"]
  if (!fontSans || !fontMono) throw new Error(`${theme.name} sets no --tradecn-font-sans or --tradecn-font-mono, and the pages take their type from them`)
  return { fontSans, fontMono }
}

/** Every value the landing templates may use. Items and version come from `registry`, the palette from `themeSource`, the showcase from `previews`. */
export function templateValues(
  registry: Registry,
  version: string,
  themeSource: Registry = registry,
  docSlugs: ReadonlySet<string> = new Set(),
  previews: Previews = NO_PREVIEWS,
): Record<string, string> {
  const tag = `v${version}`
  const themes = siteThemes(themeSource)
  const theme = themes[0]!
  const palette = pagePalette(theme)
  const { fontSans, fontMono } = pageFonts(theme)
  const picker = themePicker(themes)
  return {
    version,
    tag,
    palette,
    themePalettes: themePalettes(themes),
    themesMeta: themesMeta(themes),
    themePicker: picker,
    fontSans,
    fontMono,
    header: siteHeader(tag, null, false, picker),
    search: searchDialog(),
    showcase: showcase(registry, tag, docSlugs, previews),
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

/** The package managers the install blocks offer, in the order shadcn's own site lists them, each with its runner and its add. npm's forms are the ones every doc writes. */
export const PACKAGE_MANAGERS = [
  { name: "pnpm", run: "pnpm dlx", add: "pnpm add" },
  { name: "npm", run: "npx", add: "npm install" },
  { name: "yarn", run: "yarn dlx", add: "yarn add" },
  { name: "bun", run: "bunx --bun", add: "bun add" },
] as const
export type PackageManager = (typeof PACKAGE_MANAGERS)[number]["name"]
export type Runner = { run: string; add: string }
/** What a page shows before the reader picks a manager, and all it shows without a script. */
export const DEFAULT_MANAGER: PackageManager = "npm"

/** A line that starts with one of npm's forms, which is what makes a block an install block. */
const COMMAND_LINE = /^(npx |npm install )/m

/** The same block under another package manager: only the lines that start with `npx` or `npm install` change, so a comment or a second command rides along. */
export function commandFor(code: string, manager: Runner): string {
  return code.replace(/^npx /gm, `${manager.run} `).replace(/^npm install /gm, `${manager.add} `)
}

// The icons are inline so a page loads no image, and drawn here so they carry no licence of their own.
const icon = (paths: string, cls: string) =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`
const COPY_BUTTON = `<button type="button" class="copy" aria-label="Copy">${icon('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3"/>', "copy-icon")}${icon('<path d="M5 12.5l4.5 4.5L19 7"/>', "check-icon")}</button>`
const PROMPT_ICON = icon('<path d="M4 7l5 5-5 5M11 17h9"/>', "prompt")
const LEFT_ICON = icon('<path d="M15 6l-6 6 6 6"/>', "left-icon")
const RIGHT_ICON = icon('<path d="M9 6l6 6-6 6"/>', "right-icon")

/**
 * Every code block on a page gets a copy button, and a block with a line that starts with `npx` or `npm install`
 * becomes an install block: the same command under pnpm, npm, yarn, and bun, one of them showing. Which one is
 * the page's `data-pm`, which site.js sets from the reader's last choice before the body parses, and the tabs
 * follow it. The last pass over a page, on its HTML, because the blocks come from four places: the templates,
 * marked, the preview card, and the Installation section.
 */
export function codeBlocks(html: string): string {
  let blocks = 0
  return html.replace(/<pre><code( class="language-[\w-]+")?>([\s\S]*?)<\/code><\/pre>/g, (block: string, attributes: string | undefined, code: string) => {
    if (!COMMAND_LINE.test(code)) return `<div class="code">${block}${COPY_BUTTON}</div>`
    const id = `pm-${++blocks}`
    const tabs = PACKAGE_MANAGERS.map(
      ({ name }) =>
        `<button type="button" role="tab" id="${id}-${name}" aria-controls="${id}-${name}-code" aria-selected="${name === DEFAULT_MANAGER}" data-pm="${name}">${name}</button>`,
    ).join("")
    const panels = PACKAGE_MANAGERS.map(
      (manager) =>
        `<pre id="${id}-${manager.name}-code" role="tabpanel" aria-labelledby="${id}-${manager.name}" data-pm="${manager.name}"><code${attributes ?? ""}>${commandFor(code, manager)}</code></pre>`,
    ).join("\n")
    return `<div class="code command">\n<div class="managers" role="tablist" aria-label="Package manager">${PROMPT_ICON}${tabs}</div>\n${panels}\n${COPY_BUTTON}\n</div>`
  })
}

/**
 * Every table on a page gets a wrapper that scrolls sideways, so a table wider than the column (the tokens table
 * under a narrow window) scrolls inside it instead of widening the whole page. Tables come from the builder and
 * from marked, so this is a pass over the page like `codeBlocks`; no table here holds another.
 */
export function tables(html: string): string {
  return html.replace(/<table\b[\s\S]*?<\/table>/g, (table) => `<div class="table">${table}</div>`)
}

/** A page: the template filled, then every code block given its copy button and, for a command, its package-manager tabs, and every table its scroll wrapper. */
export function renderPage(template: string, values: Record<string, string>): string {
  return tables(codeBlocks(render(template, values)))
}

export const PAGES = ["index.html", "404.html"] as const
export const FAVICON = "favicon.svg"
/** The pages' script, a file so the site's Content-Security-Policy keeps script-src to 'self'. */
export const SITE_SCRIPT = "site.js"
/** The mode script, on every page and every preview: light or dark onto <html>, before anything paints. */
export const MODE_SCRIPT = "theme.js"
/** The pages' one stylesheet; each page adds only its palette inline. */
export const SITE_STYLES = "site.css"
/** The search index: every page's title, headings, and text, which site.js fetches the first time the search opens. */
export const SEARCH_INDEX = "search.json"
/** The headers every response carries; the stack and the smoke both read this file. */
export const HEADERS_FILE = "headers.json"
export const DOCS_TEMPLATE = "docs.html"
export const PREVIEW_TEMPLATE = "preview.html"
/** The site's own docs pages, site/docs/<slug>.md, in the order the nav and the pager walk them. `index` is /docs/ itself. */
export const SITE_DOCS = "docs"
export const START_PAGES = ["index", "installation", "components", "theming", "changelog"] as const
/** Where the embedded previews live on the site: /preview/<item>/ and the bundle under /preview/assets/. */
export const PREVIEW_PATH = "preview"
/** dockview opens this on the site's origin for a popped-out workspace panel; the playground's copy is published at the root. */
export const POPOUT = "popout.html"

export type RenderedDoc = { title: string; description: string; html: string }
/**
 * A docs page. `path` is its URL, `label` what the nav and the pager call it (an item's name, another page's
 * title), `source` the markdown file's name, and `file` the repo path the foot names, when the page is a file
 * of the tag's and not the site's own.
 */
export type Doc = RenderedDoc & { slug: string; path: string; label: string; source: string; file?: string; item?: RegistryItem }

const slugify = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")

/** The first paragraph after the title, for the meta description. */
export function firstParagraph(markdown: string): string {
  let fence = false
  let pastTitle = false
  for (const line of markdown.split("\n")) {
    if (line.startsWith("```")) fence = !fence
    if (fence || line.startsWith("```")) continue
    if (line.startsWith("# ")) {
      pastTitle = true
      continue
    }
    if (!pastTitle || !line.trim() || /^(#|-|\d+\.|>|\||<)/.test(line)) continue
    return line.replace(/`/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").trim().slice(0, 200)
  }
  return ""
}

/**
 * Markdown to HTML with the first `#` as the title, an anchor on every heading, and a link to `x.md` pointing at
 * that page. A heading that is itself a link (the changelog's versions) keeps its own link and gets no anchor,
 * since a link inside a link is not HTML.
 */
export function renderMarkdown(markdown: string): RenderedDoc {
  const ids = new Map<string, number>()
  let title = ""
  const marked = new Marked({ gfm: true })
  marked.use({
    renderer: {
      link(token) {
        // A doc links a sibling as `data-grid.md`, which works on GitHub; here that page is /docs/data-grid/.
        const href = /^[\w-]+\.md$/.test(token.href) ? `/docs/${token.href.slice(0, -".md".length)}/` : token.href
        const title = token.title ? ` title="${escapeHtml(token.title)}"` : ""
        return `<a href="${escapeHtml(href)}"${title}>${this.parser.parseInline(token.tokens)}</a>`
      },
      heading(token) {
        const plain = token.text.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/`/g, "")
        if (token.depth === 1 && !title) title = plain
        let id = slugify(plain)
        const seen = ids.get(id) ?? 0
        ids.set(id, seen + 1)
        if (seen) id = `${id}-${seen}`
        const inline = this.parser.parseInline(token.tokens)
        const linked = token.tokens.some((t) => t.type === "link")
        return `<h${token.depth} id="${id}">${linked ? inline : `<a href="#${id}">${inline}</a>`}</h${token.depth}>\n`
      },
    },
  })
  const html = marked.parse(markdown) as string
  return { title, description: firstParagraph(markdown), html }
}

/** Every docs/*.md of the tag: item docs first in registry order, the rest by name. */
export async function readDocs(dir: string, registry: Registry): Promise<Doc[]> {
  const names = (await readdir(dir)).filter((name) => name.endsWith(".md")).sort()
  const docs = await Promise.all(
    names.map(async (source): Promise<Doc> => {
      const slug = source.slice(0, -".md".length)
      const rendered = renderMarkdown(await readFile(join(dir, source), "utf8"))
      if (!rendered.title) throw new Error(`docs/${source} has no # title`)
      const item = registry.items.find((entry) => entry.name === slug)
      return { ...rendered, slug, path: `/docs/${slug}/`, label: item ? slug : rendered.title, source, file: `docs/${source}`, item }
    }),
  )
  const order = new Map(registry.items.map((item, index) => [item.name, index]))
  return docs.sort((a, b) => (order.get(a.slug) ?? Infinity) - (order.get(b.slug) ?? Infinity) || a.slug.localeCompare(b.slug))
}

// The site's own pages: site/docs/<slug>.md on main, with {{placeholders}} the builder fills from the tag's
// registry and changelog, so an Introduction or an Installation page is edited on main and republished by a
// dispatch, while what it says about the release comes from the release.

/** The body of the tag's CHANGELOG.md, from its first release heading on, or a line saying the tag has none. */
export async function readChangelog(path: string): Promise<string> {
  let text: string
  try {
    text = await readFile(path, "utf8")
  } catch {
    return "There is no changelog at this tag."
  }
  const first = text.search(/^## /m)
  // release-please seeds the file with a bare "## Changelog" heading that stays at the bottom for good.
  return first < 0 ? "There is no changelog at this tag." : text.slice(first).replace(/\n## Changelog\s*$/, "").trim()
}

/** `@tradecn/a @tradecn/b ...`: every item, for one command. */
export const everyItem = (registry: Registry) => registry.items.map((item) => `@tradecn/${item.name}`).join(" ")

/** An npm dependency as the registry writes it, `name@^x.y.z`, without the range: the Manual tab installs by name, as shadcn's does. */
const packageName = (dependency: string) => dependency.replace(/@[\^~]?\d[^@]*$/, "")

/** The packages the items pull in, each with the items that need it, as a table. */
export function dependenciesTable(registry: Registry, tag: string, docSlugs: ReadonlySet<string>): string {
  const packages = new Map<string, RegistryItem[]>()
  for (const item of registry.items) {
    for (const dependency of item.dependencies ?? []) {
      const name = packageName(dependency)
      packages.set(name, [...(packages.get(name) ?? []), item])
    }
  }
  const rows = [...packages].map(
    ([name, items]) =>
      `<tr><td><code>${escapeHtml(name)}</code></td><td>${items.map((item) => `<a href="${docHref(item, tag, docSlugs)}"><code>${escapeHtml(item.name)}</code></a>`).join(", ")}</td></tr>`,
  )
  return `<table class="dependencies">\n<thead><tr><th>Package</th><th>Needed by</th></tr></thead>\n<tbody>\n${rows.join("\n")}\n</tbody>\n</table>`
}

/** A token's value as a swatch can paint it: a shadcn variable through the page's own palette, a color as written, and nothing for a font stack or a size. */
const swatch = (value: string) => (isColorValue(value) ? `<span class="swatch" style="background: ${escapeHtml(value.replace(/^var\(--color-/, "var(--"))}"></span>` : "")

/** Every token the items add, in the order the registry introduces them: its light and dark values, and the items that add it. Themes set everything, so they are not in it. */
export function tokensTable(registry: Registry, tag: string, docSlugs: ReadonlySet<string>): string {
  const tokens = new Map<string, { light: string; dark: string; items: RegistryItem[] }>()
  for (const item of registry.items) {
    if (item.type === "registry:theme") continue
    for (const [token, light] of Object.entries(item.cssVars?.light ?? {})) {
      const entry = tokens.get(token) ?? { light, dark: item.cssVars?.dark?.[token] ?? light, items: [] }
      entry.items.push(item)
      tokens.set(token, entry)
    }
  }
  // Light over dark in one cell, so the table is three columns and fits a laptop without scrolling; one line when they agree.
  // A color stays on one line beside its swatch; a font stack is long and wraps at its commas, so the table keeps its width and the last column its room.
  const value = (text: string) => `${swatch(text)}<code${isColorValue(text) ? "" : ' class="stack"'}>${escapeHtml(text)}</code>`
  const rows = [...tokens].map(
    ([token, { light, dark, items }]) =>
      `<tr><td><code>--${escapeHtml(token)}</code></td><td class="value">${light === dark ? value(light) : `${value(light)}<br>${value(dark)}`}</td><td>${items.map((item) => `<a href="${docHref(item, tag, docSlugs)}"><code>${escapeHtml(item.name)}</code></a>`).join(", ")}</td></tr>`,
  )
  return `<table class="tokens">\n<thead><tr><th>Token</th><th>Light, then dark</th><th>Added by</th></tr></thead>\n<tbody>\n${rows.join("\n")}\n</tbody>\n</table>`
}

/** The theme items, each linked, with its one line. */
export function themesList(registry: Registry, tag: string, docSlugs: ReadonlySet<string>): string {
  const themes = registry.items.filter((item) => item.type === "registry:theme")
  if (!themes.length) return "<p>This tag ships no theme.</p>"
  return `<ul>\n${themes.map((item) => `<li><a href="${docHref(item, tag, docSlugs)}"><code>${escapeHtml(item.name)}</code></a> ${escapeHtml(item.description ?? "")}</li>`).join("\n")}\n</ul>`
}

/** One card per item: its name, its kind, and its one line, linking its page. The Components index (the components only), and the opening page when the tag has no previews (every item). */
export function itemCards(items: RegistryItem[], tag: string, docSlugs: ReadonlySet<string>): string {
  const cards = items.map(
    (item) =>
      `<a class="card" href="${docHref(item, tag, docSlugs)}"><span class="card-title"><code>${escapeHtml(item.name)}</code><span class="kind">${escapeHtml(kindOf(item))}</span></span><span class="card-text">${escapeHtml(item.description ?? "")}</span></a>`,
  )
  return `<div class="cards">\n${cards.join("\n")}\n</div>`
}

/**
 * The opening page below the fold: every item that has a demo, running, in the order the registry lists them,
 * each in a card that names it and links its page. The iframe is sized by the height its page reports, like the
 * preview on a docs page. A tag with no embed build gets the cards without the frames.
 */
export function showcase(registry: Registry, tag: string, docSlugs: ReadonlySet<string>, previews: Previews): string {
  if (!previews.embed) return itemCards(registry.items, tag, docSlugs)
  const cards = registry.items
    .filter((item) => previews.demos.has(item.name))
    .map((item) => {
      const name = escapeHtml(item.name)
      return [
        `<article class="card" data-preview="${name}">`,
        `<div class="card-bar"><a href="${docHref(item, tag, docSlugs)}"><code>${name}</code></a><span class="kind">${escapeHtml(kindOf(item))}</span><a class="open" href="/${PREVIEW_PATH}/${name}/" target="_blank" rel="noopener">Open in a new tab</a></div>`,
        `<iframe src="/${PREVIEW_PATH}/${name}/" title="${name}, live" data-preview="${name}"></iframe>`,
        `</article>`,
      ].join("\n")
    })
  return `<section class="showcase" aria-label="Every item, live">\n${cards.join("\n")}\n</section>`
}

/**
 * The site's own pages, filled and rendered. Each is a Doc like the tag's, at /docs/<slug>/ (the index at /docs/),
 * and the changelog's foot names the tag's CHANGELOG.md.
 */
export async function readSitePages(dir: string, values: Record<string, string>): Promise<Doc[]> {
  return Promise.all(
    START_PAGES.map(async (slug): Promise<Doc> => {
      const source = `${slug}.md`
      const rendered = renderMarkdown(render(await readFile(join(dir, source), "utf8"), values))
      if (!rendered.title) throw new Error(`site/docs/${source} has no # title`)
      const path = slug === "index" ? "/docs/" : `/docs/${slug}/`
      return { ...rendered, slug, path, label: rendered.title, source, file: slug === "changelog" ? "CHANGELOG.md" : undefined }
    }),
  )
}

/**
 * The pages in the order the nav and the pager walk them: the site's own, the tag's other docs (the contract),
 * then the items group by group (components, hooks, utilities, themes), each group in registry order.
 */
export function siteDocs(site: Doc[], tagDocs: Doc[]): Doc[] {
  return [...site, ...tagDocs.filter((doc) => !doc.item), ...GROUPS.flatMap((group) => tagDocs.filter((doc) => doc.item && groupOf(doc.item) === group))]
}

// The previews. A demo is playground/src/demos/<item>.tsx; the embed build is that app's dist/embed,
// a Vite manifest over one entry with a chunk per demo. The pages need both, or neither.

export type Demo = { name: string; source: string; code: string }
/** The embed build: the entry's script and stylesheets as site paths, and the directory to copy. */
export type Embed = { dir: string; script: string; styles: string[] }
export type Previews = { demos: Map<string, Demo>; embed: Embed | null }
const NO_PREVIEWS: Previews = { demos: new Map(), embed: null }

/**
 * A demo imports the registry source live, `@/registry/tradecn/ui/x`; a consumer has the same file at
 * `@/components/ui/x`. The Code tab shows the consumer's form, the one `shadcn add` writes (contract rule 4).
 */
export function consumerImports(source: string): string {
  return source
    .replace(/"@\/registry\/tradecn\/ui\//g, '"@/components/ui/')
    .replace(/"@\/registry\/tradecn\/hooks\//g, '"@/hooks/')
    .replace(/"@\/registry\/tradecn\/lib\//g, '"@/lib/')
    .replace(/"@\/registry\/tradecn\/blocks\/([^/"]+)\/[^"]+"/g, '"@/components/$1"')
}

/** Every top-level playground/src/demos/*.tsx, by item name. A missing directory is no demos, not an error. */
export async function readDemos(dir: string): Promise<Map<string, Demo>> {
  const demos = new Map<string, Demo>()
  let names: string[]
  try {
    names = (await readdir(dir)).filter((name) => name.endsWith(".tsx")).sort()
  } catch {
    return demos
  }
  for (const file of names) {
    const source = await readFile(join(dir, file), "utf8")
    const name = file.slice(0, -".tsx".length)
    demos.set(name, { name, source, code: consumerImports(source) })
  }
  return demos
}

/** The embed build's manifest, or null when the checkout has no build (a tag from before the previews). */
export async function readEmbed(dir: string): Promise<Embed | null> {
  let manifest: Record<string, { file: string; css?: string[]; isEntry?: boolean; src?: string }>
  try {
    manifest = JSON.parse(await readFile(join(dir, ".vite", "manifest.json"), "utf8"))
  } catch {
    return null
  }
  const entry = Object.values(manifest).find((chunk) => chunk.isEntry && chunk.src?.endsWith("embed.tsx"))
  if (!entry) throw new Error(`${dir} has a manifest with no embed entry`)
  const site = (file: string) => `/${PREVIEW_PATH}/${file}`
  return { dir, script: site(entry.file), styles: (entry.css ?? []).map(site) }
}

/** What the CLI writes into a consumer's stylesheet for a theme: the Code tab for an item that has no component to show. */
export function themeCss(item: RegistryItem): string {
  const block = (selector: string, vars: Record<string, string> | undefined) =>
    vars ? `${selector} {\n${Object.entries(vars).map(([k, v]) => `  --${k}: ${v};`).join("\n")}\n}` : ""
  return [block("@theme inline", item.cssVars?.theme), block(":root", item.cssVars?.light), block(".dark", item.cssVars?.dark)]
    .filter(Boolean)
    .join("\n\n")
}

/** Every variable a theme sets in one mode, for the embed page's `:root.<mode>`: the whole palette, not the pages' dozen. */
export function fullPalette(theme: RegistryItem, mode: "light" | "dark"): string {
  const vars = theme.cssVars?.[mode] ?? {}
  const font = theme.cssVars?.theme?.["font-sans"]
  const lines = Object.entries(vars).map(([token, value]) => `  --${token}: ${value};`)
  if (font) lines.push(`  --font-sans: ${font};`)
  if (!lines.length) throw new Error(`${theme.name} sets no ${mode} variables`)
  return lines.join("\n")
}

/**
 * Every other theme's two sides for the embed page, each block keyed on the data-theme theme.js writes beside the mode
 * class, so a preview wears the theme the page around it chose: the whole palette, as the default's blocks are.
 */
export function previewThemePalettes(themes: RegistryItem[]): string {
  return themes
    .slice(1)
    .map((theme) => (["dark", "light"] as const).map((mode) => `:root.${mode}[data-theme="${escapeHtml(theme.name)}"] {\n${fullPalette(theme, mode)}\n}`).join("\n"))
    .join("\n")
}

/** The Preview / Code card on an item's page. The iframe is sized by the message the embed posts. */
export function previewBlock(doc: Doc, demo: Demo, tag: string): string {
  const name = doc.slug
  const theme = doc.item?.type === "registry:theme"
  const code = theme && doc.item ? [themeCss(doc.item), doc.item.css ? registryCss(doc.item.css) : ""].filter(Boolean).join("\n\n") : demo.code
  const language = theme ? "css" : "tsx"
  const codeSource = theme ? `what <code>${escapeHtml(name)}</code> writes into your stylesheet` : `<code>playground/src/demos/${escapeHtml(name)}.tsx</code>`
  // Ids carry the demo's name, so a page could hold more than one card.
  const id = `preview-${escapeHtml(name)}`
  return [
    `<div class="preview" data-preview="${escapeHtml(name)}" data-tabs>`,
    `<div class="preview-bar" role="tablist" aria-label="${escapeHtml(name)} preview">`,
    `<button type="button" role="tab" id="${id}-tab-live" aria-selected="true" aria-controls="${id}-live">Preview</button>`,
    `<button type="button" role="tab" id="${id}-tab-code" aria-selected="false" aria-controls="${id}-code">Code</button>`,
    `<a class="preview-open" href="/${PREVIEW_PATH}/${escapeHtml(name)}/" target="_blank" rel="noopener">Open in a new tab</a>`,
    `</div>`,
    `<div class="preview-live" id="${id}-live" role="tabpanel" aria-labelledby="${id}-tab-live">`,
    `<iframe src="/${PREVIEW_PATH}/${escapeHtml(name)}/" title="${escapeHtml(name)}, live" loading="lazy" data-preview="${escapeHtml(name)}"></iframe>`,
    `</div>`,
    `<div class="preview-code" id="${id}-code" role="tabpanel" aria-labelledby="${id}-tab-code" hidden>`,
    `<p class="preview-source">${codeSource}, at <a href="${REPO_URL}/blob/${tag}/playground/src/demos/${escapeHtml(name)}.tsx">${tag}</a>.</p>`,
    `<pre><code class="language-${language}">${escapeHtml(code)}</code></pre>`,
    `</div>`,
    `</div>`,
  ].join("\n")
}

/** The preview and the Installation go after the first paragraph: the title, the one sentence, then the item itself and how to get it. */
export function withPreview(html: string, block: string): string {
  const h1 = html.indexOf("</h1>")
  const p = html.indexOf("</p>\n", h1 < 0 ? 0 : h1)
  const at = p < 0 ? (h1 < 0 ? 0 : h1 + "</h1>\n".length) : p + "</p>\n".length
  return `${html.slice(0, at)}${block}\n${html.slice(at)}`
}

// The Installation section. Command is what the Installation page says: `shadcn add` with the tag pinned. Manual
// is what that command does, step by step, from registry.json and the files it names.

/** Every file any item installs, in the form `shadcn add` writes it (a consumer's imports), by its registry path. */
export type Sources = Map<string, string>

/** Read the files the items install from the checkout that holds their `registry.json`. */
export async function readSources(registry: Registry, dir: string): Promise<Sources> {
  const sources: Sources = new Map()
  for (const item of registry.items) {
    for (const file of item.files ?? []) {
      if (!sources.has(file.path)) sources.set(file.path, consumerImports(await readFile(join(dir, file.path), "utf8")))
    }
  }
  return sources
}

/** Where `shadcn add` puts a registry file in a consumer, by the file's type: the path the Manual tab shows above its source. */
export function consumerPath(file: RegistryFile): string {
  if (file.target) return file.target.replace(/^~\//, "")
  const base = file.path.slice(file.path.lastIndexOf("/") + 1)
  const dir = { "registry:ui": "components/ui", "registry:hook": "hooks", "registry:lib": "lib", "registry:block": "components" }[file.type]
  return dir ? `${dir}/${base}` : base
}

/** A registry `css` block as the stylesheet text the CLI appends: at-rules and selectors nested, declarations inside. */
export function registryCss(css: Record<string, unknown>, depth = 0): string {
  const pad = "  ".repeat(depth)
  return Object.entries(css)
    .map(([key, value]) =>
      typeof value === "string" ? `${pad}${key}: ${value};` : `${pad}${key} {\n${registryCss(value as Record<string, unknown>, depth + 1)}\n${pad}}`,
    )
    .join("\n")
}

/**
 * The Installation section of an item's page, in shadcn's shape. Command is `shadcn add` with the tag pinned, under
 * the reader's package manager. Manual is the same install by hand: the packages, the shadcn built-ins the item
 * composes, every file at the path it lands on with a consumer's imports, and the CSS the command appends.
 */
export function installationSection(item: RegistryItem, tag: string, sources: Sources): string {
  const bash = (code: string) => `<pre><code class="language-bash">${escapeHtml(code)}</code></pre>`
  const manual: string[] = []
  const packages = (item.dependencies ?? []).map(packageName)
  if (packages.length) manual.push(`<p>Install the dependencies:</p>`, bash(`npm install ${packages.join(" ")}`))
  const builtins = item.registryDependencies ?? []
  if (builtins.length) manual.push(`<p>Add the shadcn components it composes:</p>`, bash(`npx shadcn@latest add ${builtins.join(" ")}`))
  const files = item.files ?? []
  if (files.length) manual.push(`<p>Copy the files into your project:</p>`)
  for (const file of files) {
    const source = sources.get(file.path)
    if (source === undefined) throw new Error(`${item.name} installs ${file.path}, which the checkout does not have`)
    const language = file.path.endsWith(".tsx") ? "tsx" : "ts"
    manual.push(`<p class="file"><code>${escapeHtml(consumerPath(file))}</code></p>`, `<pre><code class="language-${language}">${escapeHtml(source)}</code></pre>`)
  }
  if (item.cssVars) {
    const theme = item.type === "registry:theme"
    manual.push(`<p>${theme ? "Replace the variables in your stylesheet with these:" : "Add the tokens to your stylesheet:"}</p>`, `<pre><code class="language-css">${escapeHtml(themeCss(item))}</code></pre>`)
  }
  if (item.css) manual.push(`<p>Append this to your stylesheet:</p>`, `<pre><code class="language-css">${escapeHtml(registryCss(item.css))}</code></pre>`)
  return [
    `<h2 id="installation"><a href="#installation">Installation</a></h2>`,
    `<div class="tabs" data-tabs>`,
    `<div class="tabs-bar" role="tablist" aria-label="Installation">`,
    `<button type="button" role="tab" id="installation-tab-command" aria-selected="true" aria-controls="installation-command">Command</button>`,
    `<button type="button" role="tab" id="installation-tab-manual" aria-selected="false" aria-controls="installation-manual">Manual</button>`,
    `</div>`,
    `<div id="installation-command" role="tabpanel" aria-labelledby="installation-tab-command">`,
    bash(`npx shadcn@latest add tradecn/ui/${item.name}#${tag}`),
    `</div>`,
    `<div id="installation-manual" role="tabpanel" aria-labelledby="installation-tab-manual" hidden>`,
    ...manual,
    `</div>`,
    `</div>`,
  ].join("\n")
}

const SHADCN_DOCS = "https://ui.shadcn.com/docs/components"

/** "a, b, and c" from links, the way a sentence lists them. */
const listOf = (parts: string[]) => (parts.length < 3 ? parts.join(" and ") : `${parts.slice(0, -1).join(", ")}, and ${parts.at(-1)}`)

/** The last line of an item's API Reference: the shadcn components it composes, each linked to its own page. */
export function builtOn(item: RegistryItem): string {
  const builtins = item.registryDependencies ?? []
  if (!builtins.length) return ""
  const links = builtins.map((name) => `<a href="${SHADCN_DOCS}/${escapeHtml(name)}"><code>${escapeHtml(name)}</code></a>`)
  return `<p class="built-on">Built on shadcn's ${listOf(links)}.</p>`
}

/** Previous and next at the foot, named, in the nav's order. */
export function pager(docs: Doc[], index: number): string {
  const prev = docs[index - 1]
  const next = docs[index + 1]
  return [
    `<nav class="pager" aria-label="Previous and next">`,
    prev ? `<a rel="prev" href="${prev.path}">← ${escapeHtml(prev.label)}</a>` : `<span></span>`,
    next ? `<a rel="next" href="${next.path}">${escapeHtml(next.label)} →</a>` : `<span></span>`,
    `</nav>`,
  ].join("\n")
}

/** Previous and next beside the title, as arrows; the foot's pager says where they go. */
export function arrows(docs: Doc[], index: number): string {
  const prev = docs[index - 1]
  const next = docs[index + 1]
  return [
    `<nav class="arrows" aria-label="Previous and next">`,
    prev ? `<a rel="prev" href="${prev.path}" aria-label="Previous: ${escapeHtml(prev.label)}">${LEFT_ICON}</a>` : `<span aria-hidden="true">${LEFT_ICON}</span>`,
    next ? `<a rel="next" href="${next.path}" aria-label="Next: ${escapeHtml(next.label)}">${RIGHT_ICON}</a>` : `<span aria-hidden="true">${RIGHT_ICON}</span>`,
    `</nav>`,
  ].join("\n")
}

/** An h2 or h3 as `renderMarkdown` writes it: its level, its id, and what is inside it. */
const HEADING = /<h([23]) id="([^"]+)">([\s\S]*?)<\/h\1>/g

const NAMED_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " }

/** Rendered HTML as the words on the page: a block's end is a space, an inline tag is nothing, entities decoded, whitespace folded. */
export function textOf(html: string): string {
  return html
    .replace(/<\/?(p|li|h[1-6]|br|hr|td|th|tr|pre|div|ul|ol|blockquote|table|thead|tbody|dl|dt|dd)\b[^>]*>/g, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity: string, code: string) => {
      if (code[0] === "#") return String.fromCodePoint(code[1]?.toLowerCase() === "x" ? parseInt(code.slice(2), 16) : Number(code.slice(1)))
      return NAMED_ENTITIES[code.toLowerCase()] ?? entity
    })
    .replace(/\s+/g, " ")
    .trim()
}

export type SearchSection = { id: string; heading: string; parent?: string; text: string }
/** A page in the search index: where it is, what it is called, which sidebar group it is in, its opening text, and every h2 and h3 with the text under it. */
export type SearchPage = { path: string; title: string; group: Group; text: string; sections: SearchSection[] }

/**
 * The search index, from the docs in nav order. It reads each doc's own HTML, so the generated parts of an item's
 * page (the preview, the Installation with every file's source) are not in it: a hit is a page or one of the
 * doc's headings, and its text is what the doc says there. An h3 names the h2 it is under.
 */
export function searchIndex(docs: Doc[]): SearchPage[] {
  return docs.map((doc) => {
    const headings = [...doc.html.matchAll(HEADING)]
    const intro = doc.html.slice(0, headings[0]?.index ?? doc.html.length).replace(/<h1\b[\s\S]*?<\/h1>/, "")
    let parent: string | undefined
    const sections = headings.map((match, index): SearchSection => {
      const [whole, level, id = "", inner = ""] = match
      const heading = textOf(inner)
      if (level === "2") parent = heading
      const text = textOf(doc.html.slice(match.index + whole.length, headings[index + 1]?.index ?? doc.html.length))
      return level === "3" && parent ? { id, heading, parent, text } : { id, heading, text }
    })
    return { path: doc.path, title: doc.title, group: groupOf(doc.item), text: textOf(intro), sections }
  })
}

/** The page's h2 and h3 headings as a nested list of anchors, or nothing when it has fewer than two. */
export function toc(html: string): string {
  const headings = [...html.matchAll(HEADING)].map(([, level, id, inner]) => ({
    level: Number(level),
    id: id ?? "",
    // The heading's own anchor, and any link in it, would nest inside the entry's link.
    text: (inner ?? "").replace(/<\/?a\b[^>]*>/g, ""),
  }))
  if (headings.length < 2) return ""
  // An h3 nests under the h2 before it; the list closes whatever is open when the level comes back up.
  let list = ""
  let depth = 2
  for (const heading of headings) {
    if (heading.level > depth) list += "\n<ul>\n"
    else if (heading.level < depth) list += "</li>\n</ul>\n</li>\n"
    else if (list) list += "</li>\n"
    depth = heading.level
    list += `<li><a href="#${heading.id}">${heading.text}</a>`
  }
  list += depth === 3 ? "</li>\n</ul>\n</li>" : "</li>"
  return `<h2>On this page</h2>\n<ul>\n${list}\n</ul>`
}

/**
 * The sidebar: the site's own pages and the contract under Get Started, then the items under their own
 * kinds: Components, Hooks, Utilities, Themes, each only when the tag has one. The Components heading links
 * the Components index and the Themes heading the list on the Theming page; the other two are just headings.
 */
export function docsNav(docs: Doc[], current: string | null): string {
  const link = (doc: Doc) => `<li><a href="${doc.path}"${doc.slug === current ? ' aria-current="page"' : ""}>${escapeHtml(doc.label)}</a></li>`
  const components = docs.find((doc) => doc.slug === "components")
  const theming = docs.find((doc) => doc.slug === "theming")
  const hrefs: Partial<Record<Group, string | undefined>> = { Components: components?.path, Themes: theming && `${theming.path}#themes` }
  return GROUPS.flatMap((group) => {
    const pages = docs.filter((doc) => groupOf(doc.item) === group)
    if (!pages.length) return []
    const href = hrefs[group]
    return [`<h2>${href ? `<a href="${href}">${group}</a>` : group}</h2>\n<ul>\n${pages.map(link).join("\n")}\n</ul>`]
  }).join("\n")
}

/** Which header section a page is in. */
export function sectionOf(doc: Doc): Section {
  if (doc.item || doc.slug === "components") return "components"
  if (doc.slug === "changelog") return "changelog"
  return "docs"
}

/**
 * The rendered docs pages, as paths under the output directory. An item's page is the doc in shadcn's shape:
 * title, one sentence, the preview, Installation, then the doc's own Usage and API Reference, the shadcn
 * components it is built on, and the pager. Every page gets the arrows beside its title and its own headings
 * down the right.
 */
export function docPages(docs: Doc[], values: Record<string, string>, template: string, previews: Previews = NO_PREVIEWS, sources: Sources = new Map()): Array<{ path: string; html: string }> {
  const { tag = "", repoUrl, themePicker: picker = "" } = values
  return docs.map((doc, index) => {
    const demo = previews.embed ? previews.demos.get(doc.slug) : undefined
    const foot = doc.file ? `<p class="foot">This page is <code>${escapeHtml(doc.file)}</code> at <a href="${repoUrl}/blob/${tag}/${escapeHtml(doc.file)}">${tag}</a>.</p>` : ""
    if (doc.item && doc.html.includes('id="installation"')) throw new Error(`docs/${doc.source} has its own Installation heading, and the builder adds one`)
    const lead = [demo ? previewBlock(doc, demo, tag) : "", doc.item ? installationSection(doc.item, tag, sources) : ""].filter(Boolean).join("\n")
    const body = [lead ? withPreview(doc.html, lead) : doc.html, doc.item ? builtOn(doc.item) : ""].filter(Boolean).join("\n")
    const content = [arrows(docs, index), body, pager(docs, index)].join("\n")
    const section = sectionOf(doc)
    return {
      path: `${doc.path.slice(1)}index.html`,
      html: renderPage(template, {
        ...values,
        title: escapeHtml(doc.title),
        description: escapeHtml(doc.description),
        path: doc.path,
        header: siteHeader(tag, section, !doc.item && (section !== "docs" || doc.slug === "index"), picker),
        nav: docsNav(docs, doc.slug),
        toc: toc(body),
        content,
        foot,
      }),
    }
  })
}

/**
 * One page per demo at /preview/<item>/, around the embed bundle, with a palette for each mode. A theme's page
 * wears that theme in both, whatever the reader chose in the header; every other page wears the site's theme, from
 * `themeSource`, both whole sides, and carries every other theme's sides keyed on the choice, so a demo looks like
 * the docs page that frames it.
 */
export function previewPages(registry: Registry, themeSource: Registry, previews: Previews, values: Record<string, string>, template: string, docSlugs: ReadonlySet<string> = new Set()): Array<{ path: string; html: string }> {
  const { embed } = previews
  if (!embed) return []
  const themes = siteThemes(themeSource)
  const site = themes[0]!
  const others = previewThemePalettes(themes)
  const styles = embed.styles.map((href) => `<link rel="stylesheet" href="${href}">`).join("\n")
  // A demo is an item's, or a doc's own (the Typography page has one); a stray demo with no page gets none.
  return [...previews.demos.values()]
    .filter((demo) => registry.items.some((item) => item.name === demo.name) || docSlugs.has(demo.name))
    .map((demo) => {
      const item = registry.items.find((entry) => entry.name === demo.name)
      const theme = item?.type === "registry:theme" ? item : null
      return {
        path: `${PREVIEW_PATH}/${demo.name}/index.html`,
        html: render(template, {
          ...values,
          item: escapeHtml(demo.name),
          darkPalette: fullPalette(theme ?? site, "dark"),
          lightPalette: fullPalette(theme ?? site, "light"),
          themePalettes: theme ? "" : others,
          styles,
          script: embed.script,
        }),
      }
    })
}

/** The values the site's own pages fill their placeholders from: the template values plus what the tag's registry and changelog say. */
export function sitePageValues(registry: Registry, values: Record<string, string>, docSlugs: ReadonlySet<string>, changelog: string): Record<string, string> {
  const { tag = "" } = values
  return {
    ...values,
    dependencies: dependenciesTable(registry, tag, docSlugs),
    tokens: tokensTable(registry, tag, docSlugs),
    themes: themesList(registry, tag, docSlugs),
    cards: itemCards(componentItems(registry), tag, docSlugs),
    everyItem: everyItem(registry),
    changelog,
  }
}

async function main() {
  const root = resolve(import.meta.dirname, "../..")
  const { values: args } = parseArgs({
    options: {
      registry: { type: "string", default: "registry.json" },
      version: { type: "string", default: "version.txt" },
      docs: { type: "string", default: "docs" },
      changelog: { type: "string", default: "CHANGELOG.md" },
      theme: { type: "string", default: join(root, "registry.json") },
      demos: { type: "string", default: "playground/src/demos" },
      embed: { type: "string", default: "playground/dist/embed" },
      out: { type: "string", default: "site/dist" },
    },
  })
  const registry = JSON.parse(await readFile(resolve(args.registry), "utf8")) as Registry
  const themeSource = JSON.parse(await readFile(resolve(args.theme), "utf8")) as Registry
  const version = (await readFile(resolve(args.version), "utf8")).trim()
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`${args.version} holds "${version}", which is not a version`)
  const tagDocs = await readDocs(resolve(args.docs), registry)
  const docSlugs = new Set(tagDocs.map((doc) => doc.slug))
  const previews: Previews = { demos: await readDemos(resolve(args.demos)), embed: await readEmbed(resolve(args.embed)) }
  const values = templateValues(registry, version, themeSource, docSlugs, previews)
  const site = await readSitePages(join(root, "site", SITE_DOCS), sitePageValues(registry, values, docSlugs, await readChangelog(resolve(args.changelog))))
  const docs = siteDocs(site, tagDocs)
  // The files the Manual tab shows live beside the registry.json they are listed in: the tag's checkout in the release job.
  const sources = await readSources(registry, dirname(resolve(args.registry)))
  const out = resolve(args.out)
  await mkdir(out, { recursive: true })
  for (const page of PAGES) {
    const template = await readFile(join(root, "site", page), "utf8")
    await writeFile(join(out, page), renderPage(template, values))
  }
  // The amber mark: readable on a dark tab strip, and the same file the README shows in dark mode.
  await writeFile(join(out, FAVICON), await readFile(join(root, "assets", "logo-dark.svg")))
  await cp(join(root, "site", SITE_SCRIPT), join(out, SITE_SCRIPT))
  await cp(join(root, "site", MODE_SCRIPT), join(out, MODE_SCRIPT))
  await cp(join(root, "site", SITE_STYLES), join(out, SITE_STYLES))
  // The two faces, from the Fontsource packages the playground installs (hoisted to the root by the workspace).
  await cp(join(root, "site", FONTS_STYLES), join(out, FONTS_STYLES))
  await mkdir(join(out, FONTS_PATH), { recursive: true })
  for (const { package: pkg, file } of fontFiles()) {
    const source = join(root, "node_modules/@fontsource", pkg, "files", file)
    await cp(source, join(out, FONTS_PATH, file)).catch(() => {
      throw new Error(`${source} is missing, and ${FONTS_STYLES} serves it at /${FONTS_PATH}/${file}; run bun install`)
    })
  }
  const docsTemplate = await readFile(join(root, "site", DOCS_TEMPLATE), "utf8")
  for (const page of docPages(docs, values, docsTemplate, previews, sources)) {
    await mkdir(join(out, dirname(page.path)), { recursive: true })
    await writeFile(join(out, page.path), page.html)
  }
  await writeFile(join(out, SEARCH_INDEX), JSON.stringify(searchIndex(docs)))
  const pages = previewPages(registry, themeSource, previews, values, await readFile(join(root, "site", PREVIEW_TEMPLATE), "utf8"), docSlugs)
  if (previews.embed) {
    await cp(join(previews.embed.dir, "assets"), join(out, PREVIEW_PATH, "assets"), { recursive: true })
    await cp(join(previews.embed.dir, POPOUT), join(out, POPOUT))
    for (const page of pages) {
      await mkdir(join(out, dirname(page.path)), { recursive: true })
      await writeFile(join(out, page.path), page.html)
    }
  }
  const previewNote = previews.embed ? `${pages.length} previews` : "no previews (no embed build)"
  console.log(`site: ${registry.items.length} items, ${docs.length} docs pages, ${previewNote}, ${SEARCH_INDEX} at v${version} -> ${out}`)
}

if (import.meta.main) await main()
