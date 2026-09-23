import { useRef, useState } from "react"
import { RfqTicket, type RfqAction, type RfqInquiry, type RfqQuoteDraft } from "@/registry/tradecn/blocks/rfq-ticket/rfq-ticket"

function fresh(id: string): RfqInquiry {
  const now = Date.now()
  return {
    id,
    instrument: { symbol: "T10", description: "10Y Treasury", convention: { price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 } },
    client: { name: "ALPHA" },
    side: "buy",
    quantity: 5_000_000,
    receivedAt: now,
    expiresAt: now + 30_000,
    market: { bid: 99.5, ask: 99.515625 },
    status: "Open",
    allowedActions: ["quote", "quote-auto", "pass"],
  }
}

export default function RfqTicketServerDemo() {
  const [inquiry, setInquiry] = useState(() => fresh("Q-1"))
  const [pending, setPending] = useState<RfqQuoteDraft | null>(null)
  const [acknowledged, setAcknowledged] = useState(0)
  const nextId = useRef(2)
  const send = (draft: RfqQuoteDraft) => {
    setPending(draft)
    setInquiry((current) => ({ ...current, status: "Sending", allowedActions: ["pass"], message: "Waiting for the venue." }))
  }
  const acknowledge = () => {
    if (!pending || pending.inquiryId !== inquiry.id) return
    setInquiry((current) => ({ ...current, status: "Quoted", quoted: { bid: pending.bid, ask: pending.ask }, allowedActions: ["quote", "pass"], message: "Quote acknowledged by the venue." }))
    setAcknowledged((value) => value + 1)
    setPending(null)
  }
  const finish = (status: string, message: string) => {
    setPending(null)
    setInquiry((current) => ({ ...current, status, message, allowedActions: [] }))
  }
  const actions: RfqAction[] = [
    { id: "quote", label: "Quote", run: send, primary: true },
    // A fixed server price stands in for an auto-quoter; it does not read the fields.
    { id: "quote-auto", label: "Quote auto", needsQuote: false, run: (_, inquiry) => send({ inquiryId: inquiry.id, bid: null, ask: 99.53125, quantity: inquiry.quantity }) },
    { id: "pass", label: "Pass", needsQuote: false, destructive: true, run: () => finish("Passed", "Inquiry passed.") },
  ]
  const next = () => {
    setPending(null)
    setAcknowledged(0)
    setInquiry(fresh(`Q-${nextId.current++}`))
  }
  return (
    <>
      <div data-demo-controls className="flex flex-wrap gap-2 text-xs">
        <button type="button" className="rounded border px-2 py-1 disabled:opacity-50" disabled={!pending} onClick={acknowledge}>Acknowledge quote</button>
        <button type="button" className="rounded border px-2 py-1 disabled:opacity-50" disabled={inquiry.status !== "Quoted"} onClick={() => finish("Done away", "Cover 99-16+")}>Report done away</button>
        <button type="button" className="rounded border px-2 py-1 disabled:opacity-50" disabled={!inquiry.allowedActions?.length} onClick={() => finish("Expired", "The venue ended this inquiry.")}>Expire inquiry</button>
        <button type="button" className="rounded border px-2 py-1" onClick={next}>Next inquiry</button>
      </div>
      <div className="w-[26rem] max-w-full space-y-2 text-xs lining-nums tabular-nums">
        <RfqTicket key={inquiry.id} inquiry={inquiry} actions={actions} acknowledged={acknowledged} />
        <p role="status" className="text-muted-foreground">Inquiry {inquiry.id}: {inquiry.status}. Acknowledgements: {acknowledged}.</p>
      </div>
    </>
  )
}
