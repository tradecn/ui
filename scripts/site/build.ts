#!/usr/bin/env bun
// Render tradecn.dev: the opening page, the site's own docs pages (site/docs/*.md), one page per docs/*.md,
// and one embedded preview per item.
//   bun scripts/site/build.ts [--registry registry.json] [--version version.txt] [--docs docs] [--changelog CHANGELOG.md]
//                             [--theme registry.json] [--demos playground/src/demos] [--embed playground/dist/embed] [--out site/dist]
//                             [--base /v1.2.0] [--versions v1.2.0,v1.1.0]
// The pages say what a release ships, so the release job points --registry, --version, --docs, --changelog, --demos,
// and --embed at the tag's checkout while the templates in site/, the site's own pages, this script, and the palette
// come from main. The palette is main's because a tag from before the theme existed has none to give. A tag from
// before the previews existed has no embed build, and its pages go out without them.
// Every release keeps its pages: the root is the latest release's tree, and each release has its own under /vX.Y.Z/,
// built from the same inputs with --base, which moves every path the pages write under it. --versions names every
// release with a tree, for the header's menu and the root's versions.json.
// The pages have a light and a dark mode, both sides of the amber theme: warm paper by day, near-black by night, set
// in the two faces its typography tokens name. site/theme.js puts the mode on <html>, from the reader's choice or the system,
// and the theme beside it: the header's menu offers every theme in the registry, and a page carries each one's palette.
// Code blocks are colored by shiki (highlight.ts) in GitHub's light and dark themes, shadcn's pair, each token's color a
// light-dark() of the two so it follows the mode the way the palette does.
import { cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { parseArgs } from "node:util"
import { Marked } from "marked"
import { isColorValue } from "../lib/registry"
import { highlightLines } from "./highlight"

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
  /** The exports the item names, its primary component first; `headingOf` is held to one of them. */
  meta?: { components?: { title: string; description?: string }[] }
}
export type Registry = { name: string; items: RegistryItem[] }

const ENTITIES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ENTITIES[c] ?? c)
}

const CHARACTERS: Record<string, string> = Object.fromEntries(Object.entries(ENTITIES).map(([character, entity]) => [entity, character]))

/** `escapeHtml` undone: a code block's text as it was written, read back from the page it was escaped into. marked writes the same five entities. */
export function unescapeHtml(text: string): string {
  return text.replace(/&(?:amp|lt|gt|quot|#39);/g, (entity) => CHARACTERS[entity] ?? entity)
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

/** `use-hotkeys` as `useHotkeys`: the name a hook is exported under. */
const camelCase = (name: string) => name.replace(/-(\w)/g, (_, letter: string) => letter.toUpperCase())

/** `data-grid` as `DataGrid`: the name a component is exported under. */
const pascalCase = (name: string) => camelCase(name).replace(/^\w/, (letter) => letter.toUpperCase())

/**
 * What an item's page is headed by: the name its implementation goes by in the consumer's code. A component or a
 * block is its export (`DataGrid`, `RfqTicket`), a hook is its (`useHotkeys`), and a utility or a theme is the
 * name `shadcn add` takes (`row-store`, `tradecn-amber`), since a module and a set of variables have no identifier
 * of their own. The doc's own `#` line says it; `build.test.ts` holds every item doc to this.
 */
export const headingOf = (item: RegistryItem): string => {
  switch (item.type) {
    case "registry:ui":
    case "registry:block":
      return pascalCase(item.name)
    case "registry:hook":
      return camelCase(item.name)
    default:
      return item.name
  }
}

/**
 * An item's name as the sidebar, the pager, and the search print it: its registry title (`Data Grid`), a hook by
 * the name it is exported under (`useHotkeys`), or its name for an item without a title.
 */
export const titleOf = (item: RegistryItem) => (item.type === "registry:hook" ? camelCase(item.name) : item.title ?? item.name)

/** Alphabetical by title, the order a group of items is listed in. */
const byTitle = (a: RegistryItem, b: RegistryItem) => titleOf(a).localeCompare(titleOf(b), "en")

/** The items the Components page indexes: the `ui` items and the blocks, alphabetical by title. */
export const componentItems = (registry: Registry) => registry.items.filter((item) => groupOf(item) === "Components").sort(byTitle)

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

/**
 * GitHub's mark, the Invertocat, as Primer Octicons draws it at 16 px (`mark-github`, Copyright GitHub Inc.). It is
 * not hand-drawn like the other icons here because it is GitHub's logo: their guidelines allow a permitted logo,
 * unmodified, as a link to a project on GitHub, and forbid redrawing it. The path is theirs, byte for byte.
 */
const GITHUB_ICON = `<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M6.766 11.328c-2.063-.25-3.516-1.734-3.516-3.656 0-.781.281-1.625.75-2.188-.203-.515-.172-1.609.063-2.062.625-.078 1.468.25 1.968.703.594-.187 1.219-.281 1.985-.281.765 0 1.39.094 1.953.265.484-.437 1.344-.765 1.969-.687.218.422.25 1.515.046 2.047.5.593.766 1.39.766 2.203 0 1.922-1.453 3.375-3.547 3.64.531.344.89 1.094.89 1.954v1.625c0 .468.391.734.86.547C13.781 14.359 16 11.53 16 8.03 16 3.61 12.406 0 7.984 0 3.563 0 0 3.61 0 8.031a7.88 7.88 0 0 0 5.172 7.422c.422.156.828-.125.828-.547v-1.25c-.219.094-.5.156-.75.156-1.031 0-1.64-.562-2.078-1.609-.172-.422-.36-.672-.719-.719-.187-.015-.25-.093-.25-.187 0-.188.313-.328.625-.328.453 0 .844.281 1.25.86.313.452.64.655 1.031.655s.641-.14 1-.5c.266-.265.47-.5.657-.656"/></svg>`

/** The link to the repository, in the header: the mark alone, named for a screen reader, as shadcn's site has it. */
export const GITHUB_LINK = `<a class="github" href="${REPO_URL}" aria-label="GitHub">${GITHUB_ICON}</a>`

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

/** A release tag as the site names one: `v` and three numbers. */
const RELEASE_TAG = /^v\d+\.\d+\.\d+$/

/** Newest first, by the numbers: `v1.2.0` before `v1.1.0` before `v0.9.9`. */
export function compareTags(a: string, b: string): number {
  const x = a.slice(1).split(".").map(Number)
  const y = b.slice(1).split(".").map(Number)
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return (y[i] ?? 0) - (x[i] ?? 0)
  return 0
}

/**
 * The releases the header's menu lists, newest first, with `tag` among them whatever the list said: every release
 * with pages, as the release job reads them off the bucket, or this tag alone for a local build.
 */
export function versionList(tag: string, versions: readonly string[] = []): string[] {
  for (const version of [tag, ...versions]) if (!RELEASE_TAG.test(version)) throw new Error(`"${version}" is not a release tag`)
  return [...new Set([tag, ...versions])].sort(compareTags)
}

/** The file at the root that names every release with pages, newest first; site.js fills the menu from it on every tree. */
export const VERSIONS_INDEX = "versions.json"
export const versionsIndex = (versions: readonly string[]) => JSON.stringify({ latest: versions[0], versions })

/**
 * The version menu, first among the header's links: a native select of every release with pages, newest first,
 * this page's release selected. site.js refreshes the list from /versions.json at the root, so a page on an older
 * tree offers the releases that came after it, and a pick goes to the same page under the chosen release. Without
 * a script it is the tag alone: the one option showing, which is what the header used to print.
 */
export function versionPicker(tag: string, versions: readonly string[] = [tag]): string {
  const options = versions.map((version) => `<option value="${escapeHtml(version)}"${version === tag ? " selected" : ""}>${escapeHtml(version)}</option>`).join("")
  return `<span class="version-pick"><select class="version-select" aria-label="Version">${options}</select>${CHEVRON_ICON}</span>`
}

/**
 * Where a tree is served from: `/v1.2.0` for a release's own tree, empty for the root. One segment, no trailing
 * slash, so `${base}/docs/` is a path either way.
 */
export function siteBase(base = ""): string {
  if (base && !/^\/[A-Za-z0-9][\w.-]*$/.test(base)) throw new Error(`--base ${base} is not one path segment like /v1.2.0`)
  return base
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

/** The id of the panel the header's Menu button opens: the sidebar on a docs page, a panel of its own on the opening page. */
export const MENU_ID = "site-menu"

const MENU_ICON = `<svg class="menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h16M4 16h16"/></svg>`
const CLOSE_ICON = `<svg class="close-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>`

/**
 * The Menu button, first in the header. On a phone it stands in for the name and the sections and opens the panel
 * `MENU_ID` names: the two lines become a cross while it is open, and site.js keeps `aria-expanded` true. At a
 * laptop's width, and without a script, the stylesheet hides it and the sidebar is in the page.
 */
export const MENU_TOGGLE = `<button type="button" class="menu-toggle" aria-expanded="false" aria-controls="${MENU_ID}">${MENU_ICON}${CLOSE_ICON}<span>Menu</span></button>`

/** The three sections and the registry file, as the header and the menu both list them; `current` marks the section a page is in, `page` that it is the section's own page. */
function sectionLinks(current: Section | null, page: boolean): string[] {
  const link = (section: Section, href: string, text: string) =>
    `<a href="${href}"${section === current ? ` aria-current="${page ? "page" : "true"}"` : ""}>${text}</a>`
  return [link("docs", "/docs/", "Docs"), link("components", "/docs/components/", "Components"), link("changelog", "/docs/changelog/", "Changelog"), `<a href="/r/registry.json">registry.json</a>`]
}

/**
 * The header on every page: the Menu button, the mark, the three sections with the registry file after them, then
 * the version menu, the search, the GitHub mark, the theme menu, and the mode button. `versions` is `versionPicker()`
 * of the releases the page knows and `themes` is `themePicker()` of the themes it carries; `current` marks the
 * section a page is in, `page` that it is the section's own page.
 */
export function siteHeader(versions: string, current: Section | null = null, page = false, themes = ""): string {
  return [
    `<header class="site-header">`,
    `<div class="wrap">`,
    MENU_TOGGLE,
    `<a class="name" href="/">${MARK}<span>tradecn<span class="slash">/</span>ui</span></a>`,
    `<nav aria-label="Sections">${sectionLinks(current, page).join("")}</nav>`,
    `<nav class="side" aria-label="Links">${versions}${SEARCH_BUTTON}${GITHUB_LINK}${themes}${MODE_BUTTON}</nav>`,
    `</div>`,
    `</header>`,
  ].join("\n")
}

/**
 * What the Menu button's panel holds besides the docs groups, on a phone: the version and theme menus, which leave
 * the header there, then Home and the header's sections. On a docs page it opens the sidebar, ahead of the groups;
 * on the opening page it is the whole panel. At a laptop's width the stylesheet hides it, since the header shows all of it.
 */
export function siteMenu(versions: string, themes: string, current: Section | null = null, page = false): string {
  return [
    `<div class="menu-only">`,
    `<div class="menu-settings">${versions}${themes}</div>`,
    `<nav class="menu-sections" aria-label="Menu">`,
    `<h2>Menu</h2>`,
    `<ul>`,
    `<li><a href="/">Home</a></li>`,
    ...sectionLinks(current, page).map((link) => `<li>${link}</li>`),
    `</ul>`,
    `</nav>`,
    `</div>`,
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

/** Which tree a build is and what it knows of the others. */
export type SiteOptions = {
  /** Every release with pages; this build's tag is added when missing. The header's menu lists them and the root's versions.json names them. */
  versions?: readonly string[]
  /** Where this tree is served from, `/v1.2.0` for a release's own tree, empty for the root. Every site path the pages write moves under it. */
  base?: string
}

/** Every value the landing templates may use. Items and version come from `registry`, the palette from `themeSource`, the showcase from `previews`. */
export function templateValues(
  registry: Registry,
  version: string,
  themeSource: Registry = registry,
  docSlugs: ReadonlySet<string> = new Set(),
  previews: Previews = NO_PREVIEWS,
  options: SiteOptions = {},
): Record<string, string> {
  const tag = `v${version}`
  const base = siteBase(options.base)
  const versions = versionPicker(tag, versionList(tag, options.versions))
  const themes = siteThemes(themeSource)
  const theme = themes[0]!
  const palette = pagePalette(theme)
  const { fontSans, fontMono } = pageFonts(theme)
  const picker = themePicker(themes)
  return {
    version,
    tag,
    base,
    palette,
    themePalettes: themePalettes(themes),
    themesMeta: themesMeta(themes),
    versionPicker: versions,
    themePicker: picker,
    fontSans,
    fontMono,
    header: siteHeader(versions, null, false, picker),
    menu: siteMenu(versions, picker),
    search: searchDialog(),
    showcase: showcase(registry, tag, docSlugs, previews),
    itemCount: String(registry.items.length),
    siteUrl: SITE_URL,
    repoUrl: REPO_URL,
  }
}

/**
 * Fill `{{key}}` placeholders. A key the builder does not set is an error, not an empty string. On a release's own
 * tree (`values.base`), every path the page writes from the site's root then moves under the base: a link, a frame,
 * a script, a stylesheet, the favicon. The registry stays where it is, since `/r/` is one place and not a page.
 */
export function render(template: string, values: Record<string, string>): string {
  const filled = template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = values[key]
    if (value === undefined) throw new Error(`template uses {{${key}}}, which the builder does not set`)
    return value
  })
  return values.base ? rebase(filled, values.base) : filled
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/**
 * Every `href` and `src` from the site's root moved under `base`, the registry's excepted, and one already under
 * the base left alone: a site page's placeholders are filled before marked runs and the finished page is rendered
 * again, so the pass has to be safe to repeat. Code is escaped, so a path inside a sample is never touched.
 */
export function rebase(html: string, base: string): string {
  const under = new RegExp(`(\\s(?:href|src)=")/(?!/|r/|${escapeRegExp(base.slice(1))}(?:/|"))`, "g")
  return html.replace(under, `$1${base}/`)
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
// A Manual block's language, where a command's prompt stands: a square with the letters cut out of it, TS for a
// .ts or .tsx file and CSS for the stylesheet. The narrow S is drawn relative to its start, so CSS draws it twice.
const mark = (d: string, cls: string) => `<svg class="${cls}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="${d}"/></svg>`
const SQUARE = "M2 0h20a2 2 0 0 1 2 2v20a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2z"
const NARROW_S = "v2h-3v2h1a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-3v-2h3v-2h-1a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2z"
const TS_ICON = mark(`${SQUARE}M3 11h8v2H8v8H6v-8H3zM21 11v2h-6v2h4a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-6v-2h6v-2h-4a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2z`, "ts-icon")
const CSS_ICON = mark(`${SQUARE}M8 11v2H5v6h3v2H5a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2zM14.5 11${NARROW_S}M21 11${NARROW_S}`, "css-icon")
const LEFT_ICON = icon('<path d="M15 6l-6 6 6 6"/>', "left-icon")
const RIGHT_ICON = icon('<path d="M9 6l6 6-6 6"/>', "right-icon")

/**
 * A block's text in its colors: each token the themes color in a span whose `color` is a `light-dark()` of the
 * light theme's and the dark theme's, so it follows the mode the way the palette does, on the lines shiki splits
 * the source into. Text the themes leave in their foreground gets no span and wears the block's own color. The
 * text stays the block's, escaped the same, so a copy or a search reads what was written. `undefined` for a block
 * with no language or one the site does not highlight, which stays as it was.
 */
export function highlighted(escaped: string, language: string | undefined): string | undefined {
  const lines = language ? highlightLines(unescapeHtml(escaped), language) : undefined
  return lines?.map((line) => `<span class="line">${line.map((token) => (token.style ? `<span style="${token.style}">${escapeHtml(token.text)}</span>` : escapeHtml(token.text))).join("")}</span>`).join("\n")
}

/**
 * Every code block on a page gets its colors and a copy button, and a block with a line that starts with `npx`
 * or `npm install` becomes an install block, if it is bash or has no language (a source in another language, or a
 * Manual block, whose pre carries the id its Expand controls, is never one): the same command under pnpm, npm,
 * yarn, and bun, one of them showing. Which one is the page's `data-pm`, which site.js sets from the reader's last
 * choice before the body parses, and the tabs follow it. A Manual block's copy button stands in its header, so it
 * comes before the code, where the Tab key meets it after Expand. The last pass over a page, on its HTML, because
 * the blocks come from four places: the templates, marked, the preview card, and the Installation section.
 */
export function codeBlocks(html: string): string {
  let blocks = 0
  return html.replace(/<pre( [^>]*)?><code( class="language-([\w-]+)")?>([\s\S]*?)<\/code><\/pre>/g, (_block: string, pre: string | undefined, attributes: string | undefined, language: string | undefined, code: string) => {
    const colored = (text: string) => highlighted(text, language) ?? text
    // A block with attributes is a Manual block, whose pre keeps the id its Expand controls, and a block in a language
    // other than bash is a source: neither becomes a command, whatever its lines start with.
    if (pre) return `<div class="code">${COPY_BUTTON}<pre${pre}><code${attributes ?? ""}>${colored(code)}</code></pre></div>`
    if ((language && language !== "bash") || !COMMAND_LINE.test(code)) return `<div class="code"><pre><code${attributes ?? ""}>${colored(code)}</code></pre>${COPY_BUTTON}</div>`
    const id = `pm-${++blocks}`
    const tabs = PACKAGE_MANAGERS.map(
      ({ name }) =>
        `<button type="button" role="tab" id="${id}-${name}" aria-controls="${id}-${name}-code" aria-selected="${name === DEFAULT_MANAGER}" data-pm="${name}">${name}</button>`,
    ).join("")
    const panels = PACKAGE_MANAGERS.map(
      (manager) =>
        `<pre id="${id}-${manager.name}-code" role="tabpanel" aria-labelledby="${id}-${manager.name}" data-pm="${manager.name}"><code${attributes ?? ""}>${colored(commandFor(code, manager))}</code></pre>`,
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

/** A page: the template filled, then every code block given its colors and its copy button and, for a command, its package-manager tabs, and every table its scroll wrapper. */
export function renderPage(template: string, values: Record<string, string>): string {
  return tables(codeBlocks(render(template, values)))
}

export const NOT_FOUND_PAGE = "404.html"
export const PAGES = ["index.html", NOT_FOUND_PAGE] as const
export const FAVICON = "favicon.svg"
/** The pages' script, a file so the site's Content-Security-Policy keeps script-src to 'self'. */
export const SITE_SCRIPT = "site.js"
/** The mode script, on every page and every preview: light or dark onto <html>, before anything paints. */
export const MODE_SCRIPT = "theme.js"
/** The pages' one stylesheet; each page adds only its palette inline. */
export const SITE_STYLES = "site.css"
/** The search index: every page's title, headings, and text, which site.js fetches the first time the search opens. */
export const SEARCH_INDEX = "search.json"
/**
 * The two files a crawler reads first, at the root alone. robots.txt keeps every path open and names the sitemap;
 * the sitemap lists every page there is to index, the opening page and the docs pages, each at the address it
 * names as its canonical. The previews and the 404 page carry noindex and are not listed; a release's own tree
 * canonicalizes to the root's pages and writes neither file. Nothing is disallowed: a crawler has to fetch a
 * preview to render the page that frames it, and to read the noindex on it.
 */
export const ROBOTS_FILE = "robots.txt"
export const SITEMAP_FILE = "sitemap.xml"
export const robotsTxt = () => `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/${SITEMAP_FILE}\n`
export function sitemap(docs: readonly Doc[]): string {
  const urls = ["/", ...docs.map((doc) => doc.path)].map((path) => `  <url><loc>${escapeHtml(`${SITE_URL}${path}`)}</loc></url>`)
  return ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">', ...urls, "</urlset>", ""].join("\n")
}
/** The headers every response carries; the stack and the smoke both read this file. */
export const HEADERS_FILE = "headers.json"
export const DOCS_TEMPLATE = "docs.html"
export const PREVIEW_TEMPLATE = "preview.html"
/** The site's own docs pages, site/docs/<slug>.md, in the order the nav and the pager walk them. `index` is /docs/ itself. */
export const SITE_DOCS = "docs"
export const START_PAGES = ["index", "installation", "components", "theming", "changelog"] as const
/** Where the embedded previews live on the site: /preview/<item>/ and the bundle under /preview/assets/. */
export const PREVIEW_PATH = "preview"
/**
 * The demo the opening page frames: one workspace with every item on it, `playground/src/demos/terminal.tsx`.
 * It is no item's and no docs page's, so `previewPages` writes its page by this name and the previews test
 * allows the one demo that is neither.
 */
export const DESK_DEMO = "terminal"
/** dockview opens this on the site's origin for a popped-out workspace panel; the playground's copy is published at the root. */
export const POPOUT = "popout.html"

export type RenderedDoc = { title: string; description: string; html: string }
/**
 * A docs page. `path` is its URL, `label` what the nav, the pager, and the search call it (an item's registry
 * title, another page's own), `source` the markdown file's name, and `file` the repo path the foot names, when
 * the page is a file of the tag's and not the site's own.
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
      return { ...rendered, slug, path: `/docs/${slug}/`, label: item ? titleOf(item) : rendered.title, source, file: `docs/${source}`, item }
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

/**
 * Every item by the title the sidebar lists it under, linking its page, in the order given: a plain list the
 * stylesheet lays out in columns, shadcn's Components page. The Components index (the components only, by title),
 * and the opening page when the tag has no previews (every item).
 */
export function itemList(items: RegistryItem[], tag: string, docSlugs: ReadonlySet<string>): string {
  const links = items.map((item) => `<li><a href="${docHref(item, tag, docSlugs)}">${escapeHtml(titleOf(item))}</a></li>`)
  return `<ul class="item-list">\n${links.join("\n")}\n</ul>`
}

/** The file named for an item is its own; the rest of its `files[]` are the ones it rides. */
const ownFileOf = (item: RegistryItem) => item.files?.find((file) => file.path.replace(/\.tsx?$/, "").endsWith(`/${item.name}`))

/**
 * Every item the desk runs: the ones whose own file the demo's source imports, and the ones whose own file rides
 * in an imported item's `files[]`, since a watchlist on screen is a data grid, a row store, and the format
 * library running too. Registry order. A theme has no file, so none is ever on it; the header's menu is where
 * the themes live.
 */
export function deskItems(source: string, registry: Registry): RegistryItem[] {
  const strip = (path: string) => path.replace(/\.tsx?$/, "")
  const owners = new Map<string, RegistryItem>()
  for (const item of registry.items) {
    const own = ownFileOf(item)
    if (own) owners.set(strip(own.path), item)
  }
  const imported = new Set([...source.matchAll(/"@\/registry\/tradecn\/((?:ui|hooks|lib)\/[\w-]+|blocks\/[\w-]+\/[\w-]+)"/g)].map((match) => `registry/tradecn/${match[1]}`))
  const on = new Set<RegistryItem>()
  for (const [path, item] of owners) if (imported.has(path)) on.add(item)
  for (const item of [...on]) {
    for (const file of item.files ?? []) {
      const owner = owners.get(strip(file.path))
      if (owner) on.add(owner)
    }
  }
  return registry.items.filter((item) => on.has(item))
}

/**
 * The opening page below the fold when the tag's demos hold the desk: one workspace with every item on it, in a
 * card that names it, links its source at the tag, and opens it on its own, and under it every item it runs,
 * grouped as the sidebar groups them and linking each page, so the map from what is on screen to the docs is
 * on the page. The iframe is sized by the height its page reports, like the preview on a docs page.
 */
export function desk(registry: Registry, tag: string, docSlugs: ReadonlySet<string>, demo: Demo): string {
  const items = deskItems(demo.source, registry)
  const legend = GROUPS.filter((group) => group !== "Get Started" && group !== "Themes")
    .map((group) => {
      const members = items.filter((item) => groupOf(item) === group).sort(byTitle)
      return members.length ? `<p><span class="legend-group">${group}</span> ${members.map((item) => `<a href="${docHref(item, tag, docSlugs)}"><code>${escapeHtml(item.name)}</code></a>`).join(" ")}</p>` : ""
    })
    .filter(Boolean)
  const name = escapeHtml(demo.name)
  return [
    `<section class="showcase desk" aria-label="Every item, one desk">`,
    `<article class="card" data-preview="${name}">`,
    `<div class="card-bar"><span class="desk-name">The desk</span><span class="kind">every item, one workspace</span><a class="open" href="${REPO_URL}/blob/${tag}/playground/src/demos/${name}.tsx">Source</a><a class="open" href="/${PREVIEW_PATH}/${name}/" target="_blank" rel="noopener">Open in a new tab</a></div>`,
    `<iframe src="/${PREVIEW_PATH}/${name}/" title="The desk, live" data-preview="${name}"></iframe>`,
    `<div class="desk-legend" aria-label="On this desk">\n${legend.join("\n")}\n</div>`,
    `</article>`,
    `</section>`,
  ].join("\n")
}

/**
 * The opening page below the fold: the desk when the tag's demos hold it; before that, every item that has a
 * demo, running, in the order the registry lists them, each in a card that names it and links its page. The
 * iframes are sized by the height their pages report, like the preview on a docs page. A tag with no embed
 * build gets the names without the frames.
 */
export function showcase(registry: Registry, tag: string, docSlugs: ReadonlySet<string>, previews: Previews): string {
  if (!previews.embed) return itemList(registry.items, tag, docSlugs)
  const deskDemo = previews.demos.get(DESK_DEMO)
  if (deskDemo) return desk(registry, tag, docSlugs, deskDemo)
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

/** Alphabetical by the name the sidebar shows, so `RFQ Stack` sits before `Rules Editor` and a hook sorts as `useHotkeys`. */
const byLabel = (a: Doc, b: Doc) => a.label.localeCompare(b.label, "en")

/**
 * The pages in the order the nav and the pager walk them: the site's own, the tag's other docs (the contract),
 * then the items group by group (components, hooks, utilities, themes), each group alphabetical by title. Get
 * Started keeps its own order, since it is read front to back.
 */
export function siteDocs(site: Doc[], tagDocs: Doc[]): Doc[] {
  return [...site, ...tagDocs.filter((doc) => !doc.item), ...GROUPS.flatMap((group) => tagDocs.filter((doc) => doc.item && groupOf(doc.item) === group).sort(byLabel))]
}

// The previews. A demo is playground/src/demos/<item>.tsx, and a variant of an item is a demo of its own,
// playground/src/demos/<item>-<variant>.tsx, placed where the item's doc says `<!-- demo: <item>-<variant> -->`;
// the embed build is that app's dist/embed, a Vite manifest over one entry with a chunk per demo. The pages
// need both, or neither.

export type Demo = { name: string; source: string; code: string }
/** The embed build: the entry's script and stylesheets as site paths, and the directory to copy. */
export type Embed = { dir: string; script: string; styles: string[] }
/**
 * The frame contract a tag's demos were written to, from `frame.json` beside them. `centered`: the frame centers
 * a demo on both axes, a demo that wants the frame's width says `w-full` on its root, and its controls sit first in
 * a `data-demo-controls` element the frame pins in a bar. A tag without the file predates that, and its demos are
 * stretched as the card did then. The template is main's on every republish, so the contract travels with the
 * tag's assets and not with the template.
 */
export type Frame = "centered" | "stretch"
export const FRAME_FILE = "frame.json"
export type Previews = { demos: Map<string, Demo>; embed: Embed | null; frame?: Frame }
const NO_PREVIEWS: Previews = { demos: new Map(), embed: null }

/** The frame contract the demos in `dir` were written to: what `frame.json` names, or `stretch` for a tag without one. */
export async function readFrame(dir: string): Promise<Frame> {
  let text: string
  try {
    text = await readFile(join(dir, FRAME_FILE), "utf8")
  } catch {
    return "stretch"
  }
  const frame = (JSON.parse(text) as { frame?: unknown }).frame
  if (frame !== "centered" && frame !== "stretch") throw new Error(`${join(dir, FRAME_FILE)} names a frame contract "${String(frame)}"; it is "centered" or "stretch"`)
  return frame
}

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

/**
 * The card on an item's page, for the item's own demo at the top or a variant's where the doc places it: the demo
 * running in a frame with room around it (the embed page centers it and keeps the frame at least the card's height),
 * and its source under the frame, the first lines showing under a fade until View Code opens the rest, which scrolls
 * inside the card, shadcn's shape. The iframe is sized by the message the embed posts; `site.js` wires the button and
 * keeps the collapsed source inert. A theme's own card shows its stylesheet, not a demo's source.
 */
export function previewBlock(doc: Doc, demo: Demo): string {
  const name = demo.name
  const theme = doc.item?.type === "registry:theme" && demo.name === doc.slug
  const code = theme && doc.item ? [themeCss(doc.item), doc.item.css ? registryCss(doc.item.css) : ""].filter(Boolean).join("\n\n") : demo.code
  const language = theme ? "css" : "tsx"
  // Ids carry the demo's name, so a page holds a card per variant beside the item's own.
  const id = `preview-${escapeHtml(name)}`
  return [
    `<div class="preview" data-preview="${escapeHtml(name)}">`,
    `<div class="preview-live">`,
    `<iframe src="/${PREVIEW_PATH}/${escapeHtml(name)}/" title="${escapeHtml(name)}, live" loading="lazy" data-preview="${escapeHtml(name)}"></iframe>`,
    `</div>`,
    `<div class="preview-code" data-collapsed>`,
    `<div class="preview-code-body" id="${id}-source" tabindex="-1">`,
    `<pre><code class="language-${language}">${escapeHtml(code)}</code></pre>`,
    `</div>`,
    `<button type="button" class="view-code" aria-expanded="false" aria-controls="${id}-source">View Code</button>`,
    `</div>`,
    `</div>`,
  ].join("\n")
}

/** The preview and the Installation go after the first paragraph: the title, the summary, then the item itself and how to get it. */
export function withPreview(html: string, block: string): string {
  const h1 = html.indexOf("</h1>")
  const p = html.indexOf("</p>\n", h1 < 0 ? 0 : h1)
  const at = p < 0 ? (h1 < 0 ? 0 : h1 + "</h1>\n".length) : p + "</p>\n".length
  return `${html.slice(0, at)}${block}\n${html.slice(at)}`
}

// A variant. shadcn's pages give each major variant a heading, a sentence, and a block of its own to copy from,
// and so do ours: the doc heads a section `## <Variant>` between Usage and API Reference, says what the variant is,
// and ends the section with the line `<!-- demo: <item>-<variant> -->`. That demo is a file of its own in
// playground/src/demos, so it is small enough to paste whole. On GitHub the line is invisible and the section is its
// text; here it is the same card the item's own demo gets at the top.

/** The line a doc places a variant's demo with, as marked leaves it: its own block, so it is never inside a paragraph. */
const DEMO_LINE = /<!--\s*demo:\s*([\w-]+)\s*-->\n?/g

/** The demos a doc places by name, in page order, besides the one named for the doc itself. */
export function framedIn(html: string): string[] {
  return [...html.matchAll(DEMO_LINE)].map((match) => match[1] ?? "")
}

/** Every demo the docs frame: each page's own, named for it, and every variant a page places. What `previewPages` writes a page for. */
export function framedDemos(docs: Doc[]): Set<string> {
  return new Set(docs.flatMap((doc) => [doc.slug, ...framedIn(doc.html)]))
}

/**
 * The doc's HTML with each `<!-- demo: x -->` replaced by the card for that demo. Without an embed build the line
 * is dropped, as the card at the top is left out; with one, a doc that names a demo the playground lacks is an error.
 */
export function withDemos(doc: Doc, previews: Previews): string {
  return doc.html.replace(DEMO_LINE, (_line, name: string) => {
    if (!previews.embed) return ""
    const demo = previews.demos.get(name)
    if (!demo) throw new Error(`docs/${doc.source} frames a demo named ${name}, and playground/src/demos/${name}.tsx does not exist`)
    return `${previewBlock(doc, demo)}\n`
  })
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
 * the reader's package manager. Manual is the same install by hand, in numbered steps: the packages, the shadcn
 * built-ins the item composes, every file at the path it lands on with a consumer's imports, and the CSS the command
 * appends, each file and each stylesheet block headed by its language and collapsed to its first lines until Expand
 * opens the whole.
 */
export function installationSection(item: RegistryItem, tag: string, sources: Sources): string {
  const bash = (code: string) => `<pre><code class="language-bash">${escapeHtml(code)}</code></pre>`
  // A block to copy from, a file or the stylesheet, shadcn's shape: a header with the block's language mark and a
  // file's path, which Expand and the copy button share, over the code collapsed to its first lines under a fade until
  // Expand opens the whole of it, however long. site.js wires the buttons (the second is the fade, for the mouse),
  // keeps the collapsed code inert, and takes the buttons off a block that already shows whole. The path names the
  // figure; the stylesheet's has only its mark, since the step names it. A path too long for a phone's line breaks
  // after a slash: each part holds together, so a hyphen inside a name is never where it breaks. Expand comes before
  // the code, and `codeBlocks` puts the copy button between them, so the Tab key meets the header's two buttons in the
  // order they stand and then the code.
  let blocks = 0
  const pathCode = (path: string) => `<code>${path.split(/(?<=\/)/).map((part) => `<span>${escapeHtml(part)}</span>`).join("<wbr>")}</code>`
  const expandable = (language: "ts" | "tsx" | "css", code: string, path?: string) => {
    const id = `installation-manual-${++blocks}`
    return [
      `<figure class="source" data-collapsed>`,
      `<figcaption>${language === "css" ? CSS_ICON : TS_ICON}${path ? pathCode(path) : ""}</figcaption>`,
      `<button type="button" class="expand" aria-expanded="false" aria-controls="${id}">Expand</button>`,
      `<pre id="${id}"><code class="language-${language}">${escapeHtml(code)}</code></pre>`,
      `<button type="button" class="expand-foot" tabindex="-1" aria-hidden="true">Expand</button>`,
      `</figure>`,
    ].join("\n")
  }
  // Each step is what to do and the blocks to do it with; the stylesheet numbers them.
  const steps: string[][] = []
  const packages = (item.dependencies ?? []).map(packageName)
  if (packages.length) steps.push([`<p>Install the dependencies:</p>`, bash(`npm install ${packages.join(" ")}`)])
  const builtins = item.registryDependencies ?? []
  if (builtins.length) steps.push([`<p>Add the shadcn components it composes:</p>`, bash(`npx shadcn@latest add ${builtins.join(" ")}`)])
  const files = item.files ?? []
  if (files.length) {
    const step = [`<p>Copy the files into your project:</p>`]
    for (const file of files) {
      const source = sources.get(file.path)
      if (source === undefined) throw new Error(`${item.name} installs ${file.path}, which the checkout does not have`)
      step.push(expandable(file.path.endsWith(".tsx") ? "tsx" : "ts", source, consumerPath(file)))
    }
    steps.push(step)
  }
  if (item.cssVars) {
    const theme = item.type === "registry:theme"
    steps.push([`<p>${theme ? "Replace the variables in your stylesheet with these:" : "Add the tokens to your stylesheet:"}</p>`, expandable("css", themeCss(item))])
  }
  if (item.css) steps.push([`<p>Append this to your stylesheet:</p>`, expandable("css", registryCss(item.css))])
  // Safari's VoiceOver stops calling a list a list once the stylesheet takes its markers away; the role keeps it one.
  const manual = [`<ol class="steps" role="list">`, ...steps.map((step) => ["<li>", ...step, "</li>"].join("\n")), `</ol>`]
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
/**
 * A page in the search index: where it is, the item's name for an item page (`data-grid`, what `shadcn add` takes),
 * its title (the doc's own heading, `DataGrid`), the name the sidebar shows (`Data Grid`), which sidebar group it is
 * in, its opening text, and every h2 and h3 with the text under it. A query answers to all three names. `demos`
 * names the variant demos the page frames, when it frames any: what tells a preview's page from its name alone.
 */
export type SearchPage = { path: string; name?: string; title: string; label: string; group: Group; text: string; sections: SearchSection[]; demos?: string[] }

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
    const demos = framedIn(doc.html)
    return { path: doc.path, name: doc.item?.name, title: doc.title, label: doc.label, group: groupOf(doc.item), text: textOf(intro), sections, demos: demos.length ? demos : undefined }
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
 * The sidebar: the site's own pages and the contract under Get Started, in reading order, then the items by
 * title under their own kinds: Components, Hooks, Utilities, Themes, each only when the tag has one. The
 * Components heading links the Components index and the Themes heading the list on the Theming page; the other
 * two are just headings.
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
 * title, opening paragraph, the preview, Installation, then the doc's own Usage and API Reference, the shadcn
 * components it is built on, and the pager. Every page gets the arrows beside its title and its own headings
 * down the right.
 */
export function docPages(docs: Doc[], values: Record<string, string>, template: string, previews: Previews = NO_PREVIEWS, sources: Sources = new Map()): Array<{ path: string; html: string }> {
  const { tag = "", repoUrl, versionPicker: versions = "", themePicker: picker = "" } = values
  return docs.map((doc, index) => {
    const demo = previews.embed ? previews.demos.get(doc.slug) : undefined
    const foot = doc.file ? `<p class="foot">This page is <code>${escapeHtml(doc.file)}</code> at <a href="${repoUrl}/blob/${tag}/${escapeHtml(doc.file)}">${tag}</a>.</p>` : ""
    if (doc.item && doc.html.includes('id="installation"')) throw new Error(`docs/${doc.source} has its own Installation heading, and the builder adds one`)
    const lead = [demo ? previewBlock(doc, demo) : "", doc.item ? installationSection(doc.item, tag, sources) : ""].filter(Boolean).join("\n")
    // The variants' cards stand where the doc placed them, each in its own section.
    const html = withDemos(doc, previews)
    const body = [lead ? withPreview(html, lead) : html, doc.item ? builtOn(doc.item) : ""].filter(Boolean).join("\n")
    const content = [arrows(docs, index), body, pager(docs, index)].join("\n")
    const section = sectionOf(doc)
    // The section's own page: the index, the Components page, the changelog. An item's page is in its section, not the section itself.
    const own = !doc.item && (section !== "docs" || doc.slug === "index")
    return {
      path: `${doc.path.slice(1)}index.html`,
      html: renderPage(template, {
        ...values,
        title: escapeHtml(doc.title),
        description: escapeHtml(doc.description),
        path: doc.path,
        header: siteHeader(versions, section, own, picker),
        menu: siteMenu(versions, picker, section, own),
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
 * the docs page that frames it. `framed` names the demos the docs frame besides the items' own (`framedDemos`): a
 * page's own demo, the Typography page's, and every variant a page places.
 */
export function previewPages(registry: Registry, themeSource: Registry, previews: Previews, values: Record<string, string>, template: string, framed: ReadonlySet<string> = new Set()): Array<{ path: string; html: string }> {
  const { embed } = previews
  if (!embed) return []
  const themes = siteThemes(themeSource)
  const site = themes[0]!
  const others = previewThemePalettes(themes)
  const styles = embed.styles.map((href) => `<link rel="stylesheet" href="${href}">`).join("\n")
  // A demo is an item's, one the docs frame (a page's own, or a variant a page places), or the desk's; a stray demo that is none of those gets no page.
  return [...previews.demos.values()]
    .filter((demo) => demo.name === DESK_DEMO || registry.items.some((item) => item.name === demo.name) || framed.has(demo.name))
    .map((demo) => {
      const item = registry.items.find((entry) => entry.name === demo.name)
      const theme = item?.type === "registry:theme" ? item : null
      return {
        path: `${PREVIEW_PATH}/${demo.name}/index.html`,
        html: render(template, {
          ...values,
          item: escapeHtml(demo.name),
          // A card's frame centers a demo written to the contract and stretches one from a tag before it; the desk fills its frame.
          frame: demo.name === DESK_DEMO ? "desk" : previews.frame === "centered" ? "card" : "stretch",
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
    components: itemList(componentItems(registry), tag, docSlugs),
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
      base: { type: "string", default: "" },
      versions: { type: "string", default: "" },
    },
  })
  const registry = JSON.parse(await readFile(resolve(args.registry), "utf8")) as Registry
  const themeSource = JSON.parse(await readFile(resolve(args.theme), "utf8")) as Registry
  const version = (await readFile(resolve(args.version), "utf8")).trim()
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`${args.version} holds "${version}", which is not a version`)
  const base = siteBase(args.base)
  const versions = versionList(`v${version}`, args.versions.split(",").map((tag) => tag.trim()).filter(Boolean))
  const tagDocs = await readDocs(resolve(args.docs), registry)
  const docSlugs = new Set(tagDocs.map((doc) => doc.slug))
  const demosDir = resolve(args.demos)
  const previews: Previews = { demos: await readDemos(demosDir), embed: await readEmbed(resolve(args.embed)), frame: await readFrame(demosDir) }
  const values = templateValues(registry, version, themeSource, docSlugs, previews, { versions, base })
  const site = await readSitePages(join(root, "site", SITE_DOCS), sitePageValues(registry, values, docSlugs, await readChangelog(resolve(args.changelog))))
  const docs = siteDocs(site, tagDocs)
  // The files the Manual tab shows live beside the registry.json they are listed in: the tag's checkout in the release job.
  const sources = await readSources(registry, dirname(resolve(args.registry)))
  const out = resolve(args.out)
  await mkdir(out, { recursive: true })
  // Five things live at the root alone: the 404 page, which the distribution serves for every missing key wherever
  // it is; the popout page, which dockview opens at the root; the list of releases, which every tree's menu reads;
  // and the crawlers' two files, robots.txt and the sitemap, since a release's own pages canonicalize to the root's.
  const atRoot = !base
  for (const page of atRoot ? PAGES : PAGES.filter((page) => page !== NOT_FOUND_PAGE)) {
    const template = await readFile(join(root, "site", page), "utf8")
    await writeFile(join(out, page), renderPage(template, values))
  }
  if (atRoot) await writeFile(join(out, VERSIONS_INDEX), versionsIndex(versions))
  if (atRoot) await writeFile(join(out, ROBOTS_FILE), robotsTxt())
  if (atRoot) await writeFile(join(out, SITEMAP_FILE), sitemap(docs))
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
  const pages = previewPages(registry, themeSource, previews, values, await readFile(join(root, "site", PREVIEW_TEMPLATE), "utf8"), framedDemos(tagDocs))
  if (previews.embed) {
    await cp(join(previews.embed.dir, "assets"), join(out, PREVIEW_PATH, "assets"), { recursive: true })
    if (atRoot) await cp(join(previews.embed.dir, POPOUT), join(out, POPOUT))
    for (const page of pages) {
      await mkdir(join(out, dirname(page.path)), { recursive: true })
      await writeFile(join(out, page.path), page.html)
    }
  }
  const previewNote = previews.embed ? `${pages.length} previews` : "no previews (no embed build)"
  console.log(`site: ${registry.items.length} items, ${docs.length} docs pages, ${previewNote}, ${SEARCH_INDEX} at v${version}${base ? ` under ${base}` : ""} -> ${out}`)
}

if (import.meta.main) await main()
