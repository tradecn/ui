import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { describe, expect, it } from "vitest"
import {
  codeBlocks,
  commandFor,
  consumerPath,
  DOCS_TEMPLATE,
  docPages,
  componentItems,
  docsNav,
  escapeHtml,
  groupOf,
  GROUPS,
  headingOf,
  FAVICON,
  firstParagraph,
  FONT_PACKAGES,
  FONT_WEIGHTS,
  fontFiles,
  FONTS_PATH,
  FONTS_STYLES,
  GITHUB_LINK,
  installationSection,
  MENU_ID,
  MENU_TOGGLE,
  MODE_BUTTON,
  PAGES,
  readChangelog,
  readDemos,
  readDocs,
  readEmbed,
  readSitePages,
  readSources,
  rebase,
  registryCss,
  render,
  renderMarkdown,
  renderPage,
  SEARCH_BUTTON,
  SEARCH_INDEX,
  searchDialog,
  searchIndex,
  SITE_DOCS,
  SITE_STYLES,
  siteBase,
  siteDocs,
  siteHeader,
  siteMenu,
  sitePageValues,
  siteThemes,
  START_PAGES,
  tables,
  templateValues,
  textOf,
  THEME_ITEM,
  themePalettes,
  themePicker,
  titleOf,
  THEMES_META,
  themesMeta,
  toc,
  versionList,
  versionPicker,
  VERSIONS_INDEX,
  versionsIndex,
} from "./build"
import type { Doc, Registry } from "./build"

const root = resolve(import.meta.dirname, "../..")
const registry = JSON.parse(readFileSync(resolve(root, "registry.json"), "utf8")) as Registry
const version = readFileSync(resolve(root, "version.txt"), "utf8").trim()
const tag = `v${version}`
const template = (page: string) => readFileSync(resolve(root, "site", page), "utf8")

/** A stand-in for playground/dist/embed: a Vite manifest with one entry and its stylesheet. */
function fakeEmbed(): string {
  const dir = mkdtempSync(join(tmpdir(), "tradecn-embed-"))
  mkdirSync(join(dir, ".vite"))
  writeFileSync(
    join(dir, ".vite", "manifest.json"),
    JSON.stringify({
      "src/embed.tsx": { file: "assets/embed-abc.js", name: "embed", src: "src/embed.tsx", isEntry: true, css: ["assets/embed-def.css"] },
    }),
  )
  return dir
}

describe("the pages' type", () => {
  const fonts = readFileSync(resolve(root, "site", FONTS_STYLES), "utf8")
  const rules = [...fonts.matchAll(/@font-face \{([^}]+)\}/g)].map((match) => match[1]!)

  it("declares the two faces the tokens name, in the weights the stylesheet uses, one rule per file the builder copies, each the package's own", () => {
    const tokens = registry.items.find((item) => item.name === THEME_ITEM)!.cssVars!.light!
    for (const { family } of FONT_PACKAGES) expect(tokens[family === "Inter" ? "tradecn-font-sans" : "tradecn-font-mono"]).toMatch(new RegExp(`^'${family}',`))
    expect(rules).toHaveLength(fontFiles().length)
    for (const { package: pkg, file } of fontFiles()) {
      const rule = rules.find((text) => text.includes(`url(/${FONTS_PATH}/${file})`))
      expect(rule, file).toBeDefined()
      const family = FONT_PACKAGES.find((entry) => entry.package === pkg)!.family
      const weight = /-(\d+)-normal\.woff2$/.exec(file)![1]!
      expect(rule).toContain(`font-family: '${family}';`)
      expect(rule).toContain(`font-weight: ${weight};`)
      expect(rule).toContain("font-display: swap;")
      expect(rule).toMatch(/src: url\([^)]+\) format\('woff2'\);/)
      // The file exists where the builder reads it, and its unicode-range is the one Fontsource ships for that subset.
      const source = resolve(root, "node_modules/@fontsource", pkg, "files", file)
      expect(existsSync(source), source).toBe(true)
      const packageCss = readFileSync(resolve(root, "node_modules/@fontsource", pkg, `${weight}.css`), "utf8")
      const block = new RegExp(`/\\* ${file.replace(/\.woff2$/, "")} \\*/\\s*@font-face \\{([^}]+)\\}`).exec(packageCss)![1]!
      const range = /unicode-range: ([^;]+);/.exec(block)![1]!
      expect(rule, file).toContain(`unicode-range: ${range};`)
    }
    expect(FONT_WEIGHTS).toEqual([400, 500, 600])
    // The stylesheet reads the two stacks the pages set, never a family by name, so the theme's tokens govern the pages too.
    const site = readFileSync(resolve(root, "site", SITE_STYLES), "utf8")
    expect(site).toContain("font: 15px/1.55 var(--font-sans)")
    expect(site).toContain("font-family: var(--font-mono)")
    expect(site).not.toMatch(/font(-family)?:[^;]*(Inter|JetBrains|monospace|sans-serif)/)
  })
})

describe("the opening page", () => {
  const values = templateValues(registry, version)
  const page = renderPage(template("index.html"), values)

  it("renders every template without a placeholder left", () => {
    for (const name of PAGES) expect(renderPage(template(name), values)).not.toMatch(/\{\{\w+\}\}/)
  })

  it("links the favicon the builder copies from the amber logo", () => {
    for (const name of PAGES) expect(template(name)).toContain(`href="/${FAVICON}"`)
    const mark = readFileSync(resolve(root, "assets", "logo-dark.svg"), "utf8")
    expect(mark).toContain('stroke="#f7a224"')
    expect(mark).not.toContain('stroke="black"')
  })

  it("opens with the one line, the paragraph, and the two ways in", () => {
    expect(page).toContain("<h1>Trading-terminal components you install with <code>shadcn add</code></h1>")
    expect(page).toContain(`<a class="badge" href="/docs/changelog/">What's new in ${tag} →</a>`)
    expect(page).toContain('<a class="button primary" href="/docs/installation/">Get Started</a>')
    expect(page).toContain('<a class="button" href="/docs/components/">View Components</a>')
    // The install commands live on the Installation page now.
    expect(page).not.toContain("shadcn@latest add")
  })

  it("wears the header every page shares, with the Menu button first, the sections then registry.json, the version menu, the search, the GitHub mark, the theme menu, and the mode button last", () => {
    expect(page).toContain('<header class="site-header">')
    // The Menu button leads, ahead of the name: on a phone it stands in for the name and the sections, and it names the panel it opens.
    expect(page).toContain(`<div class="wrap">\n${MENU_TOGGLE}\n<a class="name" href="/">`)
    expect(MENU_TOGGLE).toMatch(new RegExp(`^<button type="button" class="menu-toggle" aria-expanded="false" aria-controls="${MENU_ID}"><svg class="menu-icon" [^>]*aria-hidden="true">.*</svg><svg class="close-icon" [^>]*aria-hidden="true">.*</svg><span>Menu</span></button>$`))
    expect(page.match(/class="menu-toggle"/g)).toHaveLength(1)
    expect(page).toContain('<nav aria-label="Sections"><a href="/docs/">Docs</a><a href="/docs/components/">Components</a><a href="/docs/changelog/">Changelog</a><a href="/r/registry.json">registry.json</a></nav>')
    // The version menu is first among the links, right before the search; the tag is no longer a bare label.
    expect(page).toContain(`<nav class="side" aria-label="Links">${versionPicker(tag)}${SEARCH_BUTTON}${GITHUB_LINK}`)
    expect(page).not.toContain('<span class="tag">')
    // The registry file rides after the sections, not among the links out.
    expect(page).not.toContain(`${GITHUB_LINK}<a href="/r/registry.json">`)
    expect(page).toContain(`${GITHUB_LINK}${themePicker(siteThemes(registry))}${MODE_BUTTON}</nav>`)
    // The repository link is GitHub's mark alone, named for a screen reader; the word is no longer in the header.
    expect(GITHUB_LINK).toMatch(/^<a class="github" href="https:\/\/github\.com\/tradecn\/ui" aria-label="GitHub"><svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M6\.766 11\.328c[^"]+"\/><\/svg><\/a>$/)
    expect(page).not.toContain(">GitHub</a>")
    expect(MODE_BUTTON).toContain('<button type="button" class="mode-toggle" aria-label="Toggle theme">')
    expect(page.match(/class="mode-toggle"/g)).toHaveLength(1)
    expect(page).toContain('<link rel="stylesheet" href="/site.css">')
    expect(siteHeader(versionPicker(tag), "components")).toContain('<a href="/docs/components/" aria-current="true">Components</a>')
    expect(siteHeader(versionPicker(tag), "docs", true)).toContain('<a href="/docs/" aria-current="page">Docs</a>')
    expect(siteHeader(versionPicker(tag))).not.toContain("aria-current")
  })

  it("carries the search dialog, closed, after the header; the 404 page has no script and none", () => {
    const dialog = searchDialog()
    expect(dialog).toMatch(/^<dialog class="search" aria-label="Search the docs">\n/)
    expect(dialog).not.toContain("<dialog open")
    expect(dialog).toContain('<input type="search" placeholder="Search the docs" aria-label="Search the docs" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="true" aria-autocomplete="list" aria-controls="search-results">')
    expect(dialog).toContain('<button type="button" class="search-close" aria-label="Close">Esc</button>')
    expect(dialog).toContain('<div class="search-results" id="search-results" role="listbox" aria-label="Results"></div>')
    expect(page.indexOf("</header>")).toBeLessThan(page.indexOf('<dialog class="search"'))
    expect(page.match(/<dialog /g)).toHaveLength(1)
    expect(SEARCH_BUTTON).toContain('class="search-button" aria-label="Search the docs" aria-keyshortcuts="Meta+K Control+K"')
    expect(SEARCH_BUTTON).toContain("<span>Search the docs</span><kbd>⌘K</kbd>")
    expect(renderPage(template("404.html"), values)).not.toContain("<dialog")
    expect(renderPage(template("404.html"), values)).not.toContain("search-button")
  })

  it("folds into a menu on a phone: a panel the Menu button opens, with the version and theme menus, Home, and the sections; the 404 page has none", () => {
    const versions = versionPicker(tag)
    const themes = themePicker(siteThemes(registry))
    const menu = siteMenu(versions, themes)
    expect(menu).toBe(
      [
        '<div class="menu-only">',
        `<div class="menu-settings">${versions}${themes}</div>`,
        '<nav class="menu-sections" aria-label="Menu">',
        "<h2>Menu</h2>",
        "<ul>",
        '<li><a href="/">Home</a></li>',
        '<li><a href="/docs/">Docs</a></li>',
        '<li><a href="/docs/components/">Components</a></li>',
        '<li><a href="/docs/changelog/">Changelog</a></li>',
        '<li><a href="/r/registry.json">registry.json</a></li>',
        "</ul>",
        "</nav>",
        "</div>",
      ].join("\n"),
    )
    // The sections carry the page's own aria-current, as the header's do.
    expect(siteMenu(versions, themes, "components", true)).toContain('<li><a href="/docs/components/" aria-current="page">Components</a></li>')
    expect(siteMenu(versions, themes, "docs", false)).toContain('<li><a href="/docs/" aria-current="true">Docs</a></li>')
    expect(siteMenu(versions, "")).toContain(`<div class="menu-settings">${versions}</div>`)
    // The opening page's panel is that alone, named by the button, between the search dialog and the page; a docs page's is its sidebar.
    expect(values.menu).toBe(menu)
    const panel = `<aside class="sidebar menu" id="${MENU_ID}" aria-label="Menu" tabindex="-1">\n${menu}\n</aside>`
    expect(page).toContain(panel)
    expect(page.indexOf("</dialog>")).toBeLessThan(page.indexOf(panel))
    expect(page.indexOf(panel)).toBeLessThan(page.indexOf('<main class="wrap">'))
    expect(page.match(/id="site-menu"/g)).toHaveLength(1)
    const lost = renderPage(template("404.html"), values)
    expect(lost).not.toContain("menu-toggle")
    expect(lost).not.toContain(MENU_ID)
    // The stylesheet: the button and the panel's own part show on a phone with a script, the panel is the sidebar fixed under the header while open, and without a script the sidebar stays in the page.
    const site = readFileSync(resolve(root, "site", SITE_STYLES), "utf8")
    expect(site).toContain(".menu-only, .sidebar.menu { display: none; }")
    const [, phone = ""] = site.split("@media (max-width: 48rem) {")
    expect(phone).toContain("html.js .menu-toggle { display: inline-flex; }")
    expect(phone).toContain('html.js .site-header .name, html.js .site-header nav[aria-label="Sections"], html.js .site-header .version-pick, html.js .site-header .theme-pick { display: none; }')
    expect(phone).toContain("html.js .sidebar { display: none; }")
    expect(phone).toContain('html.js[data-menu="open"], html.js[data-menu="open"] body { overflow: hidden; }')
    expect(phone).toContain('html.js[data-menu="open"] .sidebar { display: block; position: fixed; top: var(--header-height, 3.25rem); right: 0; bottom: 0; left: 0;')
    expect(phone).toContain("html.js .menu-only { display: block; }")
    expect(phone).toContain("html:not(.js) .sidebar ul { display: flex; flex-wrap: wrap;")
    // The script: the button toggles data-menu on <html>, measures the header, closes on Escape and on a link, and fills both version menus.
    const script = readFileSync(resolve(root, "site", "site.js"), "utf8")
    expect(script).toContain('document.getElementById(toggle?.getAttribute("aria-controls") ?? "")')
    expect(script).toContain("root.dataset.menu = MENU_OPEN")
    expect(script).toContain("root.style.setProperty(\"--header-height\", `${header.offsetHeight}px`)")
    expect(script).toContain('event.key !== "Escape" || !isOpen()')
    expect(script).toContain('if (event.target.closest("a")) set(false)')
    expect(script).toContain('document.querySelectorAll(".version-select")')
    expect(script).toContain('const NARROW = "(max-width: 48rem)"')
  })

  it("lists every item by title, linking its doc on GitHub when the tag ships no page for it", () => {
    expect(page).toContain('<ul class="item-list">')
    for (const item of registry.items) {
      expect(page).toContain(`<li><a href="https://github.com/tradecn/ui/blob/${tag}/docs/${item.name}.md">${titleOf(item)}</a></li>`)
    }
    // The registry title, and a hook by the name it is exported under, as the sidebar lists them.
    expect(page).toContain(`<li><a href="https://github.com/tradecn/ui/blob/${tag}/docs/format.md">Format</a></li>`)
    expect(page).toContain(`<li><a href="https://github.com/tradecn/ui/blob/${tag}/docs/use-hotkeys.md">useHotkeys</a></li>`)
    expect(page).not.toContain("<iframe")
  })

  it("links the item's own page when the tag ships a doc for it", () => {
    const withDocs = renderPage(template("index.html"), templateValues(registry, version, registry, new Set(["format"])))
    expect(withDocs).toContain(`<li><a href="/docs/format/">Format</a></li>`)
    expect(withDocs).toContain(`https://github.com/tradecn/ui/blob/${tag}/docs/row-store.md`)
  })

  it("runs every item live when the tag has an embed build, in registry order, each card naming and linking it", async () => {
    const demos = await readDemos(resolve(root, "playground/src/demos"))
    const embed = await readEmbed(fakeEmbed())
    const live = renderPage(template("index.html"), templateValues(registry, version, registry, new Set(registry.items.map((item) => item.name)), { demos, embed }))
    expect(live).toContain('<section class="showcase" aria-label="Every item, live">')
    expect(live.match(/<iframe /g)).toHaveLength(registry.items.length)
    for (const item of registry.items) {
      expect(live).toContain(`<article class="card" data-preview="${item.name}">`)
      expect(live).toContain(`<a href="/docs/${item.name}/"><code>${item.name}</code></a>`)
      expect(live).toContain(`<iframe src="/preview/${item.name}/" title="${item.name}, live" data-preview="${item.name}"></iframe>`)
    }
    const order = [...live.matchAll(/<article class="card" data-preview="([\w-]+)">/g)].map((match) => match[1])
    expect(order).toEqual(registry.items.map((item) => item.name))
    expect(live).not.toContain('<ul class="item-list">')
    // A demo without an item is not on the page; an item without a demo gets no card.
    const partial = templateValues(registry, version, registry, new Set(), { demos: new Map([["format", demos.get("format")!]]), embed })
    expect((partial.showcase ?? "").match(/<iframe /g)).toHaveLength(1)
  })

  it("offers every theme in the registry in a menu left of the mode button, the site's own first and selected, by title", () => {
    const themes = siteThemes(registry)
    const others = registry.items.filter((item) => item.type === "registry:theme" && item.name !== THEME_ITEM).map((item) => item.name)
    expect(themes.map((theme) => theme.name)).toEqual([THEME_ITEM, ...others])
    expect(others.length).toBeGreaterThan(0)
    const picker = themePicker(themes)
    expect(picker).toMatch(/^<span class="theme-pick"><select class="theme-select" aria-label="Theme"><option value="tradecn-amber" selected>Amber<\/option><option value="tradecn-slate">Slate<\/option><option value="tradecn-slate-east">Slate East<\/option>/)
    expect(picker.match(/<option /g)).toHaveLength(themes.length)
    expect(picker.match(/ selected>/g)).toHaveLength(1)
    expect(picker).toMatch(/<\/select><svg [^>]*aria-hidden="true">.*<\/svg><\/span>$/)
    // Two on the page, the header's and the phone menu's; the stylesheet shows one at a time.
    expect(page.match(/class="theme-select"/g)).toHaveLength(2)
    // The menu shows a theme's title, or its name without one, escaped either way.
    expect(themePicker([{ name: "x<y", type: "registry:theme" }])).toContain('<option value="x&lt;y" selected>x&lt;y</option>')
    expect(themePicker([])).toBe("")
    // A header built without one has none; a docs page passes the one the template values carry.
    expect(siteHeader(versionPicker(tag))).not.toContain("theme-select")
    expect(siteHeader(versionPicker(tag), "docs", true, picker)).toContain(`${GITHUB_LINK}${picker}${MODE_BUTTON}</nav>`)
    expect(values.themePicker).toBe(picker)
    // A theme source without the site's theme has nothing to offer or to wear.
    expect(() => siteThemes({ name: "t", items: registry.items.filter((item) => item.type !== "registry:theme") })).toThrow(THEME_ITEM)
  })

  it("carries the other themes' palettes keyed on the data-theme the script writes, and names the themes in a meta before the script", () => {
    const themes = siteThemes(registry)
    const [site, ...others] = themes
    const meta = themesMeta(themes)
    expect(meta).toBe(`<meta name="${THEMES_META}" content="${themes.map((theme) => theme.name).join(" ")}">`)
    expect(page).toContain(meta)
    expect(page.indexOf(meta)).toBeLessThan(page.indexOf('<script src="/theme.js">'))
    const blocks = themePalettes(themes)
    expect(page).toContain(blocks)
    expect(blocks.match(/:root\[data-theme=/g)).toHaveLength(others.length)
    for (const theme of others) {
      const light = theme.cssVars!.light!
      const dark = theme.cssVars!.dark!
      expect(blocks).toContain(`:root[data-theme="${theme.name}"] {\n  --background: light-dark(${light.background}, ${dark.background});`)
      expect(blocks).toContain(`--up: light-dark(${light.up}, ${dark.up});`)
      expect(blocks).toContain(`--radius: ${light.radius};`)
    }
    // The default is :root itself, so it has no keyed block, and no block sets color-scheme, which the mode classes own.
    expect(blocks).not.toContain(`data-theme="${site!.name}"`)
    expect(blocks).not.toContain("color-scheme")
    // The 404 page has no script, so it never wears another theme and carries neither the meta nor the blocks.
    const notFound = renderPage(template("404.html"), values)
    expect(notFound).not.toContain(THEMES_META)
    expect(notFound).not.toContain("data-theme")
  })

  it("takes both sides of its palette from the amber theme, one light-dark() pair per token, and its type from the theme's font tokens", () => {
    const theme = registry.items.find((item) => item.name === THEME_ITEM)!
    expect(THEME_ITEM).toBe("tradecn-amber")
    const light = theme.cssVars!.light!
    const dark = theme.cssVars!.dark!
    expect(page).toContain(`<meta name="color-scheme" content="light dark">`)
    expect(page).toContain(`:root {\n  color-scheme: light dark;\n  --background: light-dark(${light.background}, ${dark.background});`)
    expect(page).toContain(`--primary: light-dark(${light.primary}, ${dark.primary});`)
    expect(page).toContain(`--up: light-dark(${light.up}, ${dark.up});`)
    expect(page).toContain(`--font-sans: ${light["tradecn-font-sans"]};`)
    expect(page).toContain(`--font-mono: ${light["tradecn-font-mono"]};`)
    expect(page).not.toContain("--font: ")
    // A token the two sides agree on is written once: the theme's dark side leaves the radius to its light side.
    expect(page).toContain(`--radius: ${light.radius};`)
    expect(page).not.toContain(`light-dark(${light.radius}`)
    // The pages self-host the two faces: their stylesheet is linked before the site's.
    expect(page).toContain(`<link rel="stylesheet" href="/${FONTS_STYLES}">`)
    expect(page.indexOf(FONTS_STYLES)).toBeLessThan(page.indexOf(SITE_STYLES))
    // The 404 page has no script, so its palette alone carries both modes and it follows the system.
    const notFound = renderPage(template("404.html"), values)
    expect(notFound).toContain(`<meta name="color-scheme" content="light dark">`)
    expect(notFound).toContain("  color-scheme: light dark;")
    expect(notFound).toContain(`--primary: light-dark(${light.primary}, ${dark.primary});`)
    expect(notFound).toContain(`<link rel="stylesheet" href="/${FONTS_STYLES}">`)
    expect(notFound).not.toContain("<script")
  })

  it("escapes item text", () => {
    expect(escapeHtml(`<a href="x">Tom & Jerry's</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;")
    const hostile: Registry = {
      name: "t",
      items: [...registry.items, { name: "evil", type: "registry:ui", description: `<script>alert("x")</script>` }],
    }
    expect(templateValues(hostile, version).showcase).not.toContain("<script>")
  })

  it("refuses a placeholder the builder does not set", () => {
    expect(() => render("{{nope}}", values)).toThrow(/nope/)
  })

  it("renders a tag from before the theme existed with main's palette", () => {
    // v0.1.0 shipped five items and no theme. The release job builds its page from that
    // registry.json with the palette from main's.
    const early: Registry = {
      name: "t",
      items: registry.items.filter((item) => ["format", "row-store", "flash-cell", "data-grid", "feed-health"].includes(item.name)),
    }
    const values = templateValues(early, "0.1.0", registry)
    expect(values.showcase).toContain(">Format</a></li>")
    expect(values.showcase).not.toContain(`docs/${THEME_ITEM}`)
    expect(values.palette).toContain("--primary:")
    expect(() => templateValues(early, "0.1.0")).toThrow(THEME_ITEM)
  })
})

describe("the version menu and a release's own tree", () => {
  const values = templateValues(registry, version)
  const page = renderPage(template("index.html"), values)
  const base = `/${tag}`
  /** Every root path on a page that is neither under the base nor the registry's. */
  const outside = (html: string) => html.match(new RegExp(` (?:href|src)="/(?!r/|${tag.replace(/\./g, "\\.")}/)[^"]*"`, "g"))

  it("lists every release with pages, newest first, this one selected, and the tag it was built with alone otherwise", () => {
    expect(versionPicker(tag)).toMatch(new RegExp(`^<span class="version-pick"><select class="version-select" aria-label="Version"><option value="${tag}" selected>${tag}</option></select><svg [^>]*aria-hidden="true">.*</svg></span>$`))
    const menu = versionPicker("v1.1.0", ["v1.2.0", "v1.1.0", "v1.0.0"])
    expect(menu).toContain('<option value="v1.2.0">v1.2.0</option><option value="v1.1.0" selected>v1.1.0</option><option value="v1.0.0">v1.0.0</option>')
    expect(menu.match(/ selected>/g)).toHaveLength(1)
    // The list is sorted by the numbers, not the letters, and this build's tag is in it whatever was named.
    expect(versionList("v1.2.0", ["v1.1.0", "v1.10.0", "v0.9.9", "v1.2.0"])).toEqual(["v1.10.0", "v1.2.0", "v1.1.0", "v0.9.9"])
    expect(versionList("v1.2.0")).toEqual(["v1.2.0"])
    expect(() => versionList("1.2.0")).toThrow(/release tag/)
    expect(() => versionList("v1.2.0", ["v1.2"])).toThrow(/release tag/)
    expect(versionsIndex(["v1.2.0", "v1.1.0"])).toBe('{"latest":"v1.2.0","versions":["v1.2.0","v1.1.0"]}')
    // The menu the template values carry, twice on the page (the header's and the phone menu's, one showing at a time); a page built with a list carries it.
    expect(page.match(/class="version-select"/g)).toHaveLength(2)
    expect(values.versionPicker).toBe(versionPicker(tag))
    expect(templateValues(registry, version, registry, new Set(), undefined, { versions: ["v0.1.0"] }).versionPicker).toBe(versionPicker(tag, [tag, "v0.1.0"]))
    // The page's <html> says which release it is and where its tree is served from: the root here.
    expect(page).toContain(`<html lang="en" data-version="${tag}" data-base="">`)
    expect(values.base).toBe("")
  })

  it("moves every site path under the base, never the registry's or one already there, and leaves escaped code alone", () => {
    const html = [
      '<a class="name" href="/">Home</a><a href="/docs/x/">x</a><a href="/#install">i</a>',
      '<iframe src="/preview/x/"></iframe><script src="/site.js"></script><link rel="icon" href="/favicon.svg">',
      '<a href="/r/registry.json">r</a><a href="/r/v1.2.0/x.json">r</a>',
      '<a href="https://tradecn.dev/docs/">abs</a><a href="//cdn/x">pp</a><a href="#install">hash</a>',
      "<code>href=&quot;/docs/&quot;</code>",
    ].join("")
    const moved = rebase(html, "/v1.2.0")
    expect(moved).toBe(
      [
        '<a class="name" href="/v1.2.0/">Home</a><a href="/v1.2.0/docs/x/">x</a><a href="/v1.2.0/#install">i</a>',
        '<iframe src="/v1.2.0/preview/x/"></iframe><script src="/v1.2.0/site.js"></script><link rel="icon" href="/v1.2.0/favicon.svg">',
        '<a href="/r/registry.json">r</a><a href="/r/v1.2.0/x.json">r</a>',
        '<a href="https://tradecn.dev/docs/">abs</a><a href="//cdn/x">pp</a><a href="#install">hash</a>',
        "<code>href=&quot;/docs/&quot;</code>",
      ].join(""),
    )
    // Safe to repeat: a site page is filled before marked runs and rendered again after.
    expect(rebase(moved, "/v1.2.0")).toBe(moved)
    expect(render('<a href="/docs/">d</a>', { base: "/v1.2.0" })).toBe('<a href="/v1.2.0/docs/">d</a>')
    expect(render('<a href="/docs/">d</a>', { base: "" })).toBe('<a href="/docs/">d</a>')
    expect(siteBase("")).toBe("")
    expect(siteBase("/v1.2.0")).toBe("/v1.2.0")
    for (const bad of ["v1.2.0", "/v1.2.0/", "/a/b", "/"]) expect(() => siteBase(bad), bad).toThrow(/one path segment/)
  })

  it("renders a release's own tree from the same inputs, every path under the base, canonical at the root, the registry where it is", async () => {
    const tree = templateValues(registry, version, registry, new Set(), undefined, { base, versions: ["v0.1.0"] })
    const opening = renderPage(template("index.html"), tree)
    expect(opening).toContain(`<html lang="en" data-version="${tag}" data-base="${base}">`)
    expect(opening).toContain(`<link rel="stylesheet" href="${base}/site.css">`)
    expect(opening).toContain(`<script src="${base}/theme.js"></script>`)
    expect(opening).toContain(`<link rel="icon" href="${base}/favicon.svg"`)
    expect(opening).toContain(`<a class="name" href="${base}/">`)
    expect(opening).toContain(`<a href="${base}/docs/">Docs</a>`)
    expect(opening).toContain('<a href="/r/registry.json">registry.json</a>')
    expect(opening).toContain(`<a class="badge" href="${base}/docs/changelog/">`)
    expect(opening).toContain('<link rel="canonical" href="https://tradecn.dev/">')
    expect(opening).toContain(versionPicker(tag, [tag, "v0.1.0"]))
    expect(outside(opening)).toBeNull()
    expect(opening).not.toContain(`${base}${base}`)
    // The docs pages likewise, content links and the site's own pages' cards included, once each.
    const tagDocs = await readDocs(resolve(root, "docs"), registry)
    const docSlugs = new Set(tagDocs.map((doc) => doc.slug))
    const treeValues = templateValues(registry, version, registry, docSlugs, undefined, { base })
    const site = await readSitePages(resolve(root, "site", SITE_DOCS), sitePageValues(registry, treeValues, docSlugs, "There is no changelog at this tag."))
    const docs = siteDocs(site, tagDocs)
    const previews = { demos: await readDemos(resolve(root, "playground/src/demos")), embed: await readEmbed(fakeEmbed()) }
    const pages = new Map(docPages(docs, treeValues, template(DOCS_TEMPLATE), previews, await readSources(registry, root)).map((entry) => [entry.path, entry.html]))
    const grid = pages.get("docs/data-grid/index.html") ?? ""
    expect(grid).toContain(`<html lang="en" data-version="${tag}" data-base="${base}">`)
    expect(grid).toContain(`<li><a href="${base}/docs/">Introduction</a></li>`)
    expect(grid).toContain(`<a rel="prev" href="${base}/docs/countdown/">`)
    expect(grid).toContain(`<iframe src="${base}/preview/data-grid/"`)
    expect(grid).toContain('<link rel="canonical" href="https://tradecn.dev/docs/data-grid/">')
    expect(outside(grid)).toBeNull()
    expect(grid).not.toContain(`${base}${base}`)
    const components = pages.get("docs/components/index.html") ?? ""
    expect(components).toContain(`<li><a href="${base}/docs/data-grid/">Data Grid</a></li>`)
    expect(outside(components)).toBeNull()
    expect(components).not.toContain(`${base}${base}`)
    // The search index keeps the paths within the tree; site.js puts the base in front of them.
    for (const entry of searchIndex(docs)) expect(entry.path).toMatch(/^\/docs\//)
  })

  it("writes versions.json at the root alone, which site.js reads from the root on every tree, and both trees are built wherever the site is", () => {
    const build = readFileSync(resolve(root, "scripts/site/build.ts"), "utf8")
    expect(build).toContain("if (atRoot) await writeFile(join(out, VERSIONS_INDEX), versionsIndex(versions))")
    // The 404 page and the popout live at the root alone: the distribution serves the one for every missing key, dockview opens the other there.
    expect(build).toContain("PAGES.filter((page) => page !== NOT_FOUND_PAGE)")
    expect(build).toContain("if (atRoot) await cp(join(previews.embed.dir, POPOUT), join(out, POPOUT))")
    const script = readFileSync(resolve(root, "site", "site.js"), "utf8")
    expect(script).toContain(`const VERSIONS_INDEX = "/${VERSIONS_INDEX}"`)
    expect(script).toContain("fetch(VERSIONS_INDEX)")
    expect(script).not.toContain("BASE + VERSIONS_INDEX")
    expect(script).toContain("document.documentElement.dataset.version")
    expect(script).toContain("document.documentElement.dataset.base")
    // A pick goes to this page under the release, else its docs, else its opening page, by a HEAD; the latest lives at the root.
    expect(script).toContain('const root = version === latest ? "" : `/${version}`')
    expect(script).toContain('for (const candidate of [path, "/docs/", "/"])')
    expect(script).toContain('fetch(url, { method: "HEAD" })')
    for (const file of ["justfile", ".github/workflows/ci.yml"]) {
      expect(readFileSync(resolve(root, file), "utf8"), file).toContain('bun scripts/site/build.ts --base "/v$(cat version.txt)" --out "site/dist/v$(cat version.txt)"')
    }
    const release = readFileSync(resolve(root, ".github/workflows/release-please.yml"), "utf8")
    expect(release).toContain('build --out "site/dist/$TAG" --base "/$TAG"')
    expect(release).toContain('--versions "$VERSIONS"')
    expect(release).toContain(`aws s3 cp site/dist/${VERSIONS_INDEX} "s3://$BUCKET/${VERSIONS_INDEX}"`)
    expect(release).toContain(`--paths "/$TAG" "/$TAG/*" "/${VERSIONS_INDEX}"`)
    // The root's sync neither writes nor deletes the trees or the list, and the bundle is built once for both trees.
    expect(release).toContain(`--exclude "v[0-9]*/*" --exclude "${VERSIONS_INDEX}"`)
    expect(release).toContain("bun run --cwd playground build:embed -- --base ./")
    expect(readFileSync(resolve(root, "playground/vite.embed.config.ts"), "utf8")).toContain('base: "./"')
  })
})

describe("code blocks", () => {
  it("give every block a copy button and leave the block itself alone", () => {
    const html = codeBlocks('<p>x</p>\n<pre><code class="language-tsx">a &lt; b\n</code></pre>\n')
    expect(html).toContain('<p>x</p>\n<div class="code"><pre><code class="language-tsx">a &lt; b\n</code></pre><button type="button" class="copy" aria-label="Copy">')
    expect(html).not.toContain("managers")
    // Only a line that starts with npx is a command.
    expect(codeBlocks("<pre><code>run npx foo</code></pre>")).not.toContain("managers")
  })

  it("offer a command under pnpm, npm, yarn, and bun, changing only the lines that start with npx", () => {
    const html = codeBlocks('<pre><code class="language-bash">npx shadcn@latest add tradecn/ui/panel --diff   # look first\nnpx shadcn@latest add tradecn/ui/panel\n</code></pre>')
    expect(html).toContain('<div class="managers" role="tablist" aria-label="Package manager">')
    expect(html).toContain('<button type="button" role="tab" id="pm-1-npm" aria-controls="pm-1-npm-code" aria-selected="true" data-pm="npm">npm</button>')
    expect(html).toContain('<button type="button" role="tab" id="pm-1-bun" aria-controls="pm-1-bun-code" aria-selected="false" data-pm="bun">bun</button>')
    expect(html).toContain(
      '<pre id="pm-1-pnpm-code" role="tabpanel" aria-labelledby="pm-1-pnpm" data-pm="pnpm"><code class="language-bash">pnpm dlx shadcn@latest add tradecn/ui/panel --diff   # look first\npnpm dlx shadcn@latest add tradecn/ui/panel\n</code></pre>',
    )
    expect(html).toContain('data-pm="npm"><code class="language-bash">npx shadcn@latest add tradecn/ui/panel --diff')
    expect(html).toContain("yarn dlx shadcn@latest add tradecn/ui/panel --diff")
    expect(html).toContain("bunx --bun shadcn@latest add tradecn/ui/panel --diff")
    expect(["pnpm", "npm", "yarn", "bun"].map((name) => html.indexOf(`id="pm-1-${name}"`))).toEqual([...html.matchAll(/id="pm-1-\w+"/g)].map((match) => match.index))
    expect(html.match(/class="copy"/g)).toHaveLength(1)
  })

  it("number the blocks so tabs and panels pair up across a page", () => {
    const html = codeBlocks("<pre><code>npx a</code></pre>\n<pre><code>npx b</code></pre>")
    expect(html).toContain('id="pm-1-npm"')
    expect(html).toContain('id="pm-2-npm-code"')
    const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((match) => match[1])
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("write the runner and the add shadcn's site shows for each manager", () => {
    const bun = { run: "bunx --bun", add: "bun add" }
    expect(commandFor("npx shadcn@latest add x\n", bun)).toBe("bunx --bun shadcn@latest add x\n")
    expect(commandFor("npm install cn @tanstack/react-virtual", bun)).toBe("bun add cn @tanstack/react-virtual")
    expect(commandFor("echo npx\nnpx x", { run: "pnpm dlx", add: "pnpm add" })).toBe("echo npx\npnpm dlx x")
    const html = codeBlocks("<pre><code>npm install cn</code></pre>")
    expect(html).toContain('data-pm="yarn"><code>yarn add cn</code>')
    expect(html).toContain('data-pm="npm"><code>npm install cn</code>')
  })
})

describe("tables", () => {
  it("each get a wrapper that scrolls sideways, whatever wrote them", () => {
    const html = tables('<p>x</p>\n<table class="tokens">\n<tr><td>a</td></tr>\n</table>\n<table><tr><td>b</td></tr></table>')
    expect(html).toBe('<p>x</p>\n<div class="table"><table class="tokens">\n<tr><td>a</td></tr>\n</table></div>\n<div class="table"><table><tr><td>b</td></tr></table></div>')
    expect(renderPage("<table><tr><td>npx x</td></tr></table>", {})).toContain('<div class="table"><table>')
  })
})

describe("the Manual tab", () => {
  it("names the path a file lands on in a consumer", () => {
    expect(consumerPath({ path: "registry/tradecn/ui/x.tsx", type: "registry:ui" })).toBe("components/ui/x.tsx")
    expect(consumerPath({ path: "registry/tradecn/hooks/use-x.ts", type: "registry:hook" })).toBe("hooks/use-x.ts")
    expect(consumerPath({ path: "registry/tradecn/lib/x.ts", type: "registry:lib" })).toBe("lib/x.ts")
    expect(consumerPath({ path: "registry/tradecn/blocks/t/t.tsx", type: "registry:block" })).toBe("components/t.tsx")
    expect(consumerPath({ path: "a/b.tsx", type: "registry:block", target: "~/components/c.tsx" })).toBe("components/c.tsx")
  })

  it("writes a registry css block as the stylesheet the CLI appends", () => {
    expect(registryCss({ "@layer components": { ".x": { "--a": "1", color: "red" } } })).toBe("@layer components {\n  .x {\n    --a: 1;\n    color: red;\n  }\n}")
  })
})

describe("markdown", () => {
  it("takes the title from the first heading and gives every heading an anchor", () => {
    const doc = renderMarkdown("# `format`\n\nIntro line.\n\n## Prices\n\ntext\n\n## Prices\n\nmore\n\n### The rest\n")
    expect(doc.title).toBe("format")
    expect(doc.html).toContain('<h1 id="format"><a href="#format"><code>format</code></a></h1>')
    expect(doc.html).toContain('<h2 id="prices">')
    expect(doc.html).toContain('<h2 id="prices-1">')
    expect(doc.html).toContain('<h3 id="the-rest">')
  })

  it("leaves a heading that is a link with its own link and a plain id, since a link cannot hold a link", () => {
    const doc = renderMarkdown("# Changelog\n\n## [0.1.5](https://github.com/tradecn/ui/compare/v0.1.4...v0.1.5) (2026-09-21)\n\n### Features\n")
    expect(doc.html).toContain('<h2 id="0-1-5-2026-09-21"><a href="https://github.com/tradecn/ui/compare/v0.1.4...v0.1.5">0.1.5</a> (2026-09-21)</h2>')
    expect(doc.html).not.toContain('<a href="#0-1-5-2026-09-21">')
    expect(doc.html).toContain('<h3 id="features"><a href="#features">Features</a></h3>')
  })

  it("keeps fenced code as code, escaped, with its language", () => {
    const doc = renderMarkdown("# x\n\n```tsx\n<DataGrid rows={a < b} />\n```\n")
    expect(doc.html).toContain('<pre><code class="language-tsx">&lt;DataGrid rows={a &lt; b} /&gt;')
    expect(doc.html).not.toContain("<DataGrid")
  })

  it("points a link to a sibling doc at its page, and leaves other links alone", () => {
    const doc = renderMarkdown("# x\n\nRead [data-grid](data-grid.md) and [the CLI](https://ui.shadcn.com/docs/cli).\n")
    expect(doc.html).toContain('<a href="/docs/data-grid/">data-grid</a>')
    expect(doc.html).toContain('<a href="https://ui.shadcn.com/docs/cli">the CLI</a>')
  })

  it("describes a page by its first paragraph, without markup", () => {
    expect(firstParagraph("# t\n\n```ts\nnot this\n```\n\n- not this\n\n<table>not this</table>\n\nUse `formatPrice` for [prices](x.md).\n")).toBe(
      "Use formatPrice for prices.",
    )
  })
})

describe("the search index", () => {
  it("reads rendered HTML as the words on the page", () => {
    expect(textOf('<p>Install with <code>shadcn add</code>.</p>\n<ul>\n<li>a &lt; b &amp;&amp; c &gt; d</li>\n<li>Tom &amp; Jerry&#39;s &quot;x&quot; &#x27;y&#x27;</li>\n</ul>')).toBe("Install with shadcn add. a < b && c > d Tom & Jerry's \"x\" 'y'")
    expect(textOf('<a href="/docs/x/">x</a>, <a href="#y">y</a><br>z')).toBe("x, y z")
    expect(textOf("&unknown;")).toBe("&unknown;")
  })

  it("has a page per doc in nav order, with its group, its opening text, and every h2 and h3 with the text under it", () => {
    const docs: Doc[] = [
      {
        slug: "index",
        path: "/docs/",
        label: "Introduction",
        source: "index.md",
        title: "Introduction",
        description: "One line.",
        html: '<h1 id="introduction"><a href="#introduction">Introduction</a></h1>\n<p>One <code>line</code>.</p>\n<p>Two.</p>\n<h2 id="it-rides-shadcn"><a href="#it-rides-shadcn">It rides shadcn</a></h2>\n<p>Never copies.</p>\n<h2 id="0-1-5"><a href="https://example.com">0.1.5</a> (date)</h2>\n<h3 id="features"><a href="#features">Features</a></h3>\n<ul>\n<li>a thing</li>\n</ul>\n<h3 id="fixes"><a href="#fixes">Fixes</a></h3>\n<p>x &lt; y</p>\n',
      },
      { slug: "format", path: "/docs/format/", label: "Format", source: "format.md", title: "format", description: "", html: '<h1 id="format"><a href="#format">format</a></h1>\n<p>Prices in 32nds.</p>\n<pre><code class="language-tsx">formatPrice(99.5)</code></pre>\n', item: registry.items[0] },
    ]
    expect(searchIndex(docs)).toEqual([
      {
        path: "/docs/",
        title: "Introduction",
        label: "Introduction",
        group: "Get Started",
        text: "One line. Two.",
        sections: [
          { id: "it-rides-shadcn", heading: "It rides shadcn", text: "Never copies." },
          { id: "0-1-5", heading: "0.1.5 (date)", text: "" },
          { id: "features", heading: "Features", parent: "0.1.5 (date)", text: "a thing" },
          { id: "fixes", heading: "Fixes", parent: "0.1.5 (date)", text: "x < y" },
        ],
      },
      { path: "/docs/format/", name: "format", title: "format", label: "Format", group: "Utilities", text: "Prices in 32nds. formatPrice(99.5)", sections: [] },
    ])
  })

  it("is written beside the pages, fetched by the script, allowed by the policy, and invalidated by the release", () => {
    const build = readFileSync(resolve(root, "scripts/site/build.ts"), "utf8")
    expect(build).toContain("await writeFile(join(out, SEARCH_INDEX), JSON.stringify(searchIndex(docs)))")
    const script = readFileSync(resolve(root, "site", "site.js"), "utf8")
    expect(script).toContain(`const SEARCH_INDEX = "/${SEARCH_INDEX}"`)
    // Fetched under this tree's base: a release's own tree has an index of its own, and the paths in it are the tree's.
    expect(script).toContain("fetch(BASE + SEARCH_INDEX)")
    expect(script).toContain("href: `${BASE}${page.path}`")
    expect(script).toContain('dialog.querySelector("input")')
    expect(script).toContain("dialog.showModal()")
    // mod+k opens and closes it, with either modifier, so a Mac reader's ⌘K and everyone else's Ctrl+K both work.
    expect(script).toContain('event.key.toLowerCase() !== "k" || !(event.metaKey || event.ctrlKey)')
    const release = readFileSync(resolve(root, ".github/workflows/release-please.yml"), "utf8")
    expect(release).toContain(`"/${SEARCH_INDEX}"`)
  })
})

describe("on this page", () => {
  it("lists the h2s with their h3s nested, or nothing for a page with fewer than two headings", () => {
    const html = [
      '<h2 id="installation"><a href="#installation">Installation</a></h2>',
      '<h2 id="usage"><a href="#usage">Usage</a></h2>',
      '<h2 id="api-reference"><a href="#api-reference">API <code>Reference</code></a></h2>',
      '<h3 id="keys"><a href="#keys">Keys</a></h3>',
      '<h3 id="scopes"><a href="#scopes">Scopes</a></h3>',
      '<h2 id="0-1-5"><a href="https://example.com">0.1.5</a> (date)</h2>',
      '<h3 id="features"><a href="#features">Features</a></h3>',
    ].join("\n")
    expect(toc(html)).toBe(
      [
        "<h2>On this page</h2>",
        "<ul>",
        '<li><a href="#installation">Installation</a></li>',
        '<li><a href="#usage">Usage</a></li>',
        '<li><a href="#api-reference">API <code>Reference</code></a>',
        "<ul>",
        '<li><a href="#keys">Keys</a></li>',
        '<li><a href="#scopes">Scopes</a></li>',
        "</ul>",
        "</li>",
        '<li><a href="#0-1-5">0.1.5 (date)</a>',
        "<ul>",
        '<li><a href="#features">Features</a></li>',
        "</ul>",
        "</li>",
        "</ul>",
      ].join("\n"),
    )
    expect(toc('<h1 id="x">x</h1>\n<h2 id="only"><a href="#only">Only</a></h2>')).toBe("")
  })
})

describe("the docs pages", async () => {
  const tagDocs = await readDocs(resolve(root, "docs"), registry)
  const docSlugs = new Set(tagDocs.map((doc) => doc.slug))
  const values = templateValues(registry, version, registry, docSlugs)
  const changelog = await readChangelog(resolve(root, "CHANGELOG.md"))
  const site = await readSitePages(resolve(root, "site", SITE_DOCS), sitePageValues(registry, values, docSlugs, changelog))
  const docs = siteDocs(site, tagDocs)
  const sources = await readSources(registry, root)
  const pages = docPages(docs, values, template(DOCS_TEMPLATE), undefined, sources)
  const byPath = new Map(pages.map((page) => [page.path, page.html]))
  const at = (path: string) => byPath.get(path) ?? ""
  const items = docs.filter((doc) => doc.item)

  it("renders the site's own pages, then one page per docs/*.md, with no placeholder left", () => {
    expect(site.map((doc) => doc.slug)).toEqual([...START_PAGES])
    expect(byPath.size).toBe(START_PAGES.length + tagDocs.length)
    for (const page of pages) expect(page.html).not.toMatch(/\{\{\w+\}\}/)
    expect(byPath.has("docs/index.html")).toBe(true)
    expect(byPath.has("docs/installation/index.html")).toBe(true)
    expect(byPath.has("docs/components/index.html")).toBe(true)
    expect(byPath.has("docs/theming/index.html")).toBe(true)
    expect(byPath.has("docs/changelog/index.html")).toBe(true)
    expect(byPath.has("docs/contract/index.html")).toBe(true)
    expect(byPath.has("docs/typography/index.html")).toBe(true)
    expect(byPath.has("docs/data-grid/index.html")).toBe(true)
  })

  it("walks the site's pages, then the contract, then the items kind by kind, each kind alphabetical by title", () => {
    const itemSlugs = registry.items.map((item) => item.name).filter((name) => docSlugs.has(name))
    expect(tagDocs.filter((doc) => doc.item).map((doc) => doc.slug)).toEqual(itemSlugs)
    const byGroup = GROUPS.flatMap((group) =>
      registry.items
        .filter((item) => docSlugs.has(item.name) && groupOf(item) === group)
        .sort((a, b) => titleOf(a).localeCompare(titleOf(b), "en"))
        .map((item) => item.name),
    )
    expect(docs.map((doc) => doc.slug)).toEqual([...START_PAGES, "color", "contract", "typography", ...byGroup])
    // The registry lists the utilities first and the rest as they shipped; the pages put the components first, never mix the kinds, and sort each kind by the name the sidebar shows.
    expect(byGroup).not.toEqual(itemSlugs)
    expect(docs.filter((doc) => groupOf(doc.item) === "Components").map((doc) => doc.label).slice(0, 4)).toEqual(["Alerts", "Audit Trail", "Blotter", "Column Chooser"])
    // By title, not by slug: RFQ Stack sits before Rules Editor, and a hook is its exported name, useHotkeys.
    expect(docs.filter((doc) => doc.slug.startsWith("r")).map((doc) => doc.label)).toEqual(["RFQ Stack", "RFQ Ticket", "Rules Editor", "Row Store"])
    expect(docs.find((doc) => doc.slug === "use-hotkeys")?.label).toBe("useHotkeys")
    expect(docs.filter((doc) => groupOf(doc.item) === "Utilities").map((doc) => doc.slug)).toEqual(["alert-store", "format", "grid-rules", "limits", "preferences", "row-store", "session-calendar"])
    expect(docs.filter((doc) => doc.item).map((doc) => groupOf(doc.item))).toEqual([
      ...Array(26).fill("Components"),
      "Hooks",
      "Utilities",
      "Utilities",
      "Utilities",
      "Utilities",
      "Utilities",
      "Utilities",
      "Utilities",
      "Themes",
      "Themes",
      "Themes",
    ])
    expect(docs[0]?.path).toBe("/docs/")
    expect(docs[1]?.path).toBe("/docs/installation/")
  })

  it("groups the sidebar by kind, marks the current page, and links every other page", () => {
    const nav = docsNav(docs, "format")
    expect(nav).toContain('<h2>Get Started</h2>\n<ul>\n<li><a href="/docs/">Introduction</a></li>\n<li><a href="/docs/installation/">Installation</a></li>')
    expect(nav).toContain('<li><a href="/docs/changelog/">Changelog</a></li>\n<li><a href="/docs/color/">Color</a></li>\n<li><a href="/docs/contract/">The item contract</a></li>\n<li><a href="/docs/typography/">Typography</a></li>\n</ul>')
    // A utility is not a component: format sits under Utilities, use-hotkeys under Hooks, the themes under Themes, and only the ui items and the blocks under Components.
    // Each kind is alphabetical by the item's registry title and printed as that title: Data Grid, not data-grid; RFQ Stack before Rules Editor; a hook by its exported name, useHotkeys.
    expect(nav).toContain('<h2><a href="/docs/components/">Components</a></h2>\n<ul>\n<li><a href="/docs/alerts/">Alerts</a></li>\n<li><a href="/docs/audit-trail/">Audit Trail</a></li>\n<li><a href="/docs/blotter/">Blotter</a></li>\n<li><a href="/docs/column-chooser/">Column Chooser</a></li>\n<li><a href="/docs/command-palette/">Command Palette</a></li>\n<li><a href="/docs/countdown/">Countdown</a></li>\n<li><a href="/docs/data-grid/">Data Grid</a></li>\n<li><a href="/docs/depth-ladder/">Depth Ladder</a></li>\n<li><a href="/docs/feed-health/">Feed Health</a></li>\n<li><a href="/docs/flash-cell/">Flash Cell</a></li>\n<li><a href="/docs/hotkey-editor/">Hotkey Editor</a></li>\n<li><a href="/docs/instrument-search/">Instrument Search</a></li>\n<li><a href="/docs/layout-manager/">Layout Manager</a></li>\n<li><a href="/docs/panel/">Panel</a></li>\n<li><a href="/docs/parameter-grid/">Parameter Grid</a></li>\n<li><a href="/docs/perf-monitor/">Perf Monitor</a></li>\n<li><a href="/docs/positions/">Positions</a></li>\n<li><a href="/docs/quote-field/">Quote Field</a></li>\n<li><a href="/docs/rfq-stack/">RFQ Stack</a></li>\n<li><a href="/docs/rfq-ticket/">RFQ Ticket</a></li>\n<li><a href="/docs/rules-editor/">Rules Editor</a></li>\n<li><a href="/docs/sparkline/">Sparkline</a></li>\n<li><a href="/docs/status-bar/">Status Bar</a></li>\n<li><a href="/docs/ticket/">Ticket</a></li>\n<li><a href="/docs/watchlist/">Watchlist</a></li>\n<li><a href="/docs/workspace/">Workspace</a></li>\n</ul>\n<h2>Hooks</h2>\n<ul>\n<li><a href="/docs/use-hotkeys/">useHotkeys</a></li>\n</ul>')
    expect(nav).toContain('<h2>Utilities</h2>\n<ul>\n<li><a href="/docs/alert-store/">Alert Store</a></li>\n<li><a href="/docs/format/" aria-current="page">Format</a></li>\n<li><a href="/docs/grid-rules/">Grid Rules</a></li>\n<li><a href="/docs/limits/">Limits</a></li>\n<li><a href="/docs/preferences/">Preferences</a></li>\n<li><a href="/docs/row-store/">Row Store</a></li>\n<li><a href="/docs/session-calendar/">Session Calendar</a></li>\n</ul>')
    // Amber is the default theme and first by name too; a theme is listed by its title, without the tradecn- prefix.
    expect(nav).toContain('<h2><a href="/docs/theming/#themes">Themes</a></h2>\n<ul>\n<li><a href="/docs/tradecn-amber/">Amber</a></li>\n<li><a href="/docs/tradecn-slate/">Slate</a></li>\n<li><a href="/docs/tradecn-slate-east/">Slate East</a></li>\n</ul>')
    expect(nav).not.toContain("terminal")
    expect(nav.match(/<h2>/g)).toHaveLength(5)
    // A tag without a kind shows no heading for it.
    expect(docsNav(docs.filter((doc) => groupOf(doc.item) !== "Hooks"), null)).not.toContain("Hooks")
    const format = at("docs/format/index.html")
    for (const doc of docs) expect(format).toContain(`href="${doc.path}"`)
    expect(at("docs/index.html")).toContain('<a href="/docs/" aria-current="page">Introduction</a>')
  })

  it("opens its sidebar with the phone menu's part, then the groups in a nav of their own", () => {
    const versions = values.versionPicker ?? ""
    const picker = values.themePicker ?? ""
    const opening = (menu: string) => `<aside class="sidebar" id="${MENU_ID}" aria-label="Docs" tabindex="-1">\n${menu}\n<nav class="docs-nav" aria-label="Pages">\n`
    // An item's page is in the Components section; the Components page is that section's own; the Introduction is the docs' own.
    expect(at("docs/format/index.html")).toContain(opening(siteMenu(versions, picker, "components", false)))
    expect(at("docs/components/index.html")).toContain(opening(siteMenu(versions, picker, "components", true)))
    expect(at("docs/index.html")).toContain(opening(siteMenu(versions, picker, "docs", true)))
    expect(at("docs/installation/index.html")).toContain(opening(siteMenu(versions, picker, "docs", false)))
    expect(at("docs/format/index.html")).toContain(`${docsNav(docs, "format")}\n</nav>\n  </aside>`)
    expect(at("docs/format/index.html").match(/id="site-menu"/g)).toHaveLength(1)
    expect(at("docs/format/index.html").match(/class="version-select"/g)).toHaveLength(2)
  })

  it("puts each page in its header section", () => {
    expect(at("docs/index.html")).toContain('<a href="/docs/" aria-current="page">Docs</a>')
    // The docs pages carry the theme menu the opening page does, left of the mode button.
    expect(at("docs/index.html")).toContain(`${themePicker(siteThemes(registry))}${MODE_BUTTON}</nav>`)
    expect(at("docs/installation/index.html")).toContain('<a href="/docs/" aria-current="true">Docs</a>')
    expect(at("docs/components/index.html")).toContain('<a href="/docs/components/" aria-current="page">Components</a>')
    expect(at("docs/format/index.html")).toContain('<a href="/docs/components/" aria-current="true">Components</a>')
    expect(at("docs/changelog/index.html")).toContain('<a href="/docs/changelog/" aria-current="page">Changelog</a>')
  })

  it("gives every page its headings down the right and the arrows beside its title", () => {
    const grid = at("docs/data-grid/index.html")
    expect(grid).toContain('<aside class="toc" aria-label="On this page">\n<h2>On this page</h2>\n<ul>\n<li><a href="#installation">Installation</a></li>\n<li><a href="#usage">Usage</a></li>\n<li><a href="#api-reference">API Reference</a>\n<ul>')
    expect(grid).toContain('<nav class="arrows" aria-label="Previous and next">\n<a rel="prev" href="/docs/countdown/" aria-label="Previous: Countdown">')
    expect(grid).toContain('<a rel="next" href="/docs/depth-ladder/" aria-label="Next: Depth Ladder">')
    expect(grid.indexOf('<nav class="arrows"')).toBeLessThan(grid.indexOf("<h1 "))
    const intro = at("docs/index.html")
    expect(intro).toContain('<nav class="arrows" aria-label="Previous and next">\n<span aria-hidden="true">')
    expect(intro).toContain('<li><a href="#it-rides-shadcn">It rides shadcn</a></li>')
  })

  it("opens the docs with an Introduction from the README's lines, its dependencies from the registry", () => {
    const intro = at("docs/index.html")
    expect(intro).toContain('<h1 id="introduction"><a href="#introduction">Introduction</a></h1>')
    expect(intro).toContain("<p>Trading-terminal components you install with <code>shadcn add</code>. The source lands in your repo and it&#39;s yours.</p>")
    expect(intro).toContain('<h2 id="it-rides-shadcn">')
    expect(intro).toContain('<a href="/docs/contract/">the item contract</a>')
    expect(intro).toContain(`${tag} is the latest, and <a href="/docs/installation/">Installation</a> has both forms`)
    expect(intro).toContain('<table class="dependencies">')
    expect(intro).toContain('<tr><td><code>dockview-react</code></td><td><a href="/docs/workspace/"><code>workspace</code></a></td></tr>')
    expect(intro).toMatch(/<tr><td><code>@tanstack\/react-virtual<\/code><\/td><td><a href="\/docs\/data-grid\/"><code>data-grid<\/code><\/a>, /)
    expect(intro).not.toContain("<iframe")
    expect(intro).not.toContain('id="installation"')
    expect(intro).toContain('<a rel="next" href="/docs/installation/">Installation →</a>')
  })

  it("shows both install forms on the Installation page under pnpm, npm, yarn, and bun, with the CLI's {name} placeholder intact", () => {
    const install = at("docs/installation/index.html")
    for (const run of ["npx", "pnpm dlx", "yarn dlx", "bunx --bun"]) {
      expect(install).toContain(`${run} shadcn@latest add tradecn/ui/data-grid#${tag}`)
      expect(install).toContain(`${run} shadcn@latest add @tradecn/data-grid`)
      expect(install).toContain(`${run} shadcn@latest add tradecn/ui/data-grid#${tag} --diff`)
      expect(install).toContain(`${run} shadcn@latest add @tradecn/format @tradecn/row-store `)
    }
    expect(install).toContain(`&quot;@tradecn&quot;: &quot;https://tradecn.dev/r/{name}.json&quot;`)
    expect(install).toContain(`https://tradecn.dev/r/${tag}/{name}.json`)
    // The GitHub form, the namespace add, the two update commands, and every item at once; the JSON block gets a button and no tabs.
    expect(install.match(/<div class="code command">/g)).toHaveLength(4)
    expect(install.match(/class="copy"/g)).toHaveLength(5)
    expect(install).toContain(`@tradecn/${registry.items.at(-1)?.name}\n</code>`)
  })

  it("indexes the components on the Components page as a list of titles linking their pages, and nothing of another kind", () => {
    const components = at("docs/components/index.html")
    expect(components).toContain('<h1 id="components">')
    // The list alone: the sidebar links the same pages with the same markup, so the page as a whole proves nothing.
    const start = components.indexOf('<ul class="item-list">')
    expect(start).toBeGreaterThan(components.indexOf("<article"))
    const list = components.slice(start, components.indexOf("</ul>", start))
    for (const item of registry.items) {
      const link = `<li><a href="/docs/${item.name}/">${titleOf(item)}</a></li>`
      if (groupOf(item) === "Components") expect(list).toContain(link)
      else expect(list, item.name).not.toContain(link)
    }
    // Names alone, shadcn's page: no kind, no description, no code, nothing but the title in each row.
    const rows = list.trimEnd().split("\n").slice(1)
    expect(rows).toHaveLength(26)
    for (const row of rows) expect(row).toMatch(/^<li><a href="\/docs\/[\w-]+\/">[^<]+<\/a><\/li>$/)
    expect(list).toContain('<li><a href="/docs/rfq-stack/">RFQ Stack</a></li>')
    expect(list).toContain('<li><a href="/docs/ticket/">Ticket</a></li>')
    // Alphabetical by title, as the sidebar is: alerts, audit-trail, blotter lead, not flash-cell.
    const order = [...list.matchAll(/<li><a href="\/docs\/([^/]+)\/"/g)].map((match) => match[1])
    expect(order.slice(0, 3)).toEqual(["alerts", "audit-trail", "blotter"])
    expect(order).toEqual(componentItems(registry).map((item) => item.name))
    expect(components).not.toContain('class="card"')
    expect(components).not.toContain("<iframe")
  })

  it("tables every token the items add on the Theming page, with a swatch, and lists the themes", () => {
    const theming = at("docs/theming/index.html")
    expect(theming).toContain('<table class="tokens">')
    expect(theming).toContain("<thead><tr><th>Token</th><th>Light, then dark</th><th>Added by</th></tr></thead>")
    const up = registry.items.find((item) => item.name === "flash-cell")?.cssVars
    // Light over dark in one cell, three columns in all, so a laptop shows the table without scrolling it.
    expect(theming).toContain(`<tr><td><code>--up</code></td><td class="value"><span class="swatch" style="background: ${up?.light?.up}"></span><code>${up?.light?.up}</code><br><span class="swatch" style="background: ${up?.dark?.up}"></span><code>${up?.dark?.up}</code></td><td><a href="/docs/flash-cell/"><code>flash-cell</code></a>, `)
    // A token whose two values agree shows one line.
    expect(theming).toContain('<td class="value"><span class="swatch" style="background: var(--muted-foreground)"></span><code>var(--color-muted-foreground)</code></td>')
    // In a wrapper that scrolls sideways, so a narrow window never scrolls the page itself.
    expect(theming).toContain('<div class="table"><table class="tokens">')
    expect(at("docs/index.html")).toContain('<div class="table"><table class="dependencies">')
    // A shadcn variable paints through the page's own palette.
    expect(theming).toContain('<span class="swatch" style="background: var(--muted-foreground)"></span><code>var(--color-muted-foreground)</code>')
    expect(theming).toContain("<code>--link-1</code>")
    // A typography token is listed with the items that add it and no swatch, since a font stack paints nothing.
    expect(theming).toMatch(/<tr><td><code>--tradecn-font-mono<\/code><\/td><td class="value"><code class="stack">&#39;JetBrains Mono&#39;, ui-monospace/)
    expect(theming).not.toMatch(/<span class="swatch" style="background: &#39;/)
    // The numeric variant is a theme's token alone: the items set the figures with utilities, so no item adds it.
    expect(theming).not.toContain("<code>--tradecn-numeric-variant</code>")
    expect(theming).toContain("<code>--panel-active</code>")
    expect(theming).not.toContain("<code>--sidebar</code>")
    expect(theming).toContain('<li><a href="/docs/tradecn-slate/"><code>tradecn-slate</code></a> ')
    expect(theming).toContain('<li><a href="/docs/tradecn-slate-east/"><code>tradecn-slate-east</code></a> ')
    expect(theming).toContain('<li><a href="/docs/tradecn-amber/"><code>tradecn-amber</code></a> ')
  })

  it("renders the tag's CHANGELOG.md on the Changelog page, each version a heading, without the seed heading at the end", () => {
    const page = at("docs/changelog/index.html")
    expect(page).toContain('<h1 id="changelog"><a href="#changelog">Changelog</a></h1>')
    expect(page).toContain(`<h2 id="${version.replace(/\./g, "-")}-`)
    // A version with a compare link keeps that link; the first release has none and gets the usual anchor.
    expect(page).toMatch(/<h2 id="0-1-1-[\d-]+"><a href="https:\/\/github\.com\/tradecn\/ui\/compare\/[^"]+">0\.1\.1<\/a> \([\d-]+\)<\/h2>/)
    expect(page).toMatch(/<h2 id="0-1-0-([\d-]+)"><a href="#0-1-0-\1">0\.1\.0 \([\d-]+\)<\/a><\/h2>/)
    expect(page).not.toContain('<h2 id="changelog">')
    expect(page).toContain(`<p class="foot">This page is <code>CHANGELOG.md</code> at <a href="https://github.com/tradecn/ui/blob/${tag}/CHANGELOG.md">${tag}</a>.</p>`)
    expect(changelog.startsWith("## [")).toBe(true)
    expect(changelog.endsWith("## Changelog")).toBe(false)
  })

  it("says a tag has no changelog instead of failing its pages", async () => {
    expect(await readChangelog(join(tmpdir(), "no-such-CHANGELOG.md"))).toBe("There is no changelog at this tag.")
    const dir = mkdtempSync(join(tmpdir(), "tradecn-changelog-"))
    writeFileSync(join(dir, "CHANGELOG.md"), "# Changelog\n")
    expect(await readChangelog(join(dir, "CHANGELOG.md"))).toBe("There is no changelog at this tag.")
  })

  it("gives the site's own pages no foot, and the tag's docs the file they came from", () => {
    expect(at("docs/index.html")).not.toContain('<p class="foot">')
    expect(at("docs/installation/index.html")).not.toContain('<p class="foot">')
    expect(at("docs/format/index.html")).toContain(`<p class="foot">This page is <code>docs/format.md</code> at <a href="https://github.com/tradecn/ui/blob/${tag}/docs/format.md">${tag}</a>.</p>`)
    expect(at("docs/contract/index.html")).toContain("<code>docs/contract.md</code>")
  })

  it("heads an item's page by the name its implementation goes by: a component's export, a hook's, a utility's or a theme's own name", () => {
    const heading = (name: string) => headingOf(registry.items.find((item) => item.name === name)!)
    expect(heading("data-grid")).toBe("DataGrid")
    expect(heading("rfq-ticket")).toBe("RfqTicket")
    expect(heading("use-hotkeys")).toBe("useHotkeys")
    expect(heading("row-store")).toBe("row-store")
    expect(heading("tradecn-amber")).toBe("tradecn-amber")
    // The heading is a real export: every component, block, and hook lists it among the exports its meta names.
    for (const item of registry.items.filter((item) => item.type !== "registry:lib" && item.type !== "registry:theme")) {
      expect(item.meta?.components?.map((component) => component.title), item.name).toContain(headingOf(item))
    }
    // The sidebar keeps the registry title (`Data Grid`); the page's own title is the heading (`DataGrid`).
    expect(items.find((doc) => doc.slug === "data-grid")?.label).toBe("Data Grid")
    expect(items.find((doc) => doc.slug === "data-grid")?.title).toBe("DataGrid")
    expect(items.find((doc) => doc.slug === "use-hotkeys")?.title).toBe("useHotkeys")
    expect(items.find((doc) => doc.slug === "format")?.title).toBe("format")
  })

  it("keeps every item doc in the page's shape: the title, one paragraph, then Usage first and API Reference last", () => {
    for (const doc of items) {
      const markdown = readFileSync(resolve(root, "docs", doc.source), "utf8")
      const [intro = "", ...sections] = markdown.split(/^## /m)
      const paragraphs = intro.split(/\n{2,}/).map((text) => text.trim()).filter(Boolean)
      expect(paragraphs, `${doc.source}: the title and one paragraph before the first section`).toHaveLength(2)
      expect(paragraphs[0], `${doc.source}: headed by the name its implementation goes by`).toBe(`# ${headingOf(doc.item!)}`)
      expect(paragraphs[1], `${doc.source}: the install is the builder's`).not.toMatch(/shadcn add|npx /)
      const headings = sections.map((section) => section.split("\n")[0]?.trim())
      expect(headings[0], doc.source).toBe("Usage")
      expect(headings.at(-1), doc.source).toBe("API Reference")
      expect(headings, doc.source).not.toContain("Installation")
    }
  })

  it("puts Installation after the opening paragraph and before Usage, with Command and Manual tabs", () => {
    const grid = at("docs/data-grid/index.html")
    const installation = grid.indexOf('<h2 id="installation"><a href="#installation">Installation</a></h2>')
    expect(installation).toBeGreaterThan(grid.indexOf("</h1>"))
    expect(installation).toBeLessThan(grid.indexOf('<h2 id="usage">'))
    expect(grid).toContain('<div class="tabs" data-tabs>')
    expect(grid).toContain('role="tab" id="installation-tab-command" aria-selected="true" aria-controls="installation-command"')
    expect(grid).toContain('<div id="installation-manual" role="tabpanel" aria-labelledby="installation-tab-manual" hidden>')
    for (const run of ["npx", "pnpm dlx", "yarn dlx", "bunx --bun"]) expect(grid).toContain(`${run} shadcn@latest add tradecn/ui/data-grid#${tag}`)
    expect(grid).not.toContain("@tradecn/data-grid")
  })

  it("spells the install out under Manual: packages, built-ins, every file at its path with a consumer's imports, and the CSS", () => {
    const grid = at("docs/data-grid/index.html")
    expect(grid).toContain("<p>Install the dependencies:</p>")
    for (const add of ["npm install", "pnpm add", "yarn add", "bun add"]) expect(grid).toContain(`${add} cn @tanstack/react-virtual`)
    expect(grid).toContain("<p>Add the shadcn components it composes:</p>")
    expect(grid).toContain("pnpm dlx shadcn@latest add checkbox context-menu dropdown-menu")
    expect(grid).toContain("<p>Copy the files into your project:</p>")
    for (const path of ["components/ui/data-grid.tsx", "hooks/use-flash.ts", "hooks/use-row-store.ts", "lib/row-store.ts", "lib/format.ts"]) {
      expect(grid).toContain(`<p class="file"><code>${path}</code></p>`)
    }
    expect(grid).toContain('<code class="language-tsx">')
    expect(grid).toContain("@/hooks/use-row-store")
    expect(grid).not.toContain("@/registry/")
    expect(grid).toContain("<p>Add the tokens to your stylesheet:</p>")
    expect(grid).toMatch(/<code class="language-css">:root \{\n {2}--(up|down|flat)/)
    expect(grid).toContain("  --up: ")
    const ticket = at("docs/ticket/index.html")
    expect(ticket).toContain('<p class="file"><code>components/ticket.tsx</code></p>')
    const workspace = at("docs/workspace/index.html")
    expect(workspace).toContain("<p>Append this to your stylesheet:</p>")
    expect(workspace).toContain("@layer components {\n  .dockview-theme-tradecn {\n    --dv-")
    const format = at("docs/format/index.html")
    expect(format).not.toContain("Install the dependencies")
    expect(format).not.toContain("Add the shadcn components")
    expect(format).toContain('<p class="file"><code>lib/format.ts</code></p>')
    const theme = at("docs/tradecn-slate/index.html")
    expect(theme).toContain("<p>Replace the variables in your stylesheet with these:</p>")
    expect(theme).toContain(":root {\n  --accent:")
    expect(theme).toContain(".dark {\n  --accent:")
    expect(theme).not.toContain("Copy the files")
    const contract = at("docs/contract/index.html")
    expect(contract).not.toContain('id="installation"')
    expect(contract).not.toContain("shadcn@latest add tradecn/ui/")
  })

  it("names the shadcn components an item is built on and links the pages before and after", () => {
    const grid = at("docs/data-grid/index.html")
    expect(grid).toContain(
      `<p class="built-on">Built on shadcn's <a href="https://ui.shadcn.com/docs/components/checkbox"><code>checkbox</code></a>, <a href="https://ui.shadcn.com/docs/components/context-menu"><code>context-menu</code></a>, and <a href="https://ui.shadcn.com/docs/components/dropdown-menu"><code>dropdown-menu</code></a>.</p>`,
    )
    expect(at("docs/panel/index.html")).toContain(`<p class="built-on">Built on shadcn's <a href="https://ui.shadcn.com/docs/components/input"><code>input</code></a>.</p>`)
    expect(at("docs/format/index.html")).not.toContain('<p class="built-on">')
    expect(at("docs/index.html")).toContain(`<nav class="pager" aria-label="Previous and next">\n<span></span>\n<a rel="next" href="/docs/installation/">Installation →</a>`)
    const last = docs.at(-1)!
    expect(at(`docs/${last.slug}/index.html`)).toContain(`<a rel="prev" href="${docs.at(-2)!.path}">← ${docs.at(-2)!.label}</a>\n<span></span>`)
    expect(at("docs/color/index.html")).toContain(`<a rel="prev" href="/docs/changelog/">← Changelog</a>`)
    expect(at("docs/contract/index.html")).toContain(`<a rel="prev" href="/docs/color/">← Color</a>`)
    expect(at("docs/contract/index.html")).toContain(`<a rel="next" href="/docs/typography/">Typography →</a>`)
    expect(at("docs/typography/index.html")).toContain(`<a rel="next" href="/docs/${items[0]!.slug}/">${items[0]!.label} →</a>`)
    expect(at("docs/typography/index.html")).toContain(`<a rel="next" href="/docs/alerts/">Alerts →</a>`)
  })

  it("refuses a doc with its own Installation heading, an item whose files the checkout lacks, and a site page with a placeholder the builder does not set", async () => {
    const doc: Doc = { ...items[0]!, html: '<h1 id="x">x</h1>\n<h2 id="installation"><a href="#installation">Installation</a></h2>\n' }
    expect(() => docPages([doc], values, template(DOCS_TEMPLATE), undefined, sources)).toThrow(/Installation heading/)
    expect(() => installationSection(registry.items[0]!, "v1.0.0", new Map())).toThrow(/checkout does not have/)
    await expect(readSitePages(resolve(root, "site", SITE_DOCS), values)).rejects.toThrow(/does not set/)
  })

  it("gives every code block on every page a copy button", () => {
    for (const page of pages) {
      // A plain <pre> is wrapped; an install block's four panels carry data-pm and share one button.
      expect(page.html).not.toMatch(/(?<!<div class="code">)<pre>/)
      expect(page.html.match(/<pre id="pm-/g)?.length ?? 0).toBe((page.html.match(/<div class="code command">/g)?.length ?? 0) * 4)
    }
  })

  it("indexes every page for the search, with the doc's own headings and none the builder adds", () => {
    const index = searchIndex(docs)
    expect(index.map((page) => page.path)).toEqual(docs.map((doc) => doc.path))
    expect(index.map((page) => page.group)).toEqual(docs.map((doc) => groupOf(doc.item)))
    expect(index.find((page) => page.path === "/docs/use-hotkeys/")?.group).toBe("Hooks")
    expect(index.find((page) => page.path === "/docs/row-store/")?.group).toBe("Utilities")
    expect(index.find((page) => page.path === "/docs/tradecn-slate/")?.group).toBe("Themes")
    expect(index.find((page) => page.path === "/docs/ticket/")?.group).toBe("Components")
    const intro = index.find((page) => page.path === "/docs/")!
    expect(intro.title).toBe("Introduction")
    expect(intro.text).toMatch(/^Trading-terminal components you install with shadcn add\. The source lands in your repo and it's yours\./)
    expect(intro.sections.map((section) => section.id)).toEqual(["it-rides-shadcn", "no-npm-package", "dependencies"])
    const palette = index.find((page) => page.path === "/docs/command-palette/")!
    expect(palette.sections).toContainEqual(expect.objectContaining({ id: "recents", heading: "Recents", parent: "API Reference" }))
    expect(palette.sections.find((section) => section.id === "usage")?.parent).toBeUndefined()
    const format = index.find((page) => page.path === "/docs/format/")!
    expect(format.sections.find((section) => section.id === "prices")?.text).toContain("32nds")
    const changelog = index.find((page) => page.path === "/docs/changelog/")!
    expect(changelog.sections[0]?.heading).toMatch(/^\d+\.\d+\.\d+ \(\d{4}-\d{2}-\d{2}\)$/)
    for (const page of index) {
      // The doc's text, not the page's: no Installation, no file source, no markup, no entity left encoded.
      expect(page.sections.map((section) => section.id)).not.toContain("installation")
      for (const text of [page.title, page.text, ...page.sections.flatMap((section) => [section.heading, section.text])]) {
        // Decoded code stays (`</FlashCell>`, `var(--color-<token>)`); the tags the renderer writes do not.
        expect(text).not.toMatch(/<\/?(p|a|code|pre|h[1-6]|li|ul|ol|table|thead|tbody|tr|td|th|span|div|em|strong|br)(\s[^>]*)?>/)
        expect(text).not.toMatch(/&(lt|gt|amp|quot|#\d+|#x[0-9a-f]+);/)
        expect(text).not.toContain("Copy the files into your project")
      }
    }
    // Fetched once when the search opens. Twenty-one pages were 97 KB; wave 5 crossed 200 KB at 29 items, so the guard is against a runaway, not a budget.
    expect(JSON.stringify(index).length).toBeLessThan(400_000)
  })
})
