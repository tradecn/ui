import { useState } from "react"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import type { EditChange } from "@/registry/tradecn/ui/data-grid"
import { ParameterGrid, type ParameterDef, type ParameterRow } from "@/registry/tradecn/ui/parameter-grid"

// A pricing sheet: one row per instrument, the skew, the width, and the largest size the auto-quoter
// answers, with a pretend server 400 ms away that takes every change but a width over 8, which risk declines.

interface Sheet extends ParameterRow {
  skew: number | null
  width: number
  maxSize: number
  hedge: number
}

const PARAMETERS: ParameterDef<Sheet>[] = [
  { key: "skew", header: "Skew", accessor: (r) => r.skew, step: 0.25, min: -5, max: 5 },
  { key: "width", header: "Width", accessor: (r) => r.width, step: 0.5, min: 0.5 },
  { key: "maxSize", header: "Max size", accessor: (r) => r.maxSize, decimals: 0, step: 5, min: 0 },
  { key: "hedge", header: "Hedge ratio", accessor: (r) => r.hedge, decimals: 3, readOnly: true },
]

const INSTRUMENTS = ["TU", "FV", "TY", "UXY", "US", "WN"]

export default function ParameterGridDemo() {
  const [openedAt] = useState(() => Date.now())
  const [store] = useState(() => {
    const s = createRowStore<Sheet>({ getRowId: (r) => r.id })
    const now = Date.now()
    s.applyDeltas({
      upsert: INSTRUMENTS.map((name, i) => ({
        id: name,
        name,
        enabled: i !== 4,
        // The server decides what may be done to each row. The last one is locked.
        allowedActions: i === 5 ? [] : ["toggle", "edit"],
        skew: i === 2 ? null : (i - 2) * 0.25,
        width: 1 + i * 0.5,
        maxSize: [200, 100, 50, 25, 20, 10][i]!,
        hedge: [0.25, 0.5, 0.75, 0.9, 1, 1.35][i]!,
        updatedAt: now - (6 - i) * 3_600_000,
        updatedBy: i % 2 ? "desk" : "auto",
      })),
      meta: { producedAt: now },
    })
    return s
  })
  // The edit is a command: the server answers 400 ms later by writing the row back, or by refusing.
  const onEdit = (change: EditChange<Sheet>) =>
    new Promise<void>((resolve, reject) => {
      setTimeout(() => {
        if (change.key === "width" && typeof change.value === "number" && change.value > 8) return reject(new Error("Risk declined a width over 8"))
        const now = Date.now()
        store.applyDeltas({ patch: [{ id: change.rowId, fields: { [change.key]: change.value, updatedAt: now, updatedBy: "you" } as Partial<Sheet> }], meta: { producedAt: now } })
        resolve()
      }, 400)
    })
  return (
    <div className="flex h-72 flex-col gap-2 font-(family-name:--tradecn-font-mono) text-xs">
      <p className="text-muted-foreground">Double-click a value or press Enter on it to type; the arrows step. The box asks the server. A width over 8 is refused, and the last row allows nothing.</p>
      <div className="min-h-0 flex-1">
        <ParameterGrid store={store} parameters={PARAMETERS} onEdit={onEdit} changedSince={openedAt} />
      </div>
    </div>
  )
}
