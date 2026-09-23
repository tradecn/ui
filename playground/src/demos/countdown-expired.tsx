import { useState } from "react"
import { Countdown } from "@/registry/tradecn/ui/countdown"

// An inquiry that ended before the page drew it: the digits hold at zero, the bar is empty, and onExpire
// fires once on mount. The demo counts the calls; a desk reads the server's status instead.
export default function CountdownExpiredDemo() {
  const [over] = useState(() => Date.now() - 1000)
  const [calls, setCalls] = useState(0)
  return (
    <div className="flex flex-col items-center gap-3 font-(family-name:--tradecn-font-mono) text-xs lining-nums tabular-nums">
      <Countdown expiresAt={over} startsAt={over - 30_000} label="An earlier inquiry" className="text-xl" onExpire={() => setCalls((n) => n + 1)} />
      <p className="text-muted-foreground">
        onExpire fired {calls} {calls === 1 ? "time" : "times"}
      </p>
    </div>
  )
}
