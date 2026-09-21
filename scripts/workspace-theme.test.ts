import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { LOCKED_STYLES, ROOT, readRegistry } from "./lib/registry"

// The workspace item appends one class to the consumer's stylesheet that maps every variable the
// dock draws from onto shadcn tokens. Two things can go wrong after the fact: dockview adds a
// variable its built-in themes set and ours does not, and the tab it draws is transparent; or the
// class names a shadcn variable a style does not define. Both are checked against what is installed.

const item = readRegistry().items.find((i) => i.name === "workspace")!
const theme = (item.css?.["@layer components"] as Record<string, Record<string, string>>)[".dockview-theme-tradecn"]!

// Every `--dv-*` the dock's own light theme sets, read from the stylesheet the item imports.
const dockCss = readFileSync(path.join(ROOT, "node_modules/dockview-react/dist/styles/dockview.css"), "utf8")
const builtin = new Set<string>()
for (const block of dockCss.matchAll(/\.dockview-theme-light\s*\{([^}]*)\}/g)) for (const m of block[1]!.matchAll(/(--dv-[\w-]+)\s*:/g)) builtin.add(m[1]!)

describe("the dockview theme class", () => {
  it("sets every variable the dock's own theme sets", () => {
    expect(builtin.size).toBeGreaterThan(40)
    const ours = new Set(Object.keys(theme))
    expect([...builtin].filter((name) => !ours.has(name)).sort()).toEqual([])
  })

  it("sets nothing the dock does not know", () => {
    // Read in the stylesheet, or set by the dock's own theme (the tab-group colors are read from script).
    const known = new Set([...builtin, ...[...dockCss.matchAll(/var\((--dv-[\w-]+)/g)].map((m) => m[1]!)])
    expect(Object.keys(theme).filter((name) => !known.has(name)).sort()).toEqual([])
  })

  it("draws only from variables every locked style defines", () => {
    const wanted = new Set([...Object.values(theme).join(" ").matchAll(/var\((--[\w-]+)\)/g)].map((m) => m[1]!))
    expect(wanted.size).toBeGreaterThan(5)
    for (const style of LOCKED_STYLES) {
      const css = readFileSync(path.join(ROOT, "fixtures/consumers", style, "src/index.css"), "utf8")
      const root = [...css.matchAll(/:root\s*\{([^}]*)\}/g)].map((m) => m[1]!).join("\n")
      const defined = new Set([...root.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]!))
      expect([...wanted].filter((name) => !defined.has(name)), `${style} defines what the theme uses`).toEqual([])
    }
  })

  it("keeps the dock's overlays under a shadcn dialog", () => {
    expect(Number(theme["--dv-overlay-z-index"])).toBeLessThan(50)
  })
})
