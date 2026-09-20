import { useEffect, useMemo, useState } from "react"
import { ContextMenuItem } from "@/components/ui/context-menu"
import { createInstrumentFormatter, formatQuantity, formatSigned } from "@/registry/tradecn/lib/format"
import { createFrameBatcher, createRowStore } from "@/registry/tradecn/lib/row-store"
import { DataGrid, exportCsv, type ColumnDef, type ColumnState, type DataGridPreset, type SortState } from "@/registry/tradecn/ui/data-grid"

interface Rfq {
  id: string
  client: string
  instrument: string
  side: "BUY" | "SELL"
  size: number
  px: number
  chg: number
  secondsLeft: number
  state: "NEW" | "QUOTED" | "TRADED" | "EXPIRED"
}

const CLIENTS = ["ALPHA", "BETA", "GAMMA", "DELTA", "EPSILON", "ZETA", "THETA", "KAPPA"]
const INSTRUMENTS = ["UST 2Y", "UST 5Y", "UST 10Y", "UST 30Y", "BUND 10Y", "JGB 10Y", "OAT 10Y", "GILT 10Y"]
const ust = createInstrumentFormatter({ price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 })

function usePublisher(rows: number, updatesPerFrame: number) {
  const store = useMemo(() => createRowStore<Rfq>({ getRowId: (r) => r.id, lane: "ordered" }), [])
  useEffect(() => {
    let n = 0
    const make = (): Rfq => ({
      id: `RFQ-${++n}`,
      client: CLIENTS[n % CLIENTS.length]!,
      instrument: INSTRUMENTS[n % INSTRUMENTS.length]!,
      side: n % 3 ? "BUY" : "SELL",
      size: (1 + (n % 9)) * 5_000_000,
      px: 98 + Math.random() * 4,
      chg: 0,
      secondsLeft: 30 + (n % 60),
      state: "NEW",
    })
    store.applyDeltas({ upsert: Array.from({ length: rows }, make) })
    const batcher = createFrameBatcher<Rfq>(store.applyDeltas, { getRowId: (r) => r.id })
    let alive = true
    let frame = 0
    const tick = () => {
      if (!alive) return
      frame++
      const ids = store.getIds()
      for (let i = 0; i < updatesPerFrame; i++) {
        const id = ids[Math.floor(Math.random() * ids.length)]!
        const r = store.getRow(id)!
        const d = Math.round((Math.random() - 0.5) * 4) / 64
        batcher.push({ patch: [{ id, fields: { px: r.px + d, chg: r.chg + d } }] })
      }
      if (frame % 60 === 0) {
        for (const id of ids) {
          const r = store.getRow(id)!
          if (r.secondsLeft <= 1) batcher.push({ remove: [id] })
          else batcher.push({ patch: [{ id, fields: { secondsLeft: r.secondsLeft - 1 } }] })
        }
        batcher.push({ upsert: [make(), make()], meta: { seq: frame } })
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    return () => {
      alive = false
      batcher.cancel()
    }
  }, [store, rows, updatesPerFrame])
  return store
}

const columns: ColumnDef<Rfq>[] = [
  { key: "id", header: "RFQ", width: 90, frozen: "left", sortable: true, accessor: (r) => r.id },
  { key: "client", header: "Client", width: 90, sortable: true, accessor: (r) => r.client },
  { key: "instrument", header: "Instrument", width: 100, sortable: true, accessor: (r) => r.instrument },
  { key: "side", header: "Side", width: 60, sortable: true, accessor: (r) => r.side, cell: ({ value }) => <span className={value === "BUY" ? "text-up" : "text-down"}>{String(value)}</span> },
  { key: "size", header: "Size", width: 100, numeric: true, sortable: true, accessor: (r) => r.size, format: (v) => formatQuantity(v as number) },
  { key: "px", header: "Price", width: 90, numeric: true, sortable: true, accessor: (r) => r.px, format: (v) => ust.price(v as number) },
  { key: "chg", header: "Chg", width: 80, numeric: true, sortable: true, accessor: (r) => r.chg, format: (v) => formatSigned(v as number, { decimals: 3 }) },
  { key: "secondsLeft", header: "Time", width: 60, numeric: true, sortable: true, accessor: (r) => r.secondsLeft },
  { key: "state", header: "State", width: 80, accessor: (r) => r.state },
]

export function DataGridScene() {
  const params = new URLSearchParams(window.location.search)
  const rows = Number(params.get("rows") ?? 1000)
  const updates = Number(params.get("updates") ?? 400)
  const store = usePublisher(rows, updates)
  const [preset, setPreset] = useState<DataGridPreset>("rfq")
  const [sort, setSort] = useState<SortState>({ key: "secondsLeft", dir: "asc" })
  const [columnState, setColumnState] = useState<ColumnState>({ order: [], widths: {}, hidden: [] })
  const [selection, setSelection] = useState<ReadonlySet<string>>(new Set())
  return (
    <main className="flex h-screen flex-col gap-3 p-4 font-mono text-xs">
      <div className="flex items-center gap-3">
        <h1 className="text-sm font-semibold">data-grid</h1>
        <span className="text-muted-foreground">
          {rows} rows, {updates} patches/frame, 2 new RFQs and 1 expiry pass per second. Selected: {selection.size}.
        </span>
        <select className="ml-auto rounded border border-border bg-background px-1" value={preset} onChange={(e) => setPreset(e.target.value as DataGridPreset)}>
          {(["rfq", "blotter", "watchlist", "option-chain"] as const).map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <button className="rounded border border-border px-2" onClick={() => navigator.clipboard.writeText(exportCsv(store, columns, [...selection]))}>
          copy selection as CSV
        </button>
      </div>
      <div className="min-h-0 flex-1">
        <DataGrid
          store={store}
          columns={columns}
          preset={preset}
          label="Open RFQs"
          sort={sort}
          onSortChange={setSort}
          columnState={columnState}
          onColumnStateChange={setColumnState}
          selection={selection}
          onSelectionChange={setSelection}
          onRowActivate={(r) => console.log("activate", r.id)}
          renderContextMenu={(rs) => (
            <>
              <ContextMenuItem onClick={() => console.log("quote", rs.map((r) => r.id))}>Quote {rs.length}</ContextMenuItem>
              <ContextMenuItem onClick={() => console.log("pass", rs.map((r) => r.id))}>Pass</ContextMenuItem>
            </>
          )}
        />
      </div>
    </main>
  )
}
