import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { RfqTicket, type RfqAction, type RfqInquiry, type RfqQuoteDraft } from "@/registry/tradecn/blocks/rfq-ticket/rfq-ticket"
import { useActiveInquiry } from "@/registry/tradecn/hooks/use-active-inquiry"
import { HotkeysProvider } from "@/registry/tradecn/hooks/use-hotkeys"
import { createInstrumentFormatter, type InstrumentConvention } from "@/registry/tradecn/lib/format"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import { RfqStack, bySize, byTimeLeft, stackOrder, useRfqStackView, type RfqStackRow } from "@/registry/tradecn/ui/rfq-stack"

// A pretend venue: inquiries arrive, most of them answered by a pretend auto-quoter, and each one
// ends when the venue says so. The stack and the ticket only read what the venue writes.

const T32: InstrumentConvention = { price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 }
const ust = createInstrumentFormatter(T32)
const INSTRUMENTS = ["T 4 1/8 05/15/34", "T 4 1/4 02/15/29", "T 3 7/8 08/15/33", "T 4 5/8 05/15/54", "T 4 1/2 11/15/26"]
const CLIENTS: [string, string][] = [["Client A", "Tier 1"], ["Client B", "Tier 2"], ["Client C", "Tier 1"], ["Client D", "Tier 3"], ["Client E", "Tier 2"]]
const ENDED = new Set(["Done", "Done away", "Passed", "Expired"])
const ORDER = stackOrder<Row>(bySize, byTimeLeft)

interface Row extends RfqStackRow {
  quoted?: { bid?: number | null; ask?: number | null }
}

let seq = 0
function arrive(now: number): Row {
  const auto = Math.random() < 0.9
  const [client, tier] = CLIENTS[Math.floor(Math.random() * CLIENTS.length)]!
  const mid = 99.5 + Math.round((Math.random() - 0.5) * 32) / 64
  return {
    id: `Q-${String(++seq).padStart(4, "0")}`,
    receivedAt: now,
    expiresAt: now + 20_000 + Math.floor(Math.random() * 40_000),
    client,
    tier,
    instrument: INSTRUMENTS[Math.floor(Math.random() * INSTRUMENTS.length)]!,
    side: Math.random() < 0.45 ? "buy" : Math.random() < 0.9 ? "sell" : "two-way",
    quantity: auto ? (1 + Math.floor(Math.random() * 8)) * 1_000_000 : (5 + Math.floor(Math.random() * 45)) * 1_000_000,
    bid: mid - 1 / 128,
    ask: mid + 1 / 128,
    status: auto ? "Quoted" : "Open",
    auto,
  }
}

function toInquiry(row: Row): RfqInquiry {
  return {
    id: row.id,
    instrument: { symbol: row.instrument, description: row.instrument, convention: T32 },
    side: row.side,
    quantity: row.quantity,
    client: { name: row.client ?? "", tier: row.tier },
    tags: ["RFQ", row.auto ? "auto" : "3 dealers"],
    receivedAt: row.receivedAt,
    expiresAt: row.expiresAt,
    market: { label: "Composite", bid: row.bid, ask: row.ask },
    suggested: row.side === "sell" ? { bid: (row.bid ?? 99.5) - 1 / 64 } : row.side === "buy" ? { ask: (row.ask ?? 99.5) + 1 / 64 } : { bid: (row.bid ?? 99.5) - 1 / 64, ask: (row.ask ?? 99.5) + 1 / 64 },
    quoted: row.quoted,
    status: row.status,
    allowedActions: ENDED.has(row.status) ? [] : ["quote", "pass"],
  }
}

export function RfqStackScene() {
  const store = useMemo(() => createRowStore<Row>({ getRowId: (r) => r.id, lane: "ordered" }), [])
  const [threshold, setThreshold] = useState<number | null>(5_000_000)
  const view = useRfqStackView(store, { comparator: ORDER, threshold })
  const active = useActiveInquiry(view, { isEnded: (row) => ENDED.has(row.status) })
  const [rate, setRate] = useState(1)
  const [log, setLog] = useState("")
  const burst = useRef(0)

  // Arrivals at `rate` per second, a burst of forty on request, and the venue ending inquiries as they expire.
  useEffect(() => {
    const t = setInterval(() => {
      const now = Date.now()
      const n = burst.current > 0 ? Math.min(burst.current, 8) : Math.random() < rate / 4 ? 1 : 0
      burst.current = Math.max(0, burst.current - n)
      const upsert = Array.from({ length: n }, () => arrive(now))
      const patch = store
        .getIds()
        .map((id) => store.getRow(id)!)
        .filter((row) => row.expiresAt <= now && !ENDED.has(row.status))
        .map((row) => ({ id: row.id, fields: { status: "Expired" } as Partial<Row> }))
      const remove = store
        .getIds()
        .filter((id) => {
          const row = store.getRow(id)!
          return ENDED.has(row.status) && row.expiresAt < now - 15_000
        })
      if (upsert.length || patch.length || remove.length) store.applyDeltas({ upsert, patch, remove })
    }, 250)
    return () => clearInterval(t)
  }, [store, rate])

  const inquiry = active.row ? toInquiry(active.row) : null
  const actions: RfqAction[] = [
    {
      id: "quote",
      label: "Quote",
      primary: true,
      run: (draft: RfqQuoteDraft, q) => {
        store.applyDeltas({ patch: [{ id: q.id, fields: { status: "Quoted", quoted: { bid: draft.bid, ask: draft.ask } } }] })
        setLog(`quoted ${q.id} ${draft.bid === null ? "" : ust.price(draft.bid)}${draft.bid !== null && draft.ask !== null ? " / " : ""}${draft.ask === null ? "" : ust.price(draft.ask)}`)
        active.next()
      },
    },
    {
      id: "pass",
      label: "Pass",
      needsQuote: false,
      destructive: true,
      run: (_, q) => {
        store.applyDeltas({ patch: [{ id: q.id, fields: { status: "Passed" } }] })
        setLog(`passed ${q.id}`)
      },
    },
  ]

  return (
    <HotkeysProvider bindings={[]}>
      <main className="mx-auto flex h-screen max-w-6xl flex-col gap-3 p-6 font-(family-name:--tradecn-font-mono) text-xs">
        <h1 className="text-sm font-semibold">rfq-stack</h1>
        <p className="text-muted-foreground">
          Inquiries arrive; about nine in ten are answered by the pretend auto-quoter and hidden under the threshold when small. The stack is sorted by size then time left and holds still for a second after any key or click. The one in the ticket stays there until you act or the venue ends it; arrivals never move it, the focus, or the viewport. Enter or a
          double click puts a row in the ticket.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => (burst.current += 40)}>
            Burst of 40
          </Button>
          <Button size="sm" variant="outline" onClick={() => setRate((r) => (r >= 8 ? 1 : r * 2))}>
            Rate ×{rate}
          </Button>
          <span className="text-muted-foreground" data-rfq-log>
            {log || " "}
          </span>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-[1fr_26rem] gap-4">
          <RfqStack store={store} view={view} activeId={active.activeId} onActivate={active.setActive} threshold={threshold} onThresholdChange={setThreshold} price={(v) => ust.price(v)} />
          <div>{inquiry ? <RfqTicket key={inquiry.id} inquiry={inquiry} actions={actions} autoFocus /> : <p className="text-muted-foreground">No open inquiry.</p>}</div>
        </div>
      </main>
    </HotkeysProvider>
  )
}
