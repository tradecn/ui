import { useState } from "react"
import { Alerts } from "@/components/ui/alerts"
import { createAlertStore } from "@/lib/alert-store"

function seeded() {
  const alerts = createAlertStore()
  alerts.push({ id: "up", severity: "info", tone: "up", title: "Market data connected" })
  alerts.push({ id: "slow", key: "md:slow", severity: "warning", tone: "stale", title: "Market data slow", message: "1.2 s behind", allowedActions: ["reconnect"] })
  alerts.push({ id: "fill", severity: "fill", tone: "primary", title: "Filled 5mm" })
  alerts.push({ id: "rejected", severity: "critical", tone: "destructive", title: "Order rejected", message: "Price away from market", allowedActions: ["ack"] })
  return alerts
}

// Four notices, the newest three shown; a button that repeats the slow one by its key so the row's count climbs.
export function AlertsScene() {
  const [alerts] = useState(seeded)
  const [acted, setActed] = useState("")
  return (
    <div className="w-[36rem]" data-alerts-acted={acted}>
      <button type="button" className="mb-1 rounded border border-border px-2" onClick={() => alerts.push({ key: "md:slow", severity: "warning", tone: "stale", title: "Market data slow", message: "2.0 s behind", allowedActions: ["reconnect"] })}>
        slow feed again
      </button>
      <Alerts alerts={alerts} assertive={["critical"]} actions={[{ id: "reconnect", label: "Reconnect", onAction: (a) => setActed(`reconnect:${a.id}`) }, { id: "ack", label: "Acknowledge", onAction: (a) => setActed(`ack:${a.id}`) }]} />
    </div>
  )
}
