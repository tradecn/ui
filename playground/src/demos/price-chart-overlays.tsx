import { useState } from "react"
import type { InstrumentConvention } from "@/registry/tradecn/lib/format"
import { barId, type Bar } from "@/registry/tradecn/lib/price-series"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import { PriceChart, type PriceChartOverlay } from "@/registry/tradecn/ui/price-chart"

const ZN: InstrumentConvention = { price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 }
const start = Date.parse("2026-09-22T14:00:00Z")
const minute = 60_000
const bars: Bar[] = [
  { time: start, open: 110.5, high: 110.53125, low: 110.484375, close: 110.515625, volume: 200 },
  { time: start + minute, open: 110.515625, high: 110.53125, low: 110.46875, close: 110.484375, volume: 100 },
  { time: start + 2 * minute, open: 110.484375, high: 110.546875, low: 110.484375, close: 110.53125, volume: 300 },
  { time: start + 3 * minute, open: 110.53125, high: 110.5625, low: 110.515625, close: 110.546875, volume: 200 },
  { time: start + 4 * minute, open: 110.546875, high: 110.546875, low: 110.5, close: 110.515625, volume: 400 },
  { time: start + 5 * minute, open: 110.515625, high: 110.578125, low: 110.515625, close: 110.5625, volume: 100 },
]

const average: PriceChartOverlay["values"] = (bars) => bars.map((bar, i) => i < 2 ? null : (bars[i - 2]!.close + bars[i - 1]!.close + bar.close) / 3)
const vwap: PriceChartOverlay["values"] = (bars) => {
  let weighted = 0
  let volume = 0
  return bars.map((bar) => {
    const size = bar.volume ?? 0
    weighted += ((bar.high + bar.low + bar.close) / 3) * size
    volume += size
    return volume ? weighted / volume : null
  })
}
const overlays: PriceChartOverlay[] = [
  { id: "sma3", label: "3-bar average", values: average },
  { id: "vwap", label: "Bar VWAP", values: vwap, color: 5 },
]

export default function PriceChartOverlaysDemo() {
  const [store] = useState(() => {
    const store = createRowStore<Bar>({ getRowId: (bar) => barId(bar.time), lane: "ordered" })
    store.applyDeltas({ upsert: bars })
    return store
  })
  return <div className="w-xl max-w-full"><PriceChart store={store} convention={ZN} label="ZN sample with overlays" zone="America/Chicago" baseline={110.5} overlays={overlays} className="h-72" /></div>
}
