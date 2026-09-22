import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Ticket, describeDraft, type TicketDraft, type TicketInstrument } from "@/registry/tradecn/blocks/ticket/ticket"
import { HotkeysProvider } from "@/registry/tradecn/hooks/use-hotkeys"

const ZN: TicketInstrument = { symbol: "ZN", convention: { price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 }, quantityStep: 1 }
const ES: TicketInstrument = { symbol: "ES", convention: { price: { kind: "decimal", decimals: 2 }, tick: 0.25 }, quantityStep: 1 }

interface Server {
  status?: string
  message?: string
  orderId?: string
  allowedActions: string[]
}

// Stands in for the server: it decides the status, the reason, and what the ticket may do next. The ticket decides none of it.
function useFakeServer(open: boolean) {
  const [state, setState] = useState<Server>({ allowedActions: ["send"] })
  const count = useRef(0)
  const send = (draft: TicketDraft, instrument: TicketInstrument) => {
    const id = `ORD-${String(++count.current).padStart(4, "0")}`
    setState({ status: "Sent", allowedActions: [] })
    setTimeout(() => {
      const rejected = draft.price !== null && Math.abs(draft.price - (instrument === ZN ? 99.5 : 5012)) > (instrument === ZN ? 0.5 : 20)
      setState(rejected ? { status: "Rejected", message: "Price outside the band", allowedActions: ["send"] } : { status: "Acknowledged", message: `${id} working`, orderId: id, allowedActions: ["send", "cancel"] })
    }, 700)
  }
  const cancel = () => {
    setState((s) => ({ ...s, status: "Cancel sent", allowedActions: [] }))
    setTimeout(() => setState((s) => ({ ...s, status: "Cancelled", message: undefined, allowedActions: ["send"] })), 500)
  }
  return { state: open ? state : { ...state, allowedActions: [] }, send, cancel }
}

function Desk({ instrument, reference, open }: { instrument: TicketInstrument; reference: { bid: number; ask: number; last: number }; open: boolean }) {
  const server = useFakeServer(open)
  const [draft, setDraft] = useState<TicketDraft | null>(null)
  return (
    <div className="flex w-80 flex-col gap-2">
      <Ticket
        instrument={instrument}
        reference={reference}
        quickSizes={[1, 5, 10, 25, 50]}
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
      <p className="text-muted-foreground">{draft ? describeDraft(draft, instrument) : " "}</p>
    </div>
  )
}

export function TicketScene() {
  const [open, setOpen] = useState(true)
  return (
    <HotkeysProvider bindings={[]}>
      <main className="mx-auto max-w-3xl space-y-4 p-6 font-(family-name:--tradecn-font-mono) text-xs">
        <h1 className="text-sm font-semibold">ticket</h1>
        <p className="text-muted-foreground">
          Type a price the way the instrument quotes it: <code>99-16+</code> for ZN, <code>5012.25</code> for ES. The arrows and the buttons step by the tick, Shift for ten. Click a bid, ask, or last to take it. <kbd>⌘↩</kbd> sends from any field, <kbd>⌘⇧X</kbd> flips the side, <kbd>⌘↑</kbd> and <kbd>⌘↓</kbd> step the
          price. The pretend server acknowledges after 700 ms with a ring, or rejects a price far from the market and says why. Nothing here decides a status: it prints what the server said.
        </p>
        <Button size="sm" variant="outline" onClick={() => setOpen((o) => !o)}>
          {open ? "close the market" : "open the market"}
        </Button>
        <div className="flex flex-wrap gap-4">
          <Desk instrument={ZN} reference={{ bid: 99.484375, ask: 99.5, last: 99.5 }} open={open} />
          <Desk instrument={ES} reference={{ bid: 5012, ask: 5012.25, last: 5012.25 }} open={open} />
        </div>
      </main>
    </HotkeysProvider>
  )
}
