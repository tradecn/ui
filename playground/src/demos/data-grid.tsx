import { useEffect, useMemo, useState } from "react"
import { ContextMenuItem } from "@/components/ui/context-menu"
import { createInstrumentFormatter, formatQuantity, formatSigned } from "@/registry/tradecn/lib/format"
import { createFrameBatcher, createRowStore } from "@/registry/tradecn/lib/row-store"
import { DataGrid, type ColumnDef, type ColumnState, type SortState } from "@/registry/tradecn/ui/data-grid"

interface Rfq {
  id: string
  client: string
  instrument: string
  side: "BUY" | "SELL"
  size: number
  px: number
  chg: number
  secondsLeft: number
}

const CLIENTS = ["ALPHA", "BETA", "GAMMA", "DELTA", "EPSILON", "ZETA"]
const INSTRUMENTS = ["UST 2Y", "UST 5Y", "UST 10Y", "UST 30Y", "BUND 10Y", "GILT 10Y"]
const ust = createInstrumentFormatter({ price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 })

// 300 rows, 100 patches a frame, a new RFQ and an expiry pass every second, all through the batcher.
function usePublisher() {
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
    })
    store.applyDeltas({ upsert: Array.from({ length: 300 }, make) })
    const batcher = createFrameBatcher<Rfq>(store.applyDeltas, { getRowId: (r) => r.id })
    let alive = true
    let frame = 0
    const tick = () => {
      if (!alive) return
      frame++
      const ids = store.getIds()
      for (let i = 0; i < 100; i++) {
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
        batcher.push({ upsert: [make()] })
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    return () => {
      alive = false
      batcher.cancel()
    }
  }, [store])
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
]

export default function DataGridDemo() {
  const store = usePublisher()
  const [sort, setSort] = useState<SortState>({ key: "secondsLeft", dir: "asc" })
  const [columnState, setColumnState] = useState<ColumnState>({ order: [], widths: {}, hidden: [] })
  const [selection, setSelection] = useState<ReadonlySet<string>>(new Set())
  return (
    <div className="flex h-80 flex-col gap-2 font-(family-name:--tradecn-font-mono) text-xs">
      <p className="text-muted-foreground">Click a header to sort, drag its edge to resize. Shift and mod extend the selection ({selection.size} selected). Right-click for the menu.</p>
      <div className="min-h-0 flex-1">
        <DataGrid
          store={store}
          columns={columns}
          preset="rfq"
          label="Open RFQs"
          sort={sort}
          onSortChange={setSort}
          columnState={columnState}
          onColumnStateChange={setColumnState}
          selection={selection}
          onSelectionChange={setSelection}
          renderContextMenu={(rows) => (
            <>
              <ContextMenuItem>Quote {rows.length}</ContextMenuItem>
              <ContextMenuItem>Pass</ContextMenuItem>
            </>
          )}
        />
      </div>
    </div>
  )
}
