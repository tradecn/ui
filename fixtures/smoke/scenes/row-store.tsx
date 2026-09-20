import { useMemo } from "react"
import { useRow } from "@/hooks/use-row-store"
import { createRowStore } from "@/lib/row-store"

export function RowStoreScene() {
  const store = useMemo(() => {
    const s = createRowStore<{ id: string; px: number }>({ getRowId: (r) => r.id })
    s.applyDeltas({ upsert: [{ id: "a", px: 1 }] })
    return s
  }, [])
  const row = useRow(store, "a")
  return <div data-slot="tradecn-row-store">{row?.px}</div>
}
