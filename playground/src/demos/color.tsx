import { useId } from "react"

interface Palette {
  background: string
  foreground: string
  up: string
  down: string
  stale: string
  expiring: string
}

// The six colors used below, included so the comparison can be copied on its own.
const themes: Array<{ name: string; light: Palette; dark: Palette }> = [
  {
    name: "tradecn-amber",
    light: { background: "oklch(0.99 0.004 85)", foreground: "oklch(0.2 0.01 85)", up: "oklch(0.45 0.13 245)", down: "oklch(0.56 0.19 45)", stale: "oklch(0.52 0.13 75)", expiring: "oklch(0.53 0.2 350)" },
    dark: { background: "oklch(0.14 0.005 85)", foreground: "oklch(0.94 0.03 85)", up: "oklch(0.66 0.12 240)", down: "oklch(0.78 0.18 45)", stale: "oklch(0.8 0.15 80)", expiring: "oklch(0.74 0.17 350)" },
  },
  {
    name: "tradecn-slate",
    light: { background: "oklch(0.985 0.003 250)", foreground: "oklch(0.2 0.02 250)", up: "oklch(0.52 0.13 165)", down: "oklch(0.46 0.19 40)", stale: "oklch(0.52 0.13 75)", expiring: "oklch(0.53 0.2 350)" },
    dark: { background: "oklch(0.16 0.01 250)", foreground: "oklch(0.95 0.008 250)", up: "oklch(0.77 0.14 165)", down: "oklch(0.66 0.19 40)", stale: "oklch(0.8 0.15 80)", expiring: "oklch(0.74 0.17 350)" },
  },
  {
    name: "tradecn-slate-east",
    light: { background: "oklch(0.985 0.003 250)", foreground: "oklch(0.2 0.02 250)", up: "oklch(0.46 0.19 40)", down: "oklch(0.52 0.13 165)", stale: "oklch(0.52 0.13 75)", expiring: "oklch(0.53 0.2 350)" },
    dark: { background: "oklch(0.16 0.01 250)", foreground: "oklch(0.95 0.008 250)", up: "oklch(0.66 0.19 40)", down: "oklch(0.77 0.14 165)", stale: "oklch(0.8 0.15 80)", expiring: "oklch(0.74 0.17 350)" },
  },
]

// Machado, Oliveira and Fernandes (2009), severity 1; these matrices operate in linear RGB.
// https://www.inf.ufrgs.br/~oliveira/pubs_files/CVD_Simulation/CVD_Simulation.html
const SIMULATIONS: Array<{ id: string; label: string; matrix?: string }> = [
  { id: "none", label: "As drawn" },
  { id: "protanopia", label: "Protanopia", matrix: "0.152286 1.052583 -0.204868 0 0  0.114503 0.786281 0.099216 0 0  -0.003882 -0.048116 1.051998 0 0  0 0 0 1 0" },
  { id: "deuteranopia", label: "Deuteranopia", matrix: "0.367322 0.860646 -0.227968 0 0  0.280085 0.672501 0.047413 0 0  -0.011820 0.042940 0.968881 0 0  0 0 0 1 0" },
  { id: "tritanopia", label: "Tritanopia", matrix: "1.255528 -0.076749 -0.178779 0 0  -0.078411 0.930809 0.147602 0 0  0.004733 0.691367 0.303900 0 0  0 0 0 1 0" },
  { id: "grayscale", label: "Grayscale" },
]

const marks = [
  { token: "up", text: "+0.25 up" },
  { token: "down", text: "−0.31 down" },
  { token: "stale", text: "stale" },
  { token: "expiring", text: "0:09 left" },
] as const

function filterFor(id: string, prefix: string): string | undefined {
  if (id === "none") return undefined
  if (id === "grayscale") return "grayscale(1)"
  return `url(#${prefix}-${id})`
}

export default function ColorDemo() {
  const prefix = useId()
  return (
    <div className="w-fit max-w-full space-y-3 text-xs">
      <svg aria-hidden="true" width="0" height="0" className="absolute">
        <defs>{SIMULATIONS.filter((s) => s.matrix).map((s) => (
          <filter key={s.id} id={`${prefix}-${s.id}`} colorInterpolationFilters="linearRGB">
            <feColorMatrix type="matrix" values={s.matrix} />
          </filter>
        ))}</defs>
      </svg>
      <div role="region" aria-label="Theme color comparisons" tabIndex={0} className="max-w-full overflow-x-auto">
        <div className="space-y-4">
          {themes.map((theme) => (
            <table key={theme.name} className="w-[38rem] border-separate border-spacing-2 text-left">
              <caption className="text-left font-medium">{theme.name}</caption>
              <thead><tr>
                <th scope="col" className="font-medium">Mode</th>
                {SIMULATIONS.map((s) => <th key={s.id} scope="col" className="font-medium">{s.label}</th>)}
              </tr></thead>
              <tbody>{(["light", "dark"] as const).map((mode) => (
                <tr key={mode}>
                  <th scope="row" className="font-normal">{mode === "light" ? "Light" : "Dark"}</th>
                  {SIMULATIONS.map((s) => (
                    <td key={s.id}>
                      <div className="flex flex-col gap-0.5 rounded px-2 py-1.5 whitespace-nowrap lining-nums tabular-nums" style={{ background: theme[mode].background, color: theme[mode].foreground, filter: filterFor(s.id, prefix) }}>
                        {marks.map(({ token, text }) => <span key={token} style={{ color: theme[mode][token] }}>{text}</span>)}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}</tbody>
            </table>
          ))}
        </div>
      </div>
      <p className="max-w-[38rem] text-muted-foreground">Simulations help spot potential confusion. They do not reproduce every reader's vision or establish accessibility; keep the signs and words, and test with readers.</p>
    </div>
  )
}
