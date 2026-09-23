import { useState } from "react"
import { Countdown } from "@/registry/tradecn/ui/countdown"

// Three inquiries with the time each has left, the way a stack lists them: the digits alone, no bar, each
// timer named for its row. When one runs out the demo hands its row a fresh deadline, the way the next
// inquiry fills a row on a desk, where the stack takes both from the server.
export default function CountdownCompactDemo() {
  const [inquiries, setInquiries] = useState(() => {
    const now = Date.now()
    return [
      { id: "Q-104", expiresAt: now + 95_000 },
      { id: "Q-105", expiresAt: now + 40_000 },
      { id: "Q-106", expiresAt: now + 12_000 },
    ]
  })
  const renew = (id: string) => setInquiries((rows) => rows.map((row) => (row.id === id ? { ...row, expiresAt: Date.now() + 60_000 } : row)))
  return (
    <ul role="list" aria-label="Inquiries" className="mx-auto w-48 font-(family-name:--tradecn-font-mono) text-xs lining-nums tabular-nums">
      {inquiries.map((inquiry) => (
        <li key={inquiry.id} className="flex items-baseline justify-between border-b py-1 last:border-0">
          <span>{inquiry.id}</span>
          <Countdown expiresAt={inquiry.expiresAt} compact label={`Time left ${inquiry.id}`} onExpire={() => renew(inquiry.id)} />
        </li>
      ))}
    </ul>
  )
}
