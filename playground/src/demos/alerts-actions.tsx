import { useState } from "react"
import { createAlertStore, type AlertInput } from "@/registry/tradecn/lib/alert-store"
import { Alerts } from "@/registry/tradecn/ui/alerts"

const slow: AlertInput = { key: "feed:slow", severity: "warning", tone: "stale", title: "Feed slow", message: "1.2 s behind", allowedActions: ["reconnect"] }
const rejected: AlertInput = { key: "order:rejected", severity: "critical", tone: "destructive", title: "Order rejected", message: "Price away from market", allowedActions: ["ack"] }

export default function AlertsActionsDemo() {
  const [alerts] = useState(() => {
    const store = createAlertStore()
    store.push(slow)
    store.push(rejected)
    return store
  })
  const [acted, setActed] = useState("No action yet")

  return (
    <>
      <div data-demo-controls className="flex flex-wrap gap-2 text-xs">
        <button type="button" className="rounded border border-border px-2 py-1" onClick={() => alerts.push(slow)}>Receive slow feed</button>
        <button type="button" className="rounded border border-border px-2 py-1" onClick={() => alerts.push(rejected)}>Receive rejection</button>
      </div>
      <div className="w-lg max-w-full space-y-3 text-xs">
        <Alerts alerts={alerts} visible={2} assertive={["critical"]} actions={[
          { id: "reconnect", label: "Reconnect", onAction: (alert) => { setActed(`Reconnect requested: ${alert.title}`); alerts.dismiss(alert.id) } },
          { id: "ack", label: "Acknowledge", onAction: (alert) => { setActed(`Acknowledged: ${alert.title}`); alerts.dismiss(alert.id) } },
        ]} />
        <p role="status">{acted}</p>
      </div>
    </>
  )
}
