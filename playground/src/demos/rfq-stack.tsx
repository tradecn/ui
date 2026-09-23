import { useState } from "react"
import { useActiveInquiry } from "@/registry/tradecn/hooks/use-active-inquiry"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import { RfqStack, bySize, byTimeLeft, stackOrder, useRfqStackView, type RfqStackRow } from "@/registry/tradecn/ui/rfq-stack"

const order = stackOrder<RfqStackRow>(bySize, byTimeLeft)

export default function RfqStackDemo() {
  const [store] = useState(() => {
    const store = createRowStore<RfqStackRow>({ getRowId: (row) => row.id, lane: "ordered" })
    const now = Date.now()
    store.applyDeltas({ upsert: [
      { id: "Q-1", receivedAt: now, expiresAt: now + 60_000, client: "ALPHA", tier: "Tier 1", instrument: "ACME 4.5 2030", side: "buy", quantity: 10_000_000, bid: 99.5, ask: 99.55, status: "Open" },
      { id: "Q-2", receivedAt: now, expiresAt: now + 45_000, client: "BETA", instrument: "ACME 4.5 2030", side: "sell", quantity: 5_000_000, bid: 99.5, ask: 99.55, status: "Quoted", auto: true },
      { id: "Q-3", receivedAt: now, expiresAt: now + 30_000, client: "GAMMA", instrument: "ACME 4.5 2030", side: "two-way", quantity: 5_000_000, bid: 99.5, ask: 99.55, status: "Open" },
    ] })
    return store
  })
  const view = useRfqStackView(store, { comparator: order })
  const active = useActiveInquiry(view, { isEnded: (row) => row.status !== "Open" && row.status !== "Quoted" })
  return (
    <div className="w-fit max-w-full space-y-2 text-xs lining-nums tabular-nums">
      <div className="h-40">
        <RfqStack store={store} view={view} activeId={active.activeId} onActivate={active.setActive} label="Client inquiries" />
      </div>
      <p className="text-muted-foreground">Active inquiry: {active.activeId ?? "None"}</p>
    </div>
  )
}
