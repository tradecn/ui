import { useEffect, useRef, useState } from "react"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import type { EditChange } from "@/registry/tradecn/ui/data-grid"
import { ParameterGrid, type ParameterDef, type ParameterRow } from "@/registry/tradecn/ui/parameter-grid"

interface Sheet extends ParameterRow {
  width: number | null
}
interface Request {
  change: EditChange<Sheet>
  resolve: () => void
  reject: (error: Error) => void
}

const parameters: ParameterDef<Sheet>[] = [
  { key: "width", header: "Width", accessor: (row) => row.width, step: 0.5, min: 0.5, width: 120 },
]

export default function ParameterGridServerDemo() {
  const [openedAt] = useState(() => Date.now())
  const [store] = useState(() => {
    const store = createRowStore<Sheet>({ getRowId: (row) => row.id })
    store.applyDeltas({
      upsert: [{ id: "zn", name: "ZN", enabled: true, allowedActions: ["toggle", "edit"], width: 2, updatedAt: openedAt - 60_000, updatedBy: "desk" }],
      meta: { producedAt: openedAt },
    })
    return store
  })
  const request = useRef<Request | null>(null)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState("Widths over 8 are refused.")

  useEffect(() => () => {
    request.current?.resolve()
    request.current = null
  }, [])

  function reply() {
    if (!request.current) return
    const { change, resolve, reject } = request.current
    request.current = null
    const allowedActions = change.row.allowedActions
    if (change.key === "width" && typeof change.value === "number" && change.value > 8) {
      store.applyDeltas({ patch: [{ id: change.rowId, fields: { allowedActions } }] })
      reject(new Error("Over 8"))
      setMessage("Refused: Over 8.")
    } else {
      const now = Date.now()
      store.applyDeltas({ patch: [{ id: change.rowId, fields: { [change.key]: change.value, allowedActions, updatedAt: now, updatedBy: "you" } as Partial<Sheet> }], meta: { producedAt: now } })
      resolve()
      setMessage("Accepted.")
    }
    setPending(false)
  }

  return (
    <>
      <div data-demo-controls className="flex flex-wrap items-center gap-3 text-xs lining-nums tabular-nums">
        <button type="button" className="rounded border border-border px-2 py-1 disabled:opacity-50" disabled={!pending} onClick={reply}>Receive reply</button>
        <span role="status">{pending ? "Waiting for reply." : message}</span>
      </div>
      <div className="h-44 w-fit max-w-full">
        <ParameterGrid store={store} parameters={parameters} label="Parameters awaiting server replies" changedSince={openedAt} onEdit={(change) => new Promise<void>((resolve, reject) => {
          request.current = { change, resolve, reject }
          store.applyDeltas({ patch: [{ id: change.rowId, fields: { allowedActions: [] } }] })
          setPending(true)
        })} />
      </div>
    </>
  )
}
