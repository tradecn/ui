import { useState } from "react"
import { Countdown } from "@/registry/tradecn/ui/countdown"

// One deadline four minutes out under two ideas of soon: the default's ten seconds, and a desk that counts
// the last five minutes as soon, so its countdown turns from the start.
export default function CountdownThresholdsDemo() {
  const [start] = useState(() => Date.now())
  const end = start + 4 * 60_000
  return (
    <div className="flex flex-wrap gap-8 font-(family-name:--tradecn-font-mono) text-xs">
      <div className="space-y-1">
        <Countdown expiresAt={end} startsAt={start} label="Inquiry, soon at ten seconds" className="text-xl" />
        <p className="text-muted-foreground">the default, soonMs 10_000</p>
      </div>
      <div className="space-y-1">
        <Countdown expiresAt={end} startsAt={start} thresholds={{ soonMs: 5 * 60_000 }} label="Inquiry, soon at five minutes" className="text-xl" />
        <p className="text-muted-foreground">soonMs 300_000</p>
      </div>
    </div>
  )
}
