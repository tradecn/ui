import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import type { InstrumentConvention } from "@/registry/tradecn/lib/format"
import { barId, foldTicks, type Bar } from "@/registry/tradecn/lib/price-series"
import { createRowStore, type RowStore } from "@/registry/tradecn/lib/row-store"
import { PriceChart, PriceChartLegend, PriceChartOverlaySwatch, PriceChartHeader, PriceChartLast, PriceChartChange, PriceChartReadout, PriceChartPlot, PriceChartEmpty, type PriceChartKind, type PriceChartOverlay } from "@/registry/tradecn/ui/price-chart"

// One chart over ZN in one-minute bars, with the knobs: line or candles, the venue's zone, the overlays, a
// resizable box, and a burst of a thousand ticks folded through the store a frame at a time, which is the
// load a tick chart is judged on. The feed prints four times a second on its own.

const ZN: InstrumentConvention = { price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 }
const MINUTE = 60_000
const CLOSE = 110.5
const ZONES = ["America/Chicago", "America/New_York", "Europe/London", "Asia/Tokyo"]

function history(): Bar[] {
  const bars: Bar[] = []
  const start = Math.floor(Date.now() / MINUTE) * MINUTE - 180 * MINUTE
  let px = CLOSE
  for (let i = 0; i < 180; i++) {
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

const lastClose = (store: RowStore<Bar>) => {
  const ids = store.getIds()
  return store.getRow(ids[ids.length - 1] ?? "")?.close ?? CLOSE
}

const step = (from: number) => from + (Math.random() < 0.5 ? -1 : 1) * ZN.tick * (Math.random() < 0.8 ? 1 : 2)

const OVERLAYS: PriceChartOverlay[] = [
  {
    id: "sma20",
    label: "20-bar average",
    values: (bars) =>
      bars.map((_, i) => {
        if (i < 19) return null
        let sum = 0
        for (let k = i - 19; k <= i; k++) sum += bars[k]!.close
        return sum / 20
      }),
  },
]

export function PriceChartScene() {
  const [store] = useState(() => {
    const s = createRowStore<Bar>({ getRowId: (bar) => barId(bar.time), lane: "ordered" })
    s.applyDeltas({ upsert: history() })
    return s
  })
  const [kind, setKind] = useState<PriceChartKind>("line")
  const [zone, setZone] = useState(ZONES[0]!)
  const [overlays, setOverlays] = useState(false)
  const [bursting, setBursting] = useState(false)
  const [cursor, setCursor] = useState<Bar | null>(null)

  useEffect(() => {
    const timer = setInterval(() => store.applyDeltas(foldTicks(store, [{ at: Date.now(), price: step(lastClose(store)), size: 1 + Math.round(Math.random() * 20) }], MINUTE)), 250)
    return () => clearInterval(timer)
  }, [store])

  // A thousand ticks over a second, sixteen or so per frame, each frame one batch.
  useEffect(() => {
    if (!bursting) return
    let left = 1000
    let raf = 0
    const frame = () => {
      const n = Math.min(left, 17)
      let px = lastClose(store)
      const at = Date.now()
      const ticks = Array.from({ length: n }, (_, i) => ({ at: at + i, price: (px = step(px)), size: 1 }))
      store.applyDeltas(foldTicks(store, ticks, MINUTE))
      left -= n
      if (left > 0) raf = requestAnimationFrame(frame)
      else setBursting(false)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [bursting, store])

  return (
    <main className="mx-auto max-w-4xl space-y-4 p-6 font-(family-name:--tradecn-font-mono) text-xs lining-nums tabular-nums">
      <h1 className="text-sm font-semibold">price-chart</h1>
      <p className="text-muted-foreground">ZN in one-minute bars on uPlot, fed a print every quarter second through the store. Hover for the crosshair or Tab to the plot and use the arrow keys. Drag the corner of the box: the chart follows its size. Flip the mode on the page and the canvas takes the new tokens.</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" aria-pressed={kind === "line"} onClick={() => setKind("line")}>
          line
        </Button>
        <Button size="sm" variant="outline" aria-pressed={kind === "candles"} onClick={() => setKind("candles")}>
          candles
        </Button>
        <Button size="sm" variant="outline" aria-pressed={overlays} onClick={() => setOverlays((v) => !v)}>
          overlays
        </Button>
        <label className="flex items-center gap-1">
          zone
          <select className="rounded-sm border border-input bg-background px-1 py-0.5" value={zone} onChange={(e) => setZone(e.target.value)}>
            {ZONES.map((z) => (
              <option key={z}>{z}</option>
            ))}
          </select>
        </label>
        <Button size="sm" variant="outline" disabled={bursting} onClick={() => setBursting(true)}>
          burst 1,000 ticks
        </Button>
      </div>
      <div className="resize overflow-hidden rounded-md border border-border p-2" style={{ width: 720, height: 360 }}>
        <PriceChart store={store} convention={ZN} kind={kind} label="ZN, today" zone={zone} baseline={CLOSE} overlays={overlays ? OVERLAYS : undefined} onCursor={setCursor} className="h-full">
          <PriceChartHeader>
            <PriceChartLast />
            <PriceChartChange />
            <PriceChartReadout />
          </PriceChartHeader>
          <PriceChartPlot>
            <PriceChartEmpty />
          </PriceChartPlot>
          {overlays && <PriceChartLegend>{OVERLAYS.map((overlay) => <li key={overlay.id} className="flex items-center gap-1"><PriceChartOverlaySwatch overlayId={overlay.id} />{overlay.label}</li>)}</PriceChartLegend>}
        </PriceChart>
      </div>
      <p className="text-muted-foreground" data-scene-cursor="">
        {cursor ? `onCursor: ${new Date(cursor.time).toISOString()} close ${cursor.close}` : "onCursor: null"}
      </p>
    </main>
  )
}
