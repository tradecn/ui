import { useState } from "react"
import type { ColumnRule } from "@/registry/tradecn/lib/grid-rules"
import { ColumnChooserPanel } from "@/registry/tradecn/ui/column-chooser"
import type { ColumnDef, ColumnState } from "@/registry/tradecn/ui/data-grid"

type Quote = { id: string; client: string; price: number }
const columns: ColumnDef<Quote>[] = [
  { key: "id", header: "RFQ", width: 80, frozen: "left", accessor: (row) => row.id },
  { key: "client", header: "Client", width: 112, accessor: (row) => row.client },
  { key: "price", header: "Price", width: 96, numeric: true, accessor: (row) => row.price },
]
const rules: ColumnRule[] = [{ id: "par", column: "price", when: { op: "gte", value: "100" }, tone: "up", label: "At or above par" }]

export default function ColumnChooserInlineDemo() {
  const [columnState, setColumnState] = useState<ColumnState>({ order: [], widths: { price: 144 }, hidden: ["client"] })

  return (
    <div className="w-xl max-w-full overflow-x-auto">
      <ColumnChooserPanel columns={columns} columnState={columnState} onColumnStateChange={setColumnState} rules={rules} className="min-w-lg" />
    </div>
  )
}
