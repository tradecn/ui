import { useState } from "react"
import { createRowStore } from "@/lib/row-store"
import { PerfMonitor, PerfMonitorHistogram, PerfMonitorLane, PerfMonitorLaneValue, PerfMonitorValue } from "@/components/ui/perf-monitor"

export function PerfMonitorScene() {
  const [store] = useState(() => {
    const s = createRowStore<{ id: string; px: number }>({ getRowId: (r) => r.id, lane: "ordered" })
    s.applyDeltas({ upsert: [{ id: "a", px: 1 }, { id: "b", px: 2 }], meta: { lane: "ordered", seq: 7 } })
    return s
  })
  return (
    <PerfMonitor refreshMs={200}>
      <PerfMonitorHistogram />
      <span data-perf="p50">p50 <PerfMonitorValue metric="p50" /></span>
      <span data-perf-readout="ipc batch">ipc batch 2 rows</span>
      <PerfMonitorLane store={store}>
        <div data-perf-lane="Quotes" data-lane="ordered">
          Quotes rows <PerfMonitorLaneValue metric="rows" /> <span data-perf-seq>seq <PerfMonitorLaneValue metric="seq" /> <PerfMonitorLaneValue metric="gap" /></span>
        </div>
        <table>
          <caption>Feed readings</caption>
          <thead><tr><th scope="col">Feed</th><th scope="col">Rows</th><th scope="col">Age</th></tr></thead>
          <tbody><tr><th scope="row">Quotes</th><td><PerfMonitorLaneValue metric="rows" /></td><td><PerfMonitorLaneValue metric="age" /></td></tr></tbody>
        </table>
      </PerfMonitorLane>
      <button type="button" onClick={() => store.clear()}>Clear quotes</button>
      <button type="button" onClick={() => store.applyDeltas({ upsert: [{ id: "a", px: 3 }], meta: { lane: "ordered", seq: 9, gap: true } })}>Receive quote</button>
    </PerfMonitor>
  )
}
