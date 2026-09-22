import { useMemo, useRef } from "react"
import { DataGrid } from "@/components/ui/data-grid"
import { createRowStore } from "@/lib/row-store"

interface Row {
  id: string
  px: number
}

// A tape: 50 rows and a button that appends 10 more at the tail, with a total under them.
const footer = { px: (rows: Row[]) => String(rows.reduce((sum, r) => sum + r.px, 0)) }

export function DataGridScene() {
  const store = useMemo(() => {
    const s = createRowStore<Row>({ getRowId: (r) => r.id })
    s.applyDeltas({ upsert: Array.from({ length: 50 }, (_, i) => ({ id: `r${i}`, px: 100 + i })) })
    return s
  }, [])
  const next = useRef(50)
  const append = () => {
    const from = next.current
    next.current += 10
    store.applyDeltas({ upsert: Array.from({ length: 10 }, (_, i) => ({ id: `r${from + i}`, px: 100 + from + i })) })
  }
  return (
    <div className="flex flex-col gap-1">
      <div style={{ height: 200 }}>
        <DataGrid store={store} preset="tape" label="Smoke" footer={footer} columns={[{ key: "id", header: "Id", width: 80, accessor: (r) => r.id }, { key: "px", header: "Px", width: 80, numeric: true, accessor: (r) => r.px }]} />
      </div>
      <button type="button" onClick={append}>
        append 10
      </button>
    </div>
  )
}
