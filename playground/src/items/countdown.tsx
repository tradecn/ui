import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Countdown } from "@/registry/tradecn/ui/countdown"

// A deadline the scene owns: when it began, when it ends, and two ways to move it.
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

export function CountdownScene() {
  const long = useDeadline(90)
  const short = useDeadline(15)
  const [over] = useState(() => Date.now() - 1000)
  const [log, setLog] = useState("")
  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6 font-mono text-xs">
      <h1 className="text-sm font-semibold">countdown</h1>
      <p className="text-muted-foreground">
        Digits once a second on one shared clock, a bar the compositor shrinks for exactly the time left. The last ten seconds turn <span className="text-expiring">expiring</span>; zero stays at zero. The third one was over before the page drew it. Nothing here decides anything: the pretend server would say
        when an inquiry ended, and the countdown only shows the time it was given.
      </p>
      <div className="flex flex-wrap items-end gap-6">
        <Countdown expiresAt={long.end} startsAt={long.start} label="Inquiry A" className="text-xl" onExpire={() => setLog("A reached zero")} />
        <Countdown expiresAt={short.end} startsAt={short.start} label="Inquiry B" className="text-xl" onExpire={() => setLog("B reached zero")} />
        <Countdown expiresAt={over} startsAt={over - 30_000} label="Inquiry C" className="text-xl" />
      </div>
      <div className="flex items-baseline gap-3">
        <span className="text-muted-foreground">compact, for a grid cell:</span>
        <Countdown expiresAt={long.end} compact announce={false} />
        <Countdown expiresAt={short.end} compact announce={false} />
        <Countdown expiresAt={over} compact announce={false} />
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => short.extend(30)}>
          Extend B by 30 s
        </Button>
        <Button size="sm" variant="outline" onClick={long.restart}>
          Restart A
        </Button>
      </div>
      <p className="text-muted-foreground" data-countdown-log>
        {log || " "}
      </p>
    </main>
  )
}
