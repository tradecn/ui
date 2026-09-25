import { useState } from "react"
import type { InstrumentConvention } from "@/registry/tradecn/lib/format"
import { barId, type Bar } from "@/registry/tradecn/lib/price-series"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import { PriceChart, usePriceChart, PriceChartLegend, PriceChartOverlaySwatch, PriceChartLast, PriceChartChange, PriceChartReadout, PriceChartPlot, PriceChartEmpty, type PriceChartOverlay } from "@/registry/tradecn/ui/price-chart"

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

function CursorDetails() {
  const { bar, bars, readout } = usePriceChart()
  return (
    <footer className="space-y-1 border-t pt-2 text-xs lining-nums tabular-nums sm:col-span-2">
      <p className="text-muted-foreground">{bars.length} one-minute bars · Chicago time</p>
      <PriceChartReadout className="ml-0 block">{bar ? readout : "Focus the plot or point at a bar to inspect it."}</PriceChartReadout>
    </footer>
  )
}

export default function PriceChartLayoutDemo() {
  const [store] = useState(() => {
    const store = createRowStore<Bar>({ getRowId: (bar) => barId(bar.time), lane: "ordered" })
    store.applyDeltas({ upsert: bars })
    return store
  })
  return (
    <div className="w-2xl max-w-full">
      <PriceChart store={store} convention={ZN} label="ZN sample, research layout" zone="America/Chicago" baseline={110.5} overlays={overlays} className="grid h-auto grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]">
        <h3 className="text-sm font-semibold sm:col-span-2">ZN · Session research</h3>
        <PriceChartPlot className="h-56"><PriceChartEmpty>Waiting for sample bars.</PriceChartEmpty></PriceChartPlot>
        <aside className="space-y-3">
          <div className="flex flex-wrap items-baseline gap-2 sm:flex-col">
            <span className="text-muted-foreground">Last / change</span>
            <PriceChartLast />
            <PriceChartChange />
          </div>
          <PriceChartLegend className="flex-col gap-2 px-0">
            {[...overlays].reverse().map((overlay) => (
              <li key={overlay.id} className="flex items-center gap-2">
                <PriceChartOverlaySwatch overlayId={overlay.id} />
                <span>{overlay.label}</span>
              </li>
            ))}
          </PriceChartLegend>
        </aside>
        <CursorDetails />
      </PriceChart>
    </div>
  )
}
