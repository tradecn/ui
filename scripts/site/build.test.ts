import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import {
  codeBlocks,
  commandFor,
  consumerPath,
  DOCS_TEMPLATE,
  docPages,
  escapeHtml,
  FAVICON,
  firstParagraph,
  installationSection,
  PAGES,
  readDocs,
  readSources,
  registryCss,
  render,
  renderMarkdown,
  renderPage,
  templateValues,
  THEME_ITEM,
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
    expect(firstParagraph("# t\n\n```ts\nnot this\n```\n\n- not this\n\nUse `formatPrice` for [prices](x.md).\n")).toBe(
      "Use formatPrice for prices.",
    )
  })
})

describe("the docs pages", async () => {
  const docs = await readDocs(resolve(root, "docs"), registry)
  const values = templateValues(registry, version, registry, new Set(docs.map((doc) => doc.slug)))
  const sources = await readSources(registry, root)
  const pages = docPages(docs, values, template(DOCS_TEMPLATE), undefined, sources)
  const byPath = new Map(pages.map((page) => [page.path, page.html]))
  const items = docs.filter((doc) => doc.item)

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
    const grid = byPath.get("docs/data-grid/index.html") ?? ""
    const installation = grid.indexOf('<h2 id="installation"><a href="#installation">Installation</a></h2>')
    expect(installation).toBeGreaterThan(grid.indexOf("</h1>"))
    expect(installation).toBeLessThan(grid.indexOf('<h2 id="usage">'))
    expect(grid).toContain('<div class="tabs" data-tabs>')
    expect(grid).toContain('role="tab" id="installation-tab-command" aria-selected="true" aria-controls="installation-command"')
    expect(grid).toContain('<div id="installation-manual" role="tabpanel" aria-labelledby="installation-tab-manual" hidden>')
    for (const run of ["npx", "pnpm dlx", "yarn dlx", "bunx --bun"]) expect(grid).toContain(`${run} shadcn@latest add tradecn/ui/data-grid#v${version}`)
    expect(grid).not.toContain("@tradecn/data-grid")
  })

  it("spells the install out under Manual: packages, built-ins, every file at its path with a consumer's imports, and the CSS", () => {
    const grid = byPath.get("docs/data-grid/index.html") ?? ""
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
    const ticket = byPath.get("docs/ticket/index.html") ?? ""
    expect(ticket).toContain('<p class="file"><code>components/ticket.tsx</code></p>')
    const workspace = byPath.get("docs/workspace/index.html") ?? ""
    expect(workspace).toContain("<p>Append this to your stylesheet:</p>")
    expect(workspace).toContain("@layer components {\n  .dockview-theme-tradecn {\n    --dv-")
    const format = byPath.get("docs/format/index.html") ?? ""
    expect(format).not.toContain("Install the dependencies")
    expect(format).not.toContain("Add the shadcn components")
    expect(format).toContain('<p class="file"><code>lib/format.ts</code></p>')
    const theme = byPath.get("docs/tradecn-terminal/index.html") ?? ""
    expect(theme).toContain("<p>Replace the variables in your stylesheet with these:</p>")
    expect(theme).toContain("@theme inline {")
    expect(theme).not.toContain("Copy the files")
    const contract = byPath.get("docs/contract/index.html") ?? ""
    expect(contract).not.toContain('id="installation"')
    expect(contract).not.toContain("shadcn@latest add tradecn/ui/")
  })

  it("names the shadcn components an item is built on and links the pages before and after", () => {
    const grid = byPath.get("docs/data-grid/index.html") ?? ""
    expect(grid).toContain(
      `<p class="built-on">Built on shadcn's <a href="https://ui.shadcn.com/docs/components/checkbox"><code>checkbox</code></a>, <a href="https://ui.shadcn.com/docs/components/context-menu"><code>context-menu</code></a>, and <a href="https://ui.shadcn.com/docs/components/dropdown-menu"><code>dropdown-menu</code></a>.</p>`,
    )
    expect(byPath.get("docs/panel/index.html")).toContain(`<p class="built-on">Built on shadcn's <a href="https://ui.shadcn.com/docs/components/input"><code>input</code></a>.</p>`)
    expect(byPath.get("docs/format/index.html")).not.toContain('<p class="built-on">')
    const first = byPath.get(`docs/${docs[0]!.slug}/index.html`) ?? ""
    expect(first).toContain(`<nav class="pager" aria-label="Previous and next">\n<span></span>\n<a rel="next" href="/docs/${docs[1]!.slug}/">${docs[1]!.slug} →</a>`)
    const last = byPath.get(`docs/${docs.at(-1)!.slug}/index.html`) ?? ""
    expect(last).toContain(`<a rel="prev" href="/docs/${docs.at(-2)!.slug}/">← ${docs.at(-2)!.slug}</a>\n<span></span>`)
    expect(byPath.get(`docs/${docs.at(-2)!.slug}/index.html`)).toContain(`<a rel="next" href="/docs/contract/">The item contract →</a>`)
  })

  it("refuses a doc with its own Installation heading, and an item whose files the checkout lacks", () => {
    const doc: Doc = { ...docs[0]!, html: '<h1 id="x">x</h1>\n<h2 id="installation"><a href="#installation">Installation</a></h2>\n' }
    expect(() => docPages([doc], values, template(DOCS_TEMPLATE), undefined, sources)).toThrow(/Installation heading/)
    expect(() => installationSection(registry.items[0]!, "v1.0.0", new Map())).toThrow(/checkout does not have/)
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
