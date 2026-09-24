import { useState } from "react"
import { createAlertStore, type Alert, type AlertInput, type AlertStore } from "@/registry/tradecn/lib/alert-store"
import { useRowIds } from "@/registry/tradecn/hooks/use-row-store"
import { Alerts, AlertsList, AlertsEmpty, AlertsAnnouncer, AlertItem, AlertHeader, AlertTitle, AlertBody, AlertSeverity, AlertActions, AlertAction, AlertDismiss, useAlert, useAlertView } from "@/registry/tradecn/ui/alerts"

const slow: AlertInput = { key: "feed:slow", severity: "warning", tone: "stale", title: "Feed slow", message: "Market data is 1.2 seconds behind. Reconnect to request a fresh subscription.", allowedActions: ["reconnect"] }
const rejected: AlertInput = { key: "order:rejected", severity: "critical", tone: "destructive", title: "Order rejected", message: "Price away from market. Review the order before submitting again.", allowedActions: ["ack"] }

function Notice({ alerts, id, onAction }: { alerts: AlertStore; id: string; onAction: (action: string, alert: Alert) => void }) {
  const alert = useAlert(alerts, id)
  if (!alert) return null
  return (
    <AlertItem tone={alert.tone}>
      <AlertHeader>
        <AlertTitle>{alert.title}</AlertTitle>
        <AlertSeverity tone={alert.tone}>{alert.severity}</AlertSeverity>
      </AlertHeader>
      <AlertBody>
        <p>{alert.message}</p>
        <p className="mt-1">Received {alert.count} {alert.count === 1 ? "time" : "times"}.</p>
      </AlertBody>
      <AlertActions>
        <AlertAction alert={alert} action="reconnect" onAction={(row) => onAction("Reconnect requested", row)}>Reconnect</AlertAction>
        <AlertAction alert={alert} action="ack" onAction={(row) => onAction("Acknowledged", row)}>Acknowledge</AlertAction>
        <AlertDismiss className="ml-auto" aria-label={`Dismiss: ${alert.title}`} onClick={() => alerts.dismiss(id)}>Dismiss</AlertDismiss>
      </AlertActions>
    </AlertItem>
  )
}

export default function AlertsActionsDemo() {
  const [alerts] = useState(() => {
    const store = createAlertStore()
    store.push(slow)
    store.push(rejected)
    return store
  })
  const ids = useRowIds(useAlertView(alerts))
  const [acted, setActed] = useState("No action yet")
  const onAction = (action: string, alert: Alert) => {
    setActed(`${action}: ${alert.title}`)
    alerts.dismiss(alert.id)
  }
  return (
    <>
      <div data-demo-controls className="flex flex-wrap gap-2 text-xs">
        <button type="button" className="rounded border border-border px-2 py-1" onClick={() => alerts.push(slow)}>Receive slow feed</button>
        <button type="button" className="rounded border border-border px-2 py-1" onClick={() => alerts.push(rejected)}>Receive rejection</button>
      </div>
      <div className="flex w-lg max-w-full flex-col gap-3 text-xs">
        <Alerts>
          <AlertsAnnouncer alerts={alerts} id={ids[0] ?? null} assertive={["critical"]} />
          <AlertsList>{ids.map((id) => <Notice key={id} alerts={alerts} id={id} onAction={onAction} />)}</AlertsList>
          {ids.length === 0 && <AlertsEmpty>No notices.</AlertsEmpty>}
        </Alerts>
        <p role="status">{acted}</p>
      </div>
    </>
  )
}
