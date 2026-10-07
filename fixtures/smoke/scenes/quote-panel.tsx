import { useMemo, useRef, useState } from "react"
import { QuotePanel, quotePanelColumns, type QuoteAction, type QuoteRow } from "@/components/quote-panel"
import { ContextMenuItem } from "@/components/ui/context-menu"
import type { EditChange } from "@/components/ui/data-grid"
import { PanelPopout } from "@/components/ui/panel"
import { usePopout } from "@/hooks/use-popout"
import type { InstrumentConvention } from "@/lib/format"
import type { Limits } from "@/lib/limits"
import { createRowStore } from "@/lib/row-store"

const T32: InstrumentConvention = { price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 }
const LIMITS: Limits = { maxDistance: { ticks: 4, level: "confirm" }, maxQuantity: { confirm: 50_000_000, block: 100_000_000 } }
const ALLOWED: Record<string, readonly string[]> = { Quoting: ["edit", "pause", "pull"], Paused: ["edit", "resume", "pull"], Pulled: ["resume"] }

// 2Y quoting 100-07 / 100-08+ around a 100-07+ / 100-08 market, 10Y paused with no levels up, 30Y pulled.
const ROWS: QuoteRow[] = [
  { id: "2Y", instrument: "2Y", status: "Quoting", marketBid: 100.234375, marketAsk: 100.25, bid: 100.21875, ask: 100.265625, skew: 0, width: 3, bidSize: 25_000_000, askSize: 25_000_000, allowedActions: ALLOWED.Quoting },
  { id: "10Y", instrument: "10Y", status: "Paused", marketBid: 99.5, marketAsk: 99.515625, bid: null, ask: null, skew: 0, width: 4, bidSize: 10_000_000, askSize: 10_000_000, allowedActions: ALLOWED.Paused },
  { id: "30Y", instrument: "30Y", status: "Pulled", marketBid: 98.671875, marketAsk: 98.6875, bid: null, ask: null, skew: -1, width: 8, bidSize: null, askSize: null, allowedActions: ALLOWED.Pulled },
]

function field(key: string, value: unknown): Partial<QuoteRow> {
  const n = typeof value === "number" ? value : null
  switch (key) {
    case "bid":
      return { bid: n }
    case "ask":
      return { ask: n }
    case "skew":
      return { skew: n }
    case "width":
      return { width: n }
    case "bidSize":
      return { bidSize: n }
    case "askSize":
      return { askSize: n }
    default:
      return {}
  }
}

export function QuotePanelScene() {
  const [store] = useState(() => {
    const s = createRowStore<QuoteRow>({ getRowId: (q) => q.id })
    s.applyDeltas({ upsert: ROWS })
    return s
  })
  const [log, setLog] = useState("")
  // The pretend server answers 100 ms after every command, by writing the row back or refusing.
  const [server] = useState(() => {
    const status = (id: string, next: string) => setTimeout(() => store.applyDeltas({ patch: [{ id, fields: { status: next, allowedActions: ALLOWED[next], ...(next === "Pulled" ? { bid: null, ask: null } : {}) } }] }), 100)
    return {
      edit(change: EditChange<QuoteRow>) {
        setLog(`edit ${change.rowId} ${change.key} ${String(change.value)}`)
        return new Promise<void>((resolve, reject) =>
          setTimeout(() => {
            if (change.key === "width" && typeof change.value === "number" && change.value > 8) return reject(new Error("Risk declined a width over 8"))
            store.applyDeltas({ patch: [{ id: change.rowId, fields: field(change.key, change.value) }] })
            resolve()
          }, 100),
        )
      },
      act(id: string, action: string) {
        setLog(`${action} ${id}`)
        status(id, action === "pause" ? "Paused" : action === "resume" ? "Quoting" : "Pulled")
      },
      pullAll(rows: QuoteRow[]) {
        setLog(`pull ${rows.map((r) => r.id).join(",")}`)
        for (const row of rows) status(row.id, "Pulled")
      },
    }
  })
  const [actions] = useState<QuoteAction[]>(() => [
    { id: "pause", label: "Pause", run: (row) => server.act(row.id, "pause") },
    { id: "resume", label: "Resume", run: (row) => server.act(row.id, "resume") },
    { id: "pull", label: "Pull", destructive: true, run: (row) => server.act(row.id, "pull") },
  ])
  return (
    <div className="flex flex-col gap-1">
      <div className="w-full max-w-[70rem]" style={{ height: 180 }}>
        <QuotePanel store={store} convention={T32} actions={actions} limits={LIMITS} onEdit={server.edit} onPullAll={server.pullAll} />
      </div>
      <output data-quote-log="">{log}</output>
      <PendingQuoteActions />
      <PoppedQuotePanel />
    </div>
  )
}

// A panel mounted by a press inside its window, after the popout has moved there, so every node it makes
// belongs to the popup's realm rather than being made in the opener and adopted.
function PoppedQuotePanel() {
  const [store] = useState(() => {
    const store = createRowStore<QuoteRow>({ getRowId: row => row.id })
    store.applyDeltas({ upsert: ROWS })
    return store
  })
  const [edits, setEdits] = useState(0)
  const [shown, setShown] = useState(false)
  const popout = usePopout({ title: "Popped quotes", width: 960, height: 360 })
  return <div data-popped-quotes="" data-edits={edits}>
    <button type="button" onClick={() => popout.open()}>pop out quotes</button>
    <PanelPopout popout={popout}>
      {popout.isOpen && !shown && <button type="button" onClick={() => setShown(true)}>show quotes</button>}
      {popout.isOpen && shown && <div style={{ height: 240 }}>
        <QuotePanel store={store} convention={T32} limits={LIMITS} label="Popped quotes" onEdit={() => setEdits(count => count + 1)} onPullAll={() => new Promise<void>(() => {})} />
      </div>}
    </PanelPopout>
  </div>
}

function PendingQuoteActions() {
  const [store] = useState(() => {
    const store = createRowStore<QuoteRow>({ getRowId: row => row.id })
    store.applyDeltas({ upsert: ROWS.slice(0, 2) })
    return store
  })
  const finish = useRef<(() => void) | null>(null)
  const [selection, setSelection] = useState<ReadonlySet<string>>(new Set(["10Y"]))
  const [requests, setRequests] = useState(0)
  const [activations, setActivations] = useState(0)
  const [actions] = useState<QuoteAction[]>(() => [
    { id: "pause", label: "Pause", run: () => {
      setRequests(count => count + 1)
      return new Promise<void>(resolve => { finish.current = resolve })
    } },
    { id: "pull", label: "Pull", run: () => { setRequests(count => count + 1) } },
  ])
  const columns = useMemo(() => quotePanelColumns({ convention: T32, actions }).filter(column => column.key === "instrument" || column.key === "actions"), [actions])
  return <div data-pending-quote-actions data-selection={[...selection].join(",")} data-requests={requests} data-activations={activations}>
    <div className="h-36 max-w-lg"><QuotePanel store={store} convention={T32} actions={actions} columns={columns} label="Pending actions" onEdit={() => {}} selectionMode="multi" selection={selection} onSelectionChange={setSelection} onRowActivate={() => setActivations(count => count + 1)} renderContextMenu={(_rows, ids) => <ContextMenuItem>Pending quote action: {ids.join(",")}</ContextMenuItem>} /></div>
    <button type="button" onClick={() => { finish.current?.(); finish.current = null }}>Finish pending quote action</button>
  </div>
}
