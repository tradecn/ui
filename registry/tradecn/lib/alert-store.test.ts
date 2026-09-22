import { describe, expect, it, vi } from "vitest"
import { byNewest, createAlertStore } from "@/registry/tradecn/lib/alert-store"

function clock(start = 1_000) {
  let t = start
  return { now: () => t, tick: (ms: number) => (t += ms) }
}

describe("createAlertStore", () => {
  it("adds notices with an id, a time, and a count of one, and lists them newest first", () => {
    const c = clock()
    let n = 0
    const alerts = createAlertStore({ now: c.now, nextId: () => `n${++n}` })
    const a = alerts.push({ severity: "info", title: "Feed connected" })
    c.tick(10)
    const b = alerts.push({ severity: "warning", title: "Feed slow", message: "1.2 s behind" })
    expect(a).toEqual({ id: "n1", severity: "info", title: "Feed connected", at: 1_000, seq: 1, count: 1 })
    expect(b.id).toBe("n2")
    expect(b.seq).toBe(2)
    expect(alerts.size()).toBe(2)
    expect(alerts.list().map((x) => x.id)).toEqual(["n2", "n1"])
    expect(alerts.store.getMeta().lane).toBe("ordered")
    expect(alerts.push({ id: "mine", at: 5, severity: "info", title: "Given", count: 3 })).toMatchObject({ id: "mine", at: 5, count: 3 })
  })

  it("folds a notice with the same key into the last one: the newest words, the time, and a growing count, one row", () => {
    const c = clock()
    const alerts = createAlertStore({ now: c.now })
    const first = alerts.push({ key: "md:slow", severity: "warning", title: "Feed slow", message: "0.4 s behind" })
    c.tick(500)
    const second = alerts.push({ key: "md:slow", severity: "critical", title: "Feed slow", message: "2.1 s behind", tone: "destructive", allowedActions: ["reconnect"] })
    expect(alerts.size()).toBe(1)
    expect(second.id).toBe(first.id)
    expect(second).toMatchObject({ count: 2, at: 1_500, seq: 2, severity: "critical", message: "2.1 s behind", tone: "destructive", allowedActions: ["reconnect"] })
    expect(alerts.push({ key: "md:slow", severity: "warning", title: "Feed slow", count: 5 }).count).toBe(7)
    // Another key is another row; no key is always a new row.
    alerts.push({ key: "md:gap", severity: "warning", title: "Gap" })
    alerts.push({ severity: "info", title: "Fill" })
    alerts.push({ severity: "info", title: "Fill" })
    expect(alerts.size()).toBe(4)
  })

  it("dismisses, clears, and forgets a key so the next notice with it is new", () => {
    const alerts = createAlertStore()
    const a = alerts.push({ key: "k", severity: "info", title: "One" })
    alerts.push({ severity: "info", title: "Two" })
    alerts.dismiss(a.id)
    expect(alerts.size()).toBe(1)
    const again = alerts.push({ key: "k", severity: "info", title: "One again" })
    expect(again.id).not.toBe(a.id)
    expect(again.count).toBe(1)
    alerts.dismiss(["nothing", again.id])
    expect(alerts.size()).toBe(1)
    alerts.clear()
    expect(alerts.size()).toBe(0)
    expect(alerts.push({ key: "k", severity: "info", title: "Fresh" }).count).toBe(1)
  })

  it("keeps to the cap, letting the oldest without an action go first and the oldest with one after", () => {
    const c = clock()
    let n = 0
    const alerts = createAlertStore({ now: c.now, nextId: () => `n${++n}`, max: 3 })
    alerts.push({ severity: "info", title: "plain 1" })
    c.tick(1)
    alerts.push({ severity: "warning", title: "actionable", allowedActions: ["ack"] })
    c.tick(1)
    alerts.push({ severity: "info", title: "plain 2" })
    c.tick(1)
    alerts.push({ severity: "info", title: "plain 3" })
    expect(alerts.list().map((a) => a.title)).toEqual(["plain 3", "plain 2", "actionable"])
    c.tick(1)
    alerts.push({ severity: "info", title: "plain 4" })
    c.tick(1)
    alerts.push({ severity: "info", title: "plain 5" })
    // Every plain one older than the newest two is gone; the actionable one outlived them all.
    expect(alerts.list().map((a) => a.title)).toEqual(["plain 5", "plain 4", "actionable"])
    c.tick(1)
    alerts.push({ severity: "info", title: "plain 6", allowedActions: ["ack"] })
    c.tick(1)
    alerts.push({ severity: "info", title: "plain 7", allowedActions: ["ack"] })
    // Only actionable notices left, so the oldest of them goes.
    c.tick(1)
    alerts.push({ severity: "info", title: "plain 8", allowedActions: ["ack"] })
    expect(alerts.list().map((a) => a.title)).toEqual(["plain 8", "plain 7", "plain 6"])
  })

  it("orders newest first with a stable tie by arrival, whatever the ids say", () => {
    const a = { id: "zed", at: 5, seq: 1, severity: "s", title: "t", count: 1 }
    const b = { id: "alpha", at: 5, seq: 2, severity: "s", title: "t", count: 1 }
    const c = { id: "mid", at: 9, seq: 3, severity: "s", title: "t", count: 1 }
    // At one time the later arrival leads, so notices pushed in one millisecond keep their push order, newest first.
    expect([a, b, c].sort(byNewest).map((x) => x.id)).toEqual(["mid", "alpha", "zed"])
    expect([b, a].sort(byNewest).map((x) => x.id)).toEqual(["alpha", "zed"])
    const alerts = createAlertStore({ now: () => 1 })
    alerts.push({ id: "up", severity: "s", title: "1" })
    alerts.push({ id: "slow", severity: "s", title: "2" })
    alerts.push({ id: "fill", severity: "s", title: "3" })
    expect(alerts.list().map((x) => x.id)).toEqual(["fill", "slow", "up"])
  })

  it("applies one batch per push, so a subscriber wakes once", () => {
    const alerts = createAlertStore({ max: 2 })
    const wake = vi.fn()
    alerts.store.subscribeMeta(wake)
    alerts.push({ severity: "info", title: "1" })
    alerts.push({ severity: "info", title: "2" })
    alerts.push({ severity: "info", title: "3" })
    expect(wake).toHaveBeenCalledTimes(3)
    expect(alerts.size()).toBe(2)
  })
})
