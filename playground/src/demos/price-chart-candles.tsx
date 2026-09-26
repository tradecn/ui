import { useState } from "react"
import type { InstrumentConvention } from "@/registry/tradecn/lib/format"
import { barId, type Bar } from "@/registry/tradecn/lib/price-series"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import { PriceChart, PriceChartHeader, PriceChartLast, PriceChartChange, PriceChartReadout, PriceChartPlot, PriceChartEmpty } from "@/registry/tradecn/ui/price-chart"

const ES: InstrumentConvention = { price: { kind: "decimal", decimals: 2 }, tick: 0.25 }
const start = Date.parse("2026-09-22T14:00:00Z")
const interval = 5 * 60_000
const bars: Bar[] = [
  { time: start, open: 5010, high: 5011.5, low: 5009.5, close: 5011, volume: 1500 },
  { time: start + interval, open: 5011, high: 5011.25, low: 5009.75, close: 5010.25, volume: 1800 },
  { time: start + 2 * interval, open: 5010.25, high: 5012, low: 5010, close: 5011.75, volume: 2200 },
  { time: start + 3 * interval, open: 5011.75, high: 5012.25, low: 5011.25, close: 5011.75, volume: 1200 },
  { time: start + 4 * interval, open: 5011.75, high: 5012, low: 5010.5, close: 5011, volume: 1600 },
  { time: start + 5 * interval, open: 5011, high: 5013, low: 5010.75, close: 5012.5, volume: 2400 },
]

export default function PriceChartCandlesDemo() {
  const [store] = useState(() => {
    const store = createRowStore<Bar>({ getRowId: (bar) => barId(bar.time), lane: "ordered" })
    store.applyDeltas({ upsert: bars })
    return store
  })
  return (
    <div className="w-xl max-w-full">
      <PriceChart store={store} convention={ES} kind="candles" label="ES sample, five-minute candles" zone="America/Chicago" baseline={5010} className="h-72">
        <PriceChartHeader>
          <PriceChartLast />
          <PriceChartChange />
          <PriceChartReadout />
        </PriceChartHeader>
        <PriceChartPlot>
          <PriceChartEmpty />
        </PriceChartPlot>
      </PriceChart>
    </div>
  )
}
