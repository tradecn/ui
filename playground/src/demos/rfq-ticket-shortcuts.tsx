import { useState } from "react"
import { RfqTicket, describeQuote, type RfqAction, type RfqInquiry } from "@/registry/tradecn/blocks/rfq-ticket/rfq-ticket"
import { HotkeysProvider } from "@/registry/tradecn/hooks/use-hotkeys"

export default function RfqTicketShortcutsDemo() {
  const [inquiry] = useState<RfqInquiry>(() => {
    const now = Date.now()
    return {
      id: "Q-keys",
      instrument: { symbol: "T10", description: "10Y Treasury", convention: { price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 } },
      client: { name: "ALPHA", tier: "Tier 1", trader: "J. Doe" },
      tags: ["RFQ", "3 dealers"],
      settlement: "T+1",
      context: [{ label: "Position", value: "−12mm", tone: "down" }, { label: "DV01", value: "$4.2K" }],
      side: "two-way",
      quantity: 5_000_000,
      receivedAt: now,
      expiresAt: now + 60_000,
      market: { label: "Composite", bid: 99.5, ask: 99.515625 },
      suggested: { bid: 99.484375, ask: 99.53125 },
      status: "Open",
      allowedActions: ["quote"],
    }
  })
  const [request, setRequest] = useState("None")
  const actions: RfqAction[] = [
    { id: "quote", label: "Quote", run: (draft, inquiry) => setRequest(describeQuote(draft, inquiry)) },
  ]
  return (
    <HotkeysProvider bindings={[]}>
      <div className="w-[26rem] max-w-full space-y-2 text-xs lining-nums tabular-nums">
        <RfqTicket key={inquiry.id} inquiry={inquiry} actions={actions} quickSizes={[1_000_000, 2_000_000, 10_000_000]} />
        <p role="status" className="text-muted-foreground">Last request: {request}</p>
      </div>
    </HotkeysProvider>
  )
}
