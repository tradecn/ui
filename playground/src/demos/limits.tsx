import { createInstrumentFormatter, type InstrumentConvention } from "@/registry/tradecn/lib/format"
import { checkLimits, type Limits, type LimitsDraft } from "@/registry/tradecn/lib/limits"

// One limits table: allowed, confirmation, quantity block, distance block, and minimum-size block.
const ust: InstrumentConvention = { price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 }
const fmt = createInstrumentFormatter(ust)
const market = { bid: 99.5, ask: 99.515625 }

const LIMITS: Limits = {
  maxQuantity: { confirm: 10_000_000, block: 50_000_000 },
  minQuantity: 1_000_000,
  maxDistance: { ticks: 4 },
  sides: ["buy", "sell"],
}

const DRAFTS: { label: string; draft: LimitsDraft }[] = [
  { label: "buy 5mm at 99-17", draft: { side: "buy", quantity: 5_000_000, price: 99.53125 } },
  { label: "buy 20mm at 99-17", draft: { side: "buy", quantity: 20_000_000, price: 99.53125 } },
  { label: "buy 60mm at 99-17", draft: { side: "buy", quantity: 60_000_000, price: 99.53125 } },
  { label: "buy 5mm at 99-20", draft: { side: "buy", quantity: 5_000_000, price: 99.625 } },
  { label: "sell 500k at 99-16", draft: { side: "sell", quantity: 500_000, price: 99.5 } },
]

export default function LimitsDemo() {
  return (
    <div className="w-2xl max-w-full space-y-2 font-(family-name:--tradecn-font-mono) text-xs lining-nums tabular-nums">
      <p className="text-muted-foreground">
        market {fmt.price(market.bid)} / {fmt.price(market.ask)} · ask again above 10,000,000, stop above 50,000,000, at least 1,000,000, within 4 ticks of the market
      </p>
      <table className="w-full">
        <caption className="sr-only">Draft limit checks</caption>
        <thead>
          <tr className="border-t border-border text-left text-muted-foreground">
            <th scope="col" className="py-1 pr-3 font-normal">Draft</th>
            <th scope="col" className="py-1 font-normal">Result</th>
          </tr>
        </thead>
        <tbody>
          {DRAFTS.map(({ label, draft }) => {
            const problems = checkLimits(draft, LIMITS, { market, convention: ust })
            return (
              <tr key={label} className="border-t border-border align-top">
                <th scope="row" className="py-1 pr-3 text-left font-normal">{label}</th>
                <td className="py-1">
                  {problems.length === 0 ? (
                    <span className="text-muted-foreground">within the limits</span>
                  ) : (
                    <ul className="space-y-0.5">
                      {problems.map((p) => (
                        <li key={p.rule + p.field} data-problem-level={p.level}>
                          <span className={p.level === "block" ? "text-destructive" : "text-stale"}>{p.level}</span> {p.message}
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
