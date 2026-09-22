// @vitest-environment node
import fc from "fast-check"
import { describe, expect, it, vi } from "vitest"
import {
  NULL_TOKEN,
  QUOTE_BASIS_LABELS,
  createInstrumentFormatter,
  daysToMaturity,
  decimalsFromTick,
  formatBps,
  formatCoupon,
  formatDv01,
  formatFraction,
  formatMaturity,
  formatNotional,
  formatPercent,
  formatPrice,
  formatQuantity,
  formatQuote,
  formatSigned,
  formatTicks,
  formatYield,
  numberFormat,
  parsePrice,
  parseQuote,
  quoteStepOf,
  roundToTick,
  stepByTick,
  stepQuote,
  ticksBetween,
  type InstrumentConvention,
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
    (v) => formatQuote(v, { price: T32, tick: 1 / 64, quoteBasis: "yield" }),
    (v) => formatCoupon(v),
    (v) => formatTicks(v),
    (v) => formatNotional(v, { unit: "mm" }),
    (v) => formatMaturity(v),
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
    expect(ust.basis).toBe("price")
    expect(ust.quoteStep).toBe(1 / 64)
    expect(ust.quote(99.515625)).toBe("99-16+")
    expect(ust.parseQuote("99-17")).toBe(99.53125)
    expect(ust.stepQuote(99.5, 1)).toBe(99.515625)
  })
})

describe("the quote basis", () => {
  const note: InstrumentConvention = { price: T32, tick: 1 / 64 }
  const bill: InstrumentConvention = { price: { kind: "decimal", decimals: 3 }, tick: 0.0005, quoteBasis: "discount" }
  const onYield: InstrumentConvention = { price: T32, tick: 1 / 64, quoteBasis: "yield", quoteDecimals: 4, quoteStep: 0.0005 }
  const credit: InstrumentConvention = { price: { kind: "decimal", decimals: 3 }, tick: 0.001, quoteBasis: "spread" }
  it("is price unless said, and each basis has a step and decimals of its own", () => {
    expect(quoteStepOf(note)).toBe(1 / 64)
    expect(quoteStepOf(bill)).toBe(0.001)
    expect(quoteStepOf(onYield)).toBe(0.0005)
    expect(quoteStepOf(credit)).toBe(0.1)
    expect(Object.keys(QUOTE_BASIS_LABELS).sort()).toEqual(["discount", "price", "spread", "yield"])
  })
  it("prints and reads a quote in its basis, with no unit", () => {
    expect(formatQuote(99.515625, note)).toBe("99-16+")
    expect(parseQuote("99-16+", note)).toBe(99.515625)
    expect(formatQuote(4.2531, bill)).toBe("4.253")
    expect(parseQuote("4.2531", bill)).toBe(4.253)
    expect(parseQuote(" 4,253.2 ", bill)).toBe(4253.2)
    expect(formatQuote(4.25275, onYield)).toBe("4.2530")
    expect(parseQuote("4.2527", onYield)).toBe(4.2525)
    expect(formatQuote(12.55, credit)).toBe("12.6")
    expect(parseQuote("12.55", credit)).toBe(12.6)
    expect(formatQuote(-0.5, credit)).toBe(`${MINUS}0.5`)
    expect(parseQuote("abc", credit)).toBeNull()
    expect(parseQuote("", bill)).toBeNull()
    expect(parseQuote("4-16", bill)).toBeNull()
  })
  it("steps in its basis", () => {
    expect(stepQuote(99.5, note, 1)).toBe(99.515625)
    expect(stepQuote(4.253, bill, -3)).toBe(4.25)
    expect(stepQuote(12.6, credit, 4)).toBe(13)
  })
  it("reads back what it printed on the basis grid", () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 20_000 }), (n) => parseQuote(formatQuote(n / 1000, bill), bill) === n / 1000))
    fc.assert(fc.property(fc.integer({ min: -5000, max: 5000 }), (n) => parseQuote(formatQuote(n / 10, credit), credit) === n / 10))
  })
})

describe("coupons, maturities, ticks, and millions", () => {
  it.each([
    [4.125, "4 1/8"],
    [4.25, "4 1/4"],
    [4.375, "4 3/8"],
    [4.5, "4 1/2"],
    [4.75, "4 3/4"],
    [4.875, "4 7/8"],
    [4, "4"],
    [0, "0"],
    [0.125, "1/8"],
    [4.1, "4.1"],
    [4.1234, "4.123"],
    [-4.125, `${MINUS}4 1/8`],
  ])("coupon %d prints as %s", (v, s) => {
    expect(formatCoupon(v)).toBe(s)
  })
  it("prints a coupon as a decimal when asked", () => {
    expect(formatCoupon(4.125, { style: "decimal" })).toBe("4.125%")
    expect(formatCoupon(4.125, { style: "decimal", decimals: 2 })).toBe("4.13%")
  })
  it("prints a maturity in UTC, two-digit year by default", () => {
    expect(formatMaturity("2034-05-15")).toBe("05/15/34")
    expect(formatMaturity("2034-05-15", { year: "numeric" })).toBe("05/15/2034")
    expect(formatMaturity(Date.UTC(2034, 4, 15))).toBe("05/15/34")
    expect(formatMaturity(new Date(Date.UTC(2034, 4, 15, 23, 59)))).toBe("05/15/34")
    expect(formatMaturity("2034-05-15", { locale: "de-DE" })).toMatch(/15\.05\.34/)
    expect(formatMaturity("nope")).toBe(NULL_TOKEN)
    expect(formatMaturity(null)).toBe(NULL_TOKEN)
  })
  it("counts whole days to a maturity", () => {
    const today = Date.UTC(2026, 8, 21, 15)
    expect(daysToMaturity("2026-12-24", today)).toBe(94)
    expect(daysToMaturity("2026-09-21", today)).toBe(0)
    expect(daysToMaturity("2026-09-20", today)).toBe(-1)
    expect(daysToMaturity("2027-09-21", today)).toBe(365)
    expect(daysToMaturity("nope", today)).toBeNull()
    expect(daysToMaturity(null, today)).toBeNull()
  })
  it("counts ticks between two prices to the nearest eighth", () => {
    expect(ticksBetween(99.53125, 99.515625, 1 / 64)).toBe(1)
    expect(ticksBetween(99.5, 99.515625, 1 / 64)).toBe(-1)
    expect(ticksBetween(100.0012, 100, 0.001)).toBe(1.25)
    expect(ticksBetween(100, 100, 0.001)).toBe(0)
    expect(ticksBetween(100, 100, 0)).toBeNaN()
    expect(ticksBetween(NaN, 100, 0.001)).toBeNaN()
  })
  it("prints ticks signed, trimmed, with a unit when given", () => {
    expect(formatTicks(1)).toBe("+1")
    expect(formatTicks(-0.5)).toBe(`${MINUS}0.5`)
    expect(formatTicks(0)).toBe("0")
    expect(formatTicks(1.25)).toBe("+1.25")
    expect(formatTicks(1, { signed: false })).toBe("1")
    expect(formatTicks(2, { unit: "ticks" })).toBe("+2 ticks")
  })
  it("prints millions as the desk says them", () => {
    expect(formatNotional(5e6, { unit: "mm" })).toBe("5mm")
    expect(formatNotional(50_000, { unit: "mm" })).toBe("0.05mm")
    expect(formatNotional(2.5e6, { unit: "mm" })).toBe("2.5mm")
    expect(formatNotional(1.25e9, { unit: "mm" })).toBe("1,250mm")
    expect(formatNotional(-5e6, { unit: "mm" })).toBe(`${MINUS}5mm`)
    expect(formatNotional(1.25e6, { unit: "mm", decimals: 1 })).toBe("1.3mm")
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
