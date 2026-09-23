import { useState } from "react"
import { useActiveInquiry } from "@/registry/tradecn/hooks/use-active-inquiry"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import { RfqStack, bySize, rfqStackColumns, useRfqStackView, type RfqStackRow } from "@/registry/tradecn/ui/rfq-stack"

const columns = rfqStackColumns().filter((column) => ["client", "size", "status", "auto"].includes(column.key))

export default function RfqStackThresholdDemo() {
  const [store] = useState(() => {
    const store = createRowStore<RfqStackRow>({ getRowId: (row) => row.id, lane: "ordered" })
    const now = Date.now()
    store.applyDeltas({ upsert: [
      { id: "Q-1", receivedAt: now, expiresAt: now + 60_000, client: "ALPHA", instrument: "ACME 4.5 2030", side: "buy", quantity: 5_000_000, status: "Quoted", auto: true },
      { id: "Q-2", receivedAt: now, expiresAt: now + 60_000, client: "BETA", instrument: "ACME 4.5 2030", side: "sell", quantity: 2_000_000, status: "Quoted", auto: true },
      { id: "Q-3", receivedAt: now, expiresAt: now + 60_000, client: "GAMMA", instrument: "ACME 4.5 2030", side: "buy", quantity: 1_000_000, status: "Open" },
    ] })
    return store
  })
  const [threshold, setThreshold] = useState<number | null>(5_000_000)
  const view = useRfqStackView(store, { comparator: bySize, threshold })
  const active = useActiveInquiry(view, { isEnded: (row) => row.status !== "Open" && row.status !== "Quoted" })
  return (
    <div className="w-fit max-w-full space-y-2 text-xs lining-nums tabular-nums">
      <div className="h-40">
        <RfqStack store={store} view={view} columns={columns} activeId={active.activeId} onActivate={active.setActive} threshold={threshold} onThresholdChange={setThreshold} label="Filtered inquiries" />
      </div>
      <p className="text-muted-foreground">Active inquiry: {active.activeId ?? "None"}</p>
    </div>
  )
}
