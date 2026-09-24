import { useState } from "react"
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
}

const ust = createInstrumentFormatter({ price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 })

const columns: ColumnDef<Rfq>[] = [
  { key: "client", header: "Client", width: 180, sortable: true, accessor: (r) => r.client },
  { key: "size", header: "Size", width: 160, numeric: true, sortable: true, accessor: (r) => r.size, format: (v) => formatNotional(v as number, { unit: "mm" }) },
  { key: "px", header: "Price", width: 170, numeric: true, font: "mono", sortable: true, accessor: (r) => r.px, format: (v) => ust.price(v as number | null), parse: ust.parsePrice },
]

const rows: Rfq[] = [
  { id: "Q-1", client: "ALPHA", size: 5_000_000, px: 99.5 },
  { id: "Q-2", client: "BETA", size: 25_000_000, px: 100.015625 },
  { id: "Q-3", client: "GAMMA", size: 10_000_000, px: null },
]

// The editor and the grid share one rules object and one column state. Edit a rule and the grid follows the keystroke.
export default function RulesEditorDemo() {
  const [store] = useState(() => {
    const s = createRowStore<Rfq>({ getRowId: (r) => r.id })
    s.applyDeltas({ upsert: rows })
    return s
  })
  const [rules, setRules] = useState<GridRules>({
    columns: [{ id: "threshold", column: "px", when: { op: "gte", value: "100-00" }, tone: "primary", label: "Price threshold" }],
    filter: [],
    sort: [],
  })
  const [columnState, setColumnState] = useState<ColumnState>({ order: [], widths: {}, hidden: [] })
  return (
    <div className="w-lg max-w-full space-y-3">
      <RulesEditor className="overflow-x-auto" columns={columns} rules={rules} onRulesChange={setRules} store={store} columnState={columnState} onColumnStateChange={setColumnState} />
      <div className="h-48">
        <DataGrid store={store} columns={columns} preset="watchlist" label="Quotes with rules" rules={rules} columnState={columnState} onColumnStateChange={setColumnState} />
      </div>
    </div>
  )
}
