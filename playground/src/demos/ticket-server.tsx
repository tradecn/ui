import { useState } from "react"
import { Ticket, describeDraft, type TicketDraft, type TicketInstrument } from "@/registry/tradecn/blocks/ticket/ticket"

const ZN: TicketInstrument = { symbol: "ZN", convention: { price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 }, quantityStep: 1 }

const ready = { status: "Ready", message: "", allowedActions: ["send"] }

export default function TicketServerDemo() {
  const [server, setServer] = useState(ready)
  const [pending, setPending] = useState<TicketDraft | null>(null)
  const [acknowledged, setAcknowledged] = useState(0)
  const reply = (status: string, message: string, allowedActions: string[]) => {
    setServer({ status, message, allowedActions })
    setPending(null)
  }
  const send = (draft: TicketDraft) => {
    setPending(draft)
    setServer({ status: "Sending", message: "Waiting for the order reply.", allowedActions: [] })
  }
  const acknowledge = () => {
    if (!pending) return
    const id = acknowledged + 1
    setAcknowledged(id)
    reply("Acknowledged", `ORD-${id}: ${describeDraft(pending, ZN)}`, ["cancel"])
  }
  return (
    <>
      <div data-demo-controls className="flex flex-wrap gap-2 text-xs">
        <button type="button" className="rounded border px-2 py-1 disabled:opacity-50" disabled={!pending} onClick={acknowledge}>Acknowledge order</button>
        <button type="button" className="rounded border px-2 py-1 disabled:opacity-50" disabled={!pending} onClick={() => reply("Rejected", "Sample venue rejected this draft.", ["send"])}>Reject order</button>
        <button type="button" className="rounded border px-2 py-1 disabled:opacity-50" disabled={server.status !== "Cancel sent"} onClick={() => reply("Cancelled", "Cancellation confirmed.", ["send"])}>Acknowledge cancellation</button>
        <button type="button" className="rounded border px-2 py-1" onClick={() => reply(ready.status, ready.message, ready.allowedActions)}>Reset server</button>
      </div>
      <div className="w-80 max-w-full text-xs lining-nums tabular-nums">
        <Ticket
          instrument={ZN}
          defaultDraft={{ quantity: 5, price: 99.5 }}
          actions={[
            { id: "send", label: "Send order", run: send },
            { id: "cancel", label: "Cancel order", checked: false, destructive: true, run: () => reply("Cancel sent", "Waiting for the cancellation reply.", []) },
          ]}
          allowedActions={server.allowedActions}
          status={server.status}
          message={server.message}
          acknowledged={acknowledged}
        />
        <p role="status" className="sr-only">{server.message}</p>
      </div>
    </>
  )
}
