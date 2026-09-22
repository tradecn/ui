import { useRef, useState } from "react"
import { Ticket, describeDraft, type TicketDraft, type TicketInstrument } from "@/registry/tradecn/blocks/ticket/ticket"
import { HotkeysProvider } from "@/registry/tradecn/hooks/use-hotkeys"

const ZN: TicketInstrument = { symbol: "ZN", convention: { price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 }, quantityStep: 1 }

interface Server {
  status?: string
  message?: string
  orderId?: string
  allowedActions: string[]
}

// Stands in for the server: it decides the status, the reason, and what the ticket may do next. The ticket decides none of it.
function useFakeServer() {
  const [state, setState] = useState<Server>({ allowedActions: ["send"] })
  const count = useRef(0)
  const send = (draft: TicketDraft) => {
    const id = `ORD-${String(++count.current).padStart(4, "0")}`
    setState({ status: "Sent", allowedActions: [] })
    setTimeout(() => {
      const rejected = draft.price !== null && Math.abs(draft.price - 99.5) > 0.5
      setState(rejected ? { status: "Rejected", message: "Price outside the band", allowedActions: ["send"] } : { status: "Acknowledged", message: `${id} working`, orderId: id, allowedActions: ["send", "cancel"] })
    }, 700)
  }
  const cancel = () => {
    setState((s) => ({ ...s, status: "Cancel sent", allowedActions: [] }))
    setTimeout(() => setState((s) => ({ ...s, status: "Cancelled", message: undefined, allowedActions: ["send"] })), 500)
  }
  return { state, send, cancel }
}

export default function TicketDemo() {
  const server = useFakeServer()
  const [draft, setDraft] = useState<TicketDraft | null>(null)
  return (
    <HotkeysProvider bindings={[]}>
      <div className="flex flex-wrap gap-4 font-(family-name:--tradecn-font-mono) text-xs">
        <div className="flex w-80 flex-col gap-2">
          <Ticket
            instrument={ZN}
            reference={{ bid: 99.484375, ask: 99.5, last: 99.5 }}
            quickSizes={[1, 5, 10, 25]}
            accounts={[
              { id: "A-1", label: "A-1" },
              { id: "A-2", label: "A-2" },
            ]}
            actions={[
              { id: "send", label: (d) => (d.side === "buy" ? "Buy" : "Sell"), run: server.send, primary: true },
              { id: "cancel", label: "Cancel", run: server.cancel, destructive: true },
            ]}
            allowedActions={server.state.allowedActions}
            status={server.state.status}
            message={server.state.message}
            acknowledged={server.state.orderId}
            onDraftChange={setDraft}
          />
          <p className="text-muted-foreground">{draft ? describeDraft(draft, ZN) : " "}</p>
        </div>
        <p className="max-w-64 text-muted-foreground">
          Type a price the way ZN quotes it: <code>99-16+</code>. The arrows and the buttons step by the tick, Shift for ten. Click a bid, ask, or last to take it. <kbd>⌘↩</kbd> sends from any field, <kbd>⌘⇧X</kbd> flips the side. The pretend server acknowledges after 700 ms with a ring, or rejects a price far from the market and says why.
        </p>
      </div>
    </HotkeysProvider>
  )
}
