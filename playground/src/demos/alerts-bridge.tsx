import { useState } from "react"
import { createAlertStore } from "@/registry/tradecn/lib/alert-store"
import { Alerts, useToastBridge } from "@/registry/tradecn/ui/alerts"

export default function AlertsBridgeDemo() {
  const [alerts] = useState(() => {
    const store = createAlertStore()
    store.push({ severity: "info", title: "Feed connected" })
    return store
  })
  const [forwarded, setForwarded] = useState({ count: 0, title: "None yet" })
  useToastBridge(alerts, (alert) => setForwarded((previous) => ({ count: previous.count + 1, title: alert.title })))

  return (
    <>
      <div data-demo-controls className="text-xs">
        <button type="button" className="rounded border border-border px-2 py-1" onClick={() => alerts.push({ key: "feed:slow", severity: "warning", tone: "stale", title: "Feed slow", message: "1.2 s behind" })}>Receive slow notice</button>
      </div>
      <div className="w-lg max-w-full space-y-3 text-xs lining-nums tabular-nums">
        <Alerts alerts={alerts} />
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt>Forwarded</dt><dd>{forwarded.count}</dd>
          <dt>Last forwarded</dt><dd>{forwarded.title}</dd>
        </dl>
      </div>
    </>
  )
}
