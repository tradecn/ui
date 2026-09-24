import { useState } from "react"
import { createAlertStore, type AlertStore } from "@/registry/tradecn/lib/alert-store"
import { useRowIds } from "@/registry/tradecn/hooks/use-row-store"
import { Alerts, AlertsList, AlertsEmpty, AlertItem, AlertHeader, AlertTitle, AlertBody, AlertDismiss, useAlert, useAlertView, useToastBridge } from "@/registry/tradecn/ui/alerts"

function Notice({ alerts, id }: { alerts: AlertStore; id: string }) {
  const alert = useAlert(alerts, id)
  if (!alert) return null
  return (
    <AlertItem>
      <AlertHeader>
        <AlertTitle>{alert.title}</AlertTitle>
        <AlertDismiss aria-label={`Dismiss: ${alert.title}`} onClick={() => alerts.dismiss(id)} />
      </AlertHeader>
      <AlertBody>{alert.message} Received {alert.count} {alert.count === 1 ? "time" : "times"}.</AlertBody>
    </AlertItem>
  )
}

export default function AlertsBridgeDemo() {
  const [alerts] = useState(() => {
    const store = createAlertStore()
    store.push({ severity: "info", title: "Feed connected" })
    return store
  })
  const ids = useRowIds(useAlertView(alerts))
  const [forwarded, setForwarded] = useState({ count: 0, title: "None yet" })
  useToastBridge(alerts, (alert) => setForwarded((previous) => ({ count: previous.count + 1, title: alert.title })))
  return (
    <>
      <div data-demo-controls className="text-xs">
        <button type="button" className="rounded border border-border px-2 py-1" onClick={() => alerts.push({ key: "feed:slow", severity: "warning", title: "Feed slow", message: "1.2 s behind." })}>Receive slow notice</button>
      </div>
      <div className="flex w-lg max-w-full flex-col gap-3 text-xs lining-nums tabular-nums">
        <Alerts>
          <AlertsList>{ids.map((id) => <Notice key={id} alerts={alerts} id={id} />)}</AlertsList>
          {ids.length === 0 ? <AlertsEmpty>No notices.</AlertsEmpty> : <button type="button" className="self-end rounded border border-border px-2 py-1" onClick={() => alerts.clear()}>Clear all</button>}
        </Alerts>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt>Forwarded</dt><dd>{forwarded.count}</dd>
          <dt>Last forwarded</dt><dd>{forwarded.title}</dd>
        </dl>
      </div>
    </>
  )
}
