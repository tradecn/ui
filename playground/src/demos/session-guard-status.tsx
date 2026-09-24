import type { Clock } from "@/registry/tradecn/lib/clock"
import { SessionStatus } from "@/registry/tradecn/ui/session-guard"

const NOW = Date.UTC(2026, 8, 23, 12)
const clock: Clock = { now: () => NOW, subscribe: () => () => {} }
const sessions = [
  { name: "Live", expiresAt: NOW + 300_000 },
  { name: "Warning", expiresAt: NOW + 30_000 },
  { name: "Expired", expiresAt: NOW },
  { name: "No session", expiresAt: null },
]

export default function SessionGuardStatusDemo() {
  return (
    <table className="w-fit max-w-full text-xs lining-nums tabular-nums">
      <caption className="caption-bottom pt-3 text-muted-foreground">Fixed clock for comparison</caption>
      <thead><tr><th scope="col" className="pb-2 pr-6 text-left font-normal">Phase</th><th scope="col" className="pb-2 text-left font-normal">Readout</th></tr></thead>
      <tbody>{sessions.map(({ name, expiresAt }) => (
        <tr key={name} className="border-t border-border">
          <th scope="row" className="py-2 pr-6 text-left font-normal">{name}</th>
          <td className="py-2"><SessionStatus expiresAt={expiresAt} clock={clock} /></td>
        </tr>
      ))}</tbody>
    </table>
  )
}
