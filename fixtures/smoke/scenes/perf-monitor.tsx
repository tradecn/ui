import { useState } from "react"
import { createRowStore } from "@/lib/row-store"
import { PerfMonitor } from "@/components/ui/perf-monitor"

export function PerfMonitorScene() {
  const [store] = useState(() => {
    const s = createRowStore<{ id: string; px: number }>({ getRowId: (r) => r.id, lane: "ordered" })
    s.applyDeltas({ upsert: [{ id: "a", px: 1 }, { id: "b", px: 2 }], meta: { lane: "ordered", seq: 7 } })
    return s
  })
  return <PerfMonitor lanes={[{ label: "Quotes", store }]} readouts={[{ label: "ipc batch", value: "2 rows" }]} refreshMs={200} />
}
