import { useState } from "react"
import { Button } from "@/components/ui/button"
import { useRowIds } from "@/registry/tradecn/hooks/use-row-store"
import { createAlertStore, type AlertStore } from "@/registry/tradecn/lib/alert-store"

// The store on its own: push a notice, push a repeat by its key and watch one row's count climb, push
// past the cap and watch the oldest plain notice go while the one with an action stays.
function seeded(): AlertStore {
  const alerts = createAlertStore({ max: 5 })
  alerts.push({ severity: "info", title: "Market data connected" })
  alerts.push({ key: "md:slow", severity: "warning", title: "Market data slow", message: "1.2 s behind", allowedActions: ["reconnect"] })
  alerts.push({ severity: "fill", title: "Filled 5mm" })
  return alerts
}

export default function AlertStoreDemo() {
  const [alerts] = useState(seeded)
  const ids = useRowIds(alerts.store)
  const rows = alerts.list()
  return (
    <div className="space-y-2 font-(family-name:--tradecn-font-mono) text-xs lining-nums tabular-nums">
      <div className="flex flex-wrap gap-1">
        <Button type="button" variant="outline" size="sm" onClick={() => alerts.push({ key: "md:slow", severity: "warning", title: "Market data slow", message: `${(1 + Math.random() * 3).toFixed(1)} s behind`, allowedActions: ["reconnect"] })}>
          slow again (same key)
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => alerts.push({ severity: "fill", title: `Filled ${1 + Math.floor(Math.random() * 20)}mm` })}>
          a fill (new row)
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => alerts.clear()}>
          clear
        </Button>
      </div>
      <p className="text-muted-foreground">
        {ids.length} of at most 5 rows. The slow feed keeps one row however often it repeats; past the cap the oldest fill goes first, and the slow feed, which has an action, stays.
      </p>
      <table className="w-full">
        <thead className="text-muted-foreground">
          <tr>
            <th className="py-1 text-left font-medium">severity</th>
            <th className="py-1 text-left font-medium">title</th>
            <th className="py-1 text-left font-medium">message</th>
            <th className="py-1 text-right font-medium">count</th>
            <th className="py-1 text-left font-medium">actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((alert) => (
            <tr key={alert.id} className="border-t border-border">
              <td className="py-1">{alert.severity}</td>
              <td className="py-1">{alert.title}</td>
              <td className="py-1 text-muted-foreground">{alert.message ?? ""}</td>
              <td className="py-1 text-right">{alert.count}</td>
              <td className="py-1 text-muted-foreground">{alert.allowedActions?.join(", ") ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
