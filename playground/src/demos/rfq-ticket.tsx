import { useState } from "react"
import { RfqTicket, describeQuote, type RfqAction, type RfqInquiry } from "@/registry/tradecn/blocks/rfq-ticket/rfq-ticket"

export default function RfqTicketDemo() {
  const [inquiry] = useState<RfqInquiry>(() => {
    const now = Date.now()
    return {
      id: "Q-1",
      instrument: { symbol: "T10", description: "10Y Treasury", convention: { price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 } },
      client: { name: "ALPHA" },
      side: "buy",
      quantity: 5_000_000,
      receivedAt: now,
      expiresAt: now + 60_000,
      market: { bid: 99.5, ask: 99.515625 },
      status: "Open",
      allowedActions: ["quote"],
    }
  })
  const [request, setRequest] = useState("None")
  const actions: RfqAction[] = [
    { id: "quote", label: "Quote", run: (draft, inquiry) => setRequest(describeQuote(draft, inquiry)) },
  ]
  return (
    <div className="w-[26rem] max-w-full space-y-2 text-xs lining-nums tabular-nums">
      <RfqTicket key={inquiry.id} inquiry={inquiry} actions={actions} />
      <p role="status" className="text-muted-foreground">Last request: {request}</p>
    </div>
  )
}
