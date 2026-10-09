// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createFrameBatcher, createRowStore, type DeltaBatch } from "@/registry/tradecn/lib/row-store"

interface Quote {
  id: string
  px: number
  qty: number
}

const q = (id: string, px: number, qty = 1): Quote => ({ id, px, qty })
const make = (lane: "coalesced" | "ordered" = "coalesced") => createRowStore<Quote>({ getRowId: (r) => r.id, lane })

describe("row subscriptions", () => {
  it("a patch wakes exactly the row it touches", () => {
    const store = make()
    store.applyDeltas({ upsert: [q("a", 1), q("b", 2), q("c", 3)] })
    const a = vi.fn(), b = vi.fn(), c = vi.fn()
    store.subscribeRow("a", a)
    store.subscribeRow("b", b)
    store.subscribeRow("c", c)
    store.applyDeltas({ patch: [{ id: "a", fields: { px: 1.5 } }, { id: "a", fields: { qty: 7 } }] })
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).not.toHaveBeenCalled()
    expect(c).not.toHaveBeenCalled()
    expect(store.getRow("a")).toEqual({ id: "a", px: 1.5, qty: 7 })
  })
  it("row identity is stable across unrelated deltas and replaced on its own", () => {
    const store = make()
    store.applyDeltas({ upsert: [q("a", 1), q("b", 2)] })
    const a0 = store.getRow("a")
    store.applyDeltas({ patch: [{ id: "b", fields: { px: 9 } }] })
    expect(store.getRow("a")).toBe(a0)
    store.applyDeltas({ patch: [{ id: "a", fields: { px: 2 } }] })
    expect(store.getRow("a")).not.toBe(a0)
  })
  it("patches to unknown ids are ignored, removals wake the row and clear it", () => {
    const store = make()
    store.applyDeltas({ upsert: [q("a", 1)] })
    const ghost = vi.fn(), a = vi.fn()
    store.subscribeRow("ghost", ghost)
    store.subscribeRow("a", a)
    store.applyDeltas({ patch: [{ id: "ghost", fields: { px: 1 } }] })
    expect(ghost).not.toHaveBeenCalled()
    store.applyDeltas({ remove: ["a"] })
    expect(a).toHaveBeenCalledTimes(1)
    expect(store.getRow("a")).toBeUndefined()
    expect(store.getIds()).toEqual([])
  })
  it("unsubscribe stops notifications", () => {
    const store = make()
    store.applyDeltas({ upsert: [q("a", 1)] })
    const a = vi.fn()
    const off = store.subscribeRow("a", a)
    off()
    store.applyDeltas({ patch: [{ id: "a", fields: { px: 2 } }] })
    expect(a).not.toHaveBeenCalled()
  })
})

describe("order", () => {
  it("fires only on a real change and keeps a stable array otherwise", () => {
    const store = make()
    store.applyDeltas({ upsert: [q("a", 1), q("b", 2)] })
    const ids0 = store.getIds()
    const order = vi.fn()
    store.subscribeOrder(order)
    store.applyDeltas({ patch: [{ id: "a", fields: { px: 5 } }] })
    expect(order).not.toHaveBeenCalled()
    expect(store.getIds()).toBe(ids0)
    store.applyDeltas({ order: ["a", "b"] })
    expect(order).not.toHaveBeenCalled()
    store.applyDeltas({ order: ["b", "a"] })
    expect(order).toHaveBeenCalledTimes(1)
    expect(store.getIds()).toEqual(["b", "a"])
    store.applyDeltas({ upsert: [q("c", 3)] })
    expect(order).toHaveBeenCalledTimes(2)
    expect(store.getIds()).toEqual(["b", "a", "c"])
  })
  it("an authoritative order keeps unlisted rows at the end in their old order", () => {
    const store = make("ordered")
    store.applyDeltas({ upsert: [q("a", 1), q("b", 2), q("c", 3), q("d", 4)] })
    store.applyDeltas({ order: ["d", "b", "zzz"] })
    expect(store.getIds()).toEqual(["d", "b", "a", "c"])
  })
})

describe("meta", () => {
  it("publishes rows, order and the batch version before row listeners run", () => {
    const store = createRowStore<{ id: string; value: number }>({ getRowId: row => row.id })
    const seen: unknown[] = []
    store.subscribeRow("a", () => seen.push([store.getRow("a"), store.getIds(), store.getMeta().version]))
    store.applyDeltas({ upsert: [{ id: "a", value: 1 }] })
    store.applyDeltas({ patch: [{ id: "a", fields: { value: 2 } }] })
    store.clear()
    expect(seen).toEqual([
      [{ id: "a", value: 1 }, ["a"], 1],
      [{ id: "a", value: 2 }, ["a"], 2],
      [undefined, [], 3],
    ])
  })

  it("counts versions and accumulates drops, keeps the last seq and gap", () => {
    const store = make("ordered")
    store.applyDeltas({ upsert: [q("a", 1)], meta: { dropped: 3, seq: 10 } })
    store.applyDeltas({ patch: [{ id: "a", fields: { px: 2 } }], meta: { dropped: 2, seq: 11, gap: true } })
    const m = store.getMeta()
    expect(m).toMatchObject({ version: 2, size: 1, lane: "ordered", dropped: 5, seq: 11, gap: true })
    expect(typeof m.lastBatchAt).toBe("number")
    const listener = vi.fn()
    store.subscribeMeta(listener)
    store.applyDeltas({})
    expect(listener).toHaveBeenCalledTimes(1)
    expect(store.getMeta().version).toBe(3)
  })
  it("clear drops everything and wakes everyone", () => {
    const store = make()
    store.applyDeltas({ upsert: [q("a", 1), q("b", 2)] })
    const a = vi.fn(), order = vi.fn()
    store.subscribeRow("a", a)
    store.subscribeOrder(order)
    store.clear()
    expect(a).toHaveBeenCalledTimes(1)
    expect(order).toHaveBeenCalledTimes(1)
    expect(store.getIds()).toEqual([])
    expect(store.getMeta().size).toBe(0)
  })
})

describe("views", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it("sorts and filters, and notifies only when its order changes", () => {
    const store = make()
    store.applyDeltas({ upsert: [q("a", 3), q("b", 1), q("c", 2), q("d", 0)] })
    const view = store.createView({ comparator: (x, y) => y.px - x.px, filter: (r) => r.px > 0 })
    expect(view.getIds()).toEqual(["a", "c", "b"])
    const cb = vi.fn()
    view.subscribe(cb)
    store.applyDeltas({ patch: [{ id: "a", fields: { qty: 99 } }] })
    expect(cb).not.toHaveBeenCalled()
    store.applyDeltas({ patch: [{ id: "b", fields: { px: 10 } }] })
    expect(cb).toHaveBeenCalledTimes(1)
    expect(view.getIds()).toEqual(["b", "a", "c"])
    store.applyDeltas({ patch: [{ id: "d", fields: { px: 5 } }] })
    expect(view.getIds()).toEqual(["b", "d", "a", "c"])
    store.applyDeltas({ patch: [{ id: "c", fields: { px: -1 } }] })
    expect(view.getIds()).toEqual(["b", "d", "a"])
    const ids = view.getIds()
    store.applyDeltas({ patch: [{ id: "a", fields: { qty: 1 } }] })
    expect(view.getIds()).toBe(ids)
  })

  it("holds order after touch, appends newcomers, drops removals, then settles", () => {
    let t = 0
    const now = () => t
    const store = createRowStore<Quote>({ getRowId: (r) => r.id, now })
    store.applyDeltas({ upsert: [q("a", 3), q("b", 2), q("c", 1)] })
    const view = store.createView({ comparator: (x, y) => y.px - x.px, reorderHoldMs: 1000, now })
    const cb = vi.fn()
    view.subscribe(cb)
    expect(view.getIds()).toEqual(["a", "b", "c"])
    view.touch()
    expect(view.isHeld()).toBe(true)
    store.applyDeltas({ patch: [{ id: "c", fields: { px: 100 } }] })
    expect(view.getIds()).toEqual(["a", "b", "c"])
    expect(cb).not.toHaveBeenCalled()
    store.applyDeltas({ upsert: [q("d", 50)], remove: ["b"] })
    expect(view.getIds()).toEqual(["a", "c", "d"])
    expect(cb).toHaveBeenCalledTimes(1)
    t = 1000
    vi.advanceTimersByTime(1000)
    expect(view.isHeld()).toBe(false)
    expect(view.getIds()).toEqual(["c", "d", "a"])
    expect(cb).toHaveBeenCalledTimes(2)
  })

  it("holds as long as a timer can for a hold of Infinity, and not at all for one that isn't a number", () => {
    let t = 0
    const now = () => t
    const store = createRowStore<Quote>({ getRowId: (r) => r.id, now })
    store.applyDeltas({ upsert: [q("a", 3), q("b", 2), q("c", 1)] })
    const forever = store.createView({ comparator: (x, y) => y.px - x.px, reorderHoldMs: Infinity, now })
    const never = store.createView({ comparator: (x, y) => y.px - x.px, reorderHoldMs: Number.NaN, now })
    forever.subscribe(() => {})
    never.subscribe(() => {})
    forever.touch()
    never.touch()
    expect(never.isHeld()).toBe(false)
    store.applyDeltas({ patch: [{ id: "c", fields: { px: 100 } }] })
    // A timer told to wait longer than it can fires at once: an hour on, the hold still holds.
    t = 60 * 60 * 1000
    vi.advanceTimersByTime(60 * 60 * 1000)
    expect(forever.isHeld()).toBe(true)
    expect(forever.getIds()).toEqual(["a", "b", "c"])
    expect(never.getIds()).toEqual(["c", "a", "b"])
    // It lapses at the longest a timer can wait, about 24.8 days.
    t = 2 ** 31 - 1
    vi.advanceTimersByTime(2 ** 31 - 1 - 60 * 60 * 1000)
    expect(forever.isHeld()).toBe(false)
    expect(forever.getIds()).toEqual(["c", "a", "b"])
  })

  it("reports no hold deadline before any hold, then a wall-clock one from its own clock", () => {
    let t = 0
    const now = () => t
    const store = createRowStore<Quote>({ getRowId: (r) => r.id, now })
    store.applyDeltas({ upsert: [q("a", 3)] })
    const view = store.createView({ comparator: (x, y) => y.px - x.px, reorderHoldMs: 1000, now })
    expect(view.holdExpiresAt!()).toBeNull()
    view.touch()
    const wall = Date.now()
    const deadline = view.holdExpiresAt!()
    expect(deadline).not.toBeNull()
    // The hold runs on the injected zero-based clock; the report is wall time.
    expect(Math.abs(deadline! - (wall + 1000))).toBeLessThanOrEqual(50)
    t = 2000
    const lapsed = view.holdExpiresAt!()
    expect(lapsed).not.toBeNull()
    expect(lapsed!).toBeLessThan(Date.now())
  })

  it("touch is a no-op without a hold, dispose stops updates", () => {
    const store = make()
    store.applyDeltas({ upsert: [q("a", 1), q("b", 2)] })
    const view = store.createView({ comparator: (x, y) => y.px - x.px })
    view.touch()
    expect(view.isHeld()).toBe(false)
    const cb = vi.fn()
    view.subscribe(cb)
    view.dispose()
    store.applyDeltas({ patch: [{ id: "a", fields: { px: 9 } }] })
    expect(cb).not.toHaveBeenCalled()
  })
})

describe("prepared views", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it("prepares current snapshots without retaining feed work, even with subscribers", () => {
    const store = make()
    store.applyDeltas({ upsert: [q("a", 2), q("b", 1)] })
    const filter = vi.fn(() => true)
    const view = store.prepareView({ filter, comparator: (a, b) => a.px - b.px, reorderHoldMs: 1000 })
    const listener = vi.fn()
    view.subscribe(listener)
    expect(view.getIds()).toEqual(["b", "a"])
    view.touch()
    expect(vi.getTimerCount()).toBe(0)
    filter.mockClear()
    store.applyDeltas({ upsert: [q("c", 0)] })
    expect(filter).not.toHaveBeenCalled()
    expect(listener).not.toHaveBeenCalled()
    expect(view.getIds()).toEqual(["b", "a", "c"])
    expect(listener).not.toHaveBeenCalled()
    const held = view.getIds()
    expect(view.getIds()).toBe(held)
    vi.advanceTimersByTime(1000)
    expect(view.getIds()).toEqual(["c", "b", "a"])
    expect(listener).not.toHaveBeenCalled()
  })

  it("releases independent leases once and reconnects without losing pending notifications", () => {
    const store = make()
    store.applyDeltas({ upsert: [q("a", 2), q("b", 1)] })
    const filter = vi.fn(() => true)
    const view = store.prepareView({ filter, comparator: (a, b) => a.px - b.px })
    const listener = vi.fn()
    view.subscribe(listener)
    const first = view.connect()
    const second = view.connect()
    first()
    first()
    store.applyDeltas({ upsert: [q("c", 0)] })
    expect(listener).toHaveBeenCalledTimes(1)
    second()
    filter.mockClear()
    store.applyDeltas({ remove: ["c"] })
    expect(filter).not.toHaveBeenCalled()
    expect(view.getIds()).toEqual(["b", "a"])
    expect(listener).toHaveBeenCalledTimes(1)
    const third = view.connect()
    expect(listener).toHaveBeenCalledTimes(2)
    expect(view.isDisposed()).toBe(false)
    third()
  })

  it("reconnects only the remaining hold and settles a quiet feed", () => {
    const store = make()
    store.applyDeltas({ upsert: [q("a", 2), q("b", 1)] })
    const view = store.prepareView({ comparator: (a, b) => a.px - b.px, reorderHoldMs: 1000 })
    const release = view.connect()
    view.touch()
    store.applyDeltas({ patch: [{ id: "a", fields: { px: 0 } }] })
    vi.advanceTimersByTime(300)
    release()
    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime(200)
    const releaseAgain = view.connect()
    expect(vi.getTimerCount()).toBe(1)
    vi.advanceTimersByTime(499)
    expect(view.getIds()).toEqual(["b", "a"])
    vi.advanceTimersByTime(1)
    expect(view.getIds()).toEqual(["a", "b"])
    releaseAgain()
    expect(vi.getTimerCount()).toBe(0)
  })

  it("cannot restart feed work or timers after terminal disposal", () => {
    const store = make()
    store.applyDeltas({ upsert: [q("a", 2)] })
    const filter = vi.fn(() => true)
    const view = store.prepareView({ filter, reorderHoldMs: 1000 })
    const release = view.connect()
    view.touch()
    const ids = view.getIds()
    view.dispose()
    view.touch()
    view.connect()()
    release()
    release()
    expect(vi.getTimerCount()).toBe(0)
    filter.mockClear()
    store.applyDeltas({ upsert: [q("b", 1)] })
    expect(view.getIds()).toBe(ids)
    expect(filter).not.toHaveBeenCalled()
    expect(view.isDisposed()).toBe(true)
  })

  it("preserves eager imperative following with no subscribers", () => {
    const store = make()
    store.applyDeltas({ upsert: [q("a", 2), q("b", 1)] })
    const comparator = vi.fn((a: Quote, b: Quote) => a.px - b.px)
    const view = store.createView({ comparator })
    comparator.mockClear()
    store.applyDeltas({ upsert: [q("c", 0)] })
    expect(comparator).toHaveBeenCalled()
    comparator.mockClear()
    expect(view.getIds()).toEqual(["c", "b", "a"])
    expect(comparator).not.toHaveBeenCalled()
    view.dispose()
  })

  it("publishes a view even when an earlier view's subscriber reads its new snapshot", () => {
    const store = make()
    store.applyDeltas({ upsert: [q("a", 2), q("b", 1)] })
    const first = store.createView()
    const second = store.createView({ comparator: (a, b) => a.px - b.px })
    const readAhead = vi.fn(() => second.getIds())
    first.subscribe(readAhead)
    const notified = vi.fn(() => second.getIds())
    second.subscribe(notified)
    store.applyDeltas({ upsert: [q("c", 0)] })
    expect(readAhead).toHaveReturnedWith(["c", "b", "a"])
    expect(notified).toHaveReturnedWith(["c", "b", "a"])
    expect(notified).toHaveBeenCalledTimes(1)
    first.dispose()
    second.dispose()
  })

  it("keeps metadata-only and irrelevant batches cheap and snapshots stable", () => {
    const store = make()
    store.applyDeltas({ upsert: [q("a", 2), q("b", -1)] })
    const filter = vi.fn((row: Quote) => row.px >= 0)
    const comparator = vi.fn((a: Quote, b: Quote) => a.px - b.px)
    const view = store.createView({ filter, comparator })
    const ids = view.getIds()
    filter.mockClear()
    comparator.mockClear()
    store.applyDeltas({ meta: { dropped: 1 } })
    expect(view.getIds()).toBe(ids)
    expect(filter).not.toHaveBeenCalled()
    store.applyDeltas({ patch: [{ id: "b", fields: { px: -2 } }] })
    expect(view.getIds()).toBe(ids)
    expect(filter).toHaveBeenCalledTimes(1)
    expect(comparator).not.toHaveBeenCalled()
    view.dispose()
  })
})

describe("frame batcher", () => {
  function fakeRaf() {
    const queue: (() => void)[] = []
    return {
      raf: vi.fn((cb: () => void) => {
        queue.push(cb)
        return queue.length
      }),
      caf: vi.fn(),
      frame: () => {
        const cbs = queue.splice(0)
        for (const cb of cbs) cb()
      },
    }
  }

  it("lets a frame the timer's flush left behind flush nothing, so a newer batch waits for its own", () => {
    vi.useFakeTimers()
    try {
      const apply = vi.fn()
      // A raf with no caf: the frame a flush cancels stays queued and runs late.
      const queue: (() => void)[] = []
      const batcher = createFrameBatcher<Quote>(apply, { getRowId: (r) => r.id, raf: (cb) => queue.push(cb), caf: () => {} })
      batcher.push({ upsert: [q("a", 1)] })
      vi.advanceTimersByTime(250)
      expect(apply).toHaveBeenCalledExactlyOnceWith({ upsert: [q("a", 1)] })
      batcher.push({ upsert: [q("b", 2)] })
      queue.shift()!()
      expect(apply).toHaveBeenCalledTimes(1)
      expect(batcher.pending()).toBe(true)
      queue.shift()!()
      expect(apply).toHaveBeenCalledTimes(2)
      expect(apply).toHaveBeenLastCalledWith({ upsert: [q("b", 2)] })
      // Its own timer then finds nothing left.
      vi.advanceTimersByTime(1000)
      expect(apply).toHaveBeenCalledTimes(2)
      expect(batcher.pending()).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it("holds nothing after a frame that runs as it is requested", () => {
    vi.useFakeTimers()
    try {
      const apply = vi.fn()
      const batcher = createFrameBatcher<Quote>(apply, { getRowId: (r) => r.id, raf: (cb) => (cb(), 1) })
      batcher.push({ upsert: [q("a", 1)] })
      expect(apply).toHaveBeenCalledExactlyOnceWith({ upsert: [q("a", 1)] })
      expect(batcher.pending()).toBe(false)
      batcher.push({ upsert: [q("b", 2)] })
      expect(apply).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it("flushes on a timer when no frame comes, as in a hidden tab, and once", () => {
    vi.useFakeTimers()
    try {
      const apply = vi.fn()
      const { raf, frame } = fakeRaf()
      const batcher = createFrameBatcher<Quote>(apply, { getRowId: (r) => r.id, raf })
      batcher.push({ upsert: [q("a", 1)] })
      vi.advanceTimersByTime(249)
      expect(apply).not.toHaveBeenCalled()
      vi.advanceTimersByTime(1)
      expect(apply).toHaveBeenCalledExactlyOnceWith({ upsert: [q("a", 1)] })
      expect(batcher.pending()).toBe(false)
      // The frame that comes late finds nothing left, and a frame that comes first leaves the timer nothing.
      frame()
      batcher.push({ upsert: [q("b", 2)] })
      frame()
      vi.advanceTimersByTime(1000)
      expect(apply).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it("keeps a recorded gap when later frames never mention one", () => {
    // Omitted fields keep their previous values all the way through: a frame that
    // carries only a seq must not silence the store's gap mid-replay.
    const store = createRowStore<Quote>({ getRowId: (r) => r.id })
    const { raf, frame } = fakeRaf()
    const batcher = createFrameBatcher<Quote>((b) => store.applyDeltas(b), { getRowId: (r) => r.id, raf })
    batcher.push({ meta: { gap: true, seq: 10 } })
    frame()
    expect(store.getMeta().gap).toBe(true)
    batcher.push({ patch: [{ id: "a", fields: { px: 1 } }], meta: { seq: 11 } })
    frame()
    expect(store.getMeta().gap).toBe(true)
    batcher.push({ meta: { gap: false, seq: 12 } })
    frame()
    expect(store.getMeta().gap).toBe(false)
    // A gap that opens and closes inside one frame ends closed, as two frames would.
    batcher.push({ meta: { gap: true, seq: 13 } })
    batcher.push({ meta: { gap: false, seq: 14 } })
    frame()
    expect(store.getMeta().gap).toBe(false)
    batcher.push({ meta: { gap: false, seq: 15 } })
    batcher.push({ meta: { gap: true, seq: 16 } })
    frame()
    expect(store.getMeta().gap).toBe(true)
  })

  it("publishes id snapshots that never alias the live array", () => {
    const store = createRowStore<Quote>({ getRowId: (r) => r.id })
    const before = store.getIds()
    store.applyDeltas({ upsert: [q("a", 1)] })
    expect(before).toHaveLength(0)
    const first = store.getIds()
    store.clear()
    const empty = store.getIds()
    store.applyDeltas({ upsert: [q("b", 1)] })
    expect(empty).toHaveLength(0)
    expect(first.map(String)).toEqual(["a"])
  })

    it("coalesces one frame of messages into one batch, last write wins", () => {
    const apply = vi.fn<(b: DeltaBatch<Quote>) => void>()
    const { raf, frame } = fakeRaf()
    const batcher = createFrameBatcher<Quote>(apply, { getRowId: (r) => r.id, raf })
    batcher.push({ patch: [{ id: "a", fields: { px: 1 } }] })
    batcher.push({ patch: [{ id: "a", fields: { px: 2 } }, { id: "a", fields: { qty: 5 } }] })
    batcher.push({ patch: [{ id: "b", fields: { px: 3 } }], meta: { dropped: 2, seq: 1 } })
    batcher.push({ upsert: [q("c", 1)], meta: { dropped: 3, seq: 2, gap: true } })
    batcher.push({ patch: [{ id: "c", fields: { px: 9 } }] })
    batcher.push({ upsert: [q("d", 1)] })
    batcher.push({ remove: ["d"] })
    batcher.push({ order: ["x"] })
    batcher.push({ order: ["b", "a"] })
    expect(raf).toHaveBeenCalledTimes(1)
    expect(batcher.pending()).toBe(true)
    expect(apply).not.toHaveBeenCalled()
    frame()
    expect(apply).toHaveBeenCalledTimes(1)
    expect(apply.mock.calls[0]![0]).toEqual({
      upsert: [{ id: "c", px: 9, qty: 1 }],
      patch: [
        { id: "a", fields: { px: 2, qty: 5 } },
        { id: "b", fields: { px: 3 } },
      ],
      remove: ["d"],
      order: ["b", "a"],
      meta: { dropped: 5, seq: 2, gap: true },
    })
    expect(batcher.pending()).toBe(false)
  })

  it("an upsert after a patch replaces it; a remove after an upsert wins", () => {
    const apply = vi.fn<(b: DeltaBatch<Quote>) => void>()
    const { raf, frame } = fakeRaf()
    const batcher = createFrameBatcher<Quote>(apply, { getRowId: (r) => r.id, raf })
    batcher.push({ patch: [{ id: "a", fields: { qty: 5 } }] })
    batcher.push({ upsert: [q("a", 7)] })
    batcher.push({ upsert: [q("b", 1)] })
    batcher.push({ remove: ["b"] })
    frame()
    expect(apply.mock.calls[0]![0]).toEqual({ upsert: [q("a", 7)], remove: ["b"] })
  })

  it("flush applies now and cancels the frame; cancel drops the queue; empty frames apply nothing", () => {
    const apply = vi.fn()
    const { raf, caf, frame } = fakeRaf()
    const batcher = createFrameBatcher<Quote>(apply, { getRowId: (r) => r.id, raf, caf })
    batcher.push({ patch: [{ id: "a", fields: { px: 1 } }] })
    batcher.flush()
    expect(caf).toHaveBeenCalledTimes(1)
    expect(apply).toHaveBeenCalledTimes(1)
    frame()
    expect(apply).toHaveBeenCalledTimes(1)
    batcher.push({ patch: [{ id: "a", fields: { px: 2 } }] })
    batcher.cancel()
    frame()
    expect(apply).toHaveBeenCalledTimes(1)
    batcher.flush()
    expect(apply).toHaveBeenCalledTimes(1)
  })
})
