import { useMemo } from "react"
import { createAlertStore } from "@/lib/alert-store"

// A lib has no element of its own; the scene wraps a fold and a cap in the slot the smoke test counts.
export function AlertStoreScene() {
  const text = useMemo(() => {
    const alerts = createAlertStore({ max: 3 })
    alerts.push({ severity: "info", title: "plain" })
    alerts.push({ key: "k", severity: "warning", title: "keyed", allowedActions: ["ack"] })
    alerts.push({ key: "k", severity: "warning", title: "keyed" })
    alerts.push({ severity: "fill", title: "fill 1" })
    alerts.push({ severity: "fill", title: "fill 2" })
    return alerts
      .list()
      .map((alert) => `${alert.title}×${alert.count}`)
      .join(" ")
  }, [])
  return (
    <div data-slot="tradecn-alert-store" className="text-xs lining-nums tabular-nums">
      {text}
    </div>
  )
}
