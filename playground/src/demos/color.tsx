import type { CSSProperties } from "react"
// As text, so the playground's tsconfig does not need JSON modules for one demo.
import registryText from "../../../registry.json?raw"

// Every theme's direction pair, in light and in dark, seen four more ways: through the three kinds of color
// blindness and in grayscale. The simulations are SVG color matrices from Machado, Oliveira, and Fernandes
// (2009), at full severity. What has to survive every column is that up and down stay two colors, and that
// each stays readable on its page: the sign and the word carry direction where the hue cannot.

interface ThemeItem {
  name: string
  type: string
  cssVars?: { light?: Record<string, string>; dark?: Record<string, string> }
}

const themes = (JSON.parse(registryText) as { items: ThemeItem[] }).items.filter((item) => item.type === "registry:theme")

const SIMULATIONS: Array<{ id: string; label: string; matrix?: string }> = [
  { id: "none", label: "as drawn" },
  { id: "protanopia", label: "protanopia", matrix: "0.152286 1.052583 -0.204868 0 0  0.114503 0.786281 0.099216 0 0  -0.003882 -0.048116 1.051998 0 0  0 0 0 1 0" },
  { id: "deuteranopia", label: "deuteranopia", matrix: "0.367322 0.860646 -0.227968 0 0  0.280085 0.672501 0.047413 0 0  -0.011820 0.042940 0.968881 0 0  0 0 0 1 0" },
  { id: "tritanopia", label: "tritanopia", matrix: "1.255528 -0.076749 -0.178779 0 0  -0.078411 0.930809 0.147602 0 0  0.004733 0.691367 0.303900 0 0  0 0 0 1 0" },
  { id: "grayscale", label: "grayscale" },
]

const MARKS: Array<{ token: string; text: string }> = [
  { token: "up", text: "+0.25 up" },
  { token: "down", text: "−0.31 down" },
  { token: "stale", text: "stale" },
  { token: "expiring", text: "0:09 left" },
]

function filterFor(id: string): string | undefined {
  if (id === "none") return undefined
  if (id === "grayscale") return "grayscale(1)"
  return `url(#tradecn-cvd-${id})`
}

/** One theme's marks on its own page, in one mode, under one simulation. */
function Swatch({ vars, simulation }: { vars: Record<string, string>; simulation: string }) {
  const page: CSSProperties = { background: vars.background, color: vars.foreground, filter: filterFor(simulation) }
  return (
    <div className="flex flex-col gap-0.5 rounded px-2 py-1.5 text-xs lining-nums tabular-nums" style={page}>
      {MARKS.map(({ token, text }) => (
        <span key={token} style={{ color: vars[token] }}>
          {text}
        </span>
      ))}
    </div>
  )
}

export default function ColorDemo() {
  return (
    <div className="flex flex-col gap-4 text-xs">
      <svg aria-hidden width="0" height="0" className="absolute">
        <defs>
          {SIMULATIONS.filter((s) => s.matrix).map((s) => (
            <filter key={s.id} id={`tradecn-cvd-${s.id}`} colorInterpolationFilters="sRGB">
              <feColorMatrix type="matrix" values={s.matrix} />
            </filter>
          ))}
        </defs>
      </svg>
      {themes.map((theme) => (
        <section key={theme.name} className="flex flex-col gap-1" data-theme={theme.name}>
          <h3 className="font-medium">{theme.name}</h3>
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${SIMULATIONS.length}, minmax(0, 1fr))` }}>
            {SIMULATIONS.map((s) => (
              <span key={s.id} className="text-[10px] text-muted-foreground uppercase">
                {s.label}
              </span>
            ))}
            {(["light", "dark"] as const).map((mode) =>
              SIMULATIONS.map((s) => <Swatch key={`${mode}-${s.id}`} vars={theme.cssVars?.[mode] ?? {}} simulation={s.id} />),
            )}
          </div>
        </section>
      ))}
      <p className="text-muted-foreground">Each theme twice, its light page over its dark one. A pair that keeps two colors in every column is safe to lean on; the sign and the word are there for the columns where it does not.</p>
    </div>
  )
}
