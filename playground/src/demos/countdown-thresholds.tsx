import { useState } from "react"
import { Countdown } from "@/registry/tradecn/ui/countdown"

// One deadline under two ideas of soon: the default's ten seconds, and a desk that counts the last thirty
// seconds as soon, so its countdown turns first. When the deadline passes the demo starts it over.
function useDeadline(seconds: number) {
  const [start, setStart] = useState(() => Date.now())
  return { start, end: start + seconds * 1000, restart: () => setStart(Date.now()) }
}

export default function CountdownThresholdsDemo() {
  const deadline = useDeadline(45)
  return (
    <div className="flex flex-wrap gap-8 font-(family-name:--tradecn-font-mono) text-xs lining-nums tabular-nums">
      <div className="space-y-1">
        <Countdown expiresAt={deadline.end} startsAt={deadline.start} label="Inquiry, soon at ten seconds" className="text-xl" onExpire={deadline.restart} />
        <p className="text-muted-foreground">soon at ten seconds, the default</p>
      </div>
      <div className="space-y-1">
        <Countdown expiresAt={deadline.end} startsAt={deadline.start} thresholds={{ soonMs: 30_000 }} label="Inquiry, soon at thirty seconds" className="text-xl" />
        <p className="text-muted-foreground">soon at thirty seconds</p>
      </div>
    </div>
  )
}
