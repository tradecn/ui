# session-calendar

Build a session calendar from trading hours, holidays, and early closes in a venue's time zone, so a quiet feed can be distinguished from a stale one.

## Usage

```ts
import { createSessionCalendar, zonedInstant } from "@/lib/session-calendar"

const calendar = createSessionCalendar({
  zone: "America/New_York",
  sessions: [{ days: [1, 2, 3, 4, 5], open: "09:30", close: "16:00" }],
})
const at = zonedInstant("2026-09-23", "10:00", calendar.zone)

console.log(calendar.status(at)) // "open"
console.log(calendar.nextTransition(at)) // { at: ..., status: "closed" }; 16:00 New York
console.log(calendar.timeToClose(at)) // 21_600_000 ms (6 hours)
console.log(calendar.isTradingDay("2026-09-23")) // true
```

This illustrative schedule opens Monday through Friday. `zonedInstant` converts its local date and time to an epoch timestamp. The preview queries one fixed instant, so its status and time to close remain available to inspect. The calendar runs no timer; your application supplies each instant to query.

To use it with a feed, install [`feed-health`](feed-health.md) separately and pass the calendar to its `session` prop. That component reads `status(now)` from the calendar; it supplies no venue schedule.

## Calendar exceptions

This comparison adds pre-open and post-close windows, a sample holiday on September 24, and a 13:00 close on September 25. These dates are illustrative. Applications should use their venue's published schedule.

The holiday has no opening session. The early-close date remains a trading day: thirty minutes remain at 12:30, and the status is `post` at 13:30 because the configured post-close window still ends at 20:00. Saturday is closed. A trading day means a session is scheduled to open that day, even during pre-open or post-close hours. Scroll the table horizontally on narrow screens.

<!-- demo: session-calendar-exceptions -->

## API Reference

### Options

`createSessionCalendar(options: SessionCalendarOptions)` returns a `FullSessionCalendar`.

| Option | Type | Default | Purpose |
|---|---|---|---|
| `zone` | `string` | Required | IANA time zone, such as `"America/New_York"` |
| `sessions` | `readonly SessionWindow[]` | Required | Session windows; may be empty |
| `holidays` | `readonly string[]` | `[]` | Local `YYYY-MM-DD` dates on which no session opens |
| `earlyCloses` | `readonly EarlyClose[]` | `[]` | Close-time overrides by local closing date |

### What feed-health reads

[`feed-health`](feed-health.md) accepts a `SessionCalendar` with one method, `status(now: number): SessionStatus`. It defaults to always open and supplies no venue schedule. Passing this calendar lets it treat a connected feed's silence during `closed` or `holiday` hours as closed rather than stale.

The returned `FullSessionCalendar` has these members. Numeric instants are milliseconds since the Unix epoch.

| Member | Type | Result |
|---|---|---|
| `zone` | `string` | The configured time zone; read-only |
| `status(now)` | `(now: number) => SessionStatus` | Status at that instant |
| `nextTransition(now)` | `(now: number) => SessionTransition \| null` | Next status change strictly after `now`, or `null` if none is found in the scan |
| `timeToClose(now)` | `(now: number) => number \| null` | Milliseconds until the first matching open session closes; `null` when none is open |
| `isTradingDay(date)` | `(date: string \| number \| Date) => boolean` | Whether a session is scheduled to open on the local date, excluding holidays |
| `local(now)` | `(now: number) => LocalTime` | Local date, weekday, and minutes since midnight |

`SessionTransition` is `{ at: number, status: SessionStatus }`: `at` is an epoch timestamp in milliseconds, and `status` applies from that instant. `nextTransition` checks session and holiday boundaries for opening dates from yesterday through 21 days ahead in the calendar's zone. It skips boundaries that leave the status unchanged and can return `null` with nonempty sessions, including a continuously open calendar.

For overlapping sessions, `timeToClose` checks yesterday's opening date before today's, then sessions in input order. Its countdown can end while another session remains open; use `nextTransition` to find a change in the calendar's status.

`isTradingDay` reads a `YYYY-MM-DD` string directly and converts a number or `Date` to the calendar's zone. It checks opening dates, not settlement eligibility or whether an overnight session is still active. A Friday can return `false` while Thursday's session remains open.

### Sessions

Each `SessionWindow` uses local times in the calendar's zone.

| Field | Type | Default | Purpose |
|---|---|---|---|
| `days` | `readonly number[]` | Required | Opening weekdays: `0` Sunday through `6` Saturday |
| `open` | `string` | Required | Opening time as `HH:MM` |
| `close` | `string` | Required | Closing time as `HH:MM`; at or before `open` means the next day |
| `pre` | `string` | `open` | Pre-open start on the opening date, clamped to no later than `open` |
| `post` | `string` | `close` | Post-close end on the closing date, clamped to no earlier than the effective close |

An overnight session belongs to its opening date. A session opening at 17:00 and closing at 16:00 the next day is still open at 02:00 because it opened yesterday. The original `open` and `close` determine the closing date before any early-close override.

Sessions with an invalid `open` or `close` are ignored. Missing or invalid `pre` and `post` collapse to the open and effective close respectively, leaving no extended window.

`SessionStatus` follows this precedence across all sessions. The exported `SESSION_STATUSES: readonly SessionStatus[]` lists the five values.

| Status | When it applies |
|---|---|
| `"open"` | Any session is open |
| `"pre"` | No session is open and at least one is in its pre-open window |
| `"post"` | No session is open or pre-open and at least one is in its post-close window |
| `"holiday"` | None of those windows applies, and today is a holiday on a scheduled opening weekday |
| `"closed"` | None of the above |

Each window includes its start and excludes its end. At a session's close, it no longer contributes `open`; other windows still determine the status.

`status` and `timeToClose` consider only today's and yesterday's opening dates. Hour-24 times can extend an overnight window beyond that lookup: a UTC Monday session from `17:00` to `16:00` with `post: "24:30"` is already reported closed at Wednesday midnight. `nextTransition` can miss that cutoff and report `00:30` instead.

### Holidays and early closes

Holidays suppress sessions by opening date. They do not cancel an overnight session that opened the day before; its active windows take precedence over `holiday`.

Each `EarlyClose` overrides the close for sessions ending on that date. For an overnight session, name the day after it opens.

| Field | Type | Default | Purpose |
|---|---|---|---|
| `date` | `string` | Required | Closing date as `YYYY-MM-DD` in the calendar's zone |
| `close` | `string` | Required | Replacement close as `HH:MM` in that zone |

The last override for a date wins. It leaves the opening and pre-open times unchanged; post-close still ends at the configured `post`, clamped against the replacement close. Overrides are not checked against the open or normal close, so a close before open can leave the session in `pre`. Supply valid dates and close times; an invalid close time can throw when the calendar is read.

The library ships no venue schedule. Supply sessions, holidays, and early closes from the venue's published calendar. The examples use illustrative schedules, not exchange calendar data.

### Time zones

Time-zone conversion uses the runtime's `Intl.DateTimeFormat`, with no external dependency. For example, 09:30 New York is 14:30 UTC in February and 13:30 UTC in June. A zone the runtime does not recognize throws when a conversion is attempted.

A time inside a spring-forward gap moves forward by the gap: New York's `2026-03-08 02:30` becomes `03:30`. Repeated times depend on the offsets the implementation probes: New York's `2026-11-01 01:30` resolves to the first occurrence (`05:30Z`), but London's `2026-10-25 01:30` resolves to the second (`01:30Z`). There is no configurable ambiguity policy.

### Standalone helpers

These exports use the same conversion rules as the calendar. Date strings are `YYYY-MM-DD`; numeric instants are epoch milliseconds. All arguments are required.

| Helper | Return type | Result |
|---|---|---|
| `localTime(ms: number, zone: string)` | `LocalTime` | Date, weekday, and minutes since midnight in the zone |
| `zonedInstant(date: string, time: string, zone: string)` | `number` | Epoch milliseconds for a local date and time |
| `addDays(date: string, days: number)` | `string` | Date moved by the given number of calendar days; negative values move backward |
| `weekdayOf(date: string)` | `number` | Weekday, `0` Sunday through `6` Saturday |
| `parseTime(text: string)` | `number` | Minutes since midnight, or `NaN` for an invalid time |

`LocalTime` is `{ date: string, weekday: number, minutes: number }`. `minutes` counts whole minutes and omits seconds.

`parseTime` trims whitespace and accepts one or two hour digits (`0`–`24`) and exactly two minute digits (`00`–`59`). For example, `"9:05"` returns `545`, `"24:00"` returns `1440`, and `"9.30"` returns `NaN`. It also accepts `"24:59"`; `zonedInstant` normalizes hour `24` into the following date.

### What it does not do

The calendar reads no feed and runs no timer. Pass the clock's `now` to its methods, as feed-health does, or schedule a timer from a non-null `nextTransition` and query again when it fires.
