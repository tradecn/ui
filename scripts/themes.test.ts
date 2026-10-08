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

/** The ratio a grayscale print or a luminance-only view sees between two colors. */
const gray = (a: Oklch, b: Oklch) => {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
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

  it("reads an alpha, as a number or a percentage, and composites it over the backdrop as a browser does", () => {
    expect(must("oklch(0.74 0.15 165 / 18%)").alpha).toBeCloseTo(0.18)
    expect(must("oklch(0.74 0.15 165 / 0.5)").alpha).toBeCloseTo(0.5)
    // Half white over black shows as mid gray, about #808080, blended in gamma-encoded sRGB: 0.214, not linear light's 0.5.
    const half = luminance(must("oklch(1 0 0 / 50%)"), must("oklch(0 0 0)"))
    expect(half).toBeCloseTo(0.214, 3)
    expect(parseOklch("var(--color-primary)")).toBeNull()
  })
})

const tokens = readTokens()
const themes = readRegistry().items.filter((item) => item.type === "registry:theme")
const tokenNames = Object.keys(tokens.dark)

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
// The tints the items paint behind text, which is the foreground on every one: a badge's, a rule's, a countdown's, a
// feed tier's, the ladder's own size. A token's own color on its tint drops below 4.5 to 1 in the light themes.
const TINTS: [string, number][] = [["up-soft", 1], ["down-soft", 1], ["flat-soft", 1], ["stale-soft", 1], ["expiring-soft", 1], ["primary", 0.15], ["primary", 0.12], ["destructive", 0.15], ["destructive", 0.12]]
// The tints a grid keeps colored text on, over its own background: the focused column's, and the depth ladder's mid row.
const GRID_TINTS: [string, number][] = [["muted", 0.5], ["muted", 0.6]]
// The marks a grid cell or a ladder rung can carry.
const CELL_MARKS = ["up", "down", "stale", "expiring", "destructive", "primary"]

/** The ratio between text and a tint laid over a surface, blended as a browser does. */
const onTint = (text: Oklch, tint: Oklch, alpha: number, under: Oklch) => {
  const a = luminance(text)
  const b = luminance({ ...tint, alpha: tint.alpha * alpha }, under)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

describe("the themes", () => {
  it("are the three two-sided ones, amber first as the default", () => {
    expect(themes.map((theme) => theme.name)).toEqual(["tradecn-amber", "tradecn-slate", "tradecn-slate-east"])
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

      it(`${theme.name} ${mode}: the foreground clears 4.5 to 1 on every tint an item paints behind text, over the background and a card`, () => {
        for (const [tint, alpha] of TINTS) {
          for (const surface of SURFACES) expect(onTint(resolve("foreground"), resolve(tint), alpha, resolve(surface)), `foreground on ${tint} at ${alpha} over ${surface}`).toBeGreaterThanOrEqual(4.5)
        }
      })

      it(`${theme.name} ${mode}: every mark a grid cell carries clears 4.5 to 1 on the tints a grid keeps it on`, () => {
        for (const [tint, alpha] of GRID_TINTS) {
          for (const mark of CELL_MARKS) expect(onTint(resolve(mark), resolve(tint), alpha, resolve("background")), `${mark} on ${tint} at ${alpha}`).toBeGreaterThanOrEqual(4.5)
        }
      })

      it(`${theme.name} ${mode}: sets every tradecn token`, () => {
        for (const name of tokenNames) expect(vars[name], name).toBeDefined()
      })
    }

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
      // No theme changes the type: the font stacks are the defaults every item installs.
      expect(light["tradecn-font-sans"]).toBe(tokens.light["tradecn-font-sans"])
      expect(light["tradecn-font-mono"]).toBe(tokens.light["tradecn-font-mono"])
      expect(theme.cssVars?.theme).toBeUndefined()
    })
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

  it("amber uses blue for up and vermilion for down in both modes", () => {
    const amber = themes.find((t) => t.name === "tradecn-amber")!
    for (const mode of ["light", "dark"] as const) {
      expect(parseOklch(amber.cssVars![mode]!.up!)!.h).toBeGreaterThan(230)
      expect(parseOklch(amber.cssVars![mode]!.up!)!.h).toBeLessThan(255)
      expect(parseOklch(amber.cssVars![mode]!.down!)!.h).toBeLessThan(60)
    }
  })
})

// The items' own defaults: what every component installs into a project with no theme. They are held the way the
// themes are, on the surfaces a fresh `shadcn init` paints, since that is where a consumer without a theme reads them.
const DEFAULT_MARKS = ["up", "down", "stale", "expiring", "panel-sync", "link-1", "link-2", "link-3", "link-4"] as const
const SHADCN_SURFACES = {
  light: { white: "oklch(1 0 0)", muted: "oklch(0.97 0 0)" },
  dark: { background: "oklch(0.145 0 0)", card: "oklch(0.205 0 0)" },
} as const
// The rest of a fresh `shadcn init`'s neutral palette that the items' tints and text come from.
const SHADCN = {
  light: { background: "oklch(1 0 0)", card: "oklch(1 0 0)", foreground: "oklch(0.145 0 0)", muted: "oklch(0.97 0 0)", primary: "oklch(0.205 0 0)", destructive: "oklch(0.577 0.245 27.325)" },
  dark: { background: "oklch(0.145 0 0)", card: "oklch(0.205 0 0)", foreground: "oklch(0.985 0 0)", muted: "oklch(0.269 0 0)", primary: "oklch(0.922 0 0)", destructive: "oklch(0.704 0.191 22.216)" },
} as const

describe("the default marks", () => {
  it("are slate's light marks on the light side, so a fresh project reads them on white", () => {
    const slate = themes.find((t) => t.name === "tradecn-slate")!
    for (const mark of DEFAULT_MARKS) expect(tokens.light[mark], mark).toBe(slate.cssVars!.light![mark])
  })

  for (const mode of ["light", "dark"] as const) {
    it(`${mode}: every mark clears 4.5 to 1 on shadcn's ${mode} surfaces`, () => {
      for (const mark of DEFAULT_MARKS) {
        for (const [name, surface] of Object.entries(SHADCN_SURFACES[mode])) expect(contrast(must(tokens[mode][mark]!), must(surface)), `${mark} on ${name}`).toBeGreaterThanOrEqual(4.5)
      }
    })

    it(`${mode}: on shadcn's surfaces, the foreground reads on every tint and every mark a grid cell carries on a grid's tints`, () => {
      const shadcn = SHADCN[mode]
      const token = (name: string) => must((shadcn as Record<string, string>)[name] ?? tokens[mode][name]!)
      for (const [tint, alpha] of TINTS) {
        for (const surface of ["background", "card"]) expect(onTint(token("foreground"), token(tint), alpha, token(surface)), `foreground on ${tint} at ${alpha} over ${surface}`).toBeGreaterThanOrEqual(4.5)
      }
      for (const [tint, alpha] of GRID_TINTS) {
        for (const mark of CELL_MARKS) expect(onTint(token(mark), token(tint), alpha, token("background")), `${mark} on ${tint} at ${alpha}`).toBeGreaterThanOrEqual(4.5)
      }
    })

    it(`${mode}: the direction pair is a step apart in lightness, at least 1.3 to 1 in gray`, () => {
      expect(gray(must(tokens[mode].up!), must(tokens[mode].down!))).toBeGreaterThanOrEqual(1.3)
    })

    it(`${mode}: a soft tint is its mark at 18 percent, 16 for stale`, () => {
      for (const mark of ["up", "down", "expiring"]) expect(tokens[mode][`${mark}-soft`], mark).toBe(tokens[mode][mark]!.replace(")", " / 18%)"))
      expect(tokens[mode]["stale-soft"]).toBe(tokens[mode].stale!.replace(")", " / 16%)"))
    })
  }

  it("keep one hue per mark across the modes, lighter on the dark side", () => {
    for (const mark of DEFAULT_MARKS) {
      const a = parseOklch(tokens.light[mark]!)!
      const b = parseOklch(tokens.dark[mark]!)!
      expect(Math.abs(a.h - b.h), `${mark} keeps its hue across modes`).toBeLessThanOrEqual(10)
      expect(b.l, `${mark} is lighter on the dark side`).toBeGreaterThan(a.l)
    }
  })
})
