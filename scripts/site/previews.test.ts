import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { describe, expect, it } from "vitest"
import {
  consumerImports,
  DESK_DEMO,
  DOCS_TEMPLATE,
  docPages,
  framedDemos,
  framedIn,
  fullPalette,
  PREVIEW_TEMPLATE,
  previewBlock,
  previewPages,
  previewThemePalettes,
  readDemos,
  readDocs,
  readEmbed,
  readFrame,
  FRAME_FILE,
  readSitePages,
  readSources,
  SITE_DOCS,
  SITE_STYLES,
  siteDocs,
  sitePageValues,
  siteThemes,
  templateValues,
  THEME_ITEM,
  themeCss,
  THEMES_META,
  themesMeta,
  withDemos,
  withPreview,
} from "./build"
import type { Doc, Previews, Registry } from "./build"

const root = resolve(import.meta.dirname, "../..")
const registry = JSON.parse(readFileSync(resolve(root, "registry.json"), "utf8")) as Registry
const version = readFileSync(resolve(root, "version.txt"), "utf8").trim()
const template = (page: string) => readFileSync(resolve(root, "site", page), "utf8")

/** A stand-in for playground/dist/embed: a Vite manifest with one entry and its stylesheet. */
function fakeEmbed(): string {
  const dir = mkdtempSync(join(tmpdir(), "tradecn-embed-"))
  mkdirSync(join(dir, ".vite"))
  writeFileSync(
    join(dir, ".vite", "manifest.json"),
    JSON.stringify({
      "_chunk-abc.js": { file: "assets/chunk-abc.js", name: "chunk" },
      "src/embed.tsx": { file: "assets/embed-abc.js", name: "embed", src: "src/embed.tsx", isEntry: true, css: ["assets/embed-def.css"] },
      "src/demos/format.tsx": { file: "assets/format-ghi.js", src: "src/demos/format.tsx", isDynamicEntry: true },
    }),
  )
  return dir
}

describe("the demo source shown under Code", () => {
  it("opts table previews into shared alignment without adding controls to copied source", async () => {
    const dir = resolve(root, "playground/src/demos")
    const { alignable } = JSON.parse(readFileSync(join(dir, FRAME_FILE), "utf8")) as { alignable: string[] }
    const demos = await readDemos(dir)
    expect(alignable).toEqual([
      "data-grid",
      "data-grid-controlled",
      "data-grid-selection",
      "data-grid-totals",
      "data-grid-updates",
      "quote-panel",
      "quote-panel-pending",
      "quote-panel-actions",
      "quote-panel-limits",
      "rfq-stack",
      "rfq-stack-threshold",
      "rfq-stack-parking",
      "rfq-stack-updates",
      "row-store",
      "row-store-deltas",
      "row-store-batching",
      "row-store-views",
      "depth-ladder",
      "depth-ladder-updates",
      "depth-ladder-following",
      "spread-matrix",
      "spread-matrix-yields",
      "spread-matrix-structures",
      "spread-matrix-updates",
      "watchlist",
      "watchlist-prices",
      "watchlist-trends",
      "positions",
      "positions-formats",
      "positions-books",
      "positions-updates",
      "price-chart",
      "price-chart-candles",
      "price-chart-overlays",
      "price-chart-ticks",
    ])
    for (const name of alignable) {
      expect(demos.has(name), name).toBe(true)
      expect(demos.get(name)!.code).not.toMatch(/PreviewAlignment|preview-alignment|data-preview-align/)
    }
  })

  it("rewrites the playground's registry imports into the ones shadcn add writes", () => {
    const source = [
      'import { useState } from "react"',
      'import { Button } from "@/components/ui/button"',
      'import { FlashCell } from "@/registry/tradecn/ui/flash-cell"',
      'import { useFlash } from "@/registry/tradecn/hooks/use-flash"',
      'import { formatPrice } from "@/registry/tradecn/lib/format"',
      'import { Ticket } from "@/registry/tradecn/blocks/ticket/ticket"',
    ].join("\n")
    expect(consumerImports(source).split("\n")).toEqual([
      'import { useState } from "react"',
      'import { Button } from "@/components/ui/button"',
      'import { FlashCell } from "@/components/ui/flash-cell"',
      'import { useFlash } from "@/hooks/use-flash"',
      'import { formatPrice } from "@/lib/format"',
      'import { Ticket } from "@/components/ticket"',
    ])
  })

  it("has one demo per item, and a demo only for an item, a docs page of the same name, a variant a doc places, or the desk", async () => {
    const demos = await readDemos(resolve(root, "playground/src/demos"))
    const items = registry.items.map((item) => item.name)
    for (const name of items) expect(demos.has(name), `${name} has a demo`).toBe(true)
    // The Typography page has a demo of its own, a doc places its variants' demos, and the opening page frames the desk; a demo that is none of those would embed nowhere.
    const docs = await readDocs(resolve(root, "docs"), registry)
    const framed = framedDemos(docs)
    for (const name of demos.keys()) expect(items.includes(name) || framed.has(name) || name === DESK_DEMO, `${name} is an item, a docs page, a variant a doc places, or the desk`).toBe(true)
    // A variant a doc places is a demo that exists, named for the doc's own item as <item>-<variant>, and placed by that one doc.
    const placed = new Map<string, string>()
    for (const doc of docs) {
      for (const name of framedIn(doc.html)) {
        expect(demos.has(name), `${doc.source} places ${name}, and playground/src/demos has no such demo`).toBe(true)
        expect(name.startsWith(`${doc.slug}-`), `${doc.source} places ${name}, which is not named ${doc.slug}-<variant>`).toBe(true)
        expect(placed.get(name), `${name} is placed by both ${placed.get(name)} and ${doc.source}`).toBeUndefined()
        placed.set(name, doc.source)
      }
    }
    expect([...placed.keys()].sort()).toEqual([
      "command-palette-go-bar",
      "command-palette-scoped-actions",
      "command-palette-shared-recents",
      "command-palette-symbols",
      "countdown-compact",
      "countdown-expired",
      "countdown-thresholds",
      "data-grid-controlled",
      "data-grid-selection",
      "data-grid-totals",
      "data-grid-updates",
      "depth-ladder-following",
      "depth-ladder-updates",
      "feed-health-actions",
      "feed-health-lanes",
      "layout-manager-workspace",
      "panel-hotkeys",
      "panel-linked",
      "panel-popout",
      "panel-states",
      "positions-books",
      "positions-formats",
      "positions-updates",
      "preferences-boundaries",
      "preferences-import",
      "price-chart-candles",
      "price-chart-overlays",
      "price-chart-ticks",
      "quote-panel-actions",
      "quote-panel-limits",
      "quote-panel-pending",
      "rfq-stack-parking",
      "rfq-stack-threshold",
      "rfq-stack-updates",
      "rfq-ticket-server",
      "rfq-ticket-shortcuts",
      "rfq-ticket-sides",
      "row-store-batching",
      "row-store-deltas",
      "row-store-views",
      "spread-matrix-structures",
      "spread-matrix-updates",
      "spread-matrix-yields",
      "ticket-server",
      "ticket-shortcuts",
      "use-hotkeys-chords",
      "use-hotkeys-editing",
      "use-hotkeys-remapping",
      "use-hotkeys-scopes",
      "watchlist-prices",
      "watchlist-trends",
      "workspace-keyboard",
      "workspace-linked-panels",
      "workspace-panel-actions",
      "workspace-saved-layout",
    ])
    expect(demos.has("typography")).toBe(true)
    expect(demos.has(DESK_DEMO)).toBe(true)
    for (const demo of demos.values()) {
      expect(demo.code).not.toContain("@/registry/")
      expect(demo.source).toContain("export default function")
    }
  })

  it("reads no demos from a checkout that has none", async () => {
    expect((await readDemos(join(tmpdir(), "no-such-demos"))).size).toBe(0)
  })
})

describe("the embed build", () => {
  it("is null for a tag from before the previews", async () => {
    expect(await readEmbed(join(tmpdir(), "no-such-embed"))).toBeNull()
  })

  it("moves the bundle, the mode script, and the favicon under the base on a release's own tree", async () => {
    const previews: Previews = { demos: await readDemos(resolve(root, "playground/src/demos")), embed: await readEmbed(fakeEmbed()), frame: await readFrame(resolve(root, "playground/src/demos")) }
    const values = templateValues(registry, version, registry, new Set(), previews, { base: "/v9.9.9" })
    const [page] = previewPages(registry, registry, previews, values, template(PREVIEW_TEMPLATE))
    expect(page?.html).toContain('<script type="module" src="/v9.9.9/preview/assets/embed-abc.js"></script>')
    expect(page?.html).toContain('<link rel="stylesheet" href="/v9.9.9/preview/assets/embed-def.css">')
    expect(page?.html).toContain('<script src="/v9.9.9/theme.js"></script>')
    expect(page?.html).toContain('<link rel="icon" href="/v9.9.9/favicon.svg"')
    expect(page?.html).not.toMatch(/ (href|src)="\/(?!v9\.9\.9\/)/)
  })

  it("names the entry's script and stylesheets as site paths", async () => {
    const embed = await readEmbed(fakeEmbed())
    expect(embed?.script).toBe("/preview/assets/embed-abc.js")
    expect(embed?.styles).toEqual(["/preview/assets/embed-def.css"])
  })

  it("refuses a manifest with no embed entry", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tradecn-embed-"))
    mkdirSync(join(dir, ".vite"))
    writeFileSync(join(dir, ".vite", "manifest.json"), JSON.stringify({ "src/main.tsx": { file: "assets/main.js", isEntry: true, src: "src/main.tsx" } }))
    await expect(readEmbed(dir)).rejects.toThrow(/embed entry/)
  })
})

describe("a theme on the site", () => {
  const theme = registry.items.find((item) => item.name === THEME_ITEM)!
  // A theme that is not the site's, so its preview page is told apart from the pages that wear the site's.
  const slate = registry.items.find((item) => item.name === "tradecn-slate")!

  it("shows what the CLI writes instead of a demo's source", () => {
    const css = themeCss(theme)
    // No theme sets a @theme block any more: the type is the tokens', so the stylesheet starts at :root.
    expect(css).toMatch(/^:root \{\n {2}--accent: /)
    expect(css).toContain(`:root {\n  --accent: ${theme.cssVars?.light?.accent};`)
    expect(css).toContain(`.dark {\n  --accent: ${theme.cssVars?.dark?.accent};`)
    expect(themeCss({ ...theme, cssVars: { ...theme.cssVars, theme: { "font-sans": "monospace" } } })).toMatch(/^@theme inline \{\n {2}--font-sans: monospace;/)
  })

  it("gives the embed page every variable the theme sets in a mode, and a font-sans only when the theme sets one", () => {
    for (const mode of ["light", "dark"] as const) {
      const palette = fullPalette(theme, mode)
      for (const [token, value] of Object.entries(theme.cssVars?.[mode] ?? {})) expect(palette).toContain(`  --${token}: ${value};`)
      expect(palette).not.toContain("--font-sans:")
    }
    expect(fullPalette({ ...theme, cssVars: { ...theme.cssVars, theme: { "font-sans": "monospace" } } }, "dark")).toContain("  --font-sans: monospace;")
    expect(() => fullPalette({ name: "bare", type: "registry:theme" }, "dark")).toThrow(/bare/)
  })

  it("wears its own palette on its own preview page in both modes; every other page wears the site theme's two sides and carries every other theme's, keyed on the choice", async () => {
    const docs = await readDocs(resolve(root, "docs"), registry)
    const values = templateValues(registry, version, registry, new Set(docs.map((doc) => doc.slug)))
    const previews: Previews = { demos: await readDemos(resolve(root, "playground/src/demos")), embed: await readEmbed(fakeEmbed()), frame: await readFrame(resolve(root, "playground/src/demos")) }
    const docSlugs = new Set(docs.map((doc) => doc.slug))
    const pages = new Map(previewPages(registry, registry, previews, values, template(PREVIEW_TEMPLATE), docSlugs).map((page) => [page.path, page.html]))
    // One page per item, one per docs page with a demo of its own (Typography, Color), and one for the desk, all of which wear the site's palette like any item's.
    const docDemos = [...docSlugs].filter((slug) => previews.demos.has(slug) && !registry.items.some((item) => item.name === slug))
    expect(docDemos.sort()).toEqual(["color", "typography"])
    expect(pages.size).toBe(registry.items.length + docDemos.length + 1)
    expect(pages.has(`preview/${DESK_DEMO}/index.html`)).toBe(true)
    // With every demo the docs frame, the variants the pages place get pages of their own too, wearing the site's palette like any item's.
    const framed = framedDemos(docs)
    const variants = [...framed].filter((name) => !docSlugs.has(name)).sort()
    expect(variants).toEqual([
      "command-palette-go-bar",
      "command-palette-scoped-actions",
      "command-palette-shared-recents",
      "command-palette-symbols",
      "countdown-compact",
      "countdown-expired",
      "countdown-thresholds",
      "data-grid-controlled",
      "data-grid-selection",
      "data-grid-totals",
      "data-grid-updates",
      "depth-ladder-following",
      "depth-ladder-updates",
      "feed-health-actions",
      "feed-health-lanes",
      "layout-manager-workspace",
      "panel-hotkeys",
      "panel-linked",
      "panel-popout",
      "panel-states",
      "positions-books",
      "positions-formats",
      "positions-updates",
      "preferences-boundaries",
      "preferences-import",
      "price-chart-candles",
      "price-chart-overlays",
      "price-chart-ticks",
      "quote-panel-actions",
      "quote-panel-limits",
      "quote-panel-pending",
      "rfq-stack-parking",
      "rfq-stack-threshold",
      "rfq-stack-updates",
      "rfq-ticket-server",
      "rfq-ticket-shortcuts",
      "rfq-ticket-sides",
      "row-store-batching",
      "row-store-deltas",
      "row-store-views",
      "spread-matrix-structures",
      "spread-matrix-updates",
      "spread-matrix-yields",
      "ticket-server",
      "ticket-shortcuts",
      "use-hotkeys-chords",
      "use-hotkeys-editing",
      "use-hotkeys-remapping",
      "use-hotkeys-scopes",
      "watchlist-prices",
      "watchlist-trends",
      "workspace-keyboard",
      "workspace-linked-panels",
      "workspace-panel-actions",
      "workspace-saved-layout",
    ])
    const withVariants = new Map(previewPages(registry, registry, previews, values, template(PREVIEW_TEMPLATE), framed).map((page) => [page.path, page.html]))
    expect(withVariants.size).toBe(pages.size + variants.length)
    expect(withVariants.get("preview/countdown-compact/index.html")).toContain('<div id="root" data-item="countdown-compact"')
    expect(withVariants.get("preview/countdown-compact/index.html")).toContain(`:root.dark {\n  color-scheme: dark;\n  --accent: ${theme.cssVars?.dark?.accent};`)
    const typographyPage = pages.get("preview/typography/index.html") ?? ""
    expect(typographyPage).toContain('<div id="root" data-item="typography"')
    expect(typographyPage).toContain(`:root.dark {\n  color-scheme: dark;\n  --accent: ${theme.cssVars?.dark?.accent};`)
    expect(previewPages(registry, registry, previews, values, template(PREVIEW_TEMPLATE)).length).toBe(registry.items.length + 1)
    const slatePage = pages.get("preview/tradecn-slate/index.html") ?? ""
    const formatPage = pages.get("preview/format/index.html") ?? ""
    // A theme's page: the theme's dark side under .dark and its light side under .light, every variable of each.
    expect(slatePage).toContain(`:root.dark {\n  color-scheme: dark;\n  --accent: ${slate.cssVars?.dark?.accent};`)
    expect(slatePage).toContain(`:root.light {\n  color-scheme: light;\n  --accent: ${slate.cssVars?.light?.accent};`)
    expect(slatePage).toContain(`--down: ${slate.cssVars?.dark?.down};`)
    // A theme's page wears its own theme whatever the header's menu says: it carries no other theme's palette.
    expect(slatePage.match(/--popover:/g)).toHaveLength(2)
    expect(slatePage).not.toContain("[data-theme=")
    // Any other page: the site theme's whole dark side and whole light side, what the theme installs, over the bundle's.
    expect(formatPage).toContain(`:root.dark {\n  color-scheme: dark;\n  --accent: ${theme.cssVars?.dark?.accent};`)
    expect(formatPage).toContain(`--down: ${theme.cssVars?.dark?.down};`)
    expect(formatPage).toContain(`:root.light {\n  color-scheme: light;\n  --accent: ${theme.cssVars?.light?.accent};`)
    expect(formatPage).toContain(`--background: ${theme.cssVars?.light?.background};`)
    expect(formatPage).toContain(`--down: ${theme.cssVars?.light?.down};`)
    expect(formatPage).toContain(`--radius: ${theme.cssVars?.light?.radius};`)
    // The theme's typography tokens ride into both sides, so a light preview sets its numbers the way a dark one does, and no theme sets a font-sans of its own.
    expect(formatPage).toMatch(/:root\.light \{[^}]* {2}--tradecn-font-sans: 'Inter', ui-sans-serif, system-ui, sans-serif;/)
    expect(formatPage).toMatch(/:root\.light \{[^}]* {2}--tradecn-numeric-variant: lining-nums tabular-nums;/)
    expect(formatPage).not.toContain("--font-sans:")
    expect(formatPage).toMatch(/:root\.light \{[^}]*--tradecn-color-body-fg/)
    // Then every other theme's two sides, keyed on the data-theme theme.js writes beside the mode class, each the whole palette.
    const themes = siteThemes(registry)
    const others = previewThemePalettes(themes)
    expect(formatPage).toContain(others)
    expect(formatPage.indexOf(others)).toBeGreaterThan(formatPage.indexOf(":root.light {"))
    expect(themes.slice(1).map((item) => item.name)).toEqual(["tradecn-slate", "tradecn-slate-east"])
    expect(others).toContain(`:root.dark[data-theme="tradecn-slate"] {\n  --accent: ${slate.cssVars?.dark?.accent};`)
    expect(others).toContain(`:root.light[data-theme="tradecn-slate"] {\n  --accent: ${slate.cssVars?.light?.accent};`)
    expect(others).toContain(`:root.light[data-theme="tradecn-slate-east"] {\n`)
    expect(others).not.toContain(`data-theme="${THEME_ITEM}"`)
    // The default's two blocks and two per other theme, and the mode classes alone set color-scheme.
    expect(formatPage.match(/--popover:/g)).toHaveLength(2 + 2 * (themes.length - 1))
    expect(formatPage.match(/color-scheme: (light|dark);/g)).toHaveLength(2)
    expect(previewThemePalettes([theme])).toBe("")
    expect(slate.cssVars?.dark?.down).not.toBe(theme.cssVars?.dark?.down)
    for (const html of pages.values()) {
      expect(html).not.toMatch(/\{\{\w+\}\}/)
      expect(html).toContain('<link rel="stylesheet" href="/preview/assets/embed-def.css">')
      expect(html).toContain('<script type="module" src="/preview/assets/embed-abc.js"></script>')
      expect(html).toContain('<meta name="robots" content="noindex">')
      expect(html).toContain('<meta name="color-scheme" content="light dark">')
      // The mode script puts the class on <html>, before the bundle; the template hard-codes none.
      expect(html).not.toMatch(/<html[^>]*\bclass=/)
      expect(html).toContain('<script src="/theme.js"></script>')
      expect(html.indexOf("/theme.js")).toBeLessThan(html.indexOf("embed-def.css"))
      // The themes the script may put on <html>, declared before it runs.
      expect(html).toContain(themesMeta(themes))
      expect(html.indexOf(THEMES_META)).toBeLessThan(html.indexOf("/theme.js"))
      // The palettes come after the bundle's stylesheet, so they win the cascade.
      expect(html.indexOf("embed-def.css")).toBeLessThan(html.indexOf("--background:"))
    }
    expect(formatPage).toContain('<div id="root" data-item="format" data-frame="card">')
    // The desk fills its frame on the opening page; every other demo is centered in a card's frame.
    expect(pages.get(`preview/${DESK_DEMO}/index.html`)).toContain(`<div id="root" data-item="${DESK_DEMO}" data-frame="desk">`)
    expect(slatePage).toContain('data-frame="card"')
    for (const [path, html] of pages) expect(html, path).toMatch(/ data-frame="(card|desk)">/)
  })

  it("writes no preview pages without an embed build", async () => {
    const values = templateValues(registry, version)
    expect(previewPages(registry, registry, { demos: new Map(), embed: null }, values, template(PREVIEW_TEMPLATE))).toEqual([])
  })

  it("reads the frame contract from frame.json beside the demos, and stretches the demos of a tag from before it", async () => {
    const demosDir = resolve(root, "playground/src/demos")
    const demos = await readDemos(demosDir)
    const embed = await readEmbed(fakeEmbed())
    const values = templateValues(registry, version)
    // This checkout's demos are written to the centering contract, and say so.
    expect(await readFrame(demosDir)).toBe("centered")
    // A tag with no marker predates the contract: its demos set no w-full and know no bar, so its frames stretch, as the card did then.
    expect(await readFrame(join(tmpdir(), "no-such-demos"))).toBe("stretch")
    const old = new Map(previewPages(registry, registry, { demos, embed }, values, template(PREVIEW_TEMPLATE)).map((page) => [page.path, page.html]))
    expect(old.get("preview/format/index.html")).toContain('<div id="root" data-item="format" data-frame="stretch">')
    expect(old.get(`preview/${DESK_DEMO}/index.html`)).toContain(`<div id="root" data-item="${DESK_DEMO}" data-frame="desk">`)
    for (const [path, html] of old) expect(html, path).toMatch(/ data-frame="(stretch|desk)">/)
    // A marker naming anything else is an error, not a guess.
    const dir = mkdtempSync(join(tmpdir(), "tradecn-frame-"))
    writeFileSync(join(dir, FRAME_FILE), JSON.stringify({ frame: "sideways" }))
    await expect(readFrame(dir)).rejects.toThrow(/sideways/)
  })
})

describe("the preview card", () => {
  const doc: Doc = { slug: "flash-cell", path: "/docs/flash-cell/", label: "Flash Cell", source: "flash-cell.md", title: "flash-cell", description: "", html: "<h1 id=\"flash-cell\">flash-cell</h1>\n<p>What it is.</p>\n<pre><code>usage</code></pre>\n", item: registry.items.find((item) => item.name === "flash-cell") }
  const demo = { name: "flash-cell", source: 'import { FlashCell } from "@/registry/tradecn/ui/flash-cell"\n<b>', code: 'import { FlashCell } from "@/components/ui/flash-cell"\n<b>' }

  it("frames the item's embed page and puts its source, escaped, under the frame behind View Code", () => {
    const block = previewBlock(doc, demo, "v9.9.9")
    expect(block).toContain('<div class="preview" data-preview="flash-cell">')
    expect(block).toContain('<div class="preview-live">\n<iframe src="/preview/flash-cell/" title="flash-cell, live" loading="lazy" data-preview="flash-cell"></iframe>\n</div>')
    expect(block).toContain('<div class="preview-code" data-collapsed>\n<div class="preview-code-body" id="preview-flash-cell-source" tabindex="-1">\n<pre><code class="language-tsx">import { FlashCell } from &quot;@/components/ui/flash-cell&quot;\n&lt;b&gt;</code></pre>')
    expect(block).toContain("https://github.com/tradecn/ui/blob/v9.9.9/playground/src/demos/flash-cell.tsx")
    expect(block).toContain('<button type="button" class="view-code" aria-expanded="false" aria-controls="preview-flash-cell-source">View Code</button>')
    // No tabs and no link out: the frame is the demo, and the source's own line names the file at the tag.
    expect(block).not.toContain('role="tab')
    expect(block).not.toContain("Open in a new tab")
    // The code comes before its source line, so the collapsed peek is code and not a path.
    expect(block.indexOf("<pre>")).toBeLessThan(block.indexOf('<p class="preview-source">'))
  })

  it("shows a theme's stylesheet under Code, not the sample's source", () => {
    const theme = registry.items.find((item) => item.name === THEME_ITEM)!
    const block = previewBlock({ ...doc, slug: theme.name, item: theme }, { ...demo, name: theme.name }, "v9.9.9")
    expect(block).toContain('<code class="language-css">')
    expect(block).toContain("--primary: ")
    expect(block).not.toContain("FlashCell")
  })

  it("frames a variant's own embed page under the variant's name, with the variant's own file under Code", () => {
    const block = previewBlock(doc, { name: "flash-cell-quiet", source: "x", code: "quiet" }, "v9.9.9")
    expect(block).toContain('<div class="preview" data-preview="flash-cell-quiet">')
    expect(block).toContain('<iframe src="/preview/flash-cell-quiet/" title="flash-cell-quiet, live" loading="lazy" data-preview="flash-cell-quiet">')
    expect(block).toContain('aria-controls="preview-flash-cell-quiet-source">View Code</button>')
    expect(block).toContain("<code>playground/src/demos/flash-cell-quiet.tsx</code>, at <a href=\"https://github.com/tradecn/ui/blob/v9.9.9/playground/src/demos/flash-cell-quiet.tsx\">v9.9.9</a>")
    expect(block).toContain('<code class="language-tsx">quiet</code>')
    // Only a theme's own demo shows the stylesheet; a variant placed on a theme's page would show its source like any other.
    const theme = registry.items.find((item) => item.name === THEME_ITEM)!
    expect(previewBlock({ ...doc, slug: theme.name, item: theme }, { name: `${theme.name}-x`, source: "x", code: "tsx here" }, "v9.9.9")).toContain('<code class="language-tsx">tsx here</code>')
  })

  it("stands where the doc places a variant, in that doc's own HTML, and only when the tag has an embed build", () => {
    const placed: Doc = { ...doc, html: '<h1 id="flash-cell">flash-cell</h1>\n<p>What it is.</p>\n<h2 id="quiet">Quiet</h2>\n<p>No flash.</p>\n<!-- demo: flash-cell-quiet --><h2 id="api-reference">API Reference</h2>\n' }
    const demos = new Map([["flash-cell-quiet", { name: "flash-cell-quiet", source: "s", code: "c" }]])
    const embed = { dir: "", script: "/preview/assets/e.js", styles: [] }
    const html = withDemos(placed, { demos, embed }, "v9.9.9")
    // The card takes the line's place, as marked leaves it: its own block, right before the next heading.
    expect(html).toContain('<p>No flash.</p>\n<div class="preview" data-preview="flash-cell-quiet">')
    expect(html).toMatch(/<\/div>\n<h2 id="api-reference">/)
    expect(html).not.toContain("<!--")
    expect(framedIn(placed.html)).toEqual(["flash-cell-quiet"])
    expect(framedIn("<!--demo:a-b-->\n<p>x</p>\n<!-- demo: a-c -->")).toEqual(["a-b", "a-c"])
    expect(framedIn(doc.html)).toEqual([])
    expect(framedDemos([placed, { ...doc, slug: "typography", html: "" }])).toEqual(new Set(["flash-cell", "flash-cell-quiet", "typography"]))
    // Without an embed the line goes and nothing stands in for it, as the top card is left out; with one, a demo the playground lacks is an error.
    expect(withDemos(placed, { demos: new Map(), embed: null }, "v9.9.9")).toBe('<h1 id="flash-cell">flash-cell</h1>\n<p>What it is.</p>\n<h2 id="quiet">Quiet</h2>\n<p>No flash.</p>\n<h2 id="api-reference">API Reference</h2>\n')
    expect(() => withDemos(placed, { demos: new Map(), embed }, "v9.9.9")).toThrow(/flash-cell\.md frames a demo named flash-cell-quiet, and playground\/src\/demos\/flash-cell-quiet\.tsx does not exist/)
    expect(withDemos(doc, { demos, embed }, "v9.9.9")).toBe(doc.html)
  })

  it("lands after the first paragraph, or after the title, or at the top", () => {
    expect(withPreview("<h1>t</h1>\n<p>one</p>\n<p>two</p>\n", "<div>P</div>")).toBe("<h1>t</h1>\n<p>one</p>\n<div>P</div>\n<p>two</p>\n")
    expect(withPreview("<h1>t</h1>\n<pre>x</pre>\n", "<div>P</div>")).toBe("<h1>t</h1>\n<div>P</div>\n<pre>x</pre>\n")
    expect(withPreview("<pre>x</pre>\n", "<div>P</div>")).toBe("<div>P</div>\n<pre>x</pre>\n")
  })

  // Every page, with every Manual tab's source and every demo colored: seconds here, and more on a small runner.
  it("is on every item page and on no other page, and only when the tag has an embed build", { timeout: 30_000 }, async () => {
    const tagDocs = await readDocs(resolve(root, "docs"), registry)
    const docSlugs = new Set(tagDocs.map((doc) => doc.slug))
    const values = templateValues(registry, version, registry, docSlugs)
    const docs = siteDocs(await readSitePages(resolve(root, "site", SITE_DOCS), sitePageValues(registry, values, docSlugs, "")), tagDocs)
    const demos = await readDemos(resolve(root, "playground/src/demos"))
    const sources = await readSources(registry, root)
    const withEmbed = new Map(docPages(docs, values, template(DOCS_TEMPLATE), { demos, embed: await readEmbed(fakeEmbed()) }, sources).map((page) => [page.path, page.html]))
    for (const doc of docs) {
      const html = withEmbed.get(`${doc.path.slice(1)}index.html`) ?? ""
      if (doc.item) {
        expect(html).toContain(`<iframe src="/preview/${doc.slug}/"`)
        // The card sits between the opening paragraph and Installation, and the source under its frame is a code block like any other: wrapped, with its copy button.
        expect(html.indexOf('<div class="preview"')).toBeLessThan(html.indexOf('<h2 id="installation">'))
        expect(html).toMatch(/class="preview-code" data-collapsed>\n<div class="preview-code-body" id="preview-[\w-]+-source" tabindex="-1">\n<div class="code"><pre><code class="language-(tsx|css)">[\s\S]*?<\/pre><button type="button" class="copy"/)
      } else if (demos.has(doc.slug)) {
        // A doc with a demo of its own (Typography) gets the card and no Installation.
        expect(html).toContain(`<iframe src="/preview/${doc.slug}/"`)
        expect(html).not.toContain('id="installation"')
      } else expect(html, doc.path).not.toContain("<iframe")
      expect(html).not.toMatch(/\{\{\w+\}\}/)
    }
    expect(withEmbed.get("docs/index.html")).not.toContain("<iframe")
    expect(withEmbed.get("docs/components/index.html")).not.toContain("<iframe")
    // The countdown page places three variants, each card in its own section between Usage and API Reference, each framing its own page and naming its own file.
    const countdown = withEmbed.get("docs/countdown/index.html") ?? ""
    const at = (text: string) => {
      const index = countdown.indexOf(text)
      expect(index, `${text} on the countdown page`).toBeGreaterThan(-1)
      return index
    }
    for (const name of ["countdown-compact", "countdown-thresholds", "countdown-expired"]) {
      const card = at(`<div class="preview" data-preview="${name}">`)
      expect(card).toBeGreaterThan(at('<h2 id="usage">'))
      expect(card).toBeLessThan(at('<h2 id="api-reference">'))
      expect(countdown).toContain(`<iframe src="/preview/${name}/" title="${name}, live" loading="lazy" data-preview="${name}">`)
      expect(countdown).toContain(`<code>playground/src/demos/${name}.tsx</code>`)
    }
    expect(at('data-preview="countdown-compact"')).toBeGreaterThan(at('<h2 id="compact">'))
    expect(at('data-preview="countdown-compact"')).toBeLessThan(at('<h2 id="thresholds">'))
    expect(at('data-preview="countdown-thresholds"')).toBeLessThan(at('<h2 id="expired">'))
    expect(at('data-preview="countdown-expired"')).toBeLessThan(at('<h2 id="api-reference">'))
    expect(countdown).not.toContain("<!-- demo:")
    // The item's own card stays first, at the top.
    expect(at('data-preview="countdown"')).toBeLessThan(at('<h2 id="installation">'))
    const without = docPages(docs, values, template(DOCS_TEMPLATE), { demos, embed: null }, sources)
    for (const page of without) {
      expect(page.html).not.toContain("<iframe")
      expect(page.html).not.toContain("<!-- demo:")
    }
  })

  it("has the View Code and height plumbing in the site script, and the layout in the stylesheet", () => {
    const docs = template(DOCS_TEMPLATE)
    expect(docs).toContain('<script src="/site.js"></script>')
    expect(docs).toContain('<link rel="stylesheet" href="/site.css">')
    const styles = readFileSync(resolve(root, "site", SITE_STYLES), "utf8")
    expect(styles).toContain("article > :not(.preview) { max-width: 72ch; }")
    expect(styles).toContain(".showcase iframe {")
    // Collapsed, the source shows its first lines and hides its copy button; without a script it is simply open.
    expect(styles).toContain(".preview-code[data-collapsed] .preview-code-body { max-height: 8rem; overflow: hidden;")
    expect(styles).toContain(".preview-code[data-collapsed] .copy, .preview-code[data-collapsed] .preview-source { display: none; }")
    expect(styles).toContain("html:not(.js) .view-code { display: none; }")
    // The embed page centers a card's demo in at least the card's height, and lets the desk fill its frame.
    const preview = template(PREVIEW_TEMPLATE)
    expect(preview).toContain('<div id="root" data-item="{{item}}" data-frame="{{frame}}">')
    // Centered on both axes by auto margins, so a wide demo says w-full; the controls bar is pinned to the frame's top edge.
    expect(preview).toContain('#root[data-frame="card"] { box-sizing: border-box; min-height: 14rem; display: flex; flex-direction: column; padding: 1.5rem 1rem; }')
    expect(preview).toContain('#root[data-frame="card"] > * { max-width: 100%; margin: auto; }')
    expect(preview).toContain('#root[data-frame="card"] > [data-demo-controls] { order: -1; align-self: stretch; max-width: none; margin: -1.5rem -1rem 1.5rem;')
    expect(preview).toContain('#root[data-frame="stretch"] { box-sizing: border-box; min-height: 14rem; display: flex; flex-direction: column; justify-content: center; padding: 1.5rem 1rem; }')
    expect(preview).toContain('#root[data-frame="desk"] {')
    const script = readFileSync(resolve(root, "site", "site.js"), "utf8")
    // One wiring for the preview's View Code and the Manual's Expand: the collapsed code is inert unless the block shows whole, the button reads Collapse once open, and an opened preview's source takes the focus.
    expect(script).toContain('document.querySelectorAll(".view-code, .expand")')
    expect(script).toContain("body.inert = !open && !fits")
    expect(script).toContain('if (open) (button.classList.contains("view-code") ? body : button).focus({ preventScroll: true })')
    expect(script).toContain('button.textContent = open ? "Collapse" : closed')
    expect(script).toContain('event.data.type !== "tradecn-preview"')
    expect(script).toContain("event.origin !== location.origin")
    // Every preview frame, the docs page's card and the opening page's showcase alike, is sized and asked.
    expect(script.match(/querySelectorAll\("iframe\[data-preview\]"\)/g)).toHaveLength(2)
    expect(script).not.toContain('".preview iframe"')
    // The package-manager choice is on <html> before the body parses, and the copy button uses the clipboard API.
    expect(script).toContain("document.documentElement.dataset.pm = storedManager()")
    expect(script).toContain("navigator.clipboard.writeText(code.textContent.trimEnd())")
    // The handshake: the page asks once it is listening, and the embed answers, so the order they load in does not matter.
    expect(script).toContain('postMessage({ type: "tradecn-preview-ask" }, location.origin)')
    const embed = readFileSync(resolve(root, "playground/src/embed.tsx"), "utf8")
    expect(embed).toContain('event.data?.type === "tradecn-preview-ask"')
    expect(embed).toContain("event.source === window.parent")
  })
})
