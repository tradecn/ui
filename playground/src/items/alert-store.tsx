import { useState } from "react"
import { useRowIds, useStoreMeta } from "@/registry/tradecn/hooks/use-row-store"
import { createAlertStore, type AlertStore, type AlertTone } from "@/registry/tradecn/lib/alert-store"

// The store as a table, with the knobs: the cap, a burst that repeats keys, and the row store's own meta
// underneath so the lane and the batch count show what one push costs.

const TONES: AlertTone[] = ["up", "down", "flat", "stale", "expiring", "primary", "destructive"]

function seeded(max: number): AlertStore {
  const alerts = createAlertStore({ max })
  alerts.push({ severity: "info", tone: "up", title: "Market data connected" })
  alerts.push({ key: "md:slow", severity: "warning", tone: "stale", title: "Market data slow", message: "1.2 s behind", allowedActions: ["reconnect"] })
  alerts.push({ severity: "fill", tone: "primary", title: "Filled 5mm" })
  return alerts
}

export function AlertStoreScene() {
  const [max, setMax] = useState(8)
  const [alerts, setAlerts] = useState(() => seeded(8))
  const ids = useRowIds(alerts.store)
  const meta = useStoreMeta(alerts.store)
  const rows = alerts.list()
  const burst = (n: number) => {
    for (let i = 0; i < n; i++) {
      const feed = ["CME", "CBOT", "Eurex"][i % 3]!
      if (i % 4 === 0) alerts.push({ severity: "fill", tone: "primary", title: `Filled ${1 + (i % 9)}mm` })
      else alerts.push({ key: `${feed}:slow`, severity: "warning", tone: "stale", title: `${feed} slow`, message: `${(0.5 + (i % 7) * 0.4).toFixed(1)} s behind`, allowedActions: ["reconnect"] })
    }
  }
  return (
    <main className="mx-auto max-w-5xl space-y-3 p-6 font-(family-name:--tradecn-font-mono) text-xs lining-nums tabular-nums">
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-sm font-semibold">alert-store</h1>
        <span className="text-muted-foreground">A store for notices: repeats fold by key, a cap lets the oldest plain notice go first, and a push is one batch on the ordered lane.</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="rounded border border-border px-2 py-0.5" onClick={() => burst(20)}>
          burst of 20 (three keys and some fills)
        </button>
        <button type="button" className="rounded border border-border px-2 py-0.5" onClick={() => alerts.push({ severity: "critical", tone: "destructive", title: "Order rejected", message: "Price away from market", allowedActions: ["ack"] })}>
          a rejection
        </button>
        <button type="button" className="rounded border border-border px-2 py-0.5" onClick={() => alerts.clear()}>
          clear
        </button>
        <label className="flex items-center gap-1 text-muted-foreground">
          cap
          <input
            type="number"
            min={1}
            max={100}
            value={max}
            className="w-14 rounded border border-border bg-background px-1"
            onChange={(e) => {
              const next = Math.max(1, Number(e.target.value) || 1)
              setMax(next)
              setAlerts(seeded(next))
            }}
          />
        </label>
        <span className="ml-auto text-muted-foreground" data-alert-store-meta>
          {ids.length} rows · lane {meta.lane} · batch {meta.version} · seq {meta.seq ?? "–"}
        </span>
      </div>
      <table className="w-full">
        <thead className="text-muted-foreground">
          <tr>
            <th className="py-1 text-left font-medium">id</th>
            <th className="py-1 text-left font-medium">key</th>
            <th className="py-1 text-left font-medium">severity</th>
            <th className="py-1 text-left font-medium">tone</th>
            <th className="py-1 text-left font-medium">title</th>
            <th className="py-1 text-left font-medium">message</th>
            <th className="py-1 text-right font-medium">count</th>
            <th className="py-1 text-left font-medium">actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((alert) => (
            <tr key={alert.id} className="border-t border-border" data-alert-row={alert.id}>
              <td className="py-1 text-muted-foreground">{alert.id.slice(-6)}</td>
              <td className="py-1 text-muted-foreground">{alert.key ?? ""}</td>
              <td className="py-1">{alert.severity}</td>
              <td className="py-1 text-muted-foreground">{alert.tone ?? TONES[0]}</td>
              <td className="py-1">{alert.title}</td>
              <td className="py-1 text-muted-foreground">{alert.message ?? ""}</td>
              <td className="py-1 text-right">{alert.count}</td>
              <td className="py-1 text-muted-foreground">{alert.allowedActions?.join(", ") ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}
