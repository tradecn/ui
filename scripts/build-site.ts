#!/usr/bin/env bun
// Render tradecn.dev: the landing page and one page per docs/*.md.
//   bun scripts/build-site.ts [--registry registry.json] [--version version.txt] [--docs docs] [--theme registry.json] [--out site/dist]
// The pages say what a release ships, so the release job points --registry, --version, and --docs
// at the tag's checkout while the templates in site/, this script, and the palette come from main.
// The palette is main's because a tag from before the theme existed has none to give.
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { parseArgs } from "node:util"
import { Marked } from "marked"

export const SITE_URL = "https://tradecn.dev"
export const REPO_URL = "https://github.com/tradecn/ui"

/** The pages take their colors from this theme, so they look like the product without a palette of their own. */
export const THEME_ITEM = "tradecn-terminal"
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
  "up",
  "down",
  "radius",
] as const

export type RegistryItem = {
  name: string
  type: string
  title?: string
  description?: string
  cssVars?: { theme?: Record<string, string>; light?: Record<string, string>; dark?: Record<string, string> }
}
export type Registry = { name: string; items: RegistryItem[] }

const ENTITIES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ENTITIES[c] ?? c)
}

/** Every value the landing templates may use. Items and version come from `registry`, the palette from `themeSource`. */
export function templateValues(
  registry: Registry,
  version: string,
  themeSource: Registry = registry,
  docSlugs: ReadonlySet<string> = new Set(),
): Record<string, string> {
  const tag = `v${version}`
  const theme = themeSource.items.find((item) => item.name === THEME_ITEM)
  const light = theme?.cssVars?.light
  if (!theme || !light) throw new Error(`${THEME_ITEM} has no cssVars.light and the page takes its palette from it`)
  const palette = PALETTE.map((token) => {
    const value = light[token]
    if (!value) throw new Error(`${THEME_ITEM} sets no ${token} token`)
    return `  --${token}: ${value};`
  }).join("\n")
  const font = theme.cssVars?.theme?.["font-sans"] ?? "ui-monospace, monospace"
  const items = registry.items
    .map((item) => {
      const kind = item.type.replace(/^registry:/, "")
      // The item's own page when the tag ships a doc for it, the file on GitHub otherwise.
      const docs = docSlugs.has(item.name) ? `/docs/${item.name}/` : `${REPO_URL}/blob/${tag}/docs/${item.name}.md`
      return `      <tr><td><a href="${docs}"><code>${escapeHtml(item.name)}</code></a></td><td class="kind">${escapeHtml(kind)}</td><td>${escapeHtml(item.description ?? "")}</td></tr>`
    })
    .join("\n")
  return {
    version,
    tag,
    palette,
    font,
    items,
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

export const PAGES = ["index.html", "404.html"] as const
export const FAVICON = "favicon.svg"
export const DOCS_TEMPLATE = "docs.html"

export type RenderedDoc = { title: string; description: string; html: string }
export type Doc = RenderedDoc & { slug: string; source: string; item?: RegistryItem }

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
    if (!pastTitle || !line.trim() || /^(#|-|\d+\.|>|\|)/.test(line)) continue
    return line.replace(/`/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").trim().slice(0, 200)
  }
  return ""
}

/** Markdown to HTML with the first `#` as the title and an anchor on every heading. */
export function renderMarkdown(markdown: string): RenderedDoc {
  const ids = new Map<string, number>()
  let title = ""
  const marked = new Marked({ gfm: true })
  marked.use({
    renderer: {
      heading(token) {
        const plain = token.text.replace(/`/g, "")
        if (token.depth === 1 && !title) title = plain
        let id = slugify(plain)
        const seen = ids.get(id) ?? 0
        ids.set(id, seen + 1)
        if (seen) id = `${id}-${seen}`
        return `<h${token.depth} id="${id}"><a href="#${id}">${this.parser.parseInline(token.tokens)}</a></h${token.depth}>\n`
      },
    },
  })
  const html = marked.parse(markdown) as string
  return { title, description: firstParagraph(markdown), html }
}

/** Every docs/*.md, item docs first in registry order, the rest by name. */
export async function readDocs(dir: string, registry: Registry): Promise<Doc[]> {
  const names = (await readdir(dir)).filter((name) => name.endsWith(".md")).sort()
  const docs = await Promise.all(
    names.map(async (source): Promise<Doc> => {
      const slug = source.slice(0, -".md".length)
      const rendered = renderMarkdown(await readFile(join(dir, source), "utf8"))
      if (!rendered.title) throw new Error(`docs/${source} has no # title`)
      return { ...rendered, slug, source, item: registry.items.find((item) => item.name === slug) }
    }),
  )
  const order = new Map(registry.items.map((item, index) => [item.name, index]))
  return docs.sort((a, b) => (order.get(a.slug) ?? Infinity) - (order.get(b.slug) ?? Infinity) || a.slug.localeCompare(b.slug))
}

export function docsNav(docs: Doc[], current: string | null): string {
  const link = (doc: Doc) =>
    `<li><a href="/docs/${doc.slug}/"${doc.slug === current ? ' aria-current="page"' : ""}>${escapeHtml(doc.item ? doc.slug : doc.title)}</a></li>`
  const items = docs.filter((doc) => doc.item)
  const rest = docs.filter((doc) => !doc.item)
  const sections = [
    `<h2><a href="/docs/"${current === null ? ' aria-current="page"' : ""}>Docs</a></h2>`,
    `<h2>Items</h2>\n<ul>\n${items.map(link).join("\n")}\n</ul>`,
  ]
  if (rest.length) sections.push(`<h2>Also</h2>\n<ul>\n${rest.map(link).join("\n")}\n</ul>`)
  return sections.join("\n")
}

/** The rendered docs pages and their index, as paths under the output directory. */
export function docPages(docs: Doc[], values: Record<string, string>, template: string): Array<{ path: string; html: string }> {
  const { tag, repoUrl } = values
  const pages = docs.map((doc) => {
    const install = doc.item
      ? ` Install: <code>npx shadcn@latest add @tradecn/${doc.slug}</code> or <code>npx shadcn@latest add tradecn/ui/${doc.slug}#${tag}</code>.`
      : ""
    const foot = `<p class="foot">This page is <code>docs/${doc.source}</code> at <a href="${repoUrl}/blob/${tag}/docs/${doc.source}">${tag}</a>.${install}</p>`
    return {
      path: `docs/${doc.slug}/index.html`,
      html: render(template, {
        ...values,
        title: escapeHtml(doc.title),
        description: escapeHtml(doc.description),
        path: `/docs/${doc.slug}/`,
        nav: docsNav(docs, doc.slug),
        content: doc.html,
        foot,
      }),
    }
  })
  const entry = (doc: Doc) =>
    `<li><a href="/docs/${doc.slug}/"><code>${escapeHtml(doc.item ? doc.slug : doc.title)}</code></a> ${escapeHtml(doc.item?.description ?? doc.description)}</li>`
  const items = docs.filter((doc) => doc.item)
  const rest = docs.filter((doc) => !doc.item)
  const index = [
    `<h1 id="docs">Docs</h1>`,
    `<p>One page per item, from the <code>docs/</code> folder at ${tag}.</p>`,
    `<ul>\n${items.map(entry).join("\n")}\n</ul>`,
    rest.length ? `<h2 id="also">Also</h2>\n<ul>\n${rest.map(entry).join("\n")}\n</ul>` : "",
  ].join("\n")
  pages.push({
    path: "docs/index.html",
    html: render(template, {
      ...values,
      title: "Docs",
      description: `Docs for every tradecn/ui item at ${tag}.`,
      path: "/docs/",
      nav: docsNav(docs, null),
      content: index,
      foot: "",
    }),
  })
  return pages
}

async function main() {
  const root = resolve(import.meta.dirname, "..")
  const { values: args } = parseArgs({
    options: {
      registry: { type: "string", default: "registry.json" },
      version: { type: "string", default: "version.txt" },
      docs: { type: "string", default: "docs" },
      theme: { type: "string", default: join(root, "registry.json") },
      out: { type: "string", default: "site/dist" },
    },
  })
  const registry = JSON.parse(await readFile(resolve(args.registry), "utf8")) as Registry
  const themeSource = JSON.parse(await readFile(resolve(args.theme), "utf8")) as Registry
  const version = (await readFile(resolve(args.version), "utf8")).trim()
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`${args.version} holds "${version}", which is not a version`)
  const docs = await readDocs(resolve(args.docs), registry)
  const values = templateValues(registry, version, themeSource, new Set(docs.map((doc) => doc.slug)))
  const out = resolve(args.out)
  await mkdir(out, { recursive: true })
  for (const page of PAGES) {
    const template = await readFile(join(root, "site", page), "utf8")
    await writeFile(join(out, page), render(template, values))
  }
  // The amber mark: readable on a dark tab strip, and the same file the README shows in dark mode.
  await writeFile(join(out, FAVICON), await readFile(join(root, "assets", "logo-dark.svg")))
  const docsTemplate = await readFile(join(root, "site", DOCS_TEMPLATE), "utf8")
  for (const page of docPages(docs, values, docsTemplate)) {
    await mkdir(join(out, dirname(page.path)), { recursive: true })
    await writeFile(join(out, page.path), page.html)
  }
  console.log(`site: ${registry.items.length} items, ${docs.length} docs pages at v${version} -> ${out}`)
}

if (import.meta.main) await main()
