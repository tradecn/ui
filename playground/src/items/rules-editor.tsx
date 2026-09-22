import { useEffect, useMemo, useState } from "react"
import { createInstrumentFormatter, formatNotional } from "@/registry/tradecn/lib/format"
import type { GridRules } from "@/registry/tradecn/lib/grid-rules"
import { createFrameBatcher, createRowStore } from "@/registry/tradecn/lib/row-store"
import { DataGrid, type ColumnDef, type ColumnState } from "@/registry/tradecn/ui/data-grid"
import { RulesEditor } from "@/registry/tradecn/ui/rules-editor"

// The editor over a live grid: prices move, so the counts beside the rules move with them on their
// throttled beat, and a rule typed here colors, hides, or orders rows the moment it reads.

interface Rfq {
  id: string
  client: string
  instrument: string
  size: number
  px: number | null
  status: string
}

const ust = createInstrumentFormatter({ price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 })
const CLIENTS = ["ALPHA", "BETA", "GAMMA", "DELTA", "EPSILON", "ZETA", "THETA", "KAPPA"]
const INSTRUMENTS = ["UST 2Y", "UST 5Y", "UST 10Y", "UST 30Y"]
const STATUSES = ["Open", "Open", "Open", "Quoted", "Done away"]

const columns: ColumnDef<Rfq>[] = [
  { key: "id", header: "RFQ", width: 80, frozen: "left", sortable: true, accessor: (r) => r.id },
  { key: "client", header: "Client", width: 96, sortable: true, accessor: (r) => r.client },
  { key: "instrument", header: "Instrument", width: 96, sortable: true, accessor: (r) => r.instrument },
  { key: "size", header: "Size", width: 80, numeric: true, sortable: true, accessor: (r) => r.size, format: (v) => formatNotional(v as number, { unit: "mm" }) },
  { key: "px", header: "Price", width: 88, numeric: true, font: "mono", sortable: true, accessor: (r) => r.px, format: (v) => ust.price(v as number | null), parse: ust.parsePrice },
  { key: "status", header: "Status", width: 96, sortable: true, accessor: (r) => r.status },
]

const SEED: GridRules = {
  columns: [
    { id: "rich", column: "px", when: { op: "gte", value: "100-00" }, tone: "up", label: "Rich to the market" },
    { id: "cheap", column: "px", when: { op: "lt", value: "99-16" }, tone: "down", label: "Cheap to the market" },
    { id: "large", column: "size", when: { op: "gte", value: "20,000,000" }, tone: "primary", target: "row", label: "Large" },
  ],
  filter: [{ column: "status", op: "ne", value: "Done away" }],
  sort: [
    { key: "size", dir: "desc" },
    { key: "px", dir: "asc" },
  ],
}

function usePublisher() {
  const store = useMemo(() => createRowStore<Rfq>({ getRowId: (r) => r.id, lane: "ordered" }), [])
  useEffect(() => {
    store.applyDeltas({
      upsert: Array.from({ length: 40 }, (_, i) => ({
        id: `Q-${i + 1}`,
        client: CLIENTS[i % CLIENTS.length]!,
        instrument: INSTRUMENTS[i % INSTRUMENTS.length]!,
        size: (1 + (i % 9)) * 3_000_000,
        px: i % 11 === 0 ? null : 99 + Math.round(Math.random() * 96) / 64,
        status: STATUSES[i % STATUSES.length]!,
      })),
    })
    const batcher = createFrameBatcher<Rfq>(store.applyDeltas, { getRowId: (r) => r.id })
    const timer = setInterval(() => {
      const ids = store.getIds()
      for (let i = 0; i < 4; i++) {
        const id = ids[Math.floor(Math.random() * ids.length)]!
        const r = store.getRow(id)!
        if (r.px === null) continue
        batcher.push({ patch: [{ id, fields: { px: ust.step(r.px, Math.round((Math.random() - 0.5) * 6)) } }] })
      }
    }, 400)
    return () => {
      clearInterval(timer)
      batcher.cancel()
    }
  }, [store])
  return store
}

export function RulesEditorScene() {
  const store = usePublisher()
  const [rules, setRules] = useState<GridRules>(SEED)
  const [columnState, setColumnState] = useState<ColumnState>({ order: [], widths: {}, hidden: [] })
  return (
    <main className="flex h-screen flex-col gap-3 p-4 font-(family-name:--tradecn-font-mono) text-xs">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-sm font-semibold">rules-editor</h1>
        <span className="text-muted-foreground">Type a rule and the grid follows the keystroke. Prices move every 400 ms; the counts follow on a quarter-second beat.</span>
        <button type="button" className="ml-auto rounded border border-border px-2" onClick={() => setRules(SEED)}>
          reset rules
        </button>
      </div>
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[1fr_36rem]">
        <div className="min-h-0">
          <DataGrid store={store} columns={columns} preset="rfq" label="Open RFQs" rules={rules} columnState={columnState} onColumnStateChange={setColumnState} />
        </div>
        <aside className="flex min-h-0 flex-col gap-3">
          <RulesEditor columns={columns} rules={rules} onRulesChange={setRules} store={store} columnState={columnState} onColumnStateChange={setColumnState} className="rounded-md border border-border p-2" />
          <pre className="min-h-0 flex-1 overflow-auto rounded-md border border-border bg-card p-2 text-xs" data-rules={JSON.stringify(rules)}>
            {JSON.stringify(rules, null, 2)}
          </pre>
        </aside>
      </div>
    </main>
  )
}
