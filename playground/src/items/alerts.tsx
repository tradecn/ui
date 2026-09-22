import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { createAlertStore, type Alert, type AlertTone } from "@/registry/tradecn/lib/alert-store"
import { AlertList, Alerts, useToastBridge } from "@/registry/tradecn/ui/alerts"

// The close: a burst of events into the store, most of them folding into a few rows by key, the strip
// showing the newest three, the whole list beside it as a grid, and the toast bridge counting what it
// forwarded. Turn the burst on and watch the count on a row climb instead of the screen filling.

const FEEDS = ["CME", "CBOT", "Eurex", "ICE"]
const KINDS: { severity: string; tone: AlertTone; title: (feed: string) => string; key?: (feed: string) => string; actions?: string[]; message?: () => string }[] = [
  { severity: "warning", tone: "stale", title: (f) => `${f} slow`, key: (f) => `${f}:slow`, actions: ["reconnect"], message: () => `${(0.5 + Math.random() * 3).toFixed(1)} s behind` },
  { severity: "info", tone: "flat", title: (f) => `${f} reconnected`, key: (f) => `${f}:reconnected` },
  { severity: "fill", tone: "primary", title: () => `Filled ${1 + Math.floor(Math.random() * 20)}mm T 4 1/8 05/34` },
  { severity: "critical", tone: "destructive", title: () => "Order rejected", message: () => "Price away from market", actions: ["ack"] },
  { severity: "gap", tone: "expiring", title: (f) => `${f} sequence gap`, key: (f) => `${f}:gap`, actions: ["resubscribe"], message: () => `${1 + Math.floor(Math.random() * 40)} messages` },
]

function seeded() {
  const alerts = createAlertStore({ max: 200 })
  alerts.push({ severity: "info", tone: "up", title: "CME connected", meta: { feed: "CME" } })
  alerts.push({ key: "CBOT:slow", severity: "warning", tone: "stale", title: "CBOT slow", message: "1.2 s behind", allowedActions: ["reconnect"], meta: { feed: "CBOT" } })
  alerts.push({ severity: "fill", tone: "primary", title: "Filled 5mm T 4 1/8 05/34" })
  alerts.push({ severity: "critical", tone: "destructive", title: "Order rejected", message: "Price away from market", allowedActions: ["ack"] })
  return alerts
}

export function AlertsScene() {
  const [alerts] = useState(seeded)
  const [burst, setBurst] = useState(false)
  const [visible, setVisible] = useState(3)
  const [ttl, setTtl] = useState<number | undefined>(undefined)
  const [forwarded, setForwarded] = useState(0)
  const [acted, setActed] = useState("")
  useToastBridge(alerts, () => setForwarded((n) => n + 1))
  useEffect(() => {
    if (!burst) return
    const timer = setInterval(() => {
      const kind = KINDS[Math.floor(Math.random() * KINDS.length)]!
      const feed = FEEDS[Math.floor(Math.random() * FEEDS.length)]!
      alerts.push({ severity: kind.severity, tone: kind.tone, title: kind.title(feed), key: kind.key?.(feed), message: kind.message?.(), allowedActions: kind.actions, meta: { feed } })
    }, 120)
    return () => clearInterval(timer)
  }, [burst, alerts])
  const act = (what: string) => (a: Alert) => setActed(`${what} on ${a.title}`)
  return (
    <main className="flex h-screen flex-col gap-3 p-4 font-(family-name:--tradecn-font-mono) text-xs">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-sm font-semibold">alerts</h1>
        <span className="text-muted-foreground">A burst of events folds into a few rows by key. The strip never takes focus; the list is the same store as a grid.</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant={burst ? "secondary" : "outline"} size="sm" onClick={() => setBurst((b) => !b)}>
          {burst ? "stop the burst" : "start a burst (8 events a second)"}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => alerts.push({ severity: "critical", tone: "destructive", title: "Order rejected", message: "Price away from market", allowedActions: ["ack"] })}>
          a rejection
        </Button>
        <label className="flex items-center gap-1 text-muted-foreground">
          visible
          <input type="number" min={1} max={10} value={visible} className="w-12 rounded border border-border bg-background px-1" onChange={(e) => setVisible(Math.max(1, Number(e.target.value) || 1))} />
        </label>
        <label className="flex items-center gap-1 text-muted-foreground">
          <input type="checkbox" checked={ttl !== undefined} onChange={(e) => setTtl(e.target.checked ? 8_000 : undefined)} />
          dismiss plain notices after 8 s
        </label>
        <span className="ml-auto text-muted-foreground">
          forwarded to the toast: {forwarded} · {acted || "no action yet"}
        </span>
      </div>
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[28rem_1fr]">
        <Alerts alerts={alerts} visible={visible} ttlMs={ttl} assertive={["critical"]} actions={[{ id: "reconnect", label: "Reconnect", onAction: act("reconnect") }, { id: "resubscribe", label: "Resubscribe", onAction: act("resubscribe") }, { id: "ack", label: "Acknowledge", onAction: act("ack") }]} className="self-start" />
        <div className="min-h-0">
          <AlertList alerts={alerts} label="Every notice" />
        </div>
      </div>
    </main>
  )
}
