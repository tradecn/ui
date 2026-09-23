import { useState } from "react"
import { ContextMenuItem } from "@/components/ui/context-menu"
import { useActiveInquiry } from "@/registry/tradecn/hooks/use-active-inquiry"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import { RfqStack, bySize, rfqStackColumns, useRfqStackView, type RfqStackRow } from "@/registry/tradecn/ui/rfq-stack"

const columns = rfqStackColumns().filter((column) => ["client", "instrument", "size", "status"].includes(column.key))

export default function RfqStackParkingDemo() {
  const [store] = useState(() => {
    const store = createRowStore<RfqStackRow>({ getRowId: (row) => row.id, lane: "ordered" })
    const now = Date.now()
    store.applyDeltas({ upsert: [
      { id: "Q-1", receivedAt: now, expiresAt: now + 60_000, client: "ALPHA", instrument: "ACME 4.5 2030", side: "buy", quantity: 10_000_000, status: "Open" },
      { id: "Q-2", receivedAt: now, expiresAt: now + 60_000, client: "BETA", instrument: "ACME 4.5 2030", side: "sell", quantity: 5_000_000, status: "Open" },
      { id: "Q-3", receivedAt: now, expiresAt: now + 60_000, client: "GAMMA", instrument: "ACME 4.5 2030", side: "two-way", quantity: 1_000_000, status: "Open" },
    ] })
    return store
  })
  const view = useRfqStackView(store, { comparator: bySize })
  const active = useActiveInquiry(view, { isEnded: (row) => row.status !== "Open" })
  return (
    <div className="w-fit max-w-full space-y-2 text-xs lining-nums tabular-nums">
      <div className="h-40">
        <RfqStack
          store={store}
          view={view}
          columns={columns}
          activeId={active.activeId}
          parkedIds={active.parked}
          onActivate={active.setActive}
          label="Parkable inquiries"
          // Keep Enter in either menu action from also activating the grid row.
          renderContextMenu={(_, ids) => (
            <>
              <ContextMenuItem onKeyDown={(event) => { if (event.key === "Enter") event.stopPropagation() }} onClick={() => ids.forEach(active.park)}>Park inquiry</ContextMenuItem>
              <ContextMenuItem onKeyDown={(event) => { if (event.key === "Enter") event.stopPropagation() }} onClick={() => ids.forEach(active.unpark)}>Unpark inquiry</ContextMenuItem>
            </>
          )}
        />
      </div>
      <p className="text-muted-foreground">Active inquiry: {active.activeId ?? "None"}. Parked: {[...active.parked].join(", ") || "None"}.</p>
    </div>
  )
}
