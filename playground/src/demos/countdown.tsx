import { useState } from "react"
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

// The buttons drive the deadline and are the demo's, not the countdown's: the preview frame sets them in a bar
// along its top edge, apart from the component, and on a page of your own they are two plain buttons.
export default function CountdownDemo() {
  const inquiry = useDeadline(30)
  return (
    <>
      <div data-demo-controls className="flex flex-wrap gap-2 font-(family-name:--tradecn-font-mono) text-xs lining-nums tabular-nums">
        <button type="button" className="rounded-md border border-border px-2 py-1" onClick={() => inquiry.extend(15)}>
          Extend by 15 s
        </button>
        <button type="button" className="rounded-md border border-border px-2 py-1" onClick={inquiry.restart}>
          Start again
        </button>
      </div>
      <Countdown expiresAt={inquiry.end} startsAt={inquiry.start} label="Inquiry" className="font-(family-name:--tradecn-font-mono) text-xl" />
    </>
  )
}
