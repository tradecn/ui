import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { escapeHtml, PAGES, render, templateValues, THEME_ITEM } from "./build-site"
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

  it("refuses a registry without the theme it takes its palette from", () => {
    const bare: Registry = { name: "t", items: registry.items.filter((item) => item.name !== THEME_ITEM) }
    expect(() => templateValues(bare, version)).toThrow(THEME_ITEM)
  })
})
