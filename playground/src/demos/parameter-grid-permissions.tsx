import { useState } from "react"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import { ParameterGrid, type ParameterDef, type ParameterRow } from "@/registry/tradecn/ui/parameter-grid"

interface Sheet extends ParameterRow {
  skew: number | null
  hedge: number
}

const parameters: ParameterDef<Sheet>[] = [
  { key: "skew", header: "Skew", accessor: (row) => row.skew, step: 0.25, min: -5, max: 5 },
  { key: "hedge", header: "Hedge ratio", accessor: (row) => row.hedge, decimals: 3, readOnly: true, width: 128 },
]

export default function ParameterGridPermissionsDemo() {
  const [store] = useState(() => {
    const store = createRowStore<Sheet>({ getRowId: (row) => row.id })
    store.applyDeltas({ upsert: [
      { id: "zn", name: "ZN · edit + toggle", enabled: true, allowedActions: ["toggle", "edit"], skew: 0.5, hedge: 0.75 },
      { id: "zb", name: "ZB · edit only", enabled: false, allowedActions: ["edit"], skew: null, hedge: 1 },
      { id: "zt", name: "ZT · locked", enabled: true, allowedActions: [], skew: 0, hedge: 0.25 },
    ] })
    return store
  })

  return (
    <div className="h-44 w-fit max-w-full">
      <ParameterGrid store={store} parameters={parameters} label="Parameter permissions" asOf={false} onEdit={(change) => {
        store.applyDeltas({ patch: [{ id: change.rowId, fields: { [change.key]: change.value, updatedAt: Date.now(), updatedBy: "you" } as Partial<Sheet> }] })
      }} />
    </div>
  )
}
