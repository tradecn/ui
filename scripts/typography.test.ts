import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import {
  ACCESSIBILITY_REMAP,
  ACCESSIBILITY_SELECTOR,
  ACCESSIBLE_TOKENS,
  FONT_TOKENS,
  NUMERIC_VARIANT,
  NUMERIC_VARIANT_TOKEN,
  ROOT,
  TEXT_SIZE_FLOOR_PX,
  THEME_TYPOGRAPHY_CSS,
  TYPOGRAPHY_TOKEN,
  cssFor,
  cssVarsFor,
  fontSizesUnderFloor,
  isColorValue,
  readRegistry,
  readTokens,
  tokenClosure,
} from "./lib/registry"

// The typography system (docs/typography.md): the tokens, what the themes and the items carry, and the
// one rule the registry enforces. The validator checks the registry; this holds the docs and the README
// to it, and the pieces of the lib the validator and `just tokens` lean on.

const tokens = readTokens()
const registry = readRegistry()
const themes = registry.items.filter((item) => item.type === "registry:theme")
const typography = Object.keys(tokens.dark).filter((name) => TYPOGRAPHY_TOKEN.test(name))
const RULE = "Any component rendering numeric data MUST set `font-variant-numeric: lining-nums tabular-nums` on the numeric node."

describe("the typography tokens", () => {
  it("exist, the same in both modes, and are never colors", () => {
    expect(typography.length).toBeGreaterThanOrEqual(13)
    for (const name of typography) {
      expect(tokens.light[name], name).toBe(tokens.dark[name])
      expect(isColorValue(tokens.dark[name]!), name).toBe(false)
    }
    for (const name of FONT_TOKENS) expect(typography).toContain(name)
    for (const name of ACCESSIBLE_TOKENS) expect(typography).toContain(name)
  })

  it("fix the numeric variant, and keep the accessible stacks free of a var() that would cycle with the remap", () => {
    expect(tokens.dark[NUMERIC_VARIANT_TOKEN]).toBe(NUMERIC_VARIANT)
    expect(NUMERIC_VARIANT).toBe("lining-nums tabular-nums")
    for (const name of ACCESSIBLE_TOKENS) expect(tokens.dark[name], name).not.toMatch(/var\(/)
    expect(tokens.dark["tradecn-font-numeric"]).toBe("var(--tradecn-font-sans)")
  })

  it("keep the body size at or under 14 px and the grid floor at or over 12 px", () => {
    expect(parseFloat(tokens.dark["tradecn-text-size-body"]!)).toBeLessThanOrEqual(14)
    expect(parseFloat(tokens.dark["tradecn-text-size-grid-min"]!)).toBeGreaterThanOrEqual(12)
    expect(parseFloat(tokens.dark["tradecn-text-size-grid"]!)).toBeGreaterThanOrEqual(parseFloat(tokens.dark["tradecn-text-size-grid-min"]!))
  })

  it("close over what a value refers to, and bring the accessible pair with any font token", () => {
    const closure = tokenClosure(new Set(["tradecn-font-numeric"]), tokens)
    expect([...closure].sort()).toEqual(["tradecn-font-accessible", "tradecn-font-accessible-mono", "tradecn-font-numeric", "tradecn-font-sans"])
    expect([...tokenClosure(new Set(["up"]), tokens)]).toEqual(["up"])
    expect(cssVarsFor(new Set(["tradecn-font-mono"]), tokens)?.light).toHaveProperty("tradecn-font-accessible-mono")
    expect(cssFor(new Set(["tradecn-font-mono"]), tokens, undefined)).toEqual({ [ACCESSIBILITY_SELECTOR]: ACCESSIBILITY_REMAP })
    expect(cssFor(new Set(["up"]), tokens, undefined)).toBeUndefined()
    // Hand-written css is kept, and the remap is not duplicated.
    const keyframes = { "@keyframes tradecn-x": { from: { opacity: "0" } } }
    expect(cssFor(new Set(["tradecn-font-sans"]), tokens, { ...keyframes, [ACCESSIBILITY_SELECTOR]: { stale: "yes" } })).toEqual({ ...keyframes, [ACCESSIBILITY_SELECTOR]: ACCESSIBILITY_REMAP })
  })
})

describe("the themes' typography", () => {
  it("carry every typography token at its default, the numeric family on the sans, and append the base rules", () => {
    for (const theme of themes) {
      for (const mode of ["light", "dark"] as const) {
        for (const name of typography) expect(theme.cssVars?.[mode]?.[name], `${theme.name} ${mode} ${name}`).toBe(tokens[mode][name])
        expect(theme.cssVars?.[mode]?.["tradecn-font-numeric"], theme.name).toBe("var(--tradecn-font-sans)")
        expect(theme.cssVars?.[mode]?.[NUMERIC_VARIANT_TOKEN], theme.name).toBe(NUMERIC_VARIANT)
      }
      expect(theme.css, theme.name).toEqual(THEME_TYPOGRAPHY_CSS)
    }
  })

  it("start the remap from the root, unlayered, so it beats the :root block on <html>", () => {
    expect(ACCESSIBILITY_SELECTOR.startsWith(':root[data-accessibility="hyperlegible"]')).toBe(true)
    expect(Object.keys(THEME_TYPOGRAPHY_CSS)).toEqual(["@layer base", ACCESSIBILITY_SELECTOR])
    expect((THEME_TYPOGRAPHY_CSS["@layer base"] as Record<string, unknown>)[":root"]).toEqual({ "font-variant-numeric": `var(--${NUMERIC_VARIANT_TOKEN})` })
  })
})

describe("the items' typography", () => {
  const withFonts = registry.items.filter((item) => item.type !== "registry:theme" && FONT_TOKENS.some((name) => item.cssVars?.light?.[name]))

  it("ship the accessibility remap and the accessible pair with every item that reads a font token", () => {
    expect(withFonts.map((item) => item.name)).toContain("data-grid")
    expect(withFonts.map((item) => item.name)).toContain("quote-field")
    for (const item of withFonts) {
      expect(item.css?.[ACCESSIBILITY_SELECTOR], item.name).toEqual(ACCESSIBILITY_REMAP)
      for (const name of ACCESSIBLE_TOKENS) expect(item.cssVars?.light?.[name], `${item.name} ${name}`).toBe(tokens.light[name])
    }
    for (const item of registry.items) if (!withFonts.includes(item) && item.type !== "registry:theme") expect(item.css?.[ACCESSIBILITY_SELECTOR], item.name).toBeUndefined()
  })

  // The registry source is the contract's; the demos and scenes are shown to consumers under the Code tab and in the
  // playground, so they read the way the contract asks too. The fixtures' spec and the playground's own shadcn
  // components are not tradecn's to hold.
  const SWEPT = ["registry/tradecn", "playground/src/demos", "playground/src/items", "playground/src/bench", "playground/src/App.tsx", "fixtures/smoke/scenes"]

  it("set lining figures wherever they set tabular ones, reach every font through a token, and draw nothing under the floor", () => {
    const sources: string[] = []
    const walk = (entry: string) => {
      if (statSync(entry).isDirectory()) for (const name of readdirSync(entry)) walk(path.join(entry, name))
      else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) sources.push(entry)
    }
    for (const root of SWEPT) walk(path.join(ROOT, root))
    expect(sources.length).toBeGreaterThan(60)
    expect(TEXT_SIZE_FLOOR_PX).toBe(parseFloat(tokens.dark["tradecn-text-size-grid-min"]!))
    for (const file of sources) {
      const lines = readFileSync(file, "utf8").split("\n")
      lines.forEach((line, index) => {
        if (/\btabular-nums\b/.test(line)) expect(line, `${path.relative(ROOT, file)}:${index + 1}`).toMatch(/\blining-nums\b/)
        expect(line, `${path.relative(ROOT, file)}:${index + 1}`).not.toMatch(/(?<![\w-])(?:[\w-]+:)*font-(?:mono|sans|serif)(?![\w-])/)
        expect(fontSizesUnderFloor(line), `${path.relative(ROOT, file)}:${index + 1}`).toEqual([])
      })
    }
    // The helper reads a class or an inline size in any unit, and leaves the floor itself alone.
    expect(fontSizesUnderFloor('className="text-[10px] md:text-[11px] text-xs"')).toEqual(["text-[10px]", "md:text-[11px]"])
    expect(fontSizesUnderFloor("style={{ fontSize: 11 }}")).toEqual(["fontSize: 11"])
    expect(fontSizesUnderFloor('text-[0.7rem] text-[12px] text-[0.75rem] fontSize: "12px"')).toEqual(["text-[0.7rem]"])
    // Every ui item and block sets the figures on its root, so everything inside inherits them.
    for (const item of registry.items) {
      if (item.type !== "registry:ui" && item.type !== "registry:block") continue
      const primary = item.files?.find((file) => file.type === item.type)
      const source = readFileSync(path.join(ROOT, primary!.path), "utf8")
      expect(source, item.name).toContain("lining-nums tabular-nums")
    }
  })
})

describe("the typography docs", () => {
  const doc = readFileSync(path.join(ROOT, "docs/typography.md"), "utf8")
  const contract = readFileSync(path.join(ROOT, "docs/contract.md"), "utf8")
  const readme = readFileSync(path.join(ROOT, "README.md"), "utf8")
  const SOURCES = [
    "https://jdobr.es/pdf/Sawyer-etal-2020-Bakeoff.pdf",
    "https://pmc.ncbi.nlm.nih.gov/articles/PMC4612630/",
    "https://medium.com/design-bootcamp/the-elements-of-fintech-typography-part-1-readable-money-b6c1226acbde",
    "https://apps.dtic.mil/sti/pdfs/AD0647371.pdf",
    "https://www.brailleinstitute.org/freefont/",
    "https://www.bloomberg.com/company/stories/how-bloomberg-terminal-ux-designers-conceal-complexity/",
  ]

  it("name every typography token at its default, in the order of the contract's sections, and cite the six sources", () => {
    for (const name of typography) {
      expect(doc, name).toContain(`\`--${name}\``)
      if (name !== "tradecn-font-numeric") expect(doc, name).toContain(`\`${tokens.dark[name]}\``)
    }
    for (const section of ["## Defaults", "## Bring your own font", "## Numeric rendering", "## Character disambiguation", "## Accessibility mode", "## What we do not recommend", "## Sources"]) expect(doc).toContain(section)
    for (const url of SOURCES) expect(doc, url).toContain(`](${url})`)
    expect(doc).toContain(RULE)
    expect(doc).toContain('data-accessibility="hyperlegible"')
    expect(doc).toContain("0O 1lI 5S 8B 69")
  })

  it("use no em dash, in the page, the contract, or the demo", () => {
    for (const file of ["docs/typography.md", "docs/contract.md", "playground/src/demos/typography.tsx"]) expect(readFileSync(path.join(ROOT, file), "utf8"), file).not.toContain("—")
  })

  it("state the rule verbatim in the contract and the README, and give the page a demo", () => {
    expect(contract).toContain(`14. ${RULE}`)
    expect(readme).toContain(RULE)
    expect(readme).toContain("docs/typography.md")
    expect(existsSync(path.join(ROOT, "playground/src/demos/typography.tsx"))).toBe(true)
  })
})
