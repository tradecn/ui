import { useMemo } from "react"
import { DataGrid } from "@/components/ui/data-grid"
import { createRowStore } from "@/lib/row-store"

export function DataGridScene() {
  const store = useMemo(() => {
    const s = createRowStore<{ id: string; px: number }>({ getRowId: (r) => r.id })
    s.applyDeltas({ upsert: Array.from({ length: 50 }, (_, i) => ({ id: `r${i}`, px: 100 + i })) })
    return s
  }, [])
  return (
    <div style={{ height: 200 }}>
      <DataGrid store={store} label="Smoke" columns={[{ key: "id", header: "Id", width: 80, accessor: (r) => r.id }, { key: "px", header: "Px", width: 80, numeric: true, accessor: (r) => r.px }]} />
    </div>
  )
}
