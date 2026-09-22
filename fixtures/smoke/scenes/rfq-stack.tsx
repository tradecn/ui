import { useState } from "react"
import { useActiveInquiry } from "@/hooks/use-active-inquiry"
import { createRowStore } from "@/lib/row-store"
import { RfqStack, bySize, useRfqStackView, type RfqStackRow } from "@/components/ui/rfq-stack"

const NOW = Date.now()
const ROWS: RfqStackRow[] = [
  { id: "q1", receivedAt: NOW - 3000, expiresAt: NOW + 60_000, client: "Client A", tier: "Tier 1", instrument: "T 4 1/8 05/15/34", side: "buy", quantity: 5_000_000, bid: 99.5, ask: 99.515625, status: "Open" },
  { id: "q2", receivedAt: NOW - 2000, expiresAt: NOW + 40_000, client: "Client B", tier: "Tier 2", instrument: "T 4 1/4 02/15/29", side: "sell", quantity: 25_000_000, bid: 100.25, ask: 100.265625, status: "Open" },
  { id: "q3", receivedAt: NOW - 1000, expiresAt: NOW + 20_000, client: "Client C", instrument: "T 3 7/8 08/15/33", side: "buy", quantity: 2_000_000, bid: 98.75, ask: 98.765625, status: "Quoted", auto: true },
]

export function RfqStackScene() {
  const [store] = useState(() => {
    const s = createRowStore<RfqStackRow>({ getRowId: (r) => r.id, lane: "ordered" })
    s.applyDeltas({ upsert: ROWS })
    return s
  })
  const [threshold, setThreshold] = useState<number | null>(null)
  const view = useRfqStackView(store, { comparator: bySize, threshold })
  const active = useActiveInquiry(view, { isEnded: (row) => row.status === "Expired" || row.status === "Done" })
  return (
    <div className="flex h-56 w-[44rem] flex-col gap-1" data-rfq-active={active.activeId ?? ""}>
      <RfqStack store={store} view={view} activeId={active.activeId} onActivate={active.setActive} threshold={threshold} onThresholdChange={setThreshold} />
      <button type="button" onClick={() => store.applyDeltas({ patch: [{ id: "q2", fields: { status: "Done" } }] })}>
        venue ends q2
      </button>
    </div>
  )
}
