import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import {
  codeBlocks,
  commandFor,
  DOCS_TEMPLATE,
  docPages,
  escapeHtml,
  FAVICON,
  firstParagraph,
  installSection,
  PAGES,
  readDocs,
  render,
  renderMarkdown,
  renderPage,
  templateValues,
  THEME_ITEM,
  withInstall,
} from "./build"
import type { Doc, Registry } from "./build"

const root = resolve(import.meta.dirname, "../..")
const registry = JSON.parse(readFileSync(resolve(root, "registry.json"), "utf8")) as Registry
const version = readFileSync(resolve(root, "version.txt"), "utf8").trim()
const template = (page: string) => readFileSync(resolve(root, "site", page), "utf8")

describe("the landing page", () => {
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

  it("lists every item, linking its doc on GitHub when the tag ships no page for it", () => {
    for (const item of registry.items) {
      expect(page).toContain(`<code>${item.name}</code>`)
      expect(page).toContain(`https://github.com/tradecn/ui/blob/v${version}/docs/${item.name}.md`)
    }
  })

  it("links the item's own page when the tag ships a doc for it", () => {
    const withDocs = renderPage(template("index.html"), templateValues(registry, version, registry, new Set(["format"])))
    expect(withDocs).toContain(`<a href="/docs/format/"><code>format</code></a>`)
    expect(withDocs).toContain(`https://github.com/tradecn/ui/blob/v${version}/docs/row-store.md`)
  })

  it("shows both install forms under pnpm, npm, yarn, and bun, and keeps the CLI's {name} placeholder intact", () => {
    for (const run of ["npx", "pnpm dlx", "yarn dlx", "bunx --bun"]) {
      expect(page).toContain(`${run} shadcn@latest add tradecn/ui/data-grid#v${version}`)
      expect(page).toContain(`${run} shadcn@latest add @tradecn/data-grid`)
    }
    expect(page).toContain(`"@tradecn": "https://tradecn.dev/r/{name}.json"`)
    expect(page).toContain(`/r/v${version}/{name}.json`)
    expect(page.match(/<div class="code command">/g)).toHaveLength(2)
    // The two commands and the components.json block each have a button; the JSON gets no tabs.
    expect(page.match(/class="copy"/g)).toHaveLength(3)
    expect(page).toContain('<h2 id="install">Install</h2>')
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

  it("write the runner shadcn's site shows for each manager", () => {
    expect(commandFor("npx shadcn@latest add x\n", "bunx --bun")).toBe("bunx --bun shadcn@latest add x\n")
    expect(commandFor("echo npx\nnpx x", "pnpm dlx")).toBe("echo npx\npnpm dlx x")
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

  it("puts an Install section with both forms on an item page, after the intro and before its first section", () => {
    const panel = byPath.get("docs/panel/index.html") ?? ""
    const install = panel.indexOf('<h2 id="install"><a href="#install">Install</a></h2>')
    expect(install).toBeGreaterThan(0)
    for (const run of ["npx", "pnpm dlx", "yarn dlx", "bunx --bun"]) {
      expect(panel).toContain(`${run} shadcn@latest add tradecn/ui/panel#v${version}`)
      expect(panel).toContain(`${run} shadcn@latest add @tradecn/panel`)
    }
    // The intro's usage block comes first; the doc's own sections follow.
    expect(panel.indexOf('class="language-tsx"')).toBeLessThan(install)
    expect(install).toBeLessThan(panel.indexOf('<h2 id="a-panel-is-a-hotkey-scope">'))
    expect(panel).toContain('<a href="/#install">')
    expect(panel).not.toContain("Install: <code>")
  })

  it("ends a page with no sections with the Install section, and puts none on the contract", () => {
    const flash = byPath.get("docs/flash-cell/index.html") ?? ""
    const install = flash.indexOf('<h2 id="install">')
    expect(install).toBeGreaterThan(flash.lastIndexOf('class="language-tsx"'))
    expect(install).toBeLessThan(flash.indexOf('class="foot"'))
    const contract = byPath.get("docs/contract/index.html") ?? ""
    expect(contract).not.toContain("shadcn@latest add")
    expect(contract).not.toContain('id="install"')
    expect(contract).toContain("docs/contract.md")
  })

  it("lands before the first section heading, or last, and refuses a doc with its own Install heading", () => {
    expect(withInstall('<h1>t</h1>\n<p>a</p>\n<pre><code>u</code></pre>\n<h2 id="x">x</h2>\n<p>b</p>\n', "<h2>I</h2>")).toBe(
      '<h1>t</h1>\n<p>a</p>\n<pre><code>u</code></pre>\n<h2>I</h2>\n<h2 id="x">x</h2>\n<p>b</p>\n',
    )
    expect(withInstall("<h1>t</h1>\n<p>a</p>\n", "<h2>I</h2>")).toBe("<h1>t</h1>\n<p>a</p>\n<h2>I</h2>\n")
    expect(installSection("panel", "v1.2.3")).toContain("npx shadcn@latest add tradecn/ui/panel#v1.2.3")
    const doc: Doc = { ...docs[0]!, html: '<h1 id="x">x</h1>\n<h2 id="install"><a href="#install">Install</a></h2>\n' }
    expect(() => docPages([doc], values, template(DOCS_TEMPLATE))).toThrow(/Install heading/)
  })

  it("gives every code block on every page a copy button", () => {
    for (const page of pages) {
      // A plain <pre> is wrapped; an install block's four panels carry data-pm and share one button.
      expect(page.html).not.toMatch(/(?<!<div class="code">)<pre>/)
      expect(page.html.match(/<pre id="pm-/g)?.length ?? 0).toBe((page.html.match(/<div class="code command">/g)?.length ?? 0) * 4)
    }
  })

  it("lists every page on the index and links the landing page to each item's page", () => {
    const index = byPath.get("docs/index.html") ?? ""
    for (const doc of docs) expect(index).toContain(`href="/docs/${doc.slug}/"`)
    const landing = renderPage(template("index.html"), values)
    for (const doc of docs.filter((d) => d.item)) expect(landing).toContain(`<a href="/docs/${doc.slug}/"><code>${doc.slug}</code></a>`)
  })
})
