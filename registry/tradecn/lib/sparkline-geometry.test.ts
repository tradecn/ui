import fc from "fast-check"
import { afterEach, describe, expect, it, vi } from "vitest"
import { buildSparklineGeometry, nearestPointIndex, observeSize, resetSizeObserver } from "@/registry/tradecn/lib/sparkline-geometry"

describe("buildSparklineGeometry", () => {
  it("is empty for no readings, and for readings that are all gaps", () => {
    for (const values of [[], [null, undefined, Number.NaN, Infinity]]) {
      expect(buildSparklineGeometry(values, 100, 20)).toEqual({ line: "", area: "", points: [], min: 0, max: 0, baselineY: null })
    }
  })

  it("puts the high at the top and the low at the bottom, inside the padding", () => {
    const g = buildSparklineGeometry([1, 3, 2], 104, 24, { padding: 2 })
    expect(g.points).toEqual([
      { index: 0, value: 1, x: 2, y: 22 },
      { index: 1, value: 3, x: 52, y: 2 },
      { index: 2, value: 2, x: 102, y: 12 },
    ])
    expect(g.line).toBe("M2 22 L52 2 L102 12")
    expect(g.area).toBe("M2 22 L52 2 L102 12 L102 22 L2 22 Z")
    expect([g.min, g.max]).toEqual([1, 3])
  })

  it("draws a flat series through the middle, not along the floor", () => {
    const g = buildSparklineGeometry([5, 5, 5], 104, 24, { padding: 2 })
    expect(g.points.map((p) => p.y)).toEqual([12, 12, 12])
  })

  it("keeps each reading at the x of its own index and breaks the line at a gap", () => {
    const g = buildSparklineGeometry([1, 2, null, Number.NaN, 2, 1], 104, 24, { padding: 2 })
    expect(g.points.map((p) => [p.index, p.x])).toEqual([
      [0, 2],
      [1, 22],
      [4, 82],
      [5, 102],
    ])
    expect(g.line).toBe("M2 22 L22 2 M82 2 L102 22")
    expect(g.area.match(/Z/g)).toHaveLength(2)
  })

  it("gives a reading with gaps on both sides a dot, and no area", () => {
    const g = buildSparklineGeometry([1, null, 3, null, 2], 104, 24, { padding: 2 })
    expect(g.line).toBe("M2 22 h0 M52 2 h0 M102 12 h0")
    expect(g.area).toBe("")
  })

  it("centers a single reading", () => {
    const g = buildSparklineGeometry([7], 104, 24, { padding: 2 })
    expect(g.points).toEqual([{ index: 0, value: 7, x: 52, y: 12 }])
    expect(g.line).toBe("M52 12 h0")
  })

  it("lets a baseline join the scale, so it is always on the plot", () => {
    const above = buildSparklineGeometry([1, 2], 104, 24, { padding: 2, baseline: 5 })
    expect(above.baselineY).toBe(2)
    expect(above.points.map((p) => p.y)).toEqual([22, 17])
    expect([above.min, above.max]).toEqual([1, 2])
    const inside = buildSparklineGeometry([0, 4], 104, 24, { padding: 2, baseline: 1 })
    expect(inside.baselineY).toBe(17)
    expect(buildSparklineGeometry([1, 2], 104, 24, { baseline: Number.NaN }).baselineY).toBeNull()
  })

  it("survives a box with no room, and a long history", () => {
    const tiny = buildSparklineGeometry([1, 2, 3], 0, -5)
    for (const p of tiny.points) expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true)
    const long = Array.from({ length: 300_000 }, (_, i) => Math.sin(i / 100))
    expect(() => buildSparklineGeometry(long, 200, 40)).not.toThrow()
  })

  it("rounds coordinates to two decimals", () => {
    const g = buildSparklineGeometry([1, 2, 3, 4], 101, 23, { padding: 2 })
    for (const n of g.line.match(/-?\d+(\.\d+)?/g) ?? []) expect(n.split(".")[1]?.length ?? 0).toBeLessThanOrEqual(2)
  })

  it("keeps every point inside the padded box, in index order, whatever it is given", () => {
    const reading = fc.oneof(fc.double({ noNaN: true, noDefaultInfinity: true, min: -1e9, max: 1e9 }), fc.constant(null), fc.constant(Number.NaN))
    fc.assert(
      fc.property(fc.array(reading, { maxLength: 60 }), fc.integer({ min: 8, max: 400 }), fc.integer({ min: 8, max: 120 }), (values, width, height) => {
        const g = buildSparklineGeometry(values, width, height, { padding: 2 })
        const finite = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v))
        expect(g.points).toHaveLength(finite.length)
        for (const p of g.points) {
          expect(p.x).toBeGreaterThanOrEqual(2)
          expect(p.x).toBeLessThanOrEqual(width - 2)
          expect(p.y).toBeGreaterThanOrEqual(2)
          expect(p.y).toBeLessThanOrEqual(height - 2)
        }
        for (let i = 1; i < g.points.length; i++) expect(g.points[i]!.x).toBeGreaterThanOrEqual(g.points[i - 1]!.x)
      }),
    )
  })
})

describe("nearestPointIndex", () => {
  const points = buildSparklineGeometry([1, 2, null, null, 2, 1], 104, 24, { padding: 2 }).points

  it("finds the closest reading, across a gap too", () => {
    expect(nearestPointIndex(points, -50)).toBe(0)
    expect(nearestPointIndex(points, 11)).toBe(0)
    expect(nearestPointIndex(points, 13)).toBe(1)
    expect(nearestPointIndex(points, 51)).toBe(1)
    expect(nearestPointIndex(points, 53)).toBe(2)
    expect(nearestPointIndex(points, 999)).toBe(3)
  })

  it("is -1 with nothing to find, and 0 with one reading", () => {
    expect(nearestPointIndex([], 10)).toBe(-1)
    expect(nearestPointIndex(points.slice(0, 1), 80)).toBe(0)
  })
})

describe("observeSize", () => {
  afterEach(() => {
    resetSizeObserver()
    vi.unstubAllGlobals()
  })

  function stubObserver() {
    const made: FakeObserver[] = []
    class FakeObserver {
      observed = new Set<Element>()
      cb: ResizeObserverCallback
      constructor(cb: ResizeObserverCallback) {
        this.cb = cb
        made.push(this)
      }
      observe(el: Element) {
        this.observed.add(el)
      }
      unobserve(el: Element) {
        this.observed.delete(el)
      }
      disconnect() {
        this.observed.clear()
      }
      fire(entries: Partial<ResizeObserverEntry>[]) {
        this.cb(entries as ResizeObserverEntry[], this as unknown as ResizeObserver)
      }
    }
    vi.stubGlobal("ResizeObserver", FakeObserver)
    return made
  }

  it("serves every element from one observer, and tells each only about itself", () => {
    const made = stubObserver()
    const a = document.createElement("div")
    const b = document.createElement("div")
    const onA = vi.fn()
    const onB = vi.fn()
    const offA = observeSize(a, onA)
    observeSize(b, onB)
    expect(made).toHaveLength(1)
    expect(made[0]!.observed.size).toBe(2)
    made[0]!.fire([{ target: a, contentBoxSize: [{ inlineSize: 120, blockSize: 24 }] as unknown as ResizeObserverSize[] }])
    made[0]!.fire([{ target: b, contentRect: { width: 80, height: 16 } as DOMRectReadOnly }])
    expect(onA.mock.calls).toEqual([[{ width: 120, height: 24 }]])
    expect(onB.mock.calls).toEqual([[{ width: 80, height: 16 }]])
    offA()
    expect(made[0]!.observed.has(a)).toBe(false)
    made[0]!.fire([{ target: a, contentRect: { width: 1, height: 1 } as DOMRectReadOnly }])
    expect(onA).toHaveBeenCalledTimes(1)
  })

  it("does nothing where there is no ResizeObserver", () => {
    vi.stubGlobal("ResizeObserver", undefined)
    expect(() => observeSize(document.createElement("div"), () => {})()).not.toThrow()
  })
})
