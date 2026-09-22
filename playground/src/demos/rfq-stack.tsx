import { useEffect, useState } from "react"
import { ContextMenuItem } from "@/components/ui/context-menu"
import { useActiveInquiry } from "@/registry/tradecn/hooks/use-active-inquiry"
import { createInstrumentFormatter, type InstrumentConvention } from "@/registry/tradecn/lib/format"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import { RfqStack, bySize, byTimeLeft, stackOrder, useRfqStackView, type RfqStackRow } from "@/registry/tradecn/ui/rfq-stack"

// A pretend venue: inquiries arrive, most answered by a pretend auto-quoter, each ending when the venue says so.
const T32: InstrumentConvention = { price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 }
const ust = createInstrumentFormatter(T32)
const INSTRUMENTS = ["T 4 1/8 05/15/34", "T 4 1/4 02/15/29", "T 3 7/8 08/15/33", "T 4 5/8 05/15/54"]
const CLIENTS: [string, string][] = [["Client A", "Tier 1"], ["Client B", "Tier 2"], ["Client C", "Tier 1"], ["Client D", "Tier 3"]]
const ENDED = new Set(["Done", "Done away", "Passed", "Expired"])
const ORDER = stackOrder<RfqStackRow>(bySize, byTimeLeft)

let seq = 0
function arrive(now: number): RfqStackRow {
  const auto = Math.random() < 0.8
  const [client, tier] = CLIENTS[Math.floor(Math.random() * CLIENTS.length)]!
  const mid = 99.5 + Math.round((Math.random() - 0.5) * 32) / 64
  return {
    id: `Q-${String(++seq).padStart(4, "0")}`,
    receivedAt: now,
    expiresAt: now + 15_000 + Math.floor(Math.random() * 30_000),
    client,
    tier,
    instrument: INSTRUMENTS[Math.floor(Math.random() * INSTRUMENTS.length)]!,
    side: Math.random() < 0.5 ? "buy" : "sell",
    quantity: auto ? (1 + Math.floor(Math.random() * 8)) * 1_000_000 : (5 + Math.floor(Math.random() * 45)) * 1_000_000,
    bid: mid - 1 / 128,
    ask: mid + 1 / 128,
    status: auto ? "Quoted" : "Open",
    auto,
  }
}

export default function RfqStackDemo() {
  const [store] = useState(() => {
    const s = createRowStore<RfqStackRow>({ getRowId: (r) => r.id, lane: "ordered" })
    const now = Date.now()
    s.applyDeltas({ upsert: Array.from({ length: 8 }, () => arrive(now)) })
    return s
  })
  // The order is the desk's: largest first, then the one about to end, with the threshold folded in. The grid holds it still under a hand.
  const [threshold, setThreshold] = useState<number | null>(5_000_000)
  const view = useRfqStackView(store, { comparator: ORDER, threshold })
  // The active inquiry stays until the trader acts or the venue ends it; arrivals never change it.
  const active = useActiveInquiry(view, { isEnded: (row) => ENDED.has(row.status) })
  useEffect(() => {
    const t = setInterval(() => {
      const now = Date.now()
      const upsert = Math.random() < 0.6 ? [arrive(now)] : []
      const patch = store
        .getIds()
        .map((id) => store.getRow(id)!)
        .filter((row) => row.expiresAt <= now && !ENDED.has(row.status))
        .map((row) => ({ id: row.id, fields: { status: "Expired" } }))
      const remove = store.getIds().filter((id) => {
        const row = store.getRow(id)!
        return ENDED.has(row.status) && row.expiresAt < now - 10_000
      })
      store.applyDeltas({ upsert, patch, remove })
    }, 1000)
    return () => clearInterval(t)
  }, [store])
  return (
    <div className="space-y-2 font-(family-name:--tradecn-font-mono) text-xs">
      <div className="h-80">
        <RfqStack
          store={store}
          view={view}
          activeId={active.activeId}
          parkedIds={active.parked}
          onActivate={active.setActive}
          threshold={threshold}
          onThresholdChange={setThreshold}
          price={(v) => ust.price(v)}
          // Park from the menu: the inquiry stays in its place, muted, and is never the next one until it is let back.
          renderContextMenu={(_, ids) =>
            ids.every((id) => active.parked.has(id)) ? <ContextMenuItem onClick={() => ids.forEach(active.unpark)}>Unpark</ContextMenuItem> : <ContextMenuItem onClick={() => ids.forEach(active.park)}>Park</ContextMenuItem>
          }
        />
      </div>
      <p className="text-muted-foreground">{active.row ? `In the ticket: ${active.row.id}, ${active.row.client} ${active.row.side === "buy" ? "buys" : "sells"} ${active.row.instrument}. It stays until you act or the venue ends it.` : "No open inquiry."} Enter or a double click picks another; right-click parks one; the threshold hides the small auto-quoted ones.</p>
    </div>
  )
}
