import { useState } from "react"
import { Ticket, describeDraft, type TicketInstrument } from "@/registry/tradecn/blocks/ticket/ticket"

const ZN: TicketInstrument = { symbol: "ZN", convention: { price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 }, quantityStep: 1 }

export default function TicketDemo() {
  const [submitted, setSubmitted] = useState("No draft submitted.")
  return (
    <div className="w-80 max-w-full space-y-2 text-xs lining-nums tabular-nums">
      <Ticket
        instrument={ZN}
        reference={{ bid: 99.484375, ask: 99.5 }}
        defaultDraft={{ quantity: 5, price: 99.5 }}
        actions={[{ id: "send", label: (draft) => draft.side === "buy" ? "Submit buy" : "Submit sell", run: (draft) => setSubmitted(describeDraft(draft, ZN)) }]}
        allowedActions={["send"]}
      />
      <p role="status" className="text-muted-foreground">{submitted}</p>
    </div>
  )
}
