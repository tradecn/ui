import { useState } from "react"
import { createInstrumentFormatter, parsePrice, type InstrumentConvention } from "@/registry/tradecn/lib/format"
import { blocks, checkLimits, confirms, type Limits } from "@/registry/tradecn/lib/limits"

// The check on its own, with the knobs: type a draft, move the lines, and read what comes back and at
// which level. The tickets do the same and turn a confirm into their two-step.

const ust: InstrumentConvention = { price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 }
const fmt = createInstrumentFormatter(ust)
const market = { bid: 99.5, ask: 99.515625 }

export function LimitsScene() {
  const [side, setSide] = useState<"buy" | "sell">("buy")
  const [quantity, setQuantity] = useState("20000000")
  const [price, setPrice] = useState("99-20")
  const [confirmAt, setConfirmAt] = useState("10000000")
  const [blockAt, setBlockAt] = useState("50000000")
  const [minAt, setMinAt] = useState("1000000")
  const [maxTicks, setMaxTicks] = useState("4")
  const [distanceLevel, setDistanceLevel] = useState<"block" | "confirm">("block")
  const [sides, setSides] = useState<("buy" | "sell")[]>(["buy", "sell"])
  const num = (s: string) => (s.trim() === "" ? undefined : Number(s))
  const limits: Limits = {
    maxQuantity: { confirm: num(confirmAt), block: num(blockAt) },
    minQuantity: num(minAt),
    maxDistance: num(maxTicks) === undefined ? undefined : { ticks: Number(maxTicks), level: distanceLevel },
    sides,
  }
  const draft = { side, quantity: quantity.trim() === "" ? null : Number(quantity.replace(/,/g, "")), price: parsePrice(price, ust.price) }
  const problems = checkLimits(draft, limits, { market, convention: ust })
  const field = "w-32 rounded border border-border bg-background px-1"
  return (
    <main className="mx-auto max-w-4xl space-y-4 p-6 font-(family-name:--tradecn-font-mono) text-xs lining-nums tabular-nums">
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-sm font-semibold">limits</h1>
        <span className="text-muted-foreground">
          A draft against a limits table. The market is {fmt.price(market.bid)} / {fmt.price(market.ask)}.
        </span>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <section className="space-y-2">
          <h2 className="font-semibold">the draft</h2>
          <label className="flex items-center gap-2">
            side
            <select className={field} value={side} onChange={(e) => setSide(e.target.value as "buy" | "sell")}>
              <option value="buy">buy</option>
              <option value="sell">sell</option>
            </select>
          </label>
          <label className="flex items-center gap-2">
            quantity <input className={field} value={quantity} onChange={(e) => setQuantity(e.target.value)} aria-label="quantity" />
          </label>
          <label className="flex items-center gap-2">
            price <input className={field} value={price} onChange={(e) => setPrice(e.target.value)} aria-label="price" />
            <span className="text-muted-foreground">{draft.price === null ? "not a price" : fmt.price(draft.price)}</span>
          </label>
        </section>
        <section className="space-y-2">
          <h2 className="font-semibold">the limits</h2>
          <label className="flex items-center gap-2">
            ask again above <input className={field} value={confirmAt} onChange={(e) => setConfirmAt(e.target.value)} aria-label="confirm above" />
          </label>
          <label className="flex items-center gap-2">
            stop above <input className={field} value={blockAt} onChange={(e) => setBlockAt(e.target.value)} aria-label="block above" />
          </label>
          <label className="flex items-center gap-2">
            at least <input className={field} value={minAt} onChange={(e) => setMinAt(e.target.value)} aria-label="minimum" />
          </label>
          <label className="flex items-center gap-2">
            within <input className="w-16 rounded border border-border bg-background px-1" value={maxTicks} onChange={(e) => setMaxTicks(e.target.value)} aria-label="max ticks" /> ticks of the market, a
            <select className="rounded border border-border bg-background px-1" value={distanceLevel} onChange={(e) => setDistanceLevel(e.target.value as "block" | "confirm")}>
              <option value="block">block</option>
              <option value="confirm">confirm</option>
            </select>
          </label>
          <div className="flex items-center gap-3">
            <span>the book takes</span>
            {(["buy", "sell"] as const).map((s) => (
              <label key={s} className="flex items-center gap-1">
                <input type="checkbox" checked={sides.includes(s)} onChange={(e) => setSides(e.target.checked ? [...sides, s] : sides.filter((x) => x !== s))} /> {s}
              </label>
            ))}
          </div>
        </section>
      </div>
      <section className="space-y-1" data-limits-blocks={blocks(problems).length} data-limits-confirms={confirms(problems).length}>
        <h2 className="font-semibold">what the check says</h2>
        {problems.length === 0 ? (
          <p className="text-muted-foreground">within the limits</p>
        ) : (
          <ul className="space-y-0.5">
            {problems.map((p) => (
              <li key={p.rule + p.field} data-problem-level={p.level} data-problem-field={p.field}>
                <span className={p.level === "block" ? "text-destructive" : "text-stale"}>{p.level}</span> <span className="text-muted-foreground">{p.field}:</span> {p.message}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
