import { describe, expect, it } from "vitest"
import { contrast, luminance, parseOklch, type Oklch } from "./lib/oklch"
import { readRegistry, readTokens } from "./lib/registry"

// The theme colors were picked by hand, so they are checked by arithmetic: WCAG contrast, from the
// oklch() values as written. The converter is checked first, against colors whose answers are known.

const must = (value: string): Oklch => {
  const parsed = parseOklch(value)
  if (!parsed) throw new Error(`not an oklch() color: ${value}`)
  return parsed
}

describe("the oklch converter", () => {
  it("knows white, black, and the contrast between them", () => {
    expect(luminance(must("oklch(1 0 0)"))).toBeCloseTo(1, 3)
    expect(luminance(must("oklch(0 0 0)"))).toBeCloseTo(0, 6)
    expect(contrast(must("oklch(1 0 0)"), must("oklch(0 0 0)"))).toBeCloseTo(21, 1)
  })

  it("lands sRGB red and green on their WCAG luminance coefficients", () => {
    // #ff0000 and #00ff00 in oklch; their relative luminances are the 0.2126 and 0.7152 of the formula.
    expect(luminance(must("oklch(0.62796 0.25768 29.2339)"))).toBeCloseTo(0.2126, 2)
    expect(luminance(must("oklch(0.86644 0.29483 142.4953)"))).toBeCloseTo(0.7152, 2)
  })

  it("reads an alpha, as a number or a percentage, and composites it over the backdrop", () => {
    expect(must("oklch(0.74 0.15 165 / 18%)").alpha).toBeCloseTo(0.18)
    expect(must("oklch(0.74 0.15 165 / 0.5)").alpha).toBeCloseTo(0.5)
    const half = luminance(must("oklch(1 0 0 / 50%)"), must("oklch(0 0 0)"))
    expect(half).toBeCloseTo(0.5, 2)
    expect(parseOklch("var(--color-primary)")).toBeNull()
  })
})

const themes = readRegistry().items.filter((item) => item.type === "registry:theme")
const tokenNames = Object.keys(readTokens().dark)

// Text on the surface it sits on: 4.5 to 1.
const TEXT: [string, string][] = [
  ["foreground", "background"],
  ["foreground", "card"],
  ["card-foreground", "card"],
  ["popover-foreground", "popover"],
  ["primary-foreground", "primary"],
  ["secondary-foreground", "secondary"],
  ["muted-foreground", "background"],
  ["muted-foreground", "card"],
  ["muted-foreground", "muted"],
  ["accent-foreground", "accent"],
  ["sidebar-foreground", "sidebar"],
  ["sidebar-primary-foreground", "sidebar-primary"],
  ["sidebar-accent-foreground", "sidebar-accent"],
]
// Things read by their color, as text or as a mark: a price, a link dot, a focus ring. They are used as text too, so 4.5 to 1.
const MARKS = ["primary", "up", "down", "stale", "link-1", "link-2", "link-3", "link-4", "panel-sync", "expiring", "destructive", "ring"]
const SURFACES = ["background", "card"]

describe("the themes", () => {
  it("exist", () => {
    expect(themes.length).toBeGreaterThan(0)
  })

  it("classic is the terminal with green and red, and differs from it in nothing else", () => {
    const terminal = themes.find((t) => t.name === "tradecn-terminal")
    const classic = themes.find((t) => t.name === "tradecn-terminal-classic")
    expect(terminal && classic).toBeTruthy()
    expect(classic!.cssVars?.theme).toEqual(terminal!.cssVars?.theme)
    for (const mode of ["light", "dark"] as const) {
      const a = terminal!.cssVars![mode]!
      const b = classic!.cssVars![mode]!
      const differing = Object.keys({ ...a, ...b }).filter((key) => a[key] !== b[key])
      expect(differing.sort(), mode).toEqual(["down", "down-soft", "up", "up-soft"])
    }
    // Green and red, by hue: oklch puts green near 145 and red near 25.
    expect(parseOklch(classic!.cssVars!.dark!.up!)!.h).toBeGreaterThan(120)
    expect(parseOklch(classic!.cssVars!.dark!.up!)!.h).toBeLessThan(170)
    expect(parseOklch(classic!.cssVars!.dark!.down!)!.h).toBeLessThan(40)
  })

  for (const theme of themes) {
    for (const mode of ["light", "dark"] as const) {
      const vars = theme.cssVars?.[mode] ?? {}
      // A token given as var(--color-x) takes the theme's own x.
      const resolve = (name: string): Oklch => {
        const value = vars[name]
        if (value === undefined) throw new Error(`${theme.name} ${mode} has no --${name}`)
        const ref = /^var\(--color-([\w-]+)\)$/.exec(value)
        return ref ? resolve(ref[1]!) : must(value)
      }

      it(`${theme.name} ${mode}: text clears 4.5 to 1 on its surface`, () => {
        for (const [fg, bg] of TEXT) expect(contrast(resolve(fg), resolve(bg)), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5)
      })

      it(`${theme.name} ${mode}: every color that carries meaning clears 4.5 to 1 on the background and on a card`, () => {
        for (const mark of MARKS) for (const surface of SURFACES) expect(contrast(resolve(mark), resolve(surface)), `${mark} on ${surface}`).toBeGreaterThanOrEqual(4.5)
      })

      it(`${theme.name} ${mode}: a soft tint stays a tint, and the value on it still reads`, () => {
        for (const soft of ["up-soft", "down-soft", "flat-soft", "stale-soft", "expiring-soft"]) {
          const tint = resolve(soft)
          // The tint over the page has to stay close enough to the page that the foreground still clears 4.5 on it,
          // whichever is the lighter of the two: over black the tint brightens, over white it darkens.
          const over = luminance(tint, resolve("background"))
          const fg = luminance(resolve("foreground"))
          expect((Math.max(fg, over) + 0.05) / (Math.min(fg, over) + 0.05), `foreground on ${soft}`).toBeGreaterThanOrEqual(4.5)
        }
      })

      it(`${theme.name} ${mode}: sets every tradecn token`, () => {
        for (const name of tokenNames) expect(vars[name], name).toBeDefined()
      })
    }

    if (theme.name.startsWith("tradecn-terminal")) {
      it(`${theme.name}: is the same terminal in both modes, except that radius lives in :root`, () => {
        const { radius, ...light } = theme.cssVars?.light ?? {}
        expect(radius).toBe("0rem")
        expect(light).toEqual(theme.cssVars?.dark)
      })
    } else {
      it(`${theme.name}: has a light side and a dark side, one hue per token at the lightness each background needs`, () => {
        const light = theme.cssVars!.light!
        const dark = theme.cssVars!.dark!
        expect(light.radius).toBeDefined()
        expect(dark.radius).toBeUndefined()
        expect(parseOklch(light.background!)!.l).toBeGreaterThan(0.95)
        expect(parseOklch(dark.background!)!.l).toBeLessThan(0.2)
        // Near-black, not black, and off-white, not white, on the dark side.
        expect(parseOklch(dark.background!)!.l).toBeGreaterThan(0.1)
        expect(parseOklch(dark.foreground!)!.l).toBeLessThan(0.97)
        for (const token of ["up", "down", "stale", "expiring", "panel-sync", "primary"]) {
          const a = parseOklch(light[token]!)!
          const b = parseOklch(dark[token]!)!
          expect(Math.abs(a.h - b.h), `${token} keeps its hue across modes`).toBeLessThanOrEqual(10)
          expect(b.l, `${token} is lighter on the dark side`).toBeGreaterThan(a.l)
        }
        // The body pair is the theme's own page and text.
        expect(light["tradecn-color-body-bg"]).toBe(light.background)
        expect(dark["tradecn-color-body-fg"]).toBe(dark.foreground)
      })
    }
  }

  it("east is slate with the pair turned around, and differs from it in nothing else", () => {
    const slate = themes.find((t) => t.name === "tradecn-slate")!
    const east = themes.find((t) => t.name === "tradecn-slate-east")!
    for (const mode of ["light", "dark"] as const) {
      const a = slate.cssVars![mode]!
      const b = east.cssVars![mode]!
      const differing = Object.keys({ ...a, ...b }).filter((key) => a[key] !== b[key])
      expect(differing.sort(), mode).toEqual(["down", "down-soft", "up", "up-soft"])
      expect(b.up, mode).toBe(a.down)
      expect(b.down, mode).toBe(a.up)
    }
    // Red for up, by hue.
    expect(parseOklch(east.cssVars!.dark!.up!)!.h).toBeLessThan(60)
  })

  it("amber takes blue for up, the pair furthest apart under every kind of color blindness", () => {
    const amber = themes.find((t) => t.name === "tradecn-amber")!
    for (const mode of ["light", "dark"] as const) {
      expect(parseOklch(amber.cssVars![mode]!.up!)!.h).toBeGreaterThan(230)
      expect(parseOklch(amber.cssVars![mode]!.up!)!.h).toBeLessThan(255)
      expect(parseOklch(amber.cssVars![mode]!.down!)!.h).toBeLessThan(60)
    }
    expect(amber.cssVars?.theme).toBeUndefined()
  })
})
