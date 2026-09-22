import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Countdown } from "@/registry/tradecn/ui/countdown"

// A deadline the demo owns: when it began, when it ends, and a way to move it. The countdown only shows it.
function useDeadline(seconds: number) {
  const [start, setStart] = useState(() => Date.now())
  const [end, setEnd] = useState(() => Date.now() + seconds * 1000)
  return {
    start,
    end,
    extend: (s: number) => setEnd((e) => Math.max(e, Date.now()) + s * 1000),
    restart: () => {
      const now = Date.now()
      setStart(now)
      setEnd(now + seconds * 1000)
    },
  }
}

export default function CountdownDemo() {
  const inquiry = useDeadline(20)
  const [over] = useState(() => Date.now() - 1000)
  const [log, setLog] = useState("")
  return (
    <div className="space-y-4 font-mono text-xs">
      <div className="flex flex-wrap items-end gap-6">
        <Countdown expiresAt={inquiry.end} startsAt={inquiry.start} label="Inquiry" className="text-xl" onExpire={() => setLog("The digits reached zero. Whether the inquiry is over is the server's to say.")} />
        <Countdown expiresAt={over} startsAt={over - 30_000} label="An earlier inquiry" className="text-xl" />
        <span className="flex items-baseline gap-2 text-muted-foreground">
          compact
          <Countdown expiresAt={inquiry.end} compact announce={false} />
        </span>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => inquiry.extend(15)}>
          Extend by 15 s
        </Button>
        <Button size="sm" variant="outline" onClick={inquiry.restart}>
          Start again
        </Button>
      </div>
      <p className="text-muted-foreground">{log || "The last ten seconds turn. Zero stays at zero."}</p>
    </div>
  )
}
