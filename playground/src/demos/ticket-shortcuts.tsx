import { useState } from "react"
import { Ticket, describeDraft, type TicketDraft, type TicketInstrument } from "@/registry/tradecn/blocks/ticket/ticket"
import { HotkeysProvider } from "@/registry/tradecn/hooks/use-hotkeys"

const ZN: TicketInstrument = { symbol: "ZN", convention: { price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 }, quantityStep: 1 }

const initial: TicketDraft = { side: "buy", quantity: 5, price: 99.5, type: "limit", tif: "day", account: "A-1" }

export default function TicketShortcutsDemo() {
  const [draft, setDraft] = useState(initial)
  const [submitted, setSubmitted] = useState("No draft submitted.")
  return (
    <HotkeysProvider bindings={[]}>
      <div className="w-80 max-w-full space-y-2 text-xs lining-nums tabular-nums">
        <Ticket
          instrument={ZN}
          reference={{ last: 99.5 }}
          defaultDraft={initial}
          quickSizes={[1, 5, 10]}
          accounts={[{ id: "A-1", label: "A-1" }, { id: "A-2", label: "A-2" }]}
          onDraftChange={setDraft}
          actions={[{ id: "send", label: "Submit draft", run: (value) => setSubmitted(`${describeDraft(value, ZN)} · ${value.account}`) }]}
          allowedActions={["send"]}
        />
        <p className="text-muted-foreground">Draft: {describeDraft(draft, ZN)} · {draft.account}</p>
        <p role="status" className="text-muted-foreground">{submitted}</p>
      </div>
    </HotkeysProvider>
  )
}
