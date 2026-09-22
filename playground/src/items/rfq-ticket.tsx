import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { RfqTicket, describeQuote, type RfqAction, type RfqInquiry, type RfqQuoteDraft } from "@/registry/tradecn/blocks/rfq-ticket/rfq-ticket"
import { HotkeysProvider } from "@/registry/tradecn/hooks/use-hotkeys"
import type { InstrumentConvention } from "@/registry/tradecn/lib/format"

const T32: InstrumentConvention = { price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 }
const BILL: InstrumentConvention = { price: { kind: "decimal", decimals: 3 }, tick: 0.0005, quoteBasis: "discount" }

function fresh(id: string, over: Partial<RfqInquiry> = {}): RfqInquiry {
  const now = Date.now()
  return {
    id,
    instrument: { symbol: "T10", description: "T 4 1/8 05/15/34", convention: T32 },
    side: "buy",
    quantity: 5_000_000,
    client: { name: "Client A", tier: "Tier 1", trader: "J. Doe", salesperson: "K. Roe" },
    tags: ["RFQ", "3 dealers"],
    settlement: "T+1",
    receivedAt: now,
    expiresAt: now + 45_000,
    context: [
      { label: "Book", value: "GOVT-NY" },
      { label: "Position", value: "−12mm", tone: "down" },
      { label: "DV01", value: "$4.2K" },
    ],
    market: { label: "Composite", bid: 99.5, ask: 99.515625 },
    suggested: { ask: 99.53125 },
    status: "Open",
    allowedActions: ["quote", "quote-auto", "stop-auto", "pass"],
    ...over,
  }
}

// Stands in for the venue and the server: they decide the status, the message, and what may be done next. The ticket decides none of it.
function useFakeVenue(start: RfqInquiry) {
  const [inquiry, setInquiry] = useState(start)
  const [quoteId, setQuoteId] = useState<string | undefined>()
  const count = useRef(0)
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
      later(() => setInquiry((q) => ({ ...q, status: Math.random() < 0.5 ? "Done" : "Done away", message: Math.random() < 0.5 ? "Cover 99-16+" : undefined, allowedActions: [] })), 6000)
    }, 700)
  }
  const auto = () => quote({ inquiryId: inquiry.id, bid: null, ask: inquiry.suggested?.ask ?? null })
  const stopAuto = () => setInquiry((q) => ({ ...q, suggested: undefined, message: "Auto quoting stopped", allowedActions: ["quote", "pass"] }))
  const pass = () => setInquiry((q) => ({ ...q, status: "Passed", allowedActions: [] }))
  const reset = (over: Partial<RfqInquiry> = {}) => {
    setQuoteId(undefined)
    setInquiry(fresh(`Q-${String(++count.current).padStart(3, "0")}`, over))
  }
  return { inquiry, quoteId, quote, auto, stopAuto, pass, reset }
}

export function RfqTicketScene() {
  const venue = useFakeVenue(fresh("Q-001"))
  const [draft, setDraft] = useState<RfqQuoteDraft | null>(null)
  const actions: RfqAction[] = [
    { id: "quote", label: "Quote", run: venue.quote, primary: true },
    { id: "quote-auto", label: "Quote auto", needsQuote: false, run: venue.auto },
    { id: "stop-auto", label: "Stop auto", needsQuote: false, run: venue.stopAuto },
    { id: "pass", label: "Pass", needsQuote: false, destructive: true, run: venue.pass },
  ]
  return (
    <HotkeysProvider bindings={[]}>
      <main className="mx-auto max-w-3xl space-y-4 p-6 font-(family-name:--tradecn-font-mono) text-xs">
        <h1 className="text-sm font-semibold">rfq-ticket</h1>
        <p className="text-muted-foreground">
          A client asks for a price. Type an offer in 32nds or take the auto level, <kbd>⌘↩</kbd> sends, <kbd>⌘↑</kbd> and <kbd>⌘↓</kbd> step, <kbd>⌘⇧A</kbd> takes the suggested level. The pretend venue answers after 700 ms with a ring and a status word, then a few seconds later says how it ended. Nothing here decides a status: the ticket prints
          what the venue said and offers only what the server allows.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => venue.reset()}>
            New inquiry: a buyer
          </Button>
          <Button size="sm" variant="outline" onClick={() => venue.reset({ side: "sell", suggested: { bid: 99.484375 } })}>
            A seller
          </Button>
          <Button size="sm" variant="outline" onClick={() => venue.reset({ side: "two-way", suggested: { bid: 99.484375, ask: 99.53125 } })}>
            A market
          </Button>
          <Button size="sm" variant="outline" onClick={() => venue.reset({ instrument: { symbol: "B3M", description: "B 12/24/26", convention: BILL }, quantity: 50_000_000, market: { label: "Composite", bid: 4.255, ask: 4.25 }, suggested: { ask: 4.252 }, tags: ["RFQ", "5 dealers"] })}>
            A bill, on discount
          </Button>
        </div>
        <div className="w-[26rem]">
          <RfqTicket key={venue.inquiry.id} inquiry={venue.inquiry} actions={actions} acknowledged={venue.quoteId} onDraftChange={setDraft} autoFocus />
        </div>
        <p className="text-muted-foreground" data-rfq-draft>
          {draft ? describeQuote(draft, venue.inquiry) : " "}
        </p>
      </main>
    </HotkeysProvider>
  )
}
