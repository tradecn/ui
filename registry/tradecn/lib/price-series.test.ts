import { describe, expect, it } from "vitest"
import type { InstrumentConvention } from "@/registry/tradecn/lib/format"
import { barId, barStart, columnsOf, directionBetween, foldTick, foldTicks, formatChange, priceDecimals, priceIncrements, priceStep, summarize, sameSummary, timeFormatter, type Bar } from "@/registry/tradecn/lib/price-series"
import { createRowStore } from "@/registry/tradecn/lib/row-store"

const ZN: InstrumentConvention = { price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 }
const ES: InstrumentConvention = { price: { kind: "decimal", decimals: 2 }, tick: 0.25 }
const MINUTE = 60_000

const bars = () => createRowStore<Bar>({ getRowId: (bar) => barId(bar.time), lane: "ordered" })

describe("bars from ticks", () => {
  it("puts a moment on the interval grid and names the row by its start", () => {
    expect(barStart(MINUTE * 10 + 15_000, MINUTE)).toBe(MINUTE * 10)
    expect(barId(600_000)).toBe("600000")
  })

  it("opens a bar on the first tick and folds the next ticks into its high, low, close, and volume", () => {
    const first = foldTick(undefined, { at: 10, price: 100, size: 5 }, MINUTE)
    expect(first).toEqual({ time: 0, open: 100, high: 100, low: 100, close: 100, volume: 5 })
    const second = foldTick(first, { at: 20, price: 101, size: 2 }, MINUTE)
    const third = foldTick(second, { at: 30, price: 99.5 }, MINUTE)
    expect(third).toEqual({ time: 0, open: 100, high: 101, low: 99.5, close: 99.5, volume: 7 })
    // A tick in the next interval opens a new bar and leaves the old one alone.
    expect(foldTick(third, { at: MINUTE + 1, price: 99 }, MINUTE)).toEqual({ time: MINUTE, open: 99, high: 99, low: 99, close: 99, volume: null })
  })

  it("keeps volume null while no tick has a size", () => {
    const a = foldTick(undefined, { at: 1, price: 10 }, MINUTE)
    expect(a.volume).toBeNull()
    expect(foldTick(a, { at: 2, price: 11 }, MINUTE).volume).toBeNull()
    expect(foldTick(a, { at: 2, price: 11, size: 3 }, MINUTE).volume).toBe(3)
  })

  it("folds a frame of ticks into one upsert per bar, continuing the bar the store already holds", () => {
    const store = bars()
    store.applyDeltas(foldTicks(store, [{ at: 5, price: 100, size: 1 }, { at: 6, price: 102, size: 1 }], MINUTE))
    expect(store.getRow("0")).toEqual({ time: 0, open: 100, high: 102, low: 100, close: 102, volume: 2 })
    const batch = foldTicks(store, [{ at: 7, price: 99, size: 1 }, { at: MINUTE + 1, price: 98 }, { at: MINUTE + 2, price: 98.5 }, { at: 8, price: Number.NaN }], MINUTE)
    expect(batch.upsert).toEqual([
      { time: 0, open: 100, high: 102, low: 99, close: 99, volume: 3 },
      { time: MINUTE, open: 98, high: 98.5, low: 98, close: 98.5, volume: null },
    ])
    store.applyDeltas(batch)
    expect(store.getIds()).toEqual(["0", String(MINUTE)])
  })
})

describe("columns", () => {
  it("reads the store in its order into one array per field and skips a bar with a hole in it", () => {
    const store = bars()
    store.applyDeltas({ upsert: [{ time: 0, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 }, { time: MINUTE, open: Number.NaN, high: 2, low: 1, close: 1 }, { time: 2 * MINUTE, open: 1.5, high: 1.6, low: 1.4, close: 1.45 }] })
    const columns = columnsOf(store)
    expect(columns.time).toEqual([0, 2 * MINUTE])
    expect(columns.open).toEqual([1, 1.5])
    expect(columns.high).toEqual([2, 1.6])
    expect(columns.low).toEqual([0.5, 1.4])
    expect(columns.close).toEqual([1.5, 1.45])
    expect(columns.volume).toEqual([10, null])
    expect(columns.bars).toHaveLength(2)
  })

  it("sorts by time when a backfill arrived out of order, and not otherwise", () => {
    const store = bars()
    store.applyDeltas({ upsert: [{ time: 2 * MINUTE, open: 3, high: 3, low: 3, close: 3 }, { time: 0, open: 1, high: 1, low: 1, close: 1 }, { time: MINUTE, open: 2, high: 2, low: 2, close: 2 }] })
    expect(columnsOf(store).close).toEqual([1, 2, 3])
  })

  it("is empty for an empty store, the same object each time", () => {
    const store = bars()
    expect(columnsOf(store)).toBe(columnsOf(store))
    expect(columnsOf(store).bars).toEqual([])
  })
})

describe("the summary", () => {
  const store = bars()
  store.applyDeltas({ upsert: [{ time: 0, open: 100, high: 101, low: 99, close: 100.5 }, { time: MINUTE, open: 100.5, high: 102, low: 100, close: 101.5 }] })
  const columns = columnsOf(store)

  it("measures the change from the first open without a baseline, and from the baseline with one", () => {
    const plain = summarize(columns)
    expect(plain.count).toBe(2)
    expect(plain.reference).toBe(100)
    expect(plain.change).toBeCloseTo(1.5)
    expect(plain.changePct).toBeCloseTo(1.5)
    expect(plain.direction).toBe("up")
    expect(plain.low).toBe(99)
    expect(plain.high).toBe(102)
    const against = summarize(columns, 102)
    expect(against.reference).toBe(102)
    expect(against.change).toBeCloseTo(-0.5)
    expect(against.direction).toBe("down")
    // A baseline that is not a number is no baseline.
    expect(summarize(columns, Number.NaN).reference).toBe(100)
    expect(summarize(columns, null).reference).toBe(100)
  })

  it("is flat at no change and empty with no bars", () => {
    expect(directionBetween(1, 1)).toBe("flat")
    expect(summarize(columns, 101.5).direction).toBe("flat")
    const empty = summarize(columnsOf(bars()))
    expect(empty.count).toBe(0)
    expect(empty.last).toBeNull()
    expect(empty.direction).toBe("flat")
  })

  it("knows when two summaries print the same", () => {
    expect(sameSummary(summarize(columns), summarize(columns))).toBe(true)
    expect(sameSummary(summarize(columns), summarize(columns, 102))).toBe(false)
  })
})

describe("the price axis", () => {
  it("steps a fraction by doubling from its 32nd or its tick, so every label is a clean fraction", () => {
    expect(priceStep(ZN)).toBe(1 / 64)
    expect(priceStep({ kind: "fraction", denominator: 32, half: "+" })).toBe(1 / 32)
    const incrs = priceIncrements(ZN)
    expect(incrs.slice(0, 8)).toEqual([1 / 64, 1 / 32, 1 / 16, 1 / 8, 1 / 4, 1 / 2, 1, 2])
    expect(incrs).toContain(64)
  })

  it("steps a decimal 1, 2, 5 per decade from its last place", () => {
    expect(priceStep(ES)).toBe(0.25)
    expect(priceIncrements(ES).slice(0, 6)).toEqual([0.25, 0.5, 1.25, 2.5, 5, 12.5])
    expect(priceIncrements({ kind: "decimal", decimals: 2 }).slice(0, 4)).toEqual([0.01, 0.02, 0.05, 0.1])
    expect(priceIncrements({ kind: "tick", tick: 0.001 }).slice(0, 3)).toEqual([0.001, 0.002, 0.005])
  })

  it("prints a change with its sign in the convention, and knows a decimal's places", () => {
    expect(formatChange(2.5 / 32, ZN)).toBe("+0-02+")
    expect(formatChange(-1 / 32, ZN)).toBe("−0-01")
    expect(formatChange(0, ZN)).toBe("0-00")
    expect(formatChange(1.25, ES)).toBe("+1.25")
    expect(formatChange(-0.5, ES)).toBe("−0.50")
    expect(formatChange(null, ES)).toBe("–")
    expect(priceDecimals(ES)).toBe(2)
    expect(priceDecimals({ kind: "tick", tick: 0.001 })).toBe(3)
    expect(priceDecimals(ZN)).toBe(0)
  })
})

describe("the clock reading", () => {
  const noon = Date.UTC(2026, 0, 15, 12, 0, 5)

  it("prints the time in the zone, 24-hour, with seconds unless told otherwise", () => {
    expect(timeFormatter("America/New_York")(noon)).toBe("07:00:05")
    expect(timeFormatter("Asia/Tokyo")(noon)).toBe("21:00:05")
    expect(timeFormatter("Etc/UTC", undefined, false)(noon)).toBe("12:00")
  })

  it("falls back to the runtime's zone for one it does not know instead of throwing", () => {
    expect(() => timeFormatter("Mars/Olympus")(noon)).not.toThrow()
    expect(timeFormatter("Mars/Olympus")(noon)).toMatch(/^\d\d:\d\d:\d\d$/)
  })
})
