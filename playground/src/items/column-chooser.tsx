import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { createInstrumentFormatter, formatNotional } from "@/registry/tradecn/lib/format"
import type { GridRules } from "@/registry/tradecn/lib/grid-rules"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import { ColumnChooser, ColumnChooserPanel } from "@/registry/tradecn/ui/column-chooser"
import { DataGrid, type ColumnDef, type ColumnState } from "@/registry/tradecn/ui/data-grid"

// One grid, one ColumnState, three writers: the grid's header menus, the panel inline beside it, and
// the dialog from the button. Whatever any of them writes, the other two show.

interface Rfq {
  id: string
  client: string
  instrument: string
  side: "BUY" | "SELL"
  size: number
  px: number | null
  status: string
}

const ust = createInstrumentFormatter({ price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 })
const CLIENTS = ["ALPHA", "BETA", "GAMMA", "DELTA", "EPSILON", "ZETA"]
const INSTRUMENTS = ["UST 2Y", "UST 5Y", "UST 10Y", "UST 30Y"]

const columns: ColumnDef<Rfq>[] = [
  { key: "id", header: "RFQ", width: 80, frozen: "left", sortable: true, accessor: (r) => r.id },
  { key: "client", header: "Client", width: 96, frozen: "left", sortable: true, accessor: (r) => r.client },
  { key: "instrument", header: "Instrument", width: 96, sortable: true, accessor: (r) => r.instrument },
  { key: "side", header: "Side", width: 56, sortable: true, accessor: (r) => r.side },
  { key: "size", header: "Size", width: 80, numeric: true, sortable: true, accessor: (r) => r.size, format: (v) => formatNotional(v as number, { unit: "mm" }) },
  { key: "px", header: "Price", width: 88, numeric: true, font: "mono", sortable: true, accessor: (r) => r.px, format: (v) => ust.price(v as number | null), parse: ust.parsePrice },
  { key: "status", header: "Status", width: 96, sortable: true, accessor: (r) => r.status },
]

const RULES: GridRules = {
  columns: [
    { id: "rich", column: "px", when: { op: "gte", value: "100-00" }, tone: "up", label: "Rich to the market" },
    { id: "large", column: "size", when: { op: "gte", value: "20,000,000" }, tone: "primary", target: "row", label: "Large" },
  ],
}

export function ColumnChooserScene() {
  const store = useMemo(() => {
    const s = createRowStore<Rfq>({ getRowId: (r) => r.id, lane: "ordered" })
    s.applyDeltas({
      upsert: Array.from({ length: 30 }, (_, i) => ({
        id: `Q-${i + 1}`,
        client: CLIENTS[i % CLIENTS.length]!,
        instrument: INSTRUMENTS[i % INSTRUMENTS.length]!,
        side: i % 3 ? "BUY" : "SELL",
        size: (1 + (i % 9)) * 3_000_000,
        px: i % 7 === 0 ? null : 99 + Math.round(i * 5.3) / 64,
        status: i % 5 === 4 ? "Quoted" : "Open",
      })),
    })
    return s
  }, [])
  const [columnState, setColumnState] = useState<ColumnState>({ order: [], widths: {}, hidden: [] })
  const [open, setOpen] = useState(false)
  return (
    <main className="flex h-screen flex-col gap-3 p-4 font-(family-name:--tradecn-font-mono) text-xs">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-sm font-semibold">column-chooser</h1>
        <span className="text-muted-foreground">The grid, the panel beside it, and the dialog from the button all write one ColumnState. Hide a column here and it leaves the grid; drag its edge in the grid and the width shows here.</span>
        <Button type="button" variant="outline" size="sm" className="ml-auto" onClick={() => setOpen(true)}>
          Columns…
        </Button>
      </div>
      <ColumnChooser open={open} onOpenChange={setOpen} columns={columns} columnState={columnState} onColumnStateChange={setColumnState} rules={RULES.columns} />
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[1fr_28rem]">
        <div className="min-h-0">
          <DataGrid store={store} columns={columns} preset="rfq" label="Open RFQs" columnState={columnState} onColumnStateChange={setColumnState} rules={RULES} />
        </div>
        <aside className="flex min-h-0 flex-col gap-3">
          <ColumnChooserPanel columns={columns} columnState={columnState} onColumnStateChange={setColumnState} rules={RULES.columns} className="rounded-md border border-border p-2" />
          <pre className="min-h-0 flex-1 overflow-auto rounded-md border border-border bg-card p-2 text-xs" data-column-state={JSON.stringify(columnState)}>
            {JSON.stringify(columnState, null, 2)}
          </pre>
        </aside>
      </div>
    </main>
  )
}
