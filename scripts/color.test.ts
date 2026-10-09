import { readFileSync, readdirSync, statSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { luminance, parseOklch } from "./lib/oklch"
import { ROOT, readRegistry, tokensUsedIn } from "./lib/registry"

// Contract rule 15: direction never rides on hue alone. Every registry file that colors a value by direction
// is listed here with the other channel it carries the direction in, and the test fails on a file that colors
// by direction and is not in the table, so a new use has to say what else it does. docs/color.md has the why.

// A utility class, or the token itself read for a canvas or an inline style: `--up`, `var(--down-soft)`. A class named
// in a selector, as `[&_.text-up]:text-inherit` names one to override it, colors nothing by direction.
const DIRECTION_COLOR = /(?<![\w.-])(?:[\w-]+:)*(?:text|bg|border(?:-[xysetblr])?|stroke|fill)-(?:up|down)(?:-soft)?(?![\w-])|--(?:up|down)(?:-soft)?(?![\w-])/

/** Source evidence for each channel. This inventory cannot prove the content of arbitrary caller compositions. */
const CHANNELS: Array<{ file: string; channel: string; proof: RegExp }> = [
  { file: "hooks/use-flash.ts", channel: "the data-direction attribute the hook writes for the flash window; directionClass is paired with formatSigned where the watchlist uses it", proof: /data-direction|dataset\.direction/ },
  { file: "ui/flash-cell.tsx", channel: "data-direction on the cell for the window, and the value's own sign inside it", proof: /data-\[direction=/ },
  { file: "ui/data-grid.tsx", channel: "data-direction on a flashing cell for its window; a signed column prints the sign too, and an unsigned price carries the direction in the attribute alone", proof: /data-\[direction=/ },
  { file: "lib/grid-rules.ts", channel: "an applied rule names itself in data-rule and data-tone on the element and puts its words in the accessible description", proof: /"aria-description": \(typeof rule\.label === "string" \? rule\.label\.trim\(\) : ""\) \|\| describeRule\(rule, columns, "highlight"\)/ },
  { file: "ui/alerts.tsx", channel: "the default history column prints severity; item and badge content belongs to the caller, who must pair tone with a visible cue (rendered examples are checked in the alerts smoke scene)", proof: /cell:.*\{row\.severity\}/ },
  { file: "ui/status-bar.tsx", channel: "the environment badge is the word itself, PRODUCTION or UAT, on the tone's tint", proof: /data-status-environment=\{label\}/ },
  { file: "ui/sparkline.tsx", channel: "data-direction on the root and the direction in the words a screen reader hears", proof: /data-direction=\{tone\}/ },
  { file: "ui/price-chart.tsx", channel: "Last and Change each carry data-direction; Change prints a sign when composed, and the plot's accessible name says the direction in a word; the canvas takes the same tokens", proof: /data-chart-last="" data-direction=\{summary\.direction\}/ },
  { file: "ui/blotter.tsx", channel: "the side column's text is the word Buy or Sell", proof: /row\.side/ },
  { file: "ui/watchlist.tsx", channel: "directionClass colors change and changePct, whose text prints its sign through formatSigned and a signed formatPercent", proof: /signed\(value, formatSigned/ },
  { file: "ui/positions.tsx", channel: "directionClass colors signed figures that print their sign, and the position cell carries data-side with the side said in words for a screen reader", proof: /data-side=\{positionSide\(row\.position\)\}/ },
  { file: "ui/depth-ladder.tsx", channel: "headers belong to the caller; DepthLadderColumnHeader defaults to labels.bid and labels.ask, checked by depth-ladder.test.tsx (builds the rungs / prints the sizes through formatSize) and the depth-ladder smoke scene's columnheader assertions; every size cell carries data-side and staging says buy or sell", proof: /data-side=\{side\}/ },
  { file: "ui/spread-matrix.tsx", channel: "the flash writes data-direction for its window, and the spread it colors is printed with its sign through formatTicks or a signed formatBps", proof: /data-\[direction=/ },
  { file: "ui/feed-health.tsx", channel: "the dot is aria-hidden; omitted indicator children supply a screen-reader state word (feed-health.test.tsx checks this, and the feed-health smoke scene checks compact state and tier words)", proof: /className="sr-only">\{feed.state\}/ },
  { file: "blocks/ticket/ticket.tsx", channel: "the pressed side button says Buy or Sell, and aria-pressed says which", proof: /aria-pressed/ },
  { file: "blocks/rfq-ticket/rfq-ticket.tsx", channel: "a toned context value carries data-direction and says its direction in screen-reader words from labels", proof: /data-direction=\{item\.tone\}[\s\S]*labels\.toneUp : labels\.toneDown/ },
]

function* sources(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const file = path.join(dir, name)
    if (statSync(file).isDirectory()) yield* sources(file)
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) yield file
  }
}

describe("contract rule 15: direction never rides on hue alone", () => {
  const registryDir = path.join(ROOT, "registry/tradecn")
  // directionClass builds the utility class at runtime, so a call to it colors by
  // direction without the class ever appearing in the caller's source: count calls too.
  const colorsByDirection = (src: string) => DIRECTION_COLOR.test(src) || /\bdirectionClass\s*\(/.test(src)
  const colored = [...sources(registryDir)].filter((file) => colorsByDirection(readFileSync(file, "utf8"))).map((file) => path.relative(registryDir, file))

  it.each(["border-s-up", "data-[tone=up]:border-s-up", "dark:border-e-down-soft/50", "hover:border-x-up", "border-t-down", "text-up", "bg-down-soft", "var(--up)"])("detects direction and installs its token for %s", (source) => {
    expect(DIRECTION_COLOR.test(source)).toBe(true)
    const token = source.includes("down-soft") ? "down-soft" : source.includes("down") ? "down" : "up"
    expect([...tokensUsedIn(source, ["up", "down", "down-soft"])]).toEqual([token])
  })

  it("reads a class named only to override it as no direction color and no use of its token", () => {
    const override = "text-foreground [&_.text-up]:text-inherit [&_.text-down]:text-inherit"
    expect(DIRECTION_COLOR.test(override)).toBe(false)
    expect([...tokensUsedIn(override, ["up", "down", "foreground"])]).toEqual(["foreground"])
  })

  it.each(["border-s-upward", "border-s-downloader", "setup-down", "text-update"])("does not mistake %s for a direction token", (source) => {
    expect(DIRECTION_COLOR.test(source)).toBe(false)
    expect([...tokensUsedIn(source, ["up", "down"])]).toEqual([])
  })

  it("lists every file that colors by direction, with the channel it carries the direction in besides color", () => {
    expect(colored.sort()).toEqual(CHANNELS.map((entry) => entry.file).sort())
  })

  it("can point at the proof of each channel in the file", () => {
    for (const entry of CHANNELS) {
      const source = readFileSync(path.join(registryDir, entry.file), "utf8")
      expect(source, `${entry.file}: ${entry.channel}`).toMatch(entry.proof)
      expect(entry.channel.length).toBeGreaterThan(20)
    }
  })

  it("keeps every theme's absolute difference between hue coordinates above 60 degrees and computed luminance ratio at or above 1.3 to 1", () => {
    const themes = readRegistry().items.filter((item) => item.type === "registry:theme")
    expect(themes.length).toBeGreaterThanOrEqual(3)
    for (const theme of themes) {
      for (const mode of ["light", "dark"] as const) {
        const vars = theme.cssVars?.[mode] ?? {}
        const up = parseOklch(vars.up!)!
        const down = parseOklch(vars.down!)!
        expect(Math.abs(up.h - down.h), `${theme.name} ${mode}: up and down differ in hue`).toBeGreaterThan(60)
        // The same ratio a grayscale print or a luminance-only view sees. A pair at equal lightness was the reason the
        // terminal themes went; scripts/themes.test.ts holds the items' own default pair to the same gap.
        const a = luminance(up)
        const b = luminance(down)
        const gray = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
        expect(gray, `${theme.name} ${mode}: up against down in gray`).toBeGreaterThanOrEqual(1.3)
      }
    }
  })
})

describe("text on a tint", () => {
  const registryDir = path.join(ROOT, "registry/tradecn")
  // A tint the items paint behind text: a soft token, or primary, destructive, or a direction at a fraction.
  const TINT = /bg-(?:up|down|flat|stale|expiring)-soft|var\(--(?:up|down|flat|stale|expiring)-soft\)|bg-(?:primary|destructive|up|down|stale|expiring)\/\d+|var\(--(?:primary|destructive)\)_\d+%/
  // A state color on text, behind any variants. A class named in a selector to override it, `.text-up`, is not one.
  const STATE_TEXT = /(?<![\w.-])(?:[\w[\]=&-]+:)*text-(?:up|down|flat|stale|expiring|destructive|primary)(?![\w-])/
  const LITERAL = /"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g

  /** Each class string, and each `cn(...)` call whole, so a tint and a color split across its arguments still count. */
  function* compositions(src: string): Generator<string> {
    yield* src.match(LITERAL) ?? []
    for (let at = src.indexOf("cn("); at >= 0; at = src.indexOf("cn(", at + 3)) {
      let depth = 0
      let end = at + 2
      for (; end < src.length; end++) {
        if (src[end] === "(") depth++
        else if (src[end] === ")" && --depth === 0) break
      }
      yield src.slice(at, end + 1)
    }
  }

  it("puts no state color on text over a tint in any item: a state color on its tint reads below 4.5 to 1", () => {
    const found: string[] = []
    for (const file of sources(registryDir)) {
      for (const text of compositions(readFileSync(file, "utf8"))) {
        if (TINT.test(text) && STATE_TEXT.test(text)) found.push(`${path.relative(registryDir, file)}: ${text.replace(/\s+/g, " ").slice(0, 120)}`)
      }
    }
    expect(found).toEqual([])
    // The scan sees what it should: a tint with its own color is a finding, the override that names the color is not.
    expect(TINT.test("bg-up-soft") && STATE_TEXT.test("text-up bg-up-soft")).toBe(true)
    expect(STATE_TEXT.test("text-foreground [&_.text-up]:text-inherit")).toBe(false)
    expect(STATE_TEXT.test("dark:text-destructive")).toBe(true)
  })

  it("keeps the items' copies of the on-tint text identical to the one grid-rules exports", () => {
    const exported = /export const ON_TINT_CLASS = "([^"]+)"/.exec(readFileSync(path.join(registryDir, "lib/grid-rules.ts"), "utf8"))![1]!
    expect(exported).toMatch(/^text-foreground /)
    for (const file of ["ui/feed-health.tsx", "ui/session-guard.tsx"]) expect(readFileSync(path.join(registryDir, file), "utf8"), file).toContain(exported)
  })
})
