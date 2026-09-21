import { createInstrumentFormatter, formatBps, formatDv01, formatNotional, formatPercent, formatPrice, formatQuantity, formatSigned, formatYield } from "@/registry/tradecn/lib/format"

// One formatter per instrument: it knows the quote convention and the tick.
const ust = createInstrumentFormatter({ price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 })
const bund = createInstrumentFormatter({ price: { kind: "tick", tick: 0.005 }, tick: 0.005 })

const rows: [string, string][] = [
  ["UST 10Y at 99.515625", ust.price(99.515625)],
  ["one tick up from 99-16", ust.price(ust.step(99.5, 1))],
  ['parse "99-17"', String(ust.parsePrice("99-17"))],
  ["Bund at 130.0049", bund.price(130.0049)],
  ["yield 4.2531", formatYield(4.2531)],
  ["-12.5 bps, signed", formatBps(-12.5, { signed: true })],
  ["DV01 1234.4", formatDv01(1234.4)],
  ["notional 1,250,000, compact", formatNotional(1.25e6, { compact: true })],
  ["+1.234%, signed", formatPercent(1.234, { signed: true })],
  ["quantity 5,000,000", formatQuantity(5e6)],
  ["signed zero", formatSigned(0)],
  ["a price that has not arrived", formatPrice(null, { kind: "decimal", decimals: 2 })],
]

export default function FormatDemo() {
  return (
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
  )
}
