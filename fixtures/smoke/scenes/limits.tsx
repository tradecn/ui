import type { InstrumentConvention } from "@/lib/format"
import { checkLimits } from "@/lib/limits"

// A lib has no element of its own; the scene wraps one check in the slot the smoke test counts.
const ust: InstrumentConvention = { price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 }

export function LimitsScene() {
  const problems = checkLimits({ side: "buy", quantity: 20_000_000, price: 99.625 }, { maxQuantity: { confirm: 10_000_000, block: 50_000_000 }, maxDistance: { ticks: 4 } }, { market: { bid: 99.5, ask: 99.515625 }, convention: ust })
  return (
    <div data-slot="tradecn-limits" className="text-xs lining-nums tabular-nums">
      {problems.map((p) => `${p.level}:${p.field}:${p.rule}`).join(" ")}
    </div>
  )
}
