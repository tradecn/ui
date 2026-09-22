import { createInstrumentFormatter, formatBps, formatCoupon, formatDv01, formatMaturity, formatNotional, formatPercent, formatPrice, formatQuantity, formatSigned, formatTicks, formatYield, ticksBetween } from "@/registry/tradecn/lib/format"

// One formatter per instrument: it knows the quote convention, the tick, and what a quote is typed in.
const ust = createInstrumentFormatter({ price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 })
const bund = createInstrumentFormatter({ price: { kind: "tick", tick: 0.005 }, tick: 0.005 })
const bill = createInstrumentFormatter({ price: { kind: "decimal", decimals: 3 }, tick: 0.0005, quoteBasis: "discount" })

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
  ["a bill quoted on discount, 4.2531", bill.quote(4.2531)],
  ["a coupon of 4.125", formatCoupon(4.125)],
  ["a maturity of 2034-05-15", formatMaturity("2034-05-15")],
  ["99-17 against a composite of 99-16+, in ticks", formatTicks(ticksBetween(99.53125, 99.515625, 1 / 64), { unit: "tick" })],
  ["5,000,000 as the desk says it", formatNotional(5e6, { unit: "mm" })],
  ["a price that has not arrived", formatPrice(null, { kind: "decimal", decimals: 2 })],
]

export default function FormatDemo() {
  return (
    <table className="w-full font-(family-name:--tradecn-font-mono) text-xs lining-nums tabular-nums">
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
