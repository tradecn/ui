import { useState } from "react"
import { createAlertStore } from "@/registry/tradecn/lib/alert-store"

export default function AlertStoreDemo() {
  const [result] = useState(() => {
    const alerts = createAlertStore()
    const first = alerts.push({ key: "md:slow", severity: "warning", title: "Feed slow", message: "1.2 s behind" })
    const repeat = alerts.push({ key: "md:slow", severity: "critical", title: "Feed slow", message: "4 s behind" })
    return { repeat, size: alerts.size(), sameId: first.id === repeat.id }
  })
  return (
    <div className="w-fit max-w-full space-y-2 text-xs lining-nums tabular-nums">
      <p className="text-muted-foreground">After two pushes with the key md:slow</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt>Rows</dt><dd>{result.size}</dd>
        <dt>Same id</dt><dd>{result.sameId ? "Yes" : "No"}</dd>
        <dt>Count</dt><dd>{result.repeat.count}</dd>
        <dt>Severity</dt><dd>{result.repeat.severity}</dd>
        <dt>Message</dt><dd>{result.repeat.message}</dd>
      </dl>
    </div>
  )
}
