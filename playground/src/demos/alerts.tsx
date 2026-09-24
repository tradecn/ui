import { useState } from "react"
import { createAlertStore, type AlertStore } from "@/registry/tradecn/lib/alert-store"
import { Alerts } from "@/registry/tradecn/ui/alerts"

function restore(alerts: AlertStore) {
  alerts.clear()
  alerts.push({ severity: "info", tone: "up", title: "Feed connected" })
  alerts.push({ severity: "fill", tone: "primary", title: "Order filled", message: "5mm UST at 99-16+" })
}

export default function AlertsDemo() {
  const [alerts] = useState(() => {
    const store = createAlertStore()
    restore(store)
    return store
  })

  return (
    <>
      <div data-demo-controls className="text-xs">
        <button type="button" className="rounded border border-border px-2 py-1" onClick={() => restore(alerts)}>Restore notices</button>
      </div>
      <Alerts alerts={alerts} className="w-lg max-w-full" />
    </>
  )
}
