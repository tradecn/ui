import {
  createInstrumentFormatter,
  formatBps,
  formatDv01,
  formatNotional,
  formatPercent,
  formatPrice,
  formatQuantity,
  formatSigned,
  formatYield,
  parsePrice,
} from "@/registry/tradecn/lib/format"

const ust = createInstrumentFormatter({ price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 })
const bund = createInstrumentFormatter({ price: { kind: "tick", tick: 0.005 }, tick: 0.005 })

const rows: [string, string][] = [
  ["UST 99.515625", ust.price(99.515625)],
  ["UST step +2 from 99.5", ust.price(ust.step(99.5, 2))],
  ['UST parse "99-17"', String(ust.parsePrice("99-17"))],
  ["Bund 130.0049", bund.price(130.0049)],
  ["32nds with eighths 99.5078125", formatPrice(99.5078125, { kind: "fraction", denominator: 32, half: "+", eighths: true })],
  ['parse "99-162" eighths', String(parsePrice("99-162", { kind: "fraction", denominator: 32, half: "+", eighths: true }))],
  ["yield 4.2531", formatYield(4.2531)],
  ["bps -12.5 signed", formatBps(-12.5, { signed: true })],
  ["DV01 1234.4", formatDv01(1234.4)],
  ["DV01 compact", formatDv01(1234.4, { compact: true })],
  ["notional 1.25e6 compact", formatNotional(1.25e6, { compact: true })],
  ["signed 0", formatSigned(0)],
  ["signed -0.12", formatSigned(-0.12)],
  ["percent +1.234", formatPercent(1.234, { signed: true })],
  ["quantity 5e6", formatQuantity(5e6)],
  ["null", formatPrice(null, { kind: "decimal", decimals: 2 })],
]

export function FormatScene() {
  return (
    <main className="mx-auto max-w-xl p-6">
      <h1 className="mb-4 font-mono text-sm font-semibold">format</h1>
      <table className="w-full font-mono text-xs tabular-nums">
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label} className="border-b border-border">
              <td className="py-1 pr-4 text-muted-foreground">{label}</td>
              <td className="py-1 text-right">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}
