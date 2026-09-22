import { useMemo, useState } from "react"
import { DataGrid, type ColumnDef, type ColumnState } from "@/components/ui/data-grid"
import { RulesEditor } from "@/components/ui/rules-editor"
import type { GridRules } from "@/lib/grid-rules"
import { createRowStore } from "@/lib/row-store"

interface Rfq {
  id: string
  client: string
  px: number
  size: number
  status: string
}

const columns: ColumnDef<Rfq>[] = [
  { key: "id", header: "RFQ", width: 72, frozen: "left", accessor: (r) => r.id },
  { key: "client", header: "Client", width: 90, accessor: (r) => r.client },
  { key: "px", header: "Price", width: 80, numeric: true, accessor: (r) => r.px },
  { key: "size", header: "Size", width: 90, numeric: true, accessor: (r) => r.size },
  { key: "status", header: "Status", width: 90, accessor: (r) => r.status },
]

// The editor starts empty; the spec builds a highlight, a filter, and a sort key through the consumer's
// native-select and input, and reads each back in the grid.
export function RulesEditorScene() {
  const store = useMemo(() => {
    const s = createRowStore<Rfq>({ getRowId: (r) => r.id })
    s.applyDeltas({
      upsert: [
        { id: "a", client: "ALPHA", px: 99.5, size: 5_000_000, status: "Open" },
        { id: "b", client: "BETA", px: 100.25, size: 25_000_000, status: "Quoted" },
        { id: "c", client: "GAMMA", px: 99.75, size: 1_000_000, status: "Open" },
      ],
    })
    return s
  }, [])
  const [rules, setRules] = useState<GridRules>({})
  const [columnState, setColumnState] = useState<ColumnState>({ order: [], widths: {}, hidden: [] })
  return (
    <div className="flex w-[56rem] flex-col gap-2" data-rules-state={JSON.stringify(rules)}>
      <div style={{ height: 140 }}>
        <DataGrid store={store} columns={columns} label="Ruled by the editor" rules={rules} columnState={columnState} onColumnStateChange={setColumnState} />
      </div>
      <RulesEditor columns={columns} rules={rules} onRulesChange={setRules} store={store} columnState={columnState} onColumnStateChange={setColumnState} />
    </div>
  )
}
