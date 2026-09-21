import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import {
  DOCS_TEMPLATE,
  docPages,
  escapeHtml,
  FAVICON,
  firstParagraph,
  PAGES,
  readDocs,
  render,
  renderMarkdown,
  templateValues,
  THEME_ITEM,
} from "./build-site"
import type { Registry } from "./build-site"

const root = resolve(import.meta.dirname, "..")
const registry = JSON.parse(readFileSync(resolve(root, "registry.json"), "utf8")) as Registry
const version = readFileSync(resolve(root, "version.txt"), "utf8").trim()
const template = (page: string) => readFileSync(resolve(root, "site", page), "utf8")

describe("the landing page", () => {
  const values = templateValues(registry, version)
  const page = render(template("index.html"), values)

  it("renders every template without a placeholder left", () => {
    for (const name of PAGES) expect(render(template(name), values)).not.toMatch(/\{\{\w+\}\}/)
  })

  it("links the favicon the builder copies from the amber logo", () => {
    for (const name of PAGES) expect(template(name)).toContain(`href="/${FAVICON}"`)
    const mark = readFileSync(resolve(root, "assets", "logo-dark.svg"), "utf8")
    expect(mark).toContain('stroke="#f7a224"')
    expect(mark).not.toContain('stroke="black"')
  })

  it("lists every item, linking its doc on GitHub when the tag ships no page for it", () => {
    for (const item of registry.items) {
      expect(page).toContain(`<code>${item.name}</code>`)
      expect(page).toContain(`https://github.com/tradecn/ui/blob/v${version}/docs/${item.name}.md`)
    }
  })

  it("links the item's own page when the tag ships a doc for it", () => {
    const withDocs = render(template("index.html"), templateValues(registry, version, registry, new Set(["format"])))
    expect(withDocs).toContain(`<a href="/docs/format/"><code>format</code></a>`)
    expect(withDocs).toContain(`https://github.com/tradecn/ui/blob/v${version}/docs/row-store.md`)
  })

  it("shows both install forms and keeps the CLI's {name} placeholder intact", () => {
    expect(page).toContain(`npx shadcn@latest add tradecn/ui/data-grid#v${version}`)
    expect(page).toContain(`"@tradecn": "https://tradecn.dev/r/{name}.json"`)
    expect(page).toContain(`/r/v${version}/{name}.json`)
  })

  it("takes its palette from the terminal theme", () => {
    const theme = registry.items.find((item) => item.name === THEME_ITEM)
    expect(page).toContain(`--primary: ${theme?.cssVars?.light?.primary};`)
    expect(page).toContain(`--up: ${theme?.cssVars?.light?.up};`)
    expect(page).toContain(`--font: ${theme?.cssVars?.theme?.["font-sans"]};`)
  })

  it("escapes item text", () => {
    expect(escapeHtml(`<a href="x">Tom & Jerry's</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;")
    const hostile: Registry = {
      name: "t",
      items: [...registry.items, { name: "evil", type: "registry:ui", description: `<script>alert("x")</script>` }],
    }
    expect(templateValues(hostile, version).items).not.toContain("<script>")
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
    expect(values.items).toContain("<code>format</code>")
    expect(values.items).not.toContain(`<code>${THEME_ITEM}</code>`)
    expect(values.palette).toContain("--primary:")
    expect(() => templateValues(early, "0.1.0")).toThrow(THEME_ITEM)
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

  it("keeps fenced code as code, escaped, with its language", () => {
    const doc = renderMarkdown("# x\n\n```tsx\n<DataGrid rows={a < b} />\n```\n")
    expect(doc.html).toContain('<pre><code class="language-tsx">&lt;DataGrid rows={a &lt; b} /&gt;')
    expect(doc.html).not.toContain("<DataGrid")
  })

  it("describes a page by its first paragraph, without markup", () => {
    expect(firstParagraph("# t\n\n```ts\nnot this\n```\n\n- not this\n\nUse `formatPrice` for [prices](x.md).\n")).toBe(
      "Use formatPrice for prices.",
    )
  })
})

describe("the docs pages", async () => {
  const docs = await readDocs(resolve(root, "docs"), registry)
  const values = templateValues(registry, version, registry, new Set(docs.map((doc) => doc.slug)))
  const pages = docPages(docs, values, template(DOCS_TEMPLATE))
  const byPath = new Map(pages.map((page) => [page.path, page.html]))

  it("renders one page per docs/*.md plus an index, with no placeholder left", () => {
    expect(byPath.size).toBe(docs.length + 1)
    for (const page of pages) expect(page.html).not.toMatch(/\{\{\w+\}\}/)
    expect(byPath.has("docs/index.html")).toBe(true)
  })

  it("puts item docs first in registry order and the contract after them", () => {
    const itemSlugs = registry.items.map((item) => item.name).filter((name) => docs.some((doc) => doc.slug === name))
    expect(docs.filter((doc) => doc.item).map((doc) => doc.slug)).toEqual(itemSlugs)
    expect(docs.at(-1)?.slug).toBe("contract")
  })

  it("marks the current page in the nav and links every other page", () => {
    const format = byPath.get("docs/format/index.html") ?? ""
    expect(format).toContain('<a href="/docs/format/" aria-current="page">format</a>')
    for (const doc of docs) expect(format).toContain(`href="/docs/${doc.slug}/"`)
  })

  it("offers both install forms on an item page and none on the contract", () => {
    expect(byPath.get("docs/panel/index.html")).toContain(`npx shadcn@latest add @tradecn/panel`)
    expect(byPath.get("docs/panel/index.html")).toContain(`tradecn/ui/panel#v${version}`)
    expect(byPath.get("docs/contract/index.html")).not.toContain("npx shadcn@latest add")
    expect(byPath.get("docs/contract/index.html")).toContain(`docs/contract.md`)
  })

  it("lists every page on the index and links the landing page to each item's page", () => {
    const index = byPath.get("docs/index.html") ?? ""
    for (const doc of docs) expect(index).toContain(`href="/docs/${doc.slug}/"`)
    const landing = render(template("index.html"), values)
    for (const doc of docs.filter((d) => d.item)) expect(landing).toContain(`<a href="/docs/${doc.slug}/"><code>${doc.slug}</code></a>`)
  })
})
