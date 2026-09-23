import { useEffect, useState } from "react"
import type { InstrumentConvention } from "@/registry/tradecn/lib/format"
import { barId, foldTicks, type Bar } from "@/registry/tradecn/lib/price-series"
import { createRowStore, type RowStore } from "@/registry/tradecn/lib/row-store"
import { PriceChart } from "@/registry/tradecn/ui/price-chart"

// ES in five-minute candles: a quarter-point tick, the body in the direction's color, the wick from the low
// to the high. Under the crosshair the readout prints all four prices and the bar's volume.

const ES: InstrumentConvention = { price: { kind: "decimal", decimals: 2 }, tick: 0.25 }
const BAR = 5 * 60_000
const CLOSE = 5010

function history(): Bar[] {
  const bars: Bar[] = []
  const start = Math.floor(Date.now() / BAR) * BAR - 60 * BAR
  let px = CLOSE
  for (let i = 0; i < 60; i++) {
    const open = px
    let high = open
    let low = open
    for (let t = 0; t < 12; t++) {
      px += (Math.random() < 0.5 ? -1 : 1) * ES.tick * (1 + Math.floor(Math.random() * 3))
      high = Math.max(high, px)
      low = Math.min(low, px)
    }
    bars.push({ time: start + i * BAR, open, high, low, close: px, volume: 1500 + Math.round(Math.random() * 4000) })
  }
  return bars
}

function useFeed(store: RowStore<Bar>) {
  useEffect(() => {
    const timer = setInterval(() => {
      const ids = store.getIds()
      const last = store.getRow(ids[ids.length - 1] ?? "")?.close ?? CLOSE
      const price = last + (Math.random() < 0.5 ? -1 : 1) * ES.tick * (1 + Math.floor(Math.random() * 2))
      store.applyDeltas(foldTicks(store, [{ at: Date.now(), price, size: 1 + Math.round(Math.random() * 30) }], BAR))
    }, 250)
    return () => clearInterval(timer)
  }, [store])
}

export default function PriceChartCandlesDemo() {
  const [store] = useState(() => {
    const s = createRowStore<Bar>({ getRowId: (bar) => barId(bar.time), lane: "ordered" })
    s.applyDeltas({ upsert: history() })
    return s
  })
  useFeed(store)
  return <PriceChart store={store} convention={ES} kind="candles" label="ES, today" zone="America/Chicago" baseline={CLOSE} className="h-72" />
}
