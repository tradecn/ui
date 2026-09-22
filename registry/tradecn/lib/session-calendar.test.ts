import { describe, expect, it } from "vitest"
import { addDays, createSessionCalendar, localTime, parseTime, weekdayOf, zonedInstant } from "@/registry/tradecn/lib/session-calendar"

const NY = "America/New_York"
const CHI = "America/Chicago"

// A cash session: 09:30 to 16:00 New York, Monday to Friday, a pre-open from 04:00 and a post-close to 20:00,
// one holiday and one early close.
const cash = createSessionCalendar({
  zone: NY,
  sessions: [{ days: [1, 2, 3, 4, 5], open: "09:30", close: "16:00", pre: "04:00", post: "20:00" }],
  holidays: ["2026-09-07"],
  earlyCloses: [{ date: "2026-11-27", close: "13:00" }],
})

// An overnight session: opens 17:00 Chicago Sunday to Thursday and closes 16:00 the next day.
const overnight = createSessionCalendar({
  zone: CHI,
  sessions: [{ days: [0, 1, 2, 3, 4], open: "17:00", close: "16:00" }],
})

const utc = (y: number, m: number, d: number, h = 0, min = 0) => Date.UTC(y, m - 1, d, h, min)

describe("the zone arithmetic", () => {
  it("reads an instant's date, weekday, and minutes in a zone", () => {
    // 2026-09-22T14:30Z is 10:30 on a Tuesday in New York.
    expect(localTime(utc(2026, 9, 22, 14, 30), NY)).toEqual({ date: "2026-09-22", weekday: 2, minutes: 630 })
    // And already Wednesday in Tokyo at 23:30.
    expect(localTime(utc(2026, 9, 22, 14, 30), "Asia/Tokyo")).toEqual({ date: "2026-09-22", weekday: 2, minutes: 1410 })
    expect(localTime(utc(2026, 9, 22, 15, 30), "Asia/Tokyo")).toEqual({ date: "2026-09-23", weekday: 3, minutes: 30 })
    expect(parseTime("09:30")).toBe(570)
    expect(parseTime("9:05")).toBe(545)
    expect(parseTime("24:00")).toBe(1440)
    expect(parseTime("9.30")).toBeNaN()
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01")
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31")
    expect(weekdayOf("2026-09-22")).toBe(2)
  })

  it("finds the instant of a wall-clock time on both sides of daylight saving, in both directions", () => {
    // New York leaves standard time on 2026-03-08 and returns on 2026-11-01.
    expect(zonedInstant("2026-03-06", "09:30", NY)).toBe(utc(2026, 3, 6, 14, 30))
    expect(zonedInstant("2026-03-09", "09:30", NY)).toBe(utc(2026, 3, 9, 13, 30))
    expect(zonedInstant("2026-10-30", "09:30", NY)).toBe(utc(2026, 10, 30, 13, 30))
    expect(zonedInstant("2026-11-02", "09:30", NY)).toBe(utc(2026, 11, 2, 14, 30))
    // A time inside the spring-forward gap moves forward by the gap: 02:30 becomes 03:30 daylight time, 07:30Z.
    expect(zonedInstant("2026-03-08", "02:30", NY)).toBe(utc(2026, 3, 8, 7, 30))
    // A time the clocks fall back through happens twice; the first one, still on daylight time, is taken.
    expect(zonedInstant("2026-11-01", "01:30", NY)).toBe(utc(2026, 11, 1, 5, 30))
    expect(zonedInstant("2026-11-01", "03:00", NY)).toBe(utc(2026, 11, 1, 8, 0))
    // London and Tokyo, for good measure.
    expect(zonedInstant("2026-09-22", "08:00", "Europe/London")).toBe(utc(2026, 9, 22, 7, 0))
    expect(zonedInstant("2026-09-22", "09:00", "Asia/Tokyo")).toBe(utc(2026, 9, 22, 0, 0))
  })
})

describe("a cash session", () => {
  it("is pre, open, post, and closed through a trading day, on either side of daylight saving", () => {
    // Monday 2026-03-09, the first trading day on daylight time: 09:00 is pre, 10:00 open, 16:30 post, 21:00 closed.
    expect(cash.status(utc(2026, 3, 9, 13, 0))).toBe("pre")
    expect(cash.status(utc(2026, 3, 9, 14, 0))).toBe("open")
    expect(cash.status(utc(2026, 3, 9, 20, 30))).toBe("post")
    expect(cash.status(utc(2026, 3, 10, 1, 0))).toBe("closed")
    // Monday 2026-11-02, back on standard time: the same wall clock is an hour later in UTC.
    expect(cash.status(utc(2026, 11, 2, 14, 0))).toBe("pre")
    expect(cash.status(utc(2026, 11, 2, 15, 0))).toBe("open")
    expect(cash.status(utc(2026, 11, 2, 21, 30))).toBe("post")
    // The edges belong to what starts there.
    expect(cash.status(zonedInstant("2026-09-22", "09:30", NY))).toBe("open")
    expect(cash.status(zonedInstant("2026-09-22", "16:00", NY))).toBe("post")
    expect(cash.status(zonedInstant("2026-09-22", "16:00", NY) - 1)).toBe("open")
  })

  it("is closed at the weekend, a holiday on a holiday, and closes early on an early-close date", () => {
    expect(cash.status(zonedInstant("2026-09-19", "12:00", NY))).toBe("closed")
    expect(cash.status(zonedInstant("2026-09-07", "12:00", NY))).toBe("holiday")
    expect(cash.status(zonedInstant("2026-09-07", "02:00", NY))).toBe("holiday")
    expect(cash.status(zonedInstant("2026-11-27", "12:59", NY))).toBe("open")
    expect(cash.status(zonedInstant("2026-11-27", "13:00", NY))).toBe("post")
    expect(cash.isTradingDay("2026-09-07")).toBe(false)
    expect(cash.isTradingDay("2026-09-19")).toBe(false)
    expect(cash.isTradingDay("2026-09-22")).toBe(true)
    expect(cash.isTradingDay(zonedInstant("2026-09-22", "23:00", NY))).toBe(true)
    // 23:00 New York on the 22nd is already the 23rd in UTC; the zone decides.
    expect(cash.isTradingDay(new Date(zonedInstant("2026-09-25", "23:00", NY)))).toBe(true)
    expect(cash.local(zonedInstant("2026-09-25", "23:00", NY)).date).toBe("2026-09-25")
  })

  it("says how long is left in the session, and nothing when it is not open", () => {
    const at = zonedInstant("2026-09-22", "15:00", NY)
    expect(cash.timeToClose(at)).toBe(60 * 60 * 1000)
    expect(cash.timeToClose(zonedInstant("2026-11-27", "12:00", NY))).toBe(60 * 60 * 1000)
    expect(cash.timeToClose(zonedInstant("2026-09-22", "17:00", NY))).toBeNull()
    expect(cash.timeToClose(zonedInstant("2026-09-19", "12:00", NY))).toBeNull()
  })

  it("knows the next change of status, across a night, a weekend, and a holiday", () => {
    expect(cash.nextTransition(zonedInstant("2026-09-22", "15:00", NY))).toEqual({ at: zonedInstant("2026-09-22", "16:00", NY), status: "post" })
    expect(cash.nextTransition(zonedInstant("2026-09-22", "17:00", NY))).toEqual({ at: zonedInstant("2026-09-22", "20:00", NY), status: "closed" })
    expect(cash.nextTransition(zonedInstant("2026-09-22", "21:00", NY))).toEqual({ at: zonedInstant("2026-09-23", "04:00", NY), status: "pre" })
    // Friday night: the weekend, then Monday's pre-open.
    expect(cash.nextTransition(zonedInstant("2026-09-18", "21:00", NY))).toEqual({ at: zonedInstant("2026-09-21", "04:00", NY), status: "pre" })
    // Friday before the holiday: Saturday and Sunday are closed, Monday is a holiday, Tuesday opens.
    expect(cash.nextTransition(zonedInstant("2026-09-04", "21:00", NY))).toEqual({ at: zonedInstant("2026-09-07", "00:00", NY), status: "holiday" })
    expect(cash.nextTransition(zonedInstant("2026-09-07", "12:00", NY))).toEqual({ at: zonedInstant("2026-09-08", "00:00", NY), status: "closed" })
    expect(cash.nextTransition(zonedInstant("2026-09-08", "01:00", NY))).toEqual({ at: zonedInstant("2026-09-08", "04:00", NY), status: "pre" })
    expect(createSessionCalendar({ zone: NY, sessions: [] }).nextTransition(Date.now())).toBeNull()
    expect(createSessionCalendar({ zone: NY, sessions: [] }).status(Date.now())).toBe("closed")
  })
})

describe("an overnight session", () => {
  it("is open across midnight from the day it opened on, and closed from the Friday close to the Sunday open", () => {
    // Tuesday 02:00 Chicago: opened Monday at 17:00.
    expect(overnight.status(zonedInstant("2026-09-22", "2:00", CHI))).toBe("open")
    // Tuesday 16:30: the Monday session closed at 16:00 and Tuesday's has not opened.
    expect(overnight.status(zonedInstant("2026-09-22", "16:30", CHI))).toBe("closed")
    expect(overnight.status(zonedInstant("2026-09-22", "17:00", CHI))).toBe("open")
    // Saturday: nothing opened Friday.
    expect(overnight.status(zonedInstant("2026-09-26", "12:00", CHI))).toBe("closed")
    // Sunday noon closed, Sunday evening open.
    expect(overnight.status(zonedInstant("2026-09-27", "12:00", CHI))).toBe("closed")
    expect(overnight.status(zonedInstant("2026-09-27", "17:30", CHI))).toBe("open")
    // Friday 15:00 is Thursday's session still open; Friday 16:30 is the weekend.
    expect(overnight.status(zonedInstant("2026-09-25", "15:00", CHI))).toBe("open")
    expect(overnight.status(zonedInstant("2026-09-25", "16:30", CHI))).toBe("closed")
    expect(overnight.timeToClose(zonedInstant("2026-09-22", "2:00", CHI))).toBe(14 * 60 * 60 * 1000)
    expect(overnight.nextTransition(zonedInstant("2026-09-26", "12:00", CHI))).toEqual({ at: zonedInstant("2026-09-27", "17:00", CHI), status: "open" })
    expect(overnight.isTradingDay("2026-09-25")).toBe(false)
    expect(overnight.isTradingDay("2026-09-27")).toBe(true)
  })

  it("closes early on the date the close falls on, the day after the open", () => {
    const early = createSessionCalendar({ zone: CHI, sessions: [{ days: [0, 1, 2, 3, 4], open: "17:00", close: "16:00" }], earlyCloses: [{ date: "2026-11-27", close: "12:15" }] })
    expect(early.status(zonedInstant("2026-11-27", "12:00", CHI))).toBe("open")
    expect(early.status(zonedInstant("2026-11-27", "12:15", CHI))).toBe("closed")
    expect(overnight.status(zonedInstant("2026-11-27", "12:15", CHI))).toBe("open")
  })
})
