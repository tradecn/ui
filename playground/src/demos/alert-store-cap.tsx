import { useRef, useState, useSyncExternalStore } from "react"
import { createAlertStore, type AlertInput, type AlertStore } from "@/registry/tradecn/lib/alert-store"

const slow: AlertInput = { key: "md:slow", severity: "warning", title: "Feed slow", allowedActions: ["reconnect"] }

function restore(alerts: AlertStore) {
  alerts.clear()
  alerts.push(slow)
  alerts.push({ severity: "info", title: "Notice 1" })
  alerts.push({ severity: "info", title: "Notice 2" })
}

export default function AlertStoreCapDemo() {
  const [alerts] = useState(() => {
    const store = createAlertStore({ max: 3 })
    restore(store)
    return store
  })
  const nextNotice = useRef(2)
  useSyncExternalStore(alerts.store.subscribeMeta, alerts.store.getMeta, alerts.store.getMeta)
  const rows = alerts.list()
  const count = rows.reduce((total, alert) => total + alert.count, 0)
  return (
    <>
      <div data-demo-controls className="flex flex-wrap gap-2 text-xs">
        <button type="button" className="rounded border border-border px-2 py-1" onClick={() => alerts.push(slow)}>Repeat slow feed</button>
        <button type="button" className="rounded border border-border px-2 py-1" onClick={() => alerts.push({ severity: "info", title: `Notice ${++nextNotice.current}` })}>Add notice</button>
        <button type="button" className="rounded border border-border px-2 py-1" onClick={() => alerts.clear()}>Clear</button>
        <button type="button" className="rounded border border-border px-2 py-1" onClick={() => { nextNotice.current = 2; restore(alerts) }}>Restore</button>
      </div>
      <div className="w-fit max-w-full space-y-2 text-xs lining-nums tabular-nums">
        <p role="status" className="text-muted-foreground">{rows.length} of 3 rows · {count} {count === 1 ? "notice" : "notices"}</p>
        <div role="region" aria-label="Capped notices" tabIndex={0} className="max-w-full overflow-x-auto rounded border border-border">
          <table className="border-collapse text-left whitespace-nowrap">
            <caption className="p-2 text-left text-muted-foreground">Newest first</caption>
            <thead><tr className="border-b border-border">
              <th scope="col" className="px-2 py-1 font-medium">Title</th>
              <th scope="col" className="px-2 py-1 text-right font-medium">Count</th>
              <th scope="col" className="px-2 py-1 font-medium">Allowed actions</th>
            </tr></thead>
            <tbody>{rows.map((alert) => (
              <tr key={alert.id} className="border-b border-border last:border-0">
                <th scope="row" className="px-2 py-1 font-normal">{alert.title}</th>
                <td className="px-2 py-1 text-right">{alert.count}</td>
                <td className="px-2 py-1">{alert.allowedActions?.join(", ") || "None"}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>
    </>
  )
}
