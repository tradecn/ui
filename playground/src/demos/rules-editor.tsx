import { useMemo, useState } from "react"
import { createInstrumentFormatter, formatNotional } from "@/registry/tradecn/lib/format"
import type { GridRules } from "@/registry/tradecn/lib/grid-rules"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import { DataGrid, type ColumnDef, type ColumnState } from "@/registry/tradecn/ui/data-grid"
import { RulesEditor } from "@/registry/tradecn/ui/rules-editor"

interface Rfq {
  id: string
  client: string
  size: number
  px: number | null
  status: string
}

const ust = createInstrumentFormatter({ price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 })

const columns: ColumnDef<Rfq>[] = [
  { key: "id", header: "RFQ", width: 72, frozen: "left", accessor: (r) => r.id },
  { key: "client", header: "Client", width: 96, sortable: true, accessor: (r) => r.client },
  { key: "size", header: "Size", width: 80, numeric: true, sortable: true, accessor: (r) => r.size, format: (v) => formatNotional(v as number, { unit: "mm" }) },
  { key: "px", header: "Price", width: 88, numeric: true, font: "mono", sortable: true, accessor: (r) => r.px, format: (v) => ust.price(v as number | null), parse: ust.parsePrice },
  { key: "status", header: "Status", width: 96, sortable: true, accessor: (r) => r.status },
]

const ROWS: Rfq[] = [
  { id: "Q-1", client: "ALPHA", size: 5_000_000, px: 99.5, status: "Open" },
  { id: "Q-2", client: "BETA", size: 25_000_000, px: 100.015625, status: "Open" },
  { id: "Q-3", client: "GAMMA", size: 1_000_000, px: 99.75, status: "Open" },
  { id: "Q-4", client: "DELTA", size: 10_000_000, px: 99.25, status: "Quoted" },
  { id: "Q-5", client: "EPSILON", size: 2_000_000, px: null, status: "Open" },
  { id: "Q-6", client: "ZETA", size: 15_000_000, px: 100.5, status: "Done away" },
]

// The editor and the grid share one rules object and one column state. Edit a rule and the grid follows the keystroke.
export default function RulesEditorDemo() {
  const store = useMemo(() => {
    const s = createRowStore<Rfq>({ getRowId: (r) => r.id })
    s.applyDeltas({ upsert: ROWS })
    return s
  }, [])
  const [rules, setRules] = useState<GridRules>({
    columns: [{ id: "rich", column: "px", when: { op: "gte", value: "100-00" }, tone: "up", label: "Rich to the market" }],
    filter: [{ column: "status", op: "ne", value: "Done away" }],
    sort: [{ key: "size", dir: "desc" }],
  })
  const [columnState, setColumnState] = useState<ColumnState>({ order: [], widths: {}, hidden: [] })
  return (
    <div className="flex flex-col gap-3 font-(family-name:--tradecn-font-mono) text-xs">
      <RulesEditor columns={columns} rules={rules} onRulesChange={setRules} store={store} columnState={columnState} onColumnStateChange={setColumnState} />
      <div className="h-48">
        <DataGrid store={store} columns={columns} preset="rfq" label="Open RFQs" rules={rules} columnState={columnState} onColumnStateChange={setColumnState} />
      </div>
    </div>
  )
}
