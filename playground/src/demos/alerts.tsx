import { useState } from "react"
import { Alerts, AlertsList, AlertsEmpty, AlertItem, AlertHeader, AlertTitle, AlertBody, AlertSeverity, AlertDismiss } from "@/registry/tradecn/ui/alerts"

const initial = [
  { id: "fill", severity: "fill", title: "Order filled", message: "5mm UST at 99-16+" },
  { id: "feed", severity: "info", title: "Feed connected", message: "Market data is available." },
]

export default function AlertsDemo() {
  const [notices, setNotices] = useState(initial)
  return (
    <>
      <div data-demo-controls className="text-xs">
        <button type="button" className="rounded border border-border px-2 py-1" onClick={() => setNotices(initial)}>Restore notices</button>
      </div>
      <Alerts className="w-lg max-w-full">
        <AlertsList>
          {notices.map((notice) => (
            <AlertItem key={notice.id}>
              <AlertHeader>
                <AlertSeverity>{notice.severity}</AlertSeverity>
                <AlertTitle>{notice.title}</AlertTitle>
                <AlertDismiss aria-label={`Dismiss: ${notice.title}`} onClick={() => setNotices((rows) => rows.filter((row) => row.id !== notice.id))} />
              </AlertHeader>
              <AlertBody>{notice.message}</AlertBody>
            </AlertItem>
          ))}
        </AlertsList>
        {notices.length === 0 && <AlertsEmpty>No notices.</AlertsEmpty>}
      </Alerts>
    </>
  )
}
