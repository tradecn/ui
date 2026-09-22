import { useState } from "react"
import { RfqTicket, type RfqInquiry, type RfqQuoteDraft } from "@/components/rfq-ticket"
import { HotkeysProvider } from "@/hooks/use-hotkeys"

const NOW = Date.now()
const INQUIRY: RfqInquiry = {
  id: "Q-7",
  instrument: { symbol: "T10", description: "T 4 1/8 05/15/34", convention: { price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 } },
  side: "buy",
  quantity: 5_000_000,
  client: { name: "Client A", tier: "Tier 1" },
  tags: ["RFQ", "3 dealers"],
  receivedAt: NOW,
  expiresAt: NOW + 90_000,
  market: { label: "Composite", bid: 99.5, ask: 99.515625 },
  suggested: { ask: 99.546875 },
  status: "Open",
  allowedActions: ["quote", "pass"],
}

export function RfqTicketScene() {
  const [inquiry, setInquiry] = useState(INQUIRY)
  const [sent, setSent] = useState<RfqQuoteDraft[]>([])
  const [ack, setAck] = useState(0)
  return (
    <HotkeysProvider bindings={[]}>
      <div className="flex w-[26rem] flex-col gap-2" data-rfq-sent={JSON.stringify(sent)}>
        <RfqTicket
          inquiry={inquiry}
          limits={{ maxDistance: { ticks: 4, level: "confirm" } }}
          actions={[
            { id: "quote", label: "Quote", primary: true, run: (draft) => setSent((s) => [...s, draft]) },
            { id: "pass", label: "Pass", needsQuote: false, destructive: true, run: () => setInquiry((q) => ({ ...q, status: "Passed", allowedActions: [] })) },
          ]}
          acknowledged={ack || undefined}
        />
        <button type="button" onClick={() => { setAck((n) => n + 1); setInquiry((q) => ({ ...q, status: "Quoted", quoted: { ask: sent.at(-1)?.ask ?? null } })) }}>
          venue takes it
        </button>
        <button type="button" onClick={() => setInquiry((q) => ({ ...q, status: "Done away", allowedActions: [] }))}>
          venue ends it
        </button>
      </div>
    </HotkeysProvider>
  )
}
