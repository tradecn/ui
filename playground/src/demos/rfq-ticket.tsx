import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { RfqTicket, type RfqAction, type RfqInquiry, type RfqQuoteDraft } from "@/registry/tradecn/blocks/rfq-ticket/rfq-ticket"
import { HotkeysProvider } from "@/registry/tradecn/hooks/use-hotkeys"
import type { InstrumentConvention } from "@/registry/tradecn/lib/format"

const T32: InstrumentConvention = { price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 }

function fresh(id: string, side: RfqInquiry["side"]): RfqInquiry {
  const now = Date.now()
  return {
    id,
    instrument: { symbol: "T10", description: "T 4 1/8 05/15/34", convention: T32 },
    side,
    quantity: 5_000_000,
    client: { name: "Client A", tier: "Tier 1", trader: "J. Doe" },
    tags: ["RFQ", "3 dealers"],
    settlement: "T+1",
    receivedAt: now,
    expiresAt: now + 45_000,
    context: [
      { label: "Position", value: "−12mm", tone: "down" },
      { label: "DV01", value: "$4.2K" },
    ],
    market: { label: "Composite", bid: 99.5, ask: 99.515625 },
    suggested: side === "sell" ? { bid: 99.484375 } : side === "buy" ? { ask: 99.53125 } : { bid: 99.484375, ask: 99.53125 },
    status: "Open",
    allowedActions: ["quote", "quote-auto", "pass"],
  }
}

// Stands in for the venue and the server: they decide the status and what may be done next. The ticket decides none of it.
export default function RfqTicketDemo() {
  const [inquiry, setInquiry] = useState(() => fresh("Q-001", "buy"))
  const [quoteId, setQuoteId] = useState<string | undefined>()
  const count = useRef(1)
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (pending.current) clearTimeout(pending.current)
  }, [])
  const later = (fn: () => void, ms: number) => {
    if (pending.current) clearTimeout(pending.current)
    pending.current = setTimeout(fn, ms)
  }
  const quote = (draft: RfqQuoteDraft) => {
    setInquiry((q) => ({ ...q, status: "Sending", allowedActions: [] }))
    later(() => {
      const id = `QT-${String(++count.current).padStart(3, "0")}`
      setQuoteId(id)
      setInquiry((q) => ({ ...q, status: "Quoted", quoted: { bid: draft.bid, ask: draft.ask }, message: `${id} live with the venue`, allowedActions: ["quote", "pass"] }))
      later(() => setInquiry((q) => ({ ...q, status: "Done away", message: "Cover 99-16+", allowedActions: [] })), 6000)
    }, 700)
  }
  const actions: RfqAction[] = [
    { id: "quote", label: "Quote", run: quote, primary: true },
    { id: "quote-auto", label: "Quote auto", needsQuote: false, run: (_, q) => quote({ inquiryId: q.id, bid: q.suggested?.bid ?? null, ask: q.suggested?.ask ?? null }) },
    { id: "pass", label: "Pass", needsQuote: false, destructive: true, run: () => setInquiry((q) => ({ ...q, status: "Passed", allowedActions: [] })) },
  ]
  const next = (side: RfqInquiry["side"]) => {
    setQuoteId(undefined)
    setInquiry(fresh(`Q-${String(++count.current).padStart(3, "0")}`, side))
  }
  return (
    <HotkeysProvider bindings={[]}>
      <div className="space-y-3 font-(family-name:--tradecn-font-mono) text-xs">
        <div className="w-[26rem] max-w-full">
          <RfqTicket key={inquiry.id} inquiry={inquiry} actions={actions} acknowledged={quoteId} quickSizes={[1_000_000, 2_000_000, 10_000_000]} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => next("buy")}>
            Next: a buyer
          </Button>
          <Button size="sm" variant="outline" onClick={() => next("sell")}>
            A seller
          </Button>
          <Button size="sm" variant="outline" onClick={() => next("two-way")}>
            A market
          </Button>
        </div>
        <p className="text-muted-foreground">Type an offer in 32nds or take the auto level; ⌘↩ sends. The pretend venue says Quoted after 700 ms and, a few seconds on, how it ended. The ticket prints the words and offers only what the server allows.</p>
      </div>
    </HotkeysProvider>
  )
}
