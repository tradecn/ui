import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Countdown } from "@/registry/tradecn/ui/countdown"

// A deadline the demo owns: when it began, when it ends, and two ways to move it. The countdown only shows it.
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
  const inquiry = useDeadline(30)
  return (
    <div className="flex flex-wrap items-end gap-6 font-(family-name:--tradecn-font-mono) text-xs">
      <Countdown expiresAt={inquiry.end} startsAt={inquiry.start} label="Inquiry" className="text-xl" />
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => inquiry.extend(15)}>
          Extend by 15 s
        </Button>
        <Button size="sm" variant="outline" onClick={inquiry.restart}>
          Start again
        </Button>
      </div>
    </div>
  )
}
