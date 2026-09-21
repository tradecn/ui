import { useState } from "react"
import { Ticket, type TicketDraft, type TicketInstrument } from "@/components/ticket"
import { HotkeysProvider } from "@/hooks/use-hotkeys"

const ZN: TicketInstrument = { symbol: "ZN", convention: { price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 } }

export function TicketScene() {
  const [open, setOpen] = useState(true)
  const [sent, setSent] = useState<TicketDraft[]>([])
  const [ack, setAck] = useState(0)
  return (
    <HotkeysProvider bindings={[]}>
      <div className="flex w-80 flex-col gap-2" data-ticket-sent={JSON.stringify(sent)} data-ticket-acks={ack}>
        <button type="button" onClick={() => setOpen((o) => !o)}>
          {open ? "close market" : "open market"}
        </button>
        <Ticket
          instrument={ZN}
          reference={{ bid: 99.5, ask: 99.515625, last: 99.5 }}
          actions={[{ id: "send", label: "Send", primary: true, run: (draft) => setSent((s) => [...s, draft]) }]}
          allowedActions={open ? ["send"] : []}
          status={ack ? "Acknowledged" : sent.length ? "Sent" : undefined}
          acknowledged={ack || undefined}
        />
        <button type="button" onClick={() => setAck((n) => n + 1)}>
          acknowledge
        </button>
      </div>
    </HotkeysProvider>
  )
}
