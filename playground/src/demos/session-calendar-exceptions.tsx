import { createSessionCalendar, zonedInstant } from "@/registry/tradecn/lib/session-calendar"

// Illustrative dates, not a venue's published schedule.
const calendar = createSessionCalendar({
  zone: "America/New_York",
  sessions: [{ days: [1, 2, 3, 4, 5], open: "09:30", close: "16:00", pre: "04:00", post: "20:00" }],
  holidays: ["2026-09-24"],
  earlyCloses: [{ date: "2026-09-25", close: "13:00" }],
})
const moments = [
  { date: "2026-09-23", time: "09:00" },
  { date: "2026-09-23", time: "13:30" },
  { date: "2026-09-24", time: "13:30" },
  { date: "2026-09-25", time: "12:30" },
  { date: "2026-09-25", time: "13:30" },
  { date: "2026-09-26", time: "13:30" },
]

export default function SessionCalendarExceptionsDemo() {
  return (
    <div role="region" aria-label="Calendar exceptions" tabIndex={0} className="w-fit max-w-full overflow-x-auto rounded border border-border text-xs lining-nums tabular-nums">
      <table className="border-collapse text-left whitespace-nowrap">
        <caption className="p-2 text-left text-muted-foreground">Illustrative schedule · {calendar.zone}</caption>
        <thead><tr className="border-b border-border">
          <th scope="col" className="px-2 py-1 font-medium">Local date and time</th>
          <th scope="col" className="px-2 py-1 font-medium">Status</th>
          <th scope="col" className="px-2 py-1 font-medium">To close</th>
          <th scope="col" className="px-2 py-1 font-medium">Trading day</th>
        </tr></thead>
        <tbody>{moments.map(({ date, time }) => {
          const at = zonedInstant(date, time, calendar.zone)
          const left = calendar.timeToClose(at)
          return (
            <tr key={`${date} ${time}`} className="border-b border-border last:border-0">
              <th scope="row" className="px-2 py-1 font-normal">{date} {time}</th>
              <td className="px-2 py-1">{calendar.status(at)}</td>
              <td className="px-2 py-1">{left === null ? "Not open" : `${left / 60_000} min`}</td>
              <td className="px-2 py-1">{calendar.isTradingDay(date) ? "Yes" : "No"}</td>
            </tr>
          )
        })}</tbody>
      </table>
    </div>
  )
}
