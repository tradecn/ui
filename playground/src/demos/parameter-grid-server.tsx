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
  const requests = useRef<Request[]>([])
  const [pending, setPending] = useState(0)
  const [message, setMessage] = useState("Widths over 8 are refused.")

  useEffect(() => () => {
    for (const request of requests.current) request.resolve()
    requests.current = []
  }, [])

  function reply() {
    const batch = requests.current
    requests.current = []
    const now = Date.now()
    let refused = 0
    for (const { change, resolve, reject } of batch) {
      if (change.key === "width" && typeof change.value === "number" && change.value > 8) {
        reject(new Error("Over 8"))
        refused += 1
      } else {
        store.applyDeltas({ patch: [{ id: change.rowId, fields: { [change.key]: change.value, updatedAt: now, updatedBy: "you" } as Partial<Sheet> }], meta: { producedAt: now } })
        resolve()
      }
    }
    setPending(0)
    setMessage(`Accepted: ${batch.length - refused}. Refused: ${refused}.`)
  }

  return (
    <>
      <div data-demo-controls className="flex flex-wrap items-center gap-3 text-xs lining-nums tabular-nums">
        <button type="button" className="rounded border border-border px-2 py-1 disabled:opacity-50" disabled={pending === 0} onClick={reply}>Receive replies</button>
        <span role="status">Pending requests: {pending}. {message}</span>
      </div>
      <div className="h-44 w-fit max-w-full">
        <ParameterGrid store={store} parameters={parameters} label="Parameters awaiting server replies" changedSince={openedAt} onEdit={(change) => new Promise<void>((resolve, reject) => {
          requests.current.push({ change, resolve, reject })
          setPending(requests.current.length)
        })} />
      </div>
    </>
  )
}
