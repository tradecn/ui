import { useState } from "react"
import { PriceChart, PriceChartLegend, PriceChartOverlaySwatch, PriceChartHeader, PriceChartLast, PriceChartChange, PriceChartReadout, PriceChartPlot, PriceChartEmpty, type PriceChartOverlay } from "@/components/ui/price-chart"
import type { InstrumentConvention } from "@/lib/format"
import { barId, foldTicks, type Bar } from "@/lib/price-series"
import { createRowStore } from "@/lib/row-store"

const ZN: InstrumentConvention = { price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 }
const MINUTE = 60_000
// 14:30 UTC on a fixed day: 09:30 in New York, the zone the scene asks for.
const T0 = Date.UTC(2026, 0, 15, 14, 30)

const bar = (i: number, open: number, close: number): Bar => ({ time: T0 + i * MINUTE, open, high: Math.max(open, close) + 1 / 32, low: Math.min(open, close) - 1 / 32, close, volume: 10 * (i + 1) })

// Three bars from 110-16 to 110-18: the last is two 32nds over the first open, so the chart reads up.
const BARS = [bar(0, 110.5, 110.53125), bar(1, 110.53125, 110.5), bar(2, 110.5, 110.5625)]

const OVERLAYS: PriceChartOverlay[] = [{ id: "avg", label: "3-bar average", values: (bars) => bars.map((_, i) => (i < 2 ? null : (bars[i]!.close + bars[i - 1]!.close + bars[i - 2]!.close) / 3)) }]

export function PriceChartScene() {
  const [store] = useState(() => {
    const s = createRowStore<Bar>({ getRowId: (b) => barId(b.time), lane: "ordered" })
    s.applyDeltas({ upsert: BARS })
    return s
  })
  return (
    <div className="flex flex-col gap-1">
      <div style={{ width: 480, height: 240 }}>
        <PriceChart store={store} convention={ZN} label="ZN, today" zone="America/New_York" overlays={OVERLAYS} className="h-full">
          <PriceChartHeader>
            <PriceChartLast />
            <PriceChartChange />
            <PriceChartReadout />
          </PriceChartHeader>
          <PriceChartPlot>
            <PriceChartEmpty />
          </PriceChartPlot>
          <PriceChartLegend>{OVERLAYS.map((overlay) => <li key={overlay.id} className="flex items-center gap-1"><PriceChartOverlaySwatch overlayId={overlay.id} />{overlay.label}</li>)}</PriceChartLegend>
        </PriceChart>
      </div>
      {/* A tick under the first open folds into the open bar and turns the chart down; a later tick opens a fourth bar. */}
      <button type="button" onClick={() => store.applyDeltas(foldTicks(store, [{ at: T0 + 2 * MINUTE + 30_000, price: 110.484375 }], MINUTE))}>
        tick down
      </button>
      <button type="button" onClick={() => store.applyDeltas(foldTicks(store, [{ at: T0 + 3 * MINUTE, price: 110.625, size: 4 }], MINUTE))}>
        new bar
      </button>
    </div>
  )
}
