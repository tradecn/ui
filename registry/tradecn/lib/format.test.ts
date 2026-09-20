// @vitest-environment node
import fc from "fast-check"
import { describe, expect, it, vi } from "vitest"
import {
  NULL_TOKEN,
  createInstrumentFormatter,
  decimalsFromTick,
  formatBps,
  formatDv01,
  formatFraction,
  formatNotional,
  formatPercent,
  formatPrice,
  formatQuantity,
  formatSigned,
  formatYield,
  numberFormat,
  parsePrice,
  roundToTick,
  stepByTick,
  type PriceConvention,
} from "@/registry/tradecn/lib/format"

const MINUS = "−"
const T32 = { kind: "fraction", denominator: 32, half: "+" } as const satisfies PriceConvention
const T32_5 = { kind: "fraction", denominator: 32, half: "5" } as const satisfies PriceConvention
const T32_8 = { kind: "fraction", denominator: 32, half: "+", eighths: true } as const satisfies PriceConvention
const T64 = { kind: "fraction", denominator: 64, half: "+" } as const satisfies PriceConvention

describe("decimalsFromTick", () => {
  it.each([
    [1, 0],
    [0.5, 1],
    [0.25, 2],
    [0.01, 2],
    [0.001, 3],
    [1 / 32, 5],
    [1 / 64, 6],
    [0.0000001, 7],
  ])("tick %d gives %d decimals", (tick, decimals) => {
    expect(decimalsFromTick(tick)).toBe(decimals)
  })
  it("powers of ten round-trip", () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 8 }), (n) => decimalsFromTick(10 ** -n) === n))
  })
  it("caps at max and tolerates nonsense", () => {
    expect(decimalsFromTick(1 / 3, 4)).toBe(4)
    expect(decimalsFromTick(0)).toBe(0)
    expect(decimalsFromTick(-1)).toBe(0)
  })
})

describe("roundToTick / stepByTick", () => {
  it("snaps and cleans float noise", () => {
    expect(roundToTick(100.0049, 0.001)).toBe(100.005)
    expect(roundToTick(0.1 + 0.2, 0.1)).toBe(0.3)
    expect(roundToTick(99.51, 1 / 32)).toBe(99.5)
  })
  it("steps from the grid, not from the raw value", () => {
    expect(stepByTick(99.51, 1 / 32, 1)).toBe(99.53125)
    expect(stepByTick(100, 0.001, -3)).toBe(99.997)
  })
})

describe("fractions", () => {
  it.each([
    [99.5, T32, "99-16"],
    [99.515625, T32, "99-16+"],
    [99.515625, T32_5, "99-165"],
    [99.5078125, T32_8, "99-162"],
    [99.515625, T32_8, "99-164"],
    [100, T32, "100-00"],
    [99.984375, T32, "99-31+"],
    [99.5, T64, "99-32"],
    [99.5078125, T64, "99-32+"],
    [-0.5, T32, `${MINUS}0-16`],
    [0, T32, "0-00"],
  ])("%d formats as %s", (v, c, s) => {
    expect(formatFraction(v, c)).toBe(s)
  })
  it("rounds to the finest representable unit instead of drifting", () => {
    expect(formatFraction(99.5000001, T32)).toBe("99-16")
    expect(formatFraction(99.99999999, T32)).toBe("100-00")
  })
  it("parses its own output on the 1/64 grid (32nds with halves)", () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 200 * 64 }), (n) => parsePrice(formatFraction(n / 64, T32), T32) === n / 64))
  })
  it("parses its own output on the 1/256 grid (32nds with eighths)", () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 200 * 256 }), (n) => parsePrice(formatFraction(n / 256, T32_8), T32_8) === n / 256))
  })
  it("parses the '5' half notation and 64ths", () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 200 * 64 }), (n) => parsePrice(formatFraction(n / 64, T32_5), T32_5) === n / 64))
    fc.assert(fc.property(fc.integer({ min: 0, max: 200 * 128 }), (n) => parsePrice(formatFraction(n / 128, T64), T64) === n / 128))
  })
  it("parses what a trader types", () => {
    expect(parsePrice("99-16+", T32)).toBe(99.515625)
    expect(parsePrice(" 99-16 ", T32)).toBe(99.5)
    expect(parsePrice("99", T32)).toBe(99)
    expect(parsePrice("99.515625", T32)).toBe(99.515625)
    expect(parsePrice("-0-16", T32)).toBe(-0.5)
    expect(parsePrice("99-32", T32)).toBeNull()
    expect(parsePrice("99-16x", T32)).toBeNull()
    expect(parsePrice("99-163", T32)).toBeNull()
    expect(parsePrice("99-168", T32_8)).toBeNull()
    expect(parsePrice("", T32)).toBeNull()
    expect(parsePrice("abc", T32)).toBeNull()
  })
})

describe("decimal and tick prices", () => {
  it("formats and parses on the tick grid", () => {
    const c = { kind: "tick", tick: 0.005 } as const
    expect(formatPrice(100.0049, c)).toBe("100.005")
    expect(parsePrice("100.004", c)).toBe(100.005)
    fc.assert(fc.property(fc.integer({ min: -100000, max: 100000 }), (n) => parsePrice(formatPrice(n * 0.005, c), c) === roundToTick(n * 0.005, 0.005)))
  })
  it("fixed decimals with a typographic minus", () => {
    expect(formatPrice(-1234.5, { kind: "decimal", decimals: 2 })).toBe(`${MINUS}1,234.50`)
    expect(parsePrice("1,234.567", { kind: "decimal", decimals: 2 })).toBe(1234.57)
  })
})

describe("yield, bps, dv01, notional, signed, percent, quantity", () => {
  it("formats the fixed-income set", () => {
    expect(formatYield(4.2531)).toBe("4.253%")
    expect(formatYield(4.2531, { decimals: 2, suffix: "" })).toBe("4.25")
    expect(formatBps(12.5)).toBe("12.5 bp")
    expect(formatBps(-12.5, { signed: true, unit: "bps" })).toBe(`${MINUS}12.5 bps`)
    expect(formatBps(3, { unit: "" })).toBe("3.0")
    expect(formatDv01(1234.4)).toBe("$1,234")
    expect(formatDv01(-1234.4)).toBe(`${MINUS}$1,234`)
    expect(formatDv01(1234.4, { compact: true })).toBe("$1.23K")
    expect(formatDv01(1234.4, { currency: "EUR", locale: "de-DE" })).toMatch(/1\.234/)
    expect(formatNotional(1250000, { compact: true })).toBe("1.25M")
    expect(formatNotional(3.4e9, { compact: true })).toBe("3.40B")
    expect(formatNotional(1.2e12, { compact: true })).toBe("1.20T")
    expect(formatNotional(999, { compact: true })).toBe("999")
    expect(formatNotional(1250000)).toBe("1,250,000.00")
    expect(formatQuantity(1000000)).toBe("1,000,000")
    expect(formatQuantity(1000000.6)).toBe("1,000,001")
    expect(formatPercent(1.234)).toBe("1.23%")
    expect(formatPercent(1.234, { signed: true })).toBe("+1.23%")
    expect(formatPercent(0, { signed: true })).toBe("0.00%")
  })
  it("signed values are symmetric and flat carries no sign", () => {
    expect(formatSigned(0)).toBe("0.00")
    expect(formatSigned(0.001)).toBe("0.00")
    fc.assert(
      fc.property(fc.double({ min: 0.01, max: 1e9, noNaN: true }), (x) => {
        const pos = formatSigned(x)
        const neg = formatSigned(-x)
        return pos.startsWith("+") && neg.startsWith(MINUS) && pos.slice(1) === neg.slice(1)
      }),
    )
  })
})

describe("null sentinel", () => {
  const fns: ((v: number | null | undefined) => string)[] = [
    (v) => formatPrice(v, { kind: "decimal", decimals: 2 }),
    (v) => formatPrice(v, T32),
    (v) => formatFraction(v, T32),
    (v) => formatYield(v),
    (v) => formatBps(v),
    (v) => formatDv01(v),
    (v) => formatNotional(v),
    (v) => formatNotional(v, { compact: true }),
    (v) => formatSigned(v),
    (v) => formatPercent(v),
    (v) => formatQuantity(v),
  ]
  it.each([null, undefined, NaN, Infinity, -Infinity])("every formatter returns the sentinel for %s", (v) => {
    for (const fn of fns) expect(fn(v as number)).toBe(NULL_TOKEN)
  })
})

describe("instrument formatter", () => {
  it("binds a convention", () => {
    const ust = createInstrumentFormatter({ price: T32, tick: 1 / 64, yieldDecimals: 3 })
    expect(ust.price(99.515625)).toBe("99-16+")
    expect(ust.step(99.5, 2)).toBe(99.53125)
    expect(ust.parsePrice("99-17")).toBe(99.53125)
    expect(ust.yield(4.25)).toBe("4.250%")
    expect(ust.quantity(5000000)).toBe("5,000,000")
  })
})

describe("Intl cache", () => {
  it("constructs one formatter per locale and option set", () => {
    const spy = vi.spyOn(Intl, "NumberFormat")
    const key = { minimumFractionDigits: 4, maximumFractionDigits: 4 }
    numberFormat("en-GB", key)
    numberFormat("en-GB", key)
    numberFormat("en-GB", { ...key })
    expect(spy).toHaveBeenCalledTimes(1)
    spy.mockRestore()
  })
})
