import { createSessionCalendar, zonedInstant } from "@/lib/session-calendar"

// A lib has no element of its own; the scene wraps five readings of one calendar in the slot the smoke test counts.
const cash = createSessionCalendar({
  zone: "America/New_York",
  sessions: [{ days: [1, 2, 3, 4, 5], open: "09:30", close: "16:00", pre: "04:00", post: "20:00" }],
  holidays: ["2026-09-07"],
  earlyCloses: [{ date: "2026-11-27", close: "13:00" }],
})

export function SessionCalendarScene() {
  const readings = [
    cash.status(zonedInstant("2026-09-22", "10:00", "America/New_York")),
    cash.status(zonedInstant("2026-09-22", "17:00", "America/New_York")),
    cash.status(zonedInstant("2026-09-26", "12:00", "America/New_York")),
    cash.status(zonedInstant("2026-09-07", "12:00", "America/New_York")),
    cash.status(zonedInstant("2026-11-27", "13:30", "America/New_York")),
    cash.status(zonedInstant("2026-03-09", "09:45", "America/New_York")),
  ]
  return (
    <div data-slot="tradecn-session-calendar" className="text-xs lining-nums tabular-nums">
      {readings.join(" ")}
    </div>
  )
}
