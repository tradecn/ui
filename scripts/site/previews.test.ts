import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { describe, expect, it } from "vitest"
import {
  consumerImports,
  DOCS_TEMPLATE,
  docPages,
  fullPalette,
  LIGHT_PALETTE,
  PREVIEW_TEMPLATE,
  previewBlock,
  previewPages,
  readDemos,
  readDocs,
  readEmbed,
  readSitePages,
  readSources,
  SITE_DOCS,
  SITE_STYLES,
  siteDocs,
  sitePageValues,
  templateValues,
  THEME_ITEM,
  themeCss,
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

  it("has one demo per item and no demo without an item", async () => {
    const demos = await readDemos(resolve(root, "playground/src/demos"))
    expect([...demos.keys()].sort()).toEqual(registry.items.map((item) => item.name).sort())
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
  const classic = registry.items.find((item) => item.name === "tradecn-terminal-classic")!

  it("shows what the CLI writes instead of a demo's source", () => {
    const css = themeCss(theme)
    expect(css).toMatch(/^@theme inline \{\n {2}--font-sans: /)
    expect(css).toContain(`:root {\n  --accent: ${theme.cssVars?.light?.accent};`)
    expect(css).toContain(`.dark {\n  --accent: ${theme.cssVars?.dark?.accent};`)
  })

  it("gives the embed page every variable the theme sets in a mode, font included", () => {
    for (const mode of ["light", "dark"] as const) {
      const palette = fullPalette(theme, mode)
      for (const [token, value] of Object.entries(theme.cssVars?.[mode] ?? {})) expect(palette).toContain(`  --${token}: ${value};`)
      expect(palette).toContain(`  --font-sans: ${theme.cssVars?.theme?.["font-sans"]};`)
    }
    expect(() => fullPalette({ name: "bare", type: "registry:theme" }, "dark")).toThrow(/bare/)
  })

  it("wears its own palette on its own preview page in both modes; every other page wears the terminal theme in dark and the site's light palette in light", async () => {
    const docs = await readDocs(resolve(root, "docs"), registry)
    const values = templateValues(registry, version, registry, new Set(docs.map((doc) => doc.slug)))
    const previews: Previews = { demos: await readDemos(resolve(root, "playground/src/demos")), embed: await readEmbed(fakeEmbed()) }
    const pages = new Map(previewPages(registry, registry, previews, values, template(PREVIEW_TEMPLATE)).map((page) => [page.path, page.html]))
    expect(pages.size).toBe(registry.items.length)
    const classicPage = pages.get("preview/tradecn-terminal-classic/index.html") ?? ""
    const formatPage = pages.get("preview/format/index.html") ?? ""
    // A theme's page: the theme's dark side under .dark and its light side under .light, every variable of each.
    expect(classicPage).toContain(`:root.dark {\n  color-scheme: dark;\n  --accent: ${classic.cssVars?.dark?.accent};`)
    expect(classicPage).toContain(`:root.light {\n  color-scheme: light;\n  --accent: ${classic.cssVars?.light?.accent};`)
    expect(classicPage).toContain(`--down: ${classic.cssVars?.dark?.down};`)
    expect(classicPage.match(/--popover:/g)).toHaveLength(2)
    // Any other page: the terminal theme's dark side, and in light the site's dozen alone, so the bundle's light palette shows through the rest.
    expect(formatPage).toContain(`:root.dark {\n  color-scheme: dark;\n  --accent: ${theme.cssVars?.dark?.accent};`)
    expect(formatPage).toContain(`--down: ${theme.cssVars?.dark?.down};`)
    expect(formatPage).toContain(`:root.light {\n  color-scheme: light;\n  --background: ${LIGHT_PALETTE.background};`)
    expect(formatPage).toContain(`--down: ${LIGHT_PALETTE.down};`)
    expect(formatPage).toContain(`--radius: 0rem;\n  --font-sans: ${theme.cssVars?.theme?.["font-sans"]};\n}`)
    expect(formatPage.match(/--popover:/g)).toHaveLength(1)
    expect(classic.cssVars?.dark?.down).not.toBe(theme.cssVars?.dark?.down)
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
      // The palettes come after the bundle's stylesheet, so they win the cascade.
      expect(html.indexOf("embed-def.css")).toBeLessThan(html.indexOf("--background:"))
    }
    expect(formatPage).toContain('<div id="root" data-item="format"')
  })

  it("writes no preview pages without an embed build", async () => {
    const values = templateValues(registry, version)
    expect(previewPages(registry, registry, { demos: new Map(), embed: null }, values, template(PREVIEW_TEMPLATE))).toEqual([])
  })
})

describe("the preview card", () => {
  const doc: Doc = { slug: "flash-cell", path: "/docs/flash-cell/", label: "flash-cell", source: "flash-cell.md", title: "flash-cell", description: "", html: "<h1 id=\"flash-cell\">flash-cell</h1>\n<p>What it is.</p>\n<pre><code>usage</code></pre>\n", item: registry.items.find((item) => item.name === "flash-cell") }
  const demo = { name: "flash-cell", source: 'import { FlashCell } from "@/registry/tradecn/ui/flash-cell"\n<b>', code: 'import { FlashCell } from "@/components/ui/flash-cell"\n<b>' }

  it("frames the item's embed page and shows its source, escaped, under Code", () => {
    const block = previewBlock(doc, demo, "v9.9.9")
    expect(block).toContain('<iframe src="/preview/flash-cell/" title="flash-cell, live" loading="lazy" data-preview="flash-cell">')
    expect(block).toContain('<a class="preview-open" href="/preview/flash-cell/" target="_blank" rel="noopener">')
    expect(block).toContain('<code class="language-tsx">import { FlashCell } from &quot;@/components/ui/flash-cell&quot;\n&lt;b&gt;</code>')
    expect(block).toContain("https://github.com/tradecn/ui/blob/v9.9.9/playground/src/demos/flash-cell.tsx")
    expect(block).toContain('<div class="preview" data-preview="flash-cell" data-tabs>')
    expect(block).toContain('role="tab" id="preview-flash-cell-tab-live" aria-selected="true" aria-controls="preview-flash-cell-live"')
    expect(block).toContain('id="preview-flash-cell-code" role="tabpanel" aria-labelledby="preview-flash-cell-tab-code" hidden')
  })

  it("shows a theme's stylesheet under Code, not the sample's source", () => {
    const theme = registry.items.find((item) => item.name === THEME_ITEM)!
    const block = previewBlock({ ...doc, slug: theme.name, item: theme }, { ...demo, name: theme.name }, "v9.9.9")
    expect(block).toContain('<code class="language-css">')
    expect(block).toContain("--primary: ")
    expect(block).not.toContain("FlashCell")
  })

  it("lands after the first paragraph, or after the title, or at the top", () => {
    expect(withPreview("<h1>t</h1>\n<p>one</p>\n<p>two</p>\n", "<div>P</div>")).toBe("<h1>t</h1>\n<p>one</p>\n<div>P</div>\n<p>two</p>\n")
    expect(withPreview("<h1>t</h1>\n<pre>x</pre>\n", "<div>P</div>")).toBe("<h1>t</h1>\n<div>P</div>\n<pre>x</pre>\n")
    expect(withPreview("<pre>x</pre>\n", "<div>P</div>")).toBe("<div>P</div>\n<pre>x</pre>\n")
  })

  it("is on every item page and on no other page, and only when the tag has an embed build", async () => {
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
        // The card sits between the one sentence and Installation, and its Code tab's source is a code block like any other: wrapped, with its copy button.
        expect(html.indexOf('<div class="preview"')).toBeLessThan(html.indexOf('<h2 id="installation">'))
        expect(html).toMatch(/class="preview-code" id="preview-[\w-]+-code"[\s\S]*?<div class="code"><pre><code class="language-(tsx|css)">[\s\S]*?<\/pre><button type="button" class="copy"/)
      } else expect(html, doc.path).not.toContain("<iframe")
      expect(html).not.toMatch(/\{\{\w+\}\}/)
    }
    expect(withEmbed.get("docs/index.html")).not.toContain("<iframe")
    expect(withEmbed.get("docs/components/index.html")).not.toContain("<iframe")
    const without = docPages(docs, values, template(DOCS_TEMPLATE), { demos, embed: null }, sources)
    for (const page of without) expect(page.html).not.toContain("<iframe")
  })

  it("has the tab and height plumbing in the site script, and the layout in the stylesheet", () => {
    const docs = template(DOCS_TEMPLATE)
    expect(docs).toContain('<script src="/site.js"></script>')
    expect(docs).toContain('<link rel="stylesheet" href="/site.css">')
    const styles = readFileSync(resolve(root, "site", SITE_STYLES), "utf8")
    expect(styles).toContain("article > :not(.preview) { max-width: 72ch; }")
    expect(styles).toContain(".showcase iframe {")
    const script = readFileSync(resolve(root, "site", "site.js"), "utf8")
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
