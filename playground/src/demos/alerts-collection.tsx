import { useRef, useState } from "react"
import { Alerts, AlertsList, AlertsEmpty, AlertItem, AlertHeader, AlertTitle, AlertBody, AlertSeverity, AlertDismiss } from "@/registry/tradecn/ui/alerts"

const initial = [
  { id: "fill", severity: "fill", title: "Order filled", message: "5mm UST at 99-16+" },
  { id: "feed", severity: "info", title: "Feed connected", message: "Market data is available." },
]

export default function AlertsCollectionDemo() {
  const [notices, setNotices] = useState(initial)
  // Removal never moves focus, so the dismiss handler does: the next notice's dismiss, or
  // Restore notices when the list empties.
  const region = useRef<HTMLDivElement>(null)
  const restore = useRef<HTMLButtonElement>(null)
  const refocus = () => queueMicrotask(() => (region.current?.querySelector<HTMLElement>("[data-slot='tradecn-alert-dismiss']") ?? restore.current)?.focus())
  return (
    <>
      <div data-demo-controls className="text-xs">
        <button ref={restore} type="button" className="rounded border border-border px-2 py-1" onClick={() => setNotices(initial)}>Restore notices</button>
      </div>
      <Alerts ref={region} className="w-lg max-w-full">
        {notices.length > 0 && <AlertsList>
          {notices.map((notice) => (
            <AlertItem key={notice.id}>
              <AlertHeader>
                <AlertSeverity>{notice.severity}</AlertSeverity>
                <AlertTitle>{notice.title}</AlertTitle>
                <AlertDismiss aria-label={`Dismiss: ${notice.title}`} onClick={() => { setNotices((rows) => rows.filter((row) => row.id !== notice.id)); refocus() }} />
              </AlertHeader>
              <AlertBody>{notice.message}</AlertBody>
            </AlertItem>
          ))}
        </AlertsList>}
        {notices.length === 0 && <AlertsEmpty>No notices.</AlertsEmpty>}
      </Alerts>
    </>
  )
}
