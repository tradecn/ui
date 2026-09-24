import { readFileSync, readdirSync, statSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { luminance, parseOklch } from "./lib/oklch"
import { ROOT, readRegistry, tokensUsedIn } from "./lib/registry"

// Contract rule 15: direction never rides on hue alone. Every registry file that colors a value by direction
// is listed here with the other channel it carries the direction in, and the test fails on a file that colors
// by direction and is not in the table, so a new use has to say what else it does. docs/color.md has the why.

// A utility class, or the token itself read for a canvas or an inline style: `--up`, `var(--down-soft)`.
const DIRECTION_COLOR = /(?<![\w-])(?:[\w-]+:)*(?:text|bg|border(?:-[xysetblr])?|stroke|fill)-(?:up|down)(?:-soft)?(?![\w-])|--(?:up|down)(?:-soft)?(?![\w-])/

/** Source evidence for each channel. This inventory cannot prove the content of arbitrary caller compositions. */
const CHANNELS: Array<{ file: string; channel: string; proof: RegExp }> = [
  { file: "hooks/use-flash.ts", channel: "the data-direction attribute the hook writes for the flash window; directionClass is paired with formatSigned where the watchlist uses it", proof: /data-direction|dataset\.direction/ },
  { file: "ui/flash-cell.tsx", channel: "data-direction on the cell for the window, and the value's own sign inside it", proof: /data-\[direction=/ },
  { file: "ui/data-grid.tsx", channel: "data-direction on a flashing cell; the cell's text is the signed value", proof: /data-\[direction=/ },
  { file: "lib/grid-rules.ts", channel: "an applied rule names itself in data-rule and data-tone on the element and puts its words in the accessible description", proof: /"aria-description": rule\.label\?\.trim\(\) \|\| describeRule/ },
  { file: "ui/alerts.tsx", channel: "the default history column prints severity; item and badge content belongs to the caller, who must pair tone with a visible cue (rendered examples are checked in the alerts smoke scene)", proof: /cell:.*\{row\.severity\}/ },
  { file: "ui/status-bar.tsx", channel: "the environment badge is the word itself, PRODUCTION or UAT, and the tone colors that word", proof: /data-status-environment=\{environment\.label\}/ },
  { file: "ui/sparkline.tsx", channel: "data-direction on the root and the direction in the words a screen reader hears", proof: /data-direction=\{tone\}/ },
  { file: "ui/price-chart.tsx", channel: "the last price prints its change with a sign in the header, the root carries data-direction, and the plot's accessible name says the direction in a word; the canvas takes the same tokens", proof: /data-direction=\{direction\}/ },
  { file: "ui/blotter.tsx", channel: "the side column's text is the word Buy or Sell", proof: /row\.side/ },
  { file: "ui/depth-ladder.tsx", channel: "the columns are headed Bid and Ask, every size cell carries data-side, and a staged side reaches the consumer as the word buy or sell", proof: /data-side=\{p\.side\}/ },
  { file: "ui/spread-matrix.tsx", channel: "the flash writes data-direction for its window, and the spread it colors is printed with its sign through formatTicks or a signed formatBps", proof: /data-\[direction=/ },
  { file: "ui/feed-health.tsx", channel: "the dot is aria-hidden; the tier badge and the label carry the state in words", proof: /aria-hidden/ },
  { file: "blocks/ticket/ticket.tsx", channel: "the pressed side button says Buy or Sell, and aria-pressed says which", proof: /aria-pressed/ },
  { file: "blocks/rfq-ticket/rfq-ticket.tsx", channel: "a toned context value prints the consumer's text beside its label; the tone is a hint on it", proof: /TONE_CLASS\[item\.tone\]/ },
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
  const colored = [...sources(registryDir)].filter((file) => DIRECTION_COLOR.test(readFileSync(file, "utf8"))).map((file) => path.relative(registryDir, file))

  it.each(["border-s-up", "data-[tone=up]:border-s-up", "dark:border-e-down-soft/50", "hover:border-x-up", "border-t-down", "text-up", "bg-down-soft", "var(--up)"])("detects direction and installs its token for %s", (source) => {
    expect(DIRECTION_COLOR.test(source)).toBe(true)
    const token = source.includes("down-soft") ? "down-soft" : source.includes("down") ? "down" : "up"
    expect([...tokensUsedIn(source, ["up", "down", "down-soft"])]).toEqual([token])
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

  it("keeps every theme's direction pair apart in gray as well as hue, so it survives a grayscale print", () => {
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
