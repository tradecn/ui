import { createInstrumentFormatter, formatBps, formatCoupon, formatDv01, formatMaturity, formatNotional, formatPercent, formatPrice, formatQuantity, formatSigned, formatTicks, formatYield, ticksBetween } from "@/registry/tradecn/lib/format"

const ust = createInstrumentFormatter({ price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 })
const bund = createInstrumentFormatter({ price: { kind: "tick", tick: 0.005 }, tick: 0.005 })
const bill = createInstrumentFormatter({ price: { kind: "decimal", decimals: 3 }, tick: 0.0005, quoteBasis: "discount" })

const groups: { title: string; rows: [string, string][] }[] = [
  {
    title: "Quotes",
    rows: [
      ["UST price 99.515625", ust.price(99.515625)],
      ["One tick above 99-16", ust.price(ust.step(99.5, 1))],
      ['Parse "99-17"', String(ust.parsePrice("99-17"))],
      ["Bund price 130.0049", bund.price(130.0049)],
      ["Bill discount 4.2531", bill.quote(4.2531)],
      ["Missing price", formatPrice(null, { kind: "decimal", decimals: 2 })],
    ],
  },
  {
    title: "Instrument details",
    rows: [
      ["Coupon 4.125", formatCoupon(4.125)],
      ["Maturity 2034-05-15", formatMaturity("2034-05-15")],
      ["99-17 vs 99-16+", formatTicks(ticksBetween(99.53125, 99.515625, 1 / 64), { unit: "tick" })],
      ["5,000,000 in millions", formatNotional(5e6, { unit: "mm" })],
    ],
  },
  {
    title: "Scalar values",
    rows: [
      ["Yield 4.2531", formatYield(4.2531)],
      ["−12.5 bps, signed", formatBps(-12.5, { signed: true })],
      ["DV01 1234.4", formatDv01(1234.4)],
      ["1,250,000, compact", formatNotional(1.25e6, { compact: true })],
      ["1.234%, signed", formatPercent(1.234, { signed: true })],
      ["Quantity 5,000,000", formatQuantity(5e6)],
      ["Signed zero", formatSigned(0)],
    ],
  },
]

export default function FormatDemo() {
  return (
    <div className="w-fit max-w-full space-y-4 text-xs lining-nums tabular-nums">
      {groups.map(({ title, rows }) => (
        <table key={title} className="w-full">
          <caption className="pb-1 text-left font-medium">{title}</caption>
          <tbody>
            {rows.map(([label, value]) => (
              <tr key={label} className="border-b border-border">
                <th scope="row" className="py-1 pr-4 text-left font-normal text-muted-foreground">{label}</th>
                <td className="py-1 text-right whitespace-nowrap font-(family-name:--tradecn-font-mono)">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}
    </div>
  )
}
