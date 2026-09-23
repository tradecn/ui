import { useState } from "react"
import { useActiveInquiry } from "@/registry/tradecn/hooks/use-active-inquiry"
import { createInstrumentFormatter } from "@/registry/tradecn/lib/format"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import { RfqStack, bySize, rfqStackColumns, useRfqStackView, type RfqStackRow } from "@/registry/tradecn/ui/rfq-stack"

const note = createInstrumentFormatter({ price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 })
const columns = rfqStackColumns({ price: (value) => note.price(value) }).filter((column) => ["client", "size", "bid", "ask", "status", "timeLeft"].includes(column.key))
const steps = ["Receive larger inquiry", "Receive venue expiry", "Remove ended inquiry"]

function inquiries(now: number): RfqStackRow[] {
  return [
    { id: "Q-1", receivedAt: now, expiresAt: now + 15_000, client: "ALPHA", instrument: "10Y Treasury", side: "buy", quantity: 10_000_000, bid: 99.5, ask: 99.53125, status: "Open" },
    { id: "Q-2", receivedAt: now, expiresAt: now + 15_000, client: "BETA", instrument: "10Y Treasury", side: "sell", quantity: 5_000_000, bid: 99.5, ask: 99.53125, status: "Open" },
  ]
}

export default function RfqStackUpdatesDemo() {
  const [store] = useState(() => {
    const store = createRowStore<RfqStackRow>({ getRowId: (row) => row.id, lane: "ordered" })
    store.applyDeltas({ upsert: inquiries(Date.now()) })
    return store
  })
  const [step, setStep] = useState(0)
  const view = useRfqStackView(store, { comparator: bySize })
  const active = useActiveInquiry(view, { isEnded: (row) => row.status === "Expired" })
  const receive = () => {
    if (step === 0) {
      const now = Date.now()
      store.applyDeltas({
        upsert: [{ id: "Q-3", receivedAt: now, expiresAt: now + 15_000, client: "GAMMA", instrument: "10Y Treasury", side: "buy", quantity: 20_000_000, bid: 99.5, ask: 99.53125, status: "Open" }],
        patch: [{ id: "Q-1", fields: { bid: 99.515625, ask: 99.546875 } }],
      })
    } else if (step === 1) {
      store.applyDeltas({ patch: [{ id: "Q-1", fields: { status: "Expired" } }] })
    } else if (step === 2) {
      store.applyDeltas({ remove: ["Q-1"] })
    }
    setStep((value) => value + 1)
  }
  const restart = () => {
    store.applyDeltas({ remove: ["Q-3"], upsert: inquiries(Date.now()) })
    active.setActive("Q-1")
    setStep(0)
  }
  return (
    <>
      <div data-demo-controls className="flex flex-wrap items-center gap-3 text-xs lining-nums tabular-nums">
        <button type="button" className="rounded border px-2 py-1 disabled:opacity-50" onClick={receive} disabled={step === steps.length}>{steps[step] ?? "All updates received"}</button>
        <button type="button" className="rounded border px-2 py-1" onClick={restart}>Restart feed example</button>
      </div>
      <div className="w-fit max-w-full space-y-2 text-xs lining-nums tabular-nums">
        <div className="h-40">
          <RfqStack store={store} view={view} columns={columns} activeId={active.activeId} onActivate={active.setActive} label="Updating inquiries" />
        </div>
        <p className="text-muted-foreground">Active inquiry: {active.activeId ?? "None"}. Updates received: {step}/{steps.length}.</p>
      </div>
    </>
  )
}
