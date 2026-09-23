import { useState } from "react"
import type { InstrumentConvention } from "@/registry/tradecn/lib/format"
import { barId, foldTicks, type Bar, type PriceTick } from "@/registry/tradecn/lib/price-series"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import { PriceChart } from "@/registry/tradecn/ui/price-chart"

const ZN: InstrumentConvention = { price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 }
const start = Date.parse("2026-09-22T14:00:00Z")
const batches: { message: string; ticks: PriceTick[] }[] = [
  { message: "Three prints form two bars; their volumes are 5 and 4.", ticks: [{ at: start + 10_000, price: 110.5, size: 2 }, { at: start + 40_000, price: 110.515625, size: 3 }, { at: start + 310_000, price: 110.546875, size: 4 }] },
  { message: "Another print extends the second bar; its volume is 5.", ticks: [{ at: start + 340_000, price: 110.53125, size: 1 }] },
  { message: "A late print lowers the first bar's low and adds 6 volume. Its close stays put.", ticks: [{ at: start + 20_000, price: 110.484375, size: 6 }] },
]

export default function PriceChartTicksDemo() {
  const [store] = useState(() => createRowStore<Bar>({ getRowId: (bar) => barId(bar.time), lane: "ordered" }))
  const [step, setStep] = useState(0)
  const advance = () => {
    const batch = batches[step]
    if (!batch) return
    store.applyDeltas(foldTicks(store, batch.ticks, 5 * 60_000))
    setStep(step + 1)
  }
  const reset = () => {
    store.applyDeltas({ remove: store.getIds() })
    setStep(0)
  }
  return (
    <>
      <div data-demo-controls className="flex flex-wrap gap-2 text-xs">
        <button type="button" className="rounded border px-2 py-1 disabled:opacity-50" disabled={step === batches.length} onClick={advance}>Apply next tick batch</button>
        <button type="button" className="rounded border px-2 py-1" onClick={reset}>Clear bars</button>
      </div>
      <div className="w-xl max-w-full space-y-2 text-xs lining-nums tabular-nums">
        <PriceChart store={store} convention={ZN} kind="candles" label="ZN sample tick batches" zone="America/Chicago" baseline={110.5} className="h-72" />
        <p role="status" className="text-muted-foreground">{batches[step - 1]?.message ?? "No ticks received."}</p>
      </div>
    </>
  )
}
