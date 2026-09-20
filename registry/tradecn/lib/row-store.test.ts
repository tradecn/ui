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
