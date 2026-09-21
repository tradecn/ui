import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { describe, expect, it } from "vitest"
import {
  consumerImports,
  DOCS_TEMPLATE,
  docPages,
  fullPalette,
  PREVIEW_TEMPLATE,
  previewBlock,
  previewPages,
  readDemos,
  readDocs,
  readEmbed,
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

  it("gives the embed page every variable the theme sets, font included", () => {
    const palette = fullPalette(theme)
    for (const [token, value] of Object.entries(theme.cssVars?.light ?? {})) expect(palette).toContain(`  --${token}: ${value};`)
    expect(palette).toContain(`  --font-sans: ${theme.cssVars?.theme?.["font-sans"]};`)
    expect(() => fullPalette({ name: "bare", type: "registry:theme" })).toThrow(/bare/)
  })

  it("wears its own palette on its own preview page and the site's everywhere else", async () => {
    const docs = await readDocs(resolve(root, "docs"), registry)
    const values = templateValues(registry, version, registry, new Set(docs.map((doc) => doc.slug)))
    const previews: Previews = { demos: await readDemos(resolve(root, "playground/src/demos")), embed: await readEmbed(fakeEmbed()) }
    const pages = new Map(previewPages(registry, registry, previews, values, template(PREVIEW_TEMPLATE)).map((page) => [page.path, page.html]))
    expect(pages.size).toBe(registry.items.length)
    const classicPage = pages.get("preview/tradecn-terminal-classic/index.html") ?? ""
    const formatPage = pages.get("preview/format/index.html") ?? ""
    expect(classicPage).toContain(`--down: ${classic.cssVars?.light?.down};`)
    expect(formatPage).toContain(`--down: ${theme.cssVars?.light?.down};`)
    expect(classic.cssVars?.light?.down).not.toBe(theme.cssVars?.light?.down)
    for (const html of pages.values()) {
      expect(html).not.toMatch(/\{\{\w+\}\}/)
      expect(html).toContain('<link rel="stylesheet" href="/preview/assets/embed-def.css">')
      expect(html).toContain('<script type="module" src="/preview/assets/embed-abc.js"></script>')
      expect(html).toContain('<meta name="robots" content="noindex">')
      // The palette comes after the bundle's stylesheet, so it wins the cascade.
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
  const doc: Doc = { slug: "flash-cell", source: "flash-cell.md", title: "flash-cell", description: "", html: "<h1 id=\"flash-cell\">flash-cell</h1>\n<p>What it is.</p>\n<pre><code>usage</code></pre>\n", item: registry.items.find((item) => item.name === "flash-cell") }
  const demo = { name: "flash-cell", source: 'import { FlashCell } from "@/registry/tradecn/ui/flash-cell"\n<b>', code: 'import { FlashCell } from "@/components/ui/flash-cell"\n<b>' }

  it("frames the item's embed page and shows its source, escaped, under Code", () => {
    const block = previewBlock(doc, demo, "v9.9.9")
    expect(block).toContain('<iframe src="/preview/flash-cell/" title="flash-cell, live" loading="lazy">')
    expect(block).toContain('<a class="preview-open" href="/preview/flash-cell/" target="_blank" rel="noopener">')
    expect(block).toContain('<code class="language-tsx">import { FlashCell } from &quot;@/components/ui/flash-cell&quot;\n&lt;b&gt;</code>')
    expect(block).toContain("https://github.com/tradecn/ui/blob/v9.9.9/playground/src/demos/flash-cell.tsx")
    expect(block).toContain('role="tab" id="preview-tab-live" aria-selected="true"')
    expect(block).toContain('id="preview-code" role="tabpanel" aria-labelledby="preview-tab-code" hidden')
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
    const docs = await readDocs(resolve(root, "docs"), registry)
    const values = templateValues(registry, version, registry, new Set(docs.map((doc) => doc.slug)))
    const demos = await readDemos(resolve(root, "playground/src/demos"))
    const withEmbed = new Map(docPages(docs, values, template(DOCS_TEMPLATE), { demos, embed: await readEmbed(fakeEmbed()) }).map((page) => [page.path, page.html]))
    for (const doc of docs) {
      const html = withEmbed.get(`docs/${doc.slug}/index.html`) ?? ""
      if (doc.item) expect(html).toContain(`<iframe src="/preview/${doc.slug}/"`)
      else expect(html).not.toContain("<iframe")
      expect(html).not.toMatch(/\{\{\w+\}\}/)
    }
    expect(withEmbed.get("docs/index.html")).not.toContain("<iframe")
    const without = docPages(docs, values, template(DOCS_TEMPLATE), { demos, embed: null })
    for (const page of without) expect(page.html).not.toContain("<iframe")
  })

  it("has the tab and height plumbing in the docs template", () => {
    const docs = template(DOCS_TEMPLATE)
    expect(docs).toContain('event.data.type !== "tradecn-preview"')
    expect(docs).toContain("event.origin !== location.origin")
    expect(docs).toContain("article > :not(.preview) { max-width: 72ch; }")
  })
})
