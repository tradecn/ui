import { useMemo } from "react"
import type { EditChange } from "@/components/ui/data-grid"
import { ParameterGrid, type ParameterDef, type ParameterRow } from "@/components/ui/parameter-grid"
import { createRowStore } from "@/lib/row-store"

interface Sheet extends ParameterRow {
  skew: number
  width: number
  maxSize: number
}

const PARAMETERS: ParameterDef<Sheet>[] = [
  { key: "skew", header: "Skew", accessor: (r) => r.skew, step: 0.25, min: -5, max: 5 },
  { key: "width", header: "Width", accessor: (r) => r.width, step: 0.5, min: 0 },
  { key: "maxSize", header: "Max size", accessor: (r) => r.maxSize, decimals: 0, readOnly: true },
]

const AT = 1_700_000_000_000

// A pretend server 150 ms away: it takes every change but a width over 10, which risk declines.
export function ParameterGridScene() {
  const store = useMemo(() => {
    const s = createRowStore<Sheet>({ getRowId: (r) => r.id })
    s.applyDeltas({
      upsert: [
        { id: "zn", name: "ZN", enabled: true, allowedActions: ["toggle", "edit"], skew: 0.5, width: 2, maxSize: 50, updatedAt: AT, updatedBy: "desk" },
        { id: "zb", name: "ZB", enabled: false, allowedActions: ["toggle", "edit"], skew: -0.25, width: 3, maxSize: 20, updatedAt: AT + 60_000 },
        { id: "tu", name: "TU", enabled: true, allowedActions: [], skew: 0, width: 1, maxSize: 200, updatedAt: null },
      ],
      meta: { producedAt: AT + 120_000 },
    })
    return s
  }, [])
  const onEdit = (change: EditChange<Sheet>) =>
    new Promise<void>((resolve, reject) => {
      setTimeout(() => {
        if (change.key === "width" && typeof change.value === "number" && change.value > 10) return reject(new Error("Risk declined it"))
        store.applyDeltas({ patch: [{ id: change.rowId, fields: { [change.key]: change.value, updatedAt: AT + 240_000, updatedBy: "smoke" } as Partial<Sheet> }], meta: { producedAt: AT + 240_000 } })
        resolve()
      }, 150)
    })
  return (
    <div className="w-[44rem]" style={{ height: 160 }}>
      <ParameterGrid store={store} parameters={PARAMETERS} onEdit={onEdit} changedSince={AT + 30_000} time={(ms) => `+${Math.round((ms - AT) / 1000)}s`} />
    </div>
  )
}
