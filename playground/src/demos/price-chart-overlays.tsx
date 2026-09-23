import { useEffect, useState } from "react"
import type { InstrumentConvention } from "@/registry/tradecn/lib/format"
import { barId, foldTicks, type Bar } from "@/registry/tradecn/lib/price-series"
import { createRowStore, type RowStore } from "@/registry/tradecn/lib/row-store"
import { PriceChart, type PriceChartOverlay } from "@/registry/tradecn/ui/price-chart"

// Two lines over the bars: a twenty-bar average and the day's volume-weighted average price, each a function
// of the bars run once per applied batch, drawn in a chart token, and named in the legend under the plot.

const ZN: InstrumentConvention = { price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 }
const MINUTE = 60_000
const CLOSE = 110.5

const average = (n: number): PriceChartOverlay["values"] => (bars) =>
  bars.map((_, i) => {
    if (i < n - 1) return null
    let sum = 0
    for (let k = i - n + 1; k <= i; k++) sum += bars[k]!.close
    return sum / n
  })

const vwap: PriceChartOverlay["values"] = (bars) => {
  let notional = 0
  let volume = 0
  return bars.map((bar) => {
    const size = bar.volume ?? 0
    notional += ((bar.high + bar.low + bar.close) / 3) * size
    volume += size
    return volume ? notional / volume : null
  })
}

const OVERLAYS: PriceChartOverlay[] = [
  { id: "sma20", label: "20-bar average", values: average(20) },
  { id: "vwap", label: "VWAP", values: vwap, color: 5 },
]

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

export default function PriceChartOverlaysDemo() {
  const [store] = useState(() => {
    const s = createRowStore<Bar>({ getRowId: (bar) => barId(bar.time), lane: "ordered" })
    s.applyDeltas({ upsert: history() })
    return s
  })
  useFeed(store)
  return <PriceChart store={store} convention={ZN} label="ZN, today" zone="America/Chicago" overlays={OVERLAYS} className="h-72" />
}
