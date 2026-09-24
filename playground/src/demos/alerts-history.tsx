import { useState } from "react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { createAlertStore, type AlertStore } from "@/registry/tradecn/lib/alert-store"
import { useRowIds } from "@/registry/tradecn/hooks/use-row-store"
import { Alerts, AlertsList, AlertsEmpty, AlertsAnnouncer, AlertItem, AlertHeader, AlertTitle, AlertBody, AlertDismiss, AlertHistory, useAlert, useAlertView } from "@/registry/tradecn/ui/alerts"

function Notice({ alerts, id }: { alerts: AlertStore; id: string }) {
  const alert = useAlert(alerts, id)
  if (!alert) return null
  return (
    <AlertItem>
      <AlertHeader>
        <AlertTitle>{alert.title}</AlertTitle>
        <AlertDismiss aria-label={`Dismiss: ${alert.title}`} onClick={() => alerts.dismiss(id)} />
      </AlertHeader>
      <AlertBody>{alert.message}</AlertBody>
    </AlertItem>
  )
}

export default function AlertsHistoryDemo() {
  const [alerts] = useState(() => {
    const store = createAlertStore()
    store.push({ severity: "info", title: "Feed connected", message: "Market data is available." })
    store.push({ severity: "info", title: "Session open", message: "The trading session has begun." })
    store.push({ severity: "fill", title: "Order filled", message: "5mm UST at 99-16+." })
    store.push({ severity: "info", title: "Report ready", message: "The execution report is available." })
    return store
  })
  const ids = useRowIds(useAlertView(alerts))
  const shown = ids.slice(0, 2)
  return (
    <Dialog>
      <Alerts className="w-lg max-w-full">
        <AlertsAnnouncer alerts={alerts} id={shown[0] ?? null} />
        <AlertsList>{shown.map((id) => <Notice key={id} alerts={alerts} id={id} />)}</AlertsList>
        {ids.length === 0 && <AlertsEmpty>No notices.</AlertsEmpty>}
        <div className="flex gap-2">
          {ids.length > shown.length && <DialogTrigger className={buttonVariants({ variant: "outline", size: "sm" })}>{ids.length - shown.length} more</DialogTrigger>}
          {ids.length > 0 && <Button variant="ghost" size="sm" className="ml-auto" onClick={() => alerts.clear()}>Clear all</Button>}
        </div>
      </Alerts>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] min-w-0 flex-col sm:max-w-3xl">
        <DialogHeader className="shrink-0">
          <DialogTitle>Notice history</DialogTitle>
          <DialogDescription>Every notice, newest first.</DialogDescription>
        </DialogHeader>
        <div className="h-80 min-h-0 min-w-0"><AlertHistory alerts={alerts} /></div>
      </DialogContent>
    </Dialog>
  )
}
