import { useEffect, useState } from "react"
import type { InstrumentConvention } from "@/registry/tradecn/lib/format"
import { barId, foldTicks, type Bar } from "@/registry/tradecn/lib/price-series"
import { createRowStore, type RowStore } from "@/registry/tradecn/lib/row-store"
import { PriceChart } from "@/registry/tradecn/ui/price-chart"

// ZN in one-minute bars, two hours of pretend history behind a pretend feed that prints four times a second.
// Each print folds into the open bar through the store, so the chart hears one batch per print and reads its
// columns once. The axis is in Chicago time, where the future trades, and the dashed line is yesterday's close,
// which the change in the header is measured from. Hover or Tab to the plot and use the arrow keys.

const ZN: InstrumentConvention = { price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 }
const MINUTE = 60_000
const CLOSE = 110.5

/** Two hours of one-minute bars ending now, a random walk on the tick grid. */
function history(): Bar[] {
  const bars: Bar[] = []
  const start = Math.floor(Date.now() / MINUTE) * MINUTE - 120 * MINUTE
  let px = CLOSE
  for (let i = 0; i < 120; i++) {
    const open = px
    let high = open
    let low = open
    for (let t = 0; t < 8; t++) {
      px += (Math.random() < 0.5 ? -1 : 1) * ZN.tick * (Math.random() < 0.7 ? 1 : 2)
      high = Math.max(high, px)
      low = Math.min(low, px)
    }
    bars.push({ time: start + i * MINUTE, open, high, low, close: px, volume: 200 + Math.round(Math.random() * 800) })
  }
  return bars
}

function useFeed(store: RowStore<Bar>) {
  useEffect(() => {
    const timer = setInterval(() => {
      const ids = store.getIds()
      const last = store.getRow(ids[ids.length - 1] ?? "")?.close ?? CLOSE
      const price = last + (Math.random() < 0.5 ? -1 : 1) * ZN.tick * (Math.random() < 0.8 ? 1 : 2)
      store.applyDeltas(foldTicks(store, [{ at: Date.now(), price, size: 1 + Math.round(Math.random() * 20) }], MINUTE))
    }, 250)
    return () => clearInterval(timer)
  }, [store])
}

export default function PriceChartDemo() {
  const [store] = useState(() => {
    const s = createRowStore<Bar>({ getRowId: (bar) => barId(bar.time), lane: "ordered" })
    s.applyDeltas({ upsert: history() })
    return s
  })
  useFeed(store)
  return <PriceChart store={store} convention={ZN} label="ZN, today" zone="America/Chicago" baseline={CLOSE} className="h-72" />
}
