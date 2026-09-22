import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { createInstrumentFormatter, formatNotional } from "@/registry/tradecn/lib/format"
import type { GridRules } from "@/registry/tradecn/lib/grid-rules"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import { ColumnChooser } from "@/registry/tradecn/ui/column-chooser"
import { DataGrid, type ColumnDef, type ColumnState } from "@/registry/tradecn/ui/data-grid"

interface Rfq {
  id: string
  client: string
  instrument: string
  size: number
  px: number | null
  status: string
}

const ust = createInstrumentFormatter({ price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 })

const columns: ColumnDef<Rfq>[] = [
  { key: "id", header: "RFQ", width: 72, frozen: "left", accessor: (r) => r.id },
  { key: "client", header: "Client", width: 96, sortable: true, accessor: (r) => r.client },
  { key: "instrument", header: "Instrument", width: 96, sortable: true, accessor: (r) => r.instrument },
  { key: "size", header: "Size", width: 80, numeric: true, sortable: true, accessor: (r) => r.size, format: (v) => formatNotional(v as number, { unit: "mm" }) },
  { key: "px", header: "Price", width: 88, numeric: true, font: "mono", sortable: true, accessor: (r) => r.px, format: (v) => ust.price(v as number | null), parse: ust.parsePrice },
  { key: "status", header: "Status", width: 96, sortable: true, accessor: (r) => r.status },
]

const RULES: GridRules = {
  columns: [{ id: "rich", column: "px", when: { op: "gte", value: "100-00" }, tone: "up", label: "Rich to the market" }],
}

const ROWS: Rfq[] = [
  { id: "Q-1", client: "ALPHA", instrument: "UST 10Y", size: 5_000_000, px: 99.5, status: "Open" },
  { id: "Q-2", client: "BETA", instrument: "UST 5Y", size: 25_000_000, px: 100.015625, status: "Open" },
  { id: "Q-3", client: "GAMMA", instrument: "UST 2Y", size: 10_000_000, px: 99.25, status: "Quoted" },
  { id: "Q-4", client: "DELTA", instrument: "UST 30Y", size: 2_000_000, px: null, status: "Open" },
]

// The grid and the chooser share one ColumnState. The grid's header menus and the chooser write the same object.
export default function ColumnChooserDemo() {
  const store = useMemo(() => {
    const s = createRowStore<Rfq>({ getRowId: (r) => r.id })
    s.applyDeltas({ upsert: ROWS })
    return s
  }, [])
  const [columnState, setColumnState] = useState<ColumnState>({ order: [], widths: {}, hidden: ["instrument"] })
  const [open, setOpen] = useState(false)
  return (
    <div className="flex min-h-72 flex-col gap-2 font-(family-name:--tradecn-font-mono) text-xs">
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
          Columns
        </Button>
        <span className="text-muted-foreground">
          {columnState.hidden.length} hidden, {columnState.order.length ? "reordered" : "in the grid's order"}
        </span>
      </div>
      <ColumnChooser open={open} onOpenChange={setOpen} columns={columns} columnState={columnState} onColumnStateChange={setColumnState} rules={RULES.columns} />
      <div className="h-44">
        <DataGrid store={store} columns={columns} preset="rfq" label="Open RFQs" columnState={columnState} onColumnStateChange={setColumnState} rules={RULES} />
      </div>
    </div>
  )
}
