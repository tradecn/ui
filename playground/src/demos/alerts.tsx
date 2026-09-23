import { useState } from "react"
import { Button } from "@/components/ui/button"
import { createAlertStore, type Alert } from "@/registry/tradecn/lib/alert-store"
import { Alerts, useToastBridge } from "@/registry/tradecn/ui/alerts"

// A strip over a store: the newest three, a repeat folded into its row with a count, the actions the
// server allowed, and every new notice forwarded to whatever toast the app has (here, a line of text).
function seeded() {
  const alerts = createAlertStore()
  alerts.push({ severity: "info", tone: "up", title: "Market data connected" })
  alerts.push({ id: "slow", key: "md:slow", severity: "warning", tone: "stale", title: "Market data slow", message: "1.2 s behind", allowedActions: ["reconnect"] })
  alerts.push({ severity: "fill", tone: "primary", title: "Filled 5mm T 4 1/8 05/34 at 99-16+" })
  alerts.push({ severity: "critical", tone: "destructive", title: "Order rejected", message: "Price away from market", allowedActions: ["ack"] })
  return alerts
}

export default function AlertsDemo() {
  const [alerts] = useState(seeded)
  const [toasted, setToasted] = useState<string[]>([])
  const [acted, setActed] = useState("")
  useToastBridge(alerts, (alert: Alert) => setToasted((list) => [`${alert.severity}: ${alert.title}`, ...list].slice(0, 3)))
  return (
    <div className="w-full grid gap-3 font-(family-name:--tradecn-font-mono) text-xs sm:grid-cols-[1fr_16rem]">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-1">
          <Button type="button" variant="outline" size="sm" onClick={() => alerts.push({ key: "md:slow", severity: "warning", tone: "stale", title: "Market data slow", message: `${(1 + Math.random() * 3).toFixed(1)} s behind`, allowedActions: ["reconnect"] })}>
            slow feed again
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => alerts.push({ severity: "fill", tone: "primary", title: `Filled ${1 + Math.floor(Math.random() * 20)}mm T 4 1/8 05/34` })}>
            a fill
          </Button>
        </div>
        <Alerts alerts={alerts} visible={3} assertive={["critical"]} actions={[{ id: "reconnect", label: "Reconnect", onAction: (a) => setActed(`reconnect: ${a.title}`) }, { id: "ack", label: "Acknowledge", onAction: (a) => setActed(`ack: ${a.title}`) }]} />
        {acted && <p className="text-muted-foreground">{acted}</p>}
      </div>
      <div className="space-y-1 text-muted-foreground">
        <p>what the toast bridge forwarded</p>
        <ul className="space-y-0.5">{toasted.length === 0 ? <li>nothing yet</li> : toasted.map((line, i) => <li key={i}>{line}</li>)}</ul>
      </div>
    </div>
  )
}
