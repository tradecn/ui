import { useState } from "react"
import { Countdown } from "@/registry/tradecn/ui/countdown"

// Three inquiries with the time each has left, the way a stack lists them: the digits alone, no bar, each
// timer named for its row, and quiet, since the stack speaks for its rows.
export default function CountdownCompactDemo() {
  const [now] = useState(() => Date.now())
  const inquiries = [
    { id: "Q-104", expiresAt: now + 95_000 },
    { id: "Q-105", expiresAt: now + 40_000 },
    { id: "Q-106", expiresAt: now + 12_000 },
  ]
  return (
    <ul className="w-48 font-(family-name:--tradecn-font-mono) text-xs" aria-label="Inquiries">
      {inquiries.map((inquiry) => (
        <li key={inquiry.id} className="flex items-baseline justify-between border-b py-1 last:border-0">
          <span>{inquiry.id}</span>
          <Countdown expiresAt={inquiry.expiresAt} compact announce={false} label={`Time left ${inquiry.id}`} />
        </li>
      ))}
    </ul>
  )
}
