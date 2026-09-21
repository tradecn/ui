import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { escapeHtml, FAVICON, PAGES, render, templateValues, THEME_ITEM } from "./build-site"
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

  it("lists every item with its docs pinned to the tag", () => {
    for (const item of registry.items) {
      expect(page).toContain(`<code>${item.name}</code>`)
      expect(page).toContain(`https://github.com/tradecn/ui/blob/v${version}/docs/${item.name}.md`)
    }
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
