import { useMemo } from "react"
import { DataGrid, type ColumnDef } from "@/components/ui/data-grid"
import { createInstrumentFormatter } from "@/lib/format"
import type { GridRules } from "@/lib/grid-rules"
import { createRowStore } from "@/lib/row-store"

interface Rfq {
  id: string
  size: number
  px: number | null
  status: string
}

const ust = createInstrumentFormatter({ price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 })

const columns: ColumnDef<Rfq>[] = [
  { key: "id", header: "RFQ", width: 72, frozen: "left", accessor: (r) => r.id },
  { key: "size", header: "Size", width: 80, numeric: true, accessor: (r) => r.size },
  { key: "px", header: "Price", width: 88, numeric: true, font: "mono", accessor: (r) => r.px, format: (v) => ust.price(v as number | null), parse: ust.parsePrice },
  { key: "status", header: "Status", width: 96, accessor: (r) => r.status },
]

// A price rule typed in 32nds, a row rule, a filter that drops the small one, and an order the grid follows.
const RULES: GridRules = {
  columns: [
    { id: "rich", column: "px", when: { op: "gte", value: "100-00" }, tone: "up", label: "Rich to the market" },
    { id: "large", column: "size", when: { op: "gte", value: "20000000" }, tone: "primary", target: "row", label: "Large" },
  ],
  filter: [{ column: "size", op: "gte", value: "2000000" }],
  sort: [{ key: "size", dir: "desc" }],
}

// A lib has no element of its own; the scene wraps the grid it drives in the slot the smoke test counts.
export function GridRulesScene() {
  const store = useMemo(() => {
    const s = createRowStore<Rfq>({ getRowId: (r) => r.id })
    s.applyDeltas({
      upsert: [
        { id: "plain", size: 5_000_000, px: 99.5, status: "Open" },
        { id: "rich", size: 10_000_000, px: 100.25, status: "Open" },
        { id: "small", size: 1_000_000, px: 99.75, status: "Open" },
        { id: "big", size: 25_000_000, px: 99.0, status: "Quoted" },
      ],
    })
    return s
  }, [])
  return (
    <div data-slot="tradecn-grid-rules" style={{ height: 160 }}>
      <DataGrid store={store} columns={columns} label="Ruled" rules={RULES} />
    </div>
  )
}
