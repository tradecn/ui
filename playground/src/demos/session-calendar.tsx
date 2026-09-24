import { createSessionCalendar, zonedInstant } from "@/registry/tradecn/lib/session-calendar"

const calendar = createSessionCalendar({
  zone: "America/New_York",
  sessions: [{ days: [1, 2, 3, 4, 5], open: "09:30", close: "16:00" }],
})
const at = zonedInstant("2026-09-23", "10:00", calendar.zone)
const next = calendar.nextTransition(at)
const left = calendar.timeToClose(at)
const time = new Intl.DateTimeFormat("en-GB", { timeZone: calendar.zone, dateStyle: "short", timeStyle: "short" })

export default function SessionCalendarDemo() {
  return (
    <div className="w-fit max-w-full space-y-2 text-xs lining-nums tabular-nums">
      <p className="text-muted-foreground">Illustrative weekday schedule · {calendar.zone}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt>At</dt><dd>{time.format(at)}</dd>
        <dt>Status</dt><dd>{calendar.status(at)}</dd>
        <dt>Next change</dt><dd>{next ? `${next.status} at ${time.format(next.at)}` : "None"}</dd>
        <dt>To close</dt><dd>{left === null ? "Not open" : `${left / 60_000} min`}</dd>
        <dt>Trading day</dt><dd>{calendar.isTradingDay(at) ? "Yes" : "No"}</dd>
      </dl>
    </div>
  )
}
