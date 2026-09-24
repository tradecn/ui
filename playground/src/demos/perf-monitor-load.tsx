import { useEffect, useState } from "react"
import { createFrameSampler } from "@/registry/tradecn/lib/frame-stats"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import { DataGrid, type ColumnDef } from "@/registry/tradecn/ui/data-grid"
import { PerfMonitor } from "@/registry/tradecn/ui/perf-monitor"

type Row = { id: string; bid: number; ask: number; size: number }
const ROWS = 300
const columns: ColumnDef<Row>[] = [
  { key: "id", header: "Id", width: 80, accessor: (row) => row.id },
  { key: "bid", header: "Bid", width: 80, numeric: true, accessor: (row) => row.bid, format: (value) => Number(value).toFixed(3) },
  { key: "ask", header: "Ask", width: 80, numeric: true, accessor: (row) => row.ask, format: (value) => Number(value).toFixed(3) },
  { key: "size", header: "Size", width: 80, numeric: true, accessor: (row) => row.size },
]

export default function PerfMonitorLoadDemo() {
  const [store] = useState(() => {
    const rows = createRowStore<Row>({ getRowId: (row) => row.id, lane: "coalesced" })
    rows.applyDeltas({ upsert: Array.from({ length: ROWS }, (_, i) => ({ id: `R${i}`, bid: 100, ask: 100.01, size: i + 1 })) })
    return rows
  })
  const [sampler] = useState(() => createFrameSampler())
  const [patches, setPatches] = useState(0)

  useEffect(() => {
    if (patches === 0) return
    let frame = 0
    let step = 0
    const tick = () => {
      step++
      store.applyDeltas({ patch: Array.from({ length: patches }, (_, i) => {
        const bid = 100 + ((step + i) % 1000) / 1000
        return { id: `R${i % ROWS}`, fields: { bid, ask: bid + 0.01 } }
      }) })
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [store, patches])

  return (
    <>
      <div data-demo-controls className="flex flex-wrap items-center gap-3 text-xs lining-nums tabular-nums">
        <label className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
          Patches per frame
          <input type="range" min={0} max={3000} step={100} value={patches} onChange={(event) => setPatches(Number(event.target.value))} className="w-32 max-w-full" />
          <span aria-hidden>{patches}</span>
        </label>
        <button type="button" className="rounded border border-border px-2 py-1" onClick={() => sampler.reset()}>Reset measurements</button>
      </div>
      <div className="w-fit max-w-full space-y-2">
        <PerfMonitor sampler={sampler} lanes={[{ label: "Quotes", store }]} readouts={[{ label: "patches/frame", value: String(patches) }]} className="w-80 max-w-full" />
        <div className="h-48 w-fit max-w-full">
          <DataGrid store={store} columns={columns} preset="watchlist" label="Measured quotes" announceRowCount="off" />
        </div>
      </div>
    </>
  )
}
