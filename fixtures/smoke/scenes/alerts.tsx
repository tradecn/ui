import { useState } from "react"
import { Alerts, AlertsList, AlertsEmpty, AlertsAnnouncer, AlertItem, AlertHeader, AlertTitle, AlertBody, AlertSeverity, AlertActions, AlertAction, AlertDismiss, AlertHistory, useAlert, useAlertView } from "@/components/ui/alerts"
import { createAlertStore, type Alert, type AlertStore } from "@/lib/alert-store"

import { useRowIds } from "@/hooks/use-row-store"
import { Button, buttonVariants } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"

type NoticeAction = { id: string; label: string; onAction: (alert: Alert) => void }

function Notice({ alerts, id, actions, ttlMs }: { alerts: AlertStore; id: string; actions: NoticeAction[]; ttlMs?: number }) {
  const alert = useAlert(alerts, id, { ttlMs })
  if (!alert) return null
  return (
    <AlertItem tone={alert.tone} data-alert-id={id} data-severity={alert.severity}>
      <AlertHeader>
        <AlertSeverity tone={alert.tone}>{alert.severity}</AlertSeverity>
        <AlertTitle>{alert.title}</AlertTitle>
        {alert.count > 1 && <span className="text-muted-foreground" data-alert-count={alert.count}>×{alert.count}</span>}
        <AlertDismiss aria-label={`Dismiss: ${alert.title}`} onClick={() => alerts.dismiss(id)} />
      </AlertHeader>
      {alert.message && <AlertBody>{alert.message}</AlertBody>}
      <AlertActions>{actions.map((action) => <AlertAction key={action.id} alert={alert} action={action.id} onAction={action.onAction}>{action.label}</AlertAction>)}</AlertActions>
    </AlertItem>
  )
}

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
  const ids = useRowIds(useAlertView(alerts))
  const [acted, setActed] = useState("")
  return (
    <div className="w-[36rem]" data-alerts-acted={acted}>
      <button type="button" className="mb-1 rounded border border-border px-2" onClick={() => alerts.push({ key: "md:slow", severity: "warning", tone: "stale", title: "Market data slow", message: "2.0 s behind", allowedActions: ["reconnect"] })}>
        slow feed again
      </button>
      <Dialog>
        <Alerts data-count={ids.length}>
          <AlertsAnnouncer alerts={alerts} id={ids[0] ?? null} assertive={["critical"]} />
          <AlertsList>{ids.slice(0, 3).map((id) => <Notice key={id} alerts={alerts} id={id} actions={[{ id: "reconnect", label: "Reconnect", onAction: (a) => setActed(`reconnect:${a.id}`) }, { id: "ack", label: "Acknowledge", onAction: (a) => setActed(`ack:${a.id}`) }]} />)}</AlertsList>
          {ids.length === 0 && <AlertsEmpty>No notices.</AlertsEmpty>}
          <div className="flex gap-2">
            {ids.length > 3 && <DialogTrigger className={buttonVariants({ variant: "ghost", size: "sm" })}>{ids.length - 3} more</DialogTrigger>}
            {ids.length > 0 && <Button variant="ghost" size="sm" onClick={() => alerts.clear()}>Clear all</Button>}
          </div>
        </Alerts>
        <DialogContent className="min-w-0 sm:max-w-3xl">
          <DialogHeader><DialogTitle>All notices</DialogTitle><DialogDescription>Every notice, newest first.</DialogDescription></DialogHeader>
          <div className="h-80 min-w-0"><AlertHistory alerts={alerts} /></div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
