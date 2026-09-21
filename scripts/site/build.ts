#!/usr/bin/env bun
// Render tradecn.dev: the landing page, one page per docs/*.md, and one embedded preview per item.
//   bun scripts/site/build.ts [--registry registry.json] [--version version.txt] [--docs docs] [--theme registry.json]
//                             [--demos playground/src/demos] [--embed playground/dist/embed] [--out site/dist]
// The pages say what a release ships, so the release job points --registry, --version, --docs, --demos, and
// --embed at the tag's checkout while the templates in site/, this script, and the palette come from main.
// The palette is main's because a tag from before the theme existed has none to give. A tag from before
// the previews existed has no embed build, and its pages go out without them.
import { cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises"
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
export const PREVIEW_TEMPLATE = "preview.html"
/** Where the embedded previews live on the site: /preview/<item>/ and the bundle under /preview/assets/. */
export const PREVIEW_PATH = "preview"
/** dockview opens this on the site's origin for a popped-out workspace panel; the playground's copy is published at the root. */
export const POPOUT = "popout.html"

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

// The previews. A demo is playground/src/demos/<item>.tsx; the embed build is that app's dist/embed,
// a Vite manifest over one entry with a chunk per demo. The pages need both, or neither.

export type Demo = { name: string; source: string; code: string }
/** The embed build: the entry's script and stylesheets as site paths, and the directory to copy. */
export type Embed = { dir: string; script: string; styles: string[] }

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

/** Every variable a theme sets, for the embed page's `:root`: the whole palette, not the landing page's dozen. */
export function fullPalette(theme: RegistryItem): string {
  const light = theme.cssVars?.light ?? {}
  const font = theme.cssVars?.theme?.["font-sans"]
  const lines = Object.entries(light).map(([token, value]) => `  --${token}: ${value};`)
  if (font) lines.push(`  --font-sans: ${font};`)
  if (!lines.length) throw new Error(`${theme.name} sets no variables`)
  return lines.join("\n")
}

/** The Preview / Code card on an item's page. The iframe is sized by the message the embed posts. */
export function previewBlock(doc: Doc, demo: Demo, tag: string): string {
  const name = doc.slug
  const theme = doc.item?.type === "registry:theme"
  const code = theme && doc.item ? themeCss(doc.item) : demo.code
  const language = theme ? "css" : "tsx"
  const codeSource = theme ? `what <code>${escapeHtml(name)}</code> writes into your stylesheet` : `<code>playground/src/demos/${escapeHtml(name)}.tsx</code>`
  return [
    `<div class="preview" data-preview="${escapeHtml(name)}">`,
    `<div class="preview-bar" role="tablist" aria-label="${escapeHtml(name)} preview">`,
    `<button type="button" role="tab" id="preview-tab-live" aria-selected="true" aria-controls="preview-live">Preview</button>`,
    `<button type="button" role="tab" id="preview-tab-code" aria-selected="false" aria-controls="preview-code">Code</button>`,
    `<a class="preview-open" href="/${PREVIEW_PATH}/${escapeHtml(name)}/" target="_blank" rel="noopener">Open in a new tab</a>`,
    `</div>`,
    `<div class="preview-live" id="preview-live" role="tabpanel" aria-labelledby="preview-tab-live">`,
    `<iframe src="/${PREVIEW_PATH}/${escapeHtml(name)}/" title="${escapeHtml(name)}, live" loading="lazy"></iframe>`,
    `</div>`,
    `<div class="preview-code" id="preview-code" role="tabpanel" aria-labelledby="preview-tab-code" hidden>`,
    `<p class="preview-source">${codeSource}, at <a href="${REPO_URL}/blob/${tag}/playground/src/demos/${escapeHtml(name)}.tsx">${tag}</a>.</p>`,
    `<pre><code class="language-${language}">${escapeHtml(code)}</code></pre>`,
    `</div>`,
    `</div>`,
  ].join("\n")
}

/** The preview goes after the first paragraph: the title, what the item is, then the item itself. */
export function withPreview(html: string, block: string): string {
  const h1 = html.indexOf("</h1>")
  const p = html.indexOf("</p>\n", h1 < 0 ? 0 : h1)
  const at = p < 0 ? (h1 < 0 ? 0 : h1 + "</h1>\n".length) : p + "</p>\n".length
  return `${html.slice(0, at)}${block}\n${html.slice(at)}`
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

export type Previews = { demos: Map<string, Demo>; embed: Embed | null }
const NO_PREVIEWS: Previews = { demos: new Map(), embed: null }

/** The rendered docs pages and their index, as paths under the output directory. */
export function docPages(docs: Doc[], values: Record<string, string>, template: string, previews: Previews = NO_PREVIEWS): Array<{ path: string; html: string }> {
  const { tag = "", repoUrl } = values
  const pages = docs.map((doc) => {
    const demo = doc.item && previews.embed ? previews.demos.get(doc.slug) : undefined
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
        content: demo ? withPreview(doc.html, previewBlock(doc, demo, tag)) : doc.html,
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

/**
 * One page per demo at /preview/<item>/, around the embed bundle. A theme's page wears that theme; every
 * other page wears the site's, from `themeSource`, so a demo looks like the docs page that frames it.
 */
export function previewPages(registry: Registry, themeSource: Registry, previews: Previews, values: Record<string, string>, template: string): Array<{ path: string; html: string }> {
  const { embed } = previews
  if (!embed) return []
  const site = themeSource.items.find((item) => item.name === THEME_ITEM)
  if (!site) throw new Error(`${THEME_ITEM} is not in the theme source`)
  const styles = embed.styles.map((href) => `<link rel="stylesheet" href="${href}">`).join("\n")
  return [...previews.demos.values()]
    .filter((demo) => registry.items.some((item) => item.name === demo.name))
    .map((demo) => {
      const item = registry.items.find((entry) => entry.name === demo.name)!
      const theme = item.type === "registry:theme" ? item : site
      return {
        path: `${PREVIEW_PATH}/${demo.name}/index.html`,
        html: render(template, { ...values, item: escapeHtml(demo.name), palette: fullPalette(theme), styles, script: embed.script }),
      }
    })
}

async function main() {
  const root = resolve(import.meta.dirname, "../..")
  const { values: args } = parseArgs({
    options: {
      registry: { type: "string", default: "registry.json" },
      version: { type: "string", default: "version.txt" },
      docs: { type: "string", default: "docs" },
      theme: { type: "string", default: join(root, "registry.json") },
      demos: { type: "string", default: "playground/src/demos" },
      embed: { type: "string", default: "playground/dist/embed" },
      out: { type: "string", default: "site/dist" },
    },
  })
  const registry = JSON.parse(await readFile(resolve(args.registry), "utf8")) as Registry
  const themeSource = JSON.parse(await readFile(resolve(args.theme), "utf8")) as Registry
  const version = (await readFile(resolve(args.version), "utf8")).trim()
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`${args.version} holds "${version}", which is not a version`)
  const docs = await readDocs(resolve(args.docs), registry)
  const values = templateValues(registry, version, themeSource, new Set(docs.map((doc) => doc.slug)))
  const previews: Previews = { demos: await readDemos(resolve(args.demos)), embed: await readEmbed(resolve(args.embed)) }
  const out = resolve(args.out)
  await mkdir(out, { recursive: true })
  for (const page of PAGES) {
    const template = await readFile(join(root, "site", page), "utf8")
    await writeFile(join(out, page), render(template, values))
  }
  // The amber mark: readable on a dark tab strip, and the same file the README shows in dark mode.
  await writeFile(join(out, FAVICON), await readFile(join(root, "assets", "logo-dark.svg")))
  const docsTemplate = await readFile(join(root, "site", DOCS_TEMPLATE), "utf8")
  for (const page of docPages(docs, values, docsTemplate, previews)) {
    await mkdir(join(out, dirname(page.path)), { recursive: true })
    await writeFile(join(out, page.path), page.html)
  }
  const pages = previewPages(registry, themeSource, previews, values, await readFile(join(root, "site", PREVIEW_TEMPLATE), "utf8"))
  if (previews.embed) {
    await cp(join(previews.embed.dir, "assets"), join(out, PREVIEW_PATH, "assets"), { recursive: true })
    await cp(join(previews.embed.dir, POPOUT), join(out, POPOUT))
    for (const page of pages) {
      await mkdir(join(out, dirname(page.path)), { recursive: true })
      await writeFile(join(out, page.path), page.html)
    }
  }
  const previewNote = previews.embed ? `${pages.length} previews` : "no previews (no embed build)"
  console.log(`site: ${registry.items.length} items, ${docs.length} docs pages, ${previewNote} at v${version} -> ${out}`)
}

if (import.meta.main) await main()
