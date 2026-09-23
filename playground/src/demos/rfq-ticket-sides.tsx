import { useState } from "react"
import { RfqTicket, describeQuote, type RfqAction, type RfqInquiry } from "@/registry/tradecn/blocks/rfq-ticket/rfq-ticket"

function inquiryFor(side: RfqInquiry["side"]): RfqInquiry {
  const now = Date.now()
  return {
    id: `Q-${side}`,
    instrument: { symbol: "T10", description: "10Y Treasury", convention: { price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 } },
    client: { name: "ALPHA" },
    side,
    quantity: 5_000_000,
    receivedAt: now,
    expiresAt: now + 60_000,
    market: { bid: 99.5, ask: 99.515625 },
    status: "Open",
    allowedActions: ["quote"],
  }
}

export default function RfqTicketSidesDemo() {
  const [inquiry, setInquiry] = useState(() => inquiryFor("buy"))
  const [request, setRequest] = useState("None")
  const actions: RfqAction[] = [
    { id: "quote", label: "Quote", run: (draft, inquiry) => setRequest(describeQuote(draft, inquiry)) },
  ]
  return (
    <>
      <div data-demo-controls className="text-xs">
        <label className="flex items-center gap-2">
          Client side
          <select className="rounded border bg-background px-2 py-1" value={inquiry.side} onChange={(event) => {
            setInquiry(inquiryFor(event.target.value as RfqInquiry["side"]))
            setRequest("None")
          }}>
            <option value="buy">Buyer</option>
            <option value="sell">Seller</option>
            <option value="two-way">Two-way</option>
          </select>
        </label>
      </div>
      <div className="w-[26rem] max-w-full space-y-2 text-xs lining-nums tabular-nums">
        <RfqTicket key={inquiry.id} inquiry={inquiry} actions={actions} />
        <p role="status" className="text-muted-foreground">Last request: {request}</p>
      </div>
    </>
  )
}
