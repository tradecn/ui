import { useState } from "react"
import { Countdown } from "@/registry/tradecn/ui/countdown"

// An inquiry that ended before the page drew it: the digits hold at zero, the bar is empty, and onExpire
// fires once on mount. The demo only reports the call; the server's word says whether the inquiry is over.
export default function CountdownExpiredDemo() {
  const [over] = useState(() => Date.now() - 1000)
  const [log, setLog] = useState("")
  return (
    <div className="space-y-3 font-(family-name:--tradecn-font-mono) text-xs">
      <Countdown expiresAt={over} startsAt={over - 30_000} label="An earlier inquiry" className="text-xl" onExpire={() => setLog("onExpire fired. Whether the inquiry is over is the server's to say.")} />
      <p className="text-muted-foreground">{log || "Waiting for onExpire."}</p>
    </div>
  )
}
