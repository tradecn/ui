import { afterEach, describe, expect, it, vi } from "vitest"
import { createBroadcastChannelTransport, createLinkGroupStore, cycleLinkGroup, isLinkMessage, normalizeSymbol, type LinkMessage, type LinkTransport } from "@/registry/tradecn/lib/link-group"

// Every transport made from one hub hears what the others post, and never its own.
function createHub() {
  const ends = new Set<(message: LinkMessage) => void>()
  const log: LinkMessage[] = []
  return {
    log,
    transport(): LinkTransport {
      let mine: ((message: LinkMessage) => void) | null = null
      return {
        post(message) {
          log.push(message)
          for (const end of [...ends]) if (end !== mine) end(structuredClone(message))
        },
        subscribe(cb) {
          mine = cb
          ends.add(cb)
          return () => {
            ends.delete(cb)
            mine = null
          }
        },
      }
    },
  }
}

describe("cycleLinkGroup", () => {
  it("goes unlinked, 1, 2, 3, 4, unlinked, and back the other way", () => {
    expect([null, 1, 2, 3, 4].map((g) => cycleLinkGroup(g as 1 | null))).toEqual([1, 2, 3, 4, null])
    expect([null, 1, 2, 3, 4].map((g) => cycleLinkGroup(g as 1 | null, -1))).toEqual([4, null, 1, 2, 3])
  })

  it("treats a group it does not know as unlinked", () => {
    expect(cycleLinkGroup(9 as unknown as 1)).toBe(1)
  })
})

describe("normalizeSymbol", () => {
  it("trims, and makes blank null", () => {
    expect(normalizeSymbol("  ZN ")).toBe("ZN")
    expect(normalizeSymbol("   ")).toBeNull()
    expect(normalizeSymbol(null)).toBeNull()
    expect(normalizeSymbol(undefined)).toBeNull()
  })
})

describe("createLinkGroupStore", () => {
  it("holds one symbol per group and counts writes", () => {
    const store = createLinkGroupStore()
    expect(store.get(1)).toEqual({ group: 1, symbol: null, source: null, version: 0 })
    store.set(1, " ZN ", "book-a")
    store.set(2, "ES")
    expect(store.get(1)).toEqual({ group: 1, symbol: "ZN", source: "book-a", version: 1 })
    expect(store.get(2)).toEqual({ group: 2, symbol: "ES", source: null, version: 1 })
    expect(store.get(3).symbol).toBeNull()
  })

  it("keeps the same snapshot until the group changes, and tells subscribers when it does", () => {
    const store = createLinkGroupStore()
    const heard = vi.fn()
    const off = store.subscribe(heard)
    store.set(1, "ZN")
    const snapshot = store.get(1)
    store.set(1, "ZN")
    store.set(2, "ES")
    expect(store.get(1)).toBe(snapshot)
    expect(heard).toHaveBeenCalledTimes(2)
    off()
    store.set(1, "ZB")
    expect(heard).toHaveBeenCalledTimes(2)
  })

  it("clears with null, and ignores a group that does not exist", () => {
    const store = createLinkGroupStore()
    store.set(1, "ZN")
    store.set(1, null)
    expect(store.get(1)).toMatchObject({ symbol: null, version: 2 })
    store.set(1, "")
    expect(store.get(1).version).toBe(2)
    expect(() => store.set(7 as unknown as 1, "ZN")).not.toThrow()
  })

  it("seeds only a group nobody has written to, and a seed is not a write", () => {
    const store = createLinkGroupStore()
    store.seed(1, "ZN", "book-a")
    store.seed(1, "ES", "book-b")
    expect(store.get(1)).toEqual({ group: 1, symbol: "ZN", source: "book-a", version: 0 })
    store.set(2, "CL")
    store.set(2, null)
    store.seed(2, "NG")
    expect(store.get(2).symbol).toBeNull()
    store.seed(3, "  ")
    expect(store.get(3).symbol).toBeNull()
  })

  it("counts writing a seed's own symbol as the first write, so other windows hear it", () => {
    const hub = createHub()
    const store = createLinkGroupStore({ transport: hub.transport(), id: "a" })
    store.connect()
    store.seed(1, "ZN")
    expect(hub.log.filter((m) => m.type === "set")).toEqual([])
    store.set(1, "ZN")
    expect(store.get(1).version).toBe(1)
    expect(hub.log.filter((m) => m.type === "set")).toHaveLength(1)
  })
})

describe("between windows", () => {
  it("carries a write to every connected store and does not echo it back", () => {
    const hub = createHub()
    const a = createLinkGroupStore({ transport: hub.transport(), id: "a" })
    const b = createLinkGroupStore({ transport: hub.transport(), id: "b" })
    a.connect()
    b.connect()
    const heard = vi.fn()
    b.subscribe(heard)
    a.set(1, "ZN", "book")
    expect(b.get(1)).toEqual({ group: 1, symbol: "ZN", source: "book", version: 1 })
    expect(heard).toHaveBeenCalledTimes(1)
    expect(hub.log.filter((m) => m.type === "set")).toHaveLength(1)
  })

  it("posts nothing until it is connected, and nothing after the last disconnect", () => {
    const hub = createHub()
    const a = createLinkGroupStore({ transport: hub.transport(), id: "a" })
    const b = createLinkGroupStore({ transport: hub.transport(), id: "b" })
    b.connect()
    a.set(1, "ZN")
    expect(b.get(1).symbol).toBeNull()
    const off1 = a.connect()
    const off2 = a.connect()
    off1()
    off1()
    a.set(1, "ZB")
    expect(b.get(1).symbol).toBe("ZB")
    off2()
    a.set(1, "ZF")
    expect(b.get(1).symbol).toBe("ZB")
    b.set(1, "ZT")
    expect(a.get(1).symbol).toBe("ZF")
  })

  it("tells a window that opens late what the others hold, seeds excepted", () => {
    const hub = createHub()
    const a = createLinkGroupStore({ transport: hub.transport(), id: "a" })
    a.connect()
    a.set(1, "ZN")
    a.set(1, "ZB")
    a.seed(2, "ES")
    const late = createLinkGroupStore({ transport: hub.transport(), id: "late" })
    late.seed(1, "stale, from storage")
    late.connect()
    expect(late.get(1)).toMatchObject({ symbol: "ZB", version: 2 })
    expect(late.get(2).symbol).toBeNull()
  })

  it("ignores a write older than what it holds", () => {
    const hub = createHub()
    const a = createLinkGroupStore({ transport: hub.transport(), id: "a" })
    a.connect()
    a.set(1, "ZN")
    a.set(1, "ZB")
    const probe = hub.transport()
    probe.subscribe(() => {})
    probe.post({ kind: "tradecn-link", type: "set", origin: "old", group: 1, symbol: "ES", source: null, version: 1 })
    expect(a.get(1).symbol).toBe("ZB")
  })

  it("settles two writes at the same version on the same symbol in both windows", () => {
    const post = vi.fn()
    const make = (id: string) => {
      let deliver: (m: LinkMessage) => void = () => {}
      const store = createLinkGroupStore({ id, transport: { post, subscribe: (cb) => ((deliver = cb), () => {}) } })
      store.connect()
      return { store, deliver: (m: LinkMessage) => deliver(m) }
    }
    const a = make("a")
    const b = make("b")
    a.store.set(1, "FROM-A")
    b.store.set(1, "FROM-B")
    a.deliver({ kind: "tradecn-link", type: "set", origin: "b", group: 1, symbol: "FROM-B", source: null, version: 1 })
    b.deliver({ kind: "tradecn-link", type: "set", origin: "a", group: 1, symbol: "FROM-A", source: null, version: 1 })
    expect(a.store.get(1).symbol).toBe("FROM-B")
    expect(b.store.get(1).symbol).toBe("FROM-B")
  })

  it("drops anything that is not a link message", () => {
    expect(isLinkMessage(null)).toBe(false)
    expect(isLinkMessage({ kind: "tradecn-link", type: "set", origin: "x", group: 5, symbol: "ZN", source: null, version: 1 })).toBe(false)
    expect(isLinkMessage({ kind: "tradecn-link", type: "set", origin: "x", group: 1, symbol: 7, source: null, version: 1 })).toBe(false)
    expect(isLinkMessage({ kind: "tradecn-link", type: "set", origin: "x", group: 1, symbol: "ZN", source: null, version: Number.NaN })).toBe(false)
    expect(isLinkMessage({ kind: "tradecn-link", type: "set", origin: "", group: 1, symbol: "ZN", source: null, version: 1 })).toBe(false)
    expect(isLinkMessage({ kind: "someone-else", type: "hello", origin: "x" })).toBe(false)
    expect(isLinkMessage({ kind: "tradecn-link", type: "hello", origin: "x" })).toBe(true)
    let deliver: (m: LinkMessage) => void = () => {}
    const store = createLinkGroupStore({ transport: { post: () => {}, subscribe: (cb) => ((deliver = cb), () => {}) } })
    store.connect()
    deliver({ type: "set", group: 1, symbol: "ZN" } as unknown as LinkMessage)
    expect(store.get(1).symbol).toBeNull()
  })

  it("connects to nothing without a transport", () => {
    const store = createLinkGroupStore()
    expect(() => store.connect()()).not.toThrow()
  })
})

describe("createBroadcastChannelTransport", () => {
  afterEach(() => vi.unstubAllGlobals())

  function stubChannel() {
    const made: FakeChannel[] = []
    class FakeChannel {
      listeners = new Set<(event: MessageEvent) => void>()
      posted: unknown[] = []
      closed = false
      name: string
      constructor(name: string) {
        this.name = name
        made.push(this)
      }
      addEventListener(_: string, cb: (event: MessageEvent) => void) {
        this.listeners.add(cb)
      }
      removeEventListener(_: string, cb: (event: MessageEvent) => void) {
        this.listeners.delete(cb)
      }
      postMessage(data: unknown) {
        this.posted.push(data)
      }
      close() {
        this.closed = true
      }
    }
    vi.stubGlobal("BroadcastChannel", FakeChannel)
    return made
  }

  it("opens with the first subscriber, closes with the last, and delivers only link messages", () => {
    const made = stubChannel()
    const transport = createBroadcastChannelTransport("rates")
    transport.post({ kind: "tradecn-link", type: "hello", origin: "a" })
    expect(made).toHaveLength(0)
    const one = vi.fn()
    const two = vi.fn()
    const offOne = transport.subscribe(one)
    const offTwo = transport.subscribe(two)
    expect(made).toHaveLength(1)
    expect(made[0]!.name).toBe("rates")
    const hello: LinkMessage = { kind: "tradecn-link", type: "hello", origin: "b" }
    for (const cb of made[0]!.listeners) cb({ data: hello } as MessageEvent)
    for (const cb of made[0]!.listeners) cb({ data: "noise" } as MessageEvent)
    expect(one).toHaveBeenCalledTimes(1)
    expect(two).toHaveBeenCalledWith(hello)
    transport.post(hello)
    expect(made[0]!.posted).toEqual([hello])
    offOne()
    expect(made[0]!.closed).toBe(false)
    offTwo()
    expect(made[0]!.closed).toBe(true)
    transport.subscribe(one)
    expect(made).toHaveLength(2)
  })

  it("is inert where there is no BroadcastChannel", () => {
    vi.stubGlobal("BroadcastChannel", undefined)
    const transport = createBroadcastChannelTransport()
    const off = transport.subscribe(() => {})
    expect(() => transport.post({ kind: "tradecn-link", type: "hello", origin: "a" })).not.toThrow()
    expect(() => off()).not.toThrow()
  })
})
