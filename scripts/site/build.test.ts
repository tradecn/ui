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
  docsNav,
  escapeHtml,
  groupOf,
  GROUPS,
  FAVICON,
  firstParagraph,
  FONT_PACKAGES,
  FONT_WEIGHTS,
  fontFiles,
  FONTS_PATH,
  FONTS_STYLES,
  GITHUB_LINK,
  installationSection,
  MODE_BUTTON,
  PAGES,
  readChangelog,
  readDemos,
  readDocs,
  readEmbed,
  readSitePages,
  readSources,
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
  siteDocs,
  siteHeader,
  sitePageValues,
  siteThemes,
  START_PAGES,
  tables,
  templateValues,
  textOf,
  THEME_ITEM,
  themePalettes,
  themePicker,
  THEMES_META,
  themesMeta,
  toc,
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

  it("wears the header every page shares, with the sections, the search, the links out, the theme menu, and the mode button last", () => {
    expect(page).toContain('<header class="site-header">')
    expect(page).toContain('<a href="/docs/">Docs</a><a href="/docs/components/">Components</a><a href="/docs/changelog/">Changelog</a>')
    expect(page).toContain(`${SEARCH_BUTTON}${GITHUB_LINK}<a href="/r/registry.json">registry.json</a>`)
    expect(page).toContain(`<span class="tag">${tag}</span>${themePicker(siteThemes(registry))}${MODE_BUTTON}</nav>`)
    // The repository link is GitHub's mark alone, named for a screen reader; the word is no longer in the header.
    expect(GITHUB_LINK).toMatch(/^<a class="github" href="https:\/\/github\.com\/tradecn\/ui" aria-label="GitHub"><svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M6\.766 11\.328c[^"]+"\/><\/svg><\/a>$/)
    expect(page).not.toContain(">GitHub</a>")
    expect(MODE_BUTTON).toContain('<button type="button" class="mode-toggle" aria-label="Toggle theme">')
    expect(page.match(/class="mode-toggle"/g)).toHaveLength(1)
    expect(page).toContain('<link rel="stylesheet" href="/site.css">')
    expect(siteHeader(tag, "components")).toContain('<a href="/docs/components/" aria-current="true">Components</a>')
    expect(siteHeader(tag, "docs", true)).toContain('<a href="/docs/" aria-current="page">Docs</a>')
    expect(siteHeader(tag)).not.toContain("aria-current")
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

  it("shows every item as a card, linking its doc on GitHub when the tag ships no page for it", () => {
    expect(page).toContain('<div class="cards">')
    for (const item of registry.items) {
      expect(page).toContain(`<code>${item.name}</code>`)
      expect(page).toContain(`https://github.com/tradecn/ui/blob/${tag}/docs/${item.name}.md`)
    }
    expect(page).toContain(`<span class="card-title"><code>format</code><span class="kind">lib</span></span>`)
    expect(page).not.toContain("<iframe")
  })

  it("links the item's own page when the tag ships a doc for it", () => {
    const withDocs = renderPage(template("index.html"), templateValues(registry, version, registry, new Set(["format"])))
    expect(withDocs).toContain(`<a class="card" href="/docs/format/">`)
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
    expect(live).not.toContain('<div class="cards">')
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
    expect(page.match(/class="theme-select"/g)).toHaveLength(1)
    // The menu shows a theme's title, or its name without one, escaped either way.
    expect(themePicker([{ name: "x<y", type: "registry:theme" }])).toContain('<option value="x&lt;y" selected>x&lt;y</option>')
    expect(themePicker([])).toBe("")
    // A header built without one has none; a docs page passes the one the template values carry.
    expect(siteHeader(tag)).not.toContain("theme-select")
    expect(siteHeader(tag, "docs", true, picker)).toContain(`<span class="tag">${tag}</span>${picker}${MODE_BUTTON}</nav>`)
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
    expect(values.showcase).toContain("<code>format</code>")
    expect(values.showcase).not.toContain(`<code>${THEME_ITEM}</code>`)
    expect(values.palette).toContain("--primary:")
    expect(() => templateValues(early, "0.1.0")).toThrow(THEME_ITEM)
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
      { slug: "format", path: "/docs/format/", label: "format", source: "format.md", title: "format", description: "", html: '<h1 id="format"><a href="#format">format</a></h1>\n<p>Prices in 32nds.</p>\n<pre><code class="language-tsx">formatPrice(99.5)</code></pre>\n', item: registry.items[0] },
    ]
    expect(searchIndex(docs)).toEqual([
      {
        path: "/docs/",
        title: "Introduction",
        group: "Get Started",
        text: "One line. Two.",
        sections: [
          { id: "it-rides-shadcn", heading: "It rides shadcn", text: "Never copies." },
          { id: "0-1-5", heading: "0.1.5 (date)", text: "" },
          { id: "features", heading: "Features", parent: "0.1.5 (date)", text: "a thing" },
          { id: "fixes", heading: "Fixes", parent: "0.1.5 (date)", text: "x < y" },
        ],
      },
      { path: "/docs/format/", title: "format", group: "Utilities", text: "Prices in 32nds. formatPrice(99.5)", sections: [] },
    ])
  })

  it("is written beside the pages, fetched by the script, allowed by the policy, and invalidated by the release", () => {
    const build = readFileSync(resolve(root, "scripts/site/build.ts"), "utf8")
    expect(build).toContain("await writeFile(join(out, SEARCH_INDEX), JSON.stringify(searchIndex(docs)))")
    const script = readFileSync(resolve(root, "site", "site.js"), "utf8")
    expect(script).toContain(`const SEARCH_INDEX = "/${SEARCH_INDEX}"`)
    expect(script).toContain("fetch(SEARCH_INDEX)")
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

  it("walks the site's pages, then the contract, then the items kind by kind, each kind in registry order", () => {
    const itemSlugs = registry.items.map((item) => item.name).filter((name) => docSlugs.has(name))
    expect(tagDocs.filter((doc) => doc.item).map((doc) => doc.slug)).toEqual(itemSlugs)
    const byGroup = GROUPS.flatMap((group) => registry.items.filter((item) => docSlugs.has(item.name) && groupOf(item) === group).map((item) => item.name))
    expect(docs.map((doc) => doc.slug)).toEqual([...START_PAGES, "color", "contract", "typography", ...byGroup])
    // The registry lists the utilities first; the pages put the components first and never mix the kinds.
    expect(byGroup).not.toEqual(itemSlugs)
    expect(docs.filter((doc) => doc.item).map((doc) => groupOf(doc.item))).toEqual([
      ...Array(16).fill("Components"),
      "Hooks",
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
    // A utility is not a component: format sits under Utilities, use-hotkeys under Hooks, the themes under Themes, and only the ui items and the block under Components.
    expect(nav).toContain('<h2><a href="/docs/components/">Components</a></h2>\n<ul>\n<li><a href="/docs/flash-cell/">flash-cell</a></li>')
    expect(nav).toContain('<li><a href="/docs/workspace/">workspace</a></li>\n<li><a href="/docs/ticket/">ticket</a></li>\n<li><a href="/docs/countdown/">countdown</a></li>\n<li><a href="/docs/quote-field/">quote-field</a></li>\n<li><a href="/docs/rfq-ticket/">rfq-ticket</a></li>\n<li><a href="/docs/rfq-stack/">rfq-stack</a></li>\n<li><a href="/docs/perf-monitor/">perf-monitor</a></li>\n<li><a href="/docs/hotkey-editor/">hotkey-editor</a></li>\n</ul>\n<h2>Hooks</h2>\n<ul>\n<li><a href="/docs/use-hotkeys/">use-hotkeys</a></li>\n</ul>')
    expect(nav).toContain('<h2>Utilities</h2>\n<ul>\n<li><a href="/docs/format/" aria-current="page">format</a></li>\n<li><a href="/docs/row-store/">row-store</a></li>\n<li><a href="/docs/grid-rules/">grid-rules</a></li>\n</ul>')
    // Amber is the default theme, so it leads the group; the registry order is the sidebar's.
    expect(nav).toContain('<h2><a href="/docs/theming/#themes">Themes</a></h2>\n<ul>\n<li><a href="/docs/tradecn-amber/">tradecn-amber</a></li>\n<li><a href="/docs/tradecn-slate/">tradecn-slate</a></li>\n<li><a href="/docs/tradecn-slate-east/">tradecn-slate-east</a></li>\n</ul>')
    expect(nav).not.toContain("terminal")
    expect(nav.match(/<h2>/g)).toHaveLength(5)
    // A tag without a kind shows no heading for it.
    expect(docsNav(docs.filter((doc) => groupOf(doc.item) !== "Hooks"), null)).not.toContain("Hooks")
    const format = at("docs/format/index.html")
    for (const doc of docs) expect(format).toContain(`href="${doc.path}"`)
    expect(at("docs/index.html")).toContain('<a href="/docs/" aria-current="page">Introduction</a>')
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
    expect(grid).toContain('<nav class="arrows" aria-label="Previous and next">\n<a rel="prev" href="/docs/flash-cell/" aria-label="Previous: flash-cell">')
    expect(grid).toContain('<a rel="next" href="/docs/feed-health/" aria-label="Next: feed-health">')
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

  it("indexes the components on the Components page as cards linking their pages, and nothing of another kind", () => {
    const components = at("docs/components/index.html")
    expect(components).toContain('<h1 id="components">')
    expect(components).toContain('<div class="cards">')
    for (const item of registry.items) {
      const card = `<a class="card" href="/docs/${item.name}/"><span class="card-title"><code>${item.name}</code><span class="kind">${item.type.replace("registry:", "")}</span></span>`
      if (groupOf(item) === "Components") expect(components).toContain(card)
      else expect(components, item.name).not.toContain(card)
    }
    expect(components.match(/<a class="card"/g)).toHaveLength(16)
    expect(components).toContain('<span class="kind">block</span>')
    expect(components).not.toContain('<span class="kind">lib</span>')
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

  it("keeps every item doc in the page's shape: the title, one sentence, then Usage first and API Reference last", () => {
    for (const doc of items) {
      const markdown = readFileSync(resolve(root, "docs", doc.source), "utf8")
      const [intro = "", ...sections] = markdown.split(/^## /m)
      const paragraphs = intro.split(/\n{2,}/).map((text) => text.trim()).filter(Boolean)
      expect(paragraphs, `${doc.source}: the title and one paragraph before the first section`).toHaveLength(2)
      expect(paragraphs[1], `${doc.source}: one sentence`).toMatch(/^[^.!?]+[.!?]$/)
      expect(paragraphs[1], `${doc.source}: the install is the builder's`).not.toMatch(/shadcn add|npx /)
      const headings = sections.map((section) => section.split("\n")[0]?.trim())
      expect(headings[0], doc.source).toBe("Usage")
      expect(headings.at(-1), doc.source).toBe("API Reference")
      expect(headings, doc.source).not.toContain("Installation")
    }
  })

  it("puts Installation after the one sentence and before Usage, with Command and Manual tabs", () => {
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
    expect(at(`docs/${last.slug}/index.html`)).toContain(`<a rel="prev" href="${docs.at(-2)!.path}">← ${docs.at(-2)!.slug}</a>\n<span></span>`)
    expect(at("docs/color/index.html")).toContain(`<a rel="prev" href="/docs/changelog/">← Changelog</a>`)
    expect(at("docs/contract/index.html")).toContain(`<a rel="prev" href="/docs/color/">← Color</a>`)
    expect(at("docs/contract/index.html")).toContain(`<a rel="next" href="/docs/typography/">Typography →</a>`)
    expect(at("docs/typography/index.html")).toContain(`<a rel="next" href="/docs/${items[0]!.slug}/">${items[0]!.slug} →</a>`)
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
    expect(JSON.stringify(index).length).toBeLessThan(200_000)
  })
})
