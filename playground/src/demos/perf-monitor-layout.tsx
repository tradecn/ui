import { useState } from "react"
import { createFrameSampler } from "@/registry/tradecn/lib/frame-stats"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import { PerfMonitor, PerfMonitorHistogram, PerfMonitorLane, PerfMonitorLaneValue, PerfMonitorValue } from "@/registry/tradecn/ui/perf-monitor"

export default function PerfMonitorLayoutDemo() {
  const [sampler] = useState(() => createFrameSampler({ budgetMs: 20, window: 120, refreshMs: 500 }))
  const [feeds] = useState(() => {
    const quotes = createRowStore<{ id: string }>({ getRowId: (row) => row.id, lane: "coalesced" })
    quotes.applyDeltas({ upsert: [{ id: "ZN" }, { id: "ZF" }] })
    const orders = createRowStore<{ id: string }>({ getRowId: (row) => row.id, lane: "ordered" })
    return [{ label: "Orders", store: orders }, { label: "Quotes", store: quotes }]
  })

  return (
    <PerfMonitor sampler={sampler} budgetMs={20} label="Desk measurements" className="w-80 max-w-full gap-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Desk measurements</h2>
        <button type="button" className="rounded border border-border px-2 py-1" onClick={() => sampler.reset()}>Reset measurements</button>
      </header>
      <table className="w-full text-left">
        <caption className="text-left text-muted-foreground">Frame gaps</caption>
        <tbody>
          <tr><th scope="row" className="font-normal">p99</th><td className="text-right"><PerfMonitorValue metric="p99" /></td></tr>
          <tr><th scope="row" className="font-normal">frames</th><td className="text-right"><PerfMonitorValue metric="frames" /></td></tr>
          <tr><th scope="row" className="font-normal">mean</th><td className="text-right"><PerfMonitorValue metric="mean" /></td></tr>
        </tbody>
      </table>
      <table className="w-full text-left">
        <caption className="text-left text-muted-foreground">Feeds</caption>
        <thead><tr><th scope="col" className="font-normal">Feed</th><th scope="col" className="text-right font-normal">Age</th><th scope="col" className="text-right font-normal">Rows</th></tr></thead>
        <tbody>
          {feeds.map(({ label, store }) => (
            <PerfMonitorLane key={label} store={store}>
              <tr><th scope="row" className="font-normal">{label}</th><td className="text-right"><PerfMonitorLaneValue metric="age" /></td><td className="text-right"><PerfMonitorLaneValue metric="rows" /></td></tr>
            </PerfMonitorLane>
          ))}
        </tbody>
      </table>
      <footer className="flex flex-wrap items-center justify-between gap-2">
        <span>Tail gap <PerfMonitorValue metric="p99" /></span>
        <PerfMonitorHistogram />
      </footer>
    </PerfMonitor>
  )
}
