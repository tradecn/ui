import { describe, expect, it } from "vitest"
import type { InstrumentConvention } from "@/registry/tradecn/lib/format"
import { blocks, checkLimits, confirms, distanceFromMarket, marketSideFor, problemsByField, type Limits } from "@/registry/tradecn/lib/limits"

const ust: InstrumentConvention = { price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 }
const bill: InstrumentConvention = { price: { kind: "decimal", decimals: 3 }, tick: 0.0005, quoteBasis: "discount" }
const credit: InstrumentConvention = { price: { kind: "decimal", decimals: 3 }, tick: 0.001, quoteBasis: "spread" }
const market = { bid: 99.5, ask: 99.515625, last: 99.5 }

describe("checkLimits", () => {
  it("says nothing without limits, and nothing when the draft is within them", () => {
    expect(checkLimits({ side: "buy", quantity: 5_000_000, price: 99.515625 }, undefined, { market, convention: ust })).toEqual([])
    const limits: Limits = { maxQuantity: 25_000_000, minQuantity: 1_000_000, maxDistance: { ticks: 4 }, sides: ["buy", "sell"] }
    expect(checkLimits({ side: "buy", quantity: 5_000_000, price: 99.53125 }, limits, { market, convention: ust })).toEqual([])
    expect(checkLimits({ quantity: null, price: null }, limits, { market, convention: ust })).toEqual([])
  })

  it("blocks a size above one number, and asks again past a confirm line before stopping at a block line", () => {
    expect(checkLimits({ quantity: 30_000_000 }, { maxQuantity: 25_000_000 })).toEqual([{ field: "quantity", level: "block", rule: "maxQuantity", message: "30,000,000 is above the size limit of 25,000,000." }])
    const lines: Limits = { maxQuantity: { confirm: 10_000_000, block: 50_000_000 } }
    expect(checkLimits({ quantity: 5_000_000 }, lines)).toEqual([])
    expect(checkLimits({ quantity: 20_000_000 }, lines)).toEqual([{ field: "quantity", level: "confirm", rule: "maxQuantity", message: "20,000,000 is above 10,000,000. Send it anyway?" }])
    expect(checkLimits({ quantity: 60_000_000 }, lines)).toEqual([{ field: "quantity", level: "block", rule: "maxQuantity", message: "60,000,000 is above the size limit of 50,000,000." }])
    expect(checkLimits({ quantity: 500 }, { minQuantity: { confirm: 1_000 } })[0]).toMatchObject({ level: "confirm", rule: "minQuantity", message: "500 is below 1,000. Send it anyway?" })
    expect(checkLimits({ quantity: 500 }, { minQuantity: 1_000 })[0]).toMatchObject({ level: "block", rule: "minQuantity" })
    expect(checkLimits({ quantity: 1_000 }, { minQuantity: 1_000 })).toEqual([])
  })

  it("measures a level against the market's same side in ticks for a price and basis points for a discount, and takes the level the rule sets", () => {
    // A buyer paying 99-20 against an offer of 99-16+ is seven 64ths away.
    const far = checkLimits({ side: "buy", quantity: 1, price: 99.625 }, { maxDistance: { ticks: 4 } }, { market, convention: ust })
    expect(far).toEqual([{ field: "price", level: "block", rule: "maxDistance", message: "The price is 7 ticks from the market; the limit is 4 ticks." }])
    expect(checkLimits({ side: "buy", quantity: 1, price: 99.5625 }, { maxDistance: { ticks: 4 } }, { market, convention: ust })).toEqual([])
    // A seller is measured against the bid.
    expect(checkLimits({ side: "sell", quantity: 1, price: 99.5625 }, { maxDistance: { ticks: 4 } }, { market, convention: ust })).toEqual([])
    expect(checkLimits({ side: "sell", quantity: 1, price: 99.375 }, { maxDistance: { ticks: 4 } }, { market, convention: ust })[0]?.message).toBe("The price is 8 ticks from the market; the limit is 4 ticks.")
    // A confirm, not a block, when the rule says so.
    expect(checkLimits({ side: "buy", quantity: 1, price: 99.625 }, { maxDistance: { ticks: 4, level: "confirm" } }, { market, convention: ust })[0]).toMatchObject({ level: "confirm", message: "The price is 7 ticks from the market, past 4 ticks. Send it anyway?" })
    // A quote's two sides, each against its own side of the market.
    expect(checkLimits({ bid: 99.25, ask: 99.53125 }, { maxDistance: { ticks: 4 } }, { market, convention: ust }).map((p) => p.field)).toEqual(["bid"])
    // A discount in basis points: 4.30 against a market of 4.25 is 5 bp.
    const billMarket = { bid: 4.26, ask: 4.25 }
    expect(checkLimits({ side: "buy", quantity: 1, price: 4.3 }, { maxDistance: { bps: 4 } }, { market: billMarket, convention: bill })[0]?.message).toBe("The price is 5 bp from the market; the limit is 4 bp.")
    expect(checkLimits({ side: "buy", quantity: 1, price: 4.28 }, { maxDistance: { bps: 4 } }, { market: billMarket, convention: bill })).toEqual([])
    // A spread is already in basis points: 203 against a market of 200 is 3 bp, not 300.
    const creditMarket = { bid: 205, ask: 200 }
    expect(checkLimits({ side: "buy", quantity: 1, price: 203 }, { maxDistance: { bps: 2 } }, { market: creditMarket, convention: credit })[0]?.message).toBe("The price is 3 bp from the market; the limit is 2 bp.")
    expect(checkLimits({ side: "buy", quantity: 1, price: 201.5 }, { maxDistance: { bps: 2 } }, { market: creditMarket, convention: credit })).toEqual([])
    // A ticks rule on a basis-point instrument, or no market, says nothing rather than something wrong.
    expect(checkLimits({ side: "buy", quantity: 1, price: 4.9 }, { maxDistance: { ticks: 4 } }, { market: billMarket, convention: bill })).toEqual([])
    expect(checkLimits({ side: "buy", quantity: 1, price: 105 }, { maxDistance: { ticks: 4 } }, { convention: ust })).toEqual([])
  })

  it("refuses a side the book does not take: a ticket's side, and for a quote a bid is a buy and an offer a sell", () => {
    expect(checkLimits({ side: "sell", quantity: 1 }, { sides: ["buy"] })).toEqual([{ field: "side", level: "block", rule: "sides", message: "The book does not take a sell." }])
    expect(checkLimits({ side: "buy", quantity: 1 }, { sides: ["buy"] })).toEqual([])
    expect(checkLimits({ bid: 99.5, ask: 99.53 }, { sides: ["sell"] })).toEqual([{ field: "bid", level: "block", rule: "sides", message: "The book does not take a buy." }])
    expect(checkLimits({ bid: null, ask: 99.53 }, { sides: ["sell"] })).toEqual([])
  })

  it("runs your own rules after its own, in the same shape, and takes its words from labels", () => {
    const limits: Limits = {
      maxQuantity: 10,
      custom: (draft) => (draft.quantity === 7 ? [{ field: "quantity", level: "confirm", rule: "lucky", message: "Seven again?" }] : []),
    }
    expect(checkLimits({ quantity: 7 }, limits)).toEqual([{ field: "quantity", level: "confirm", rule: "lucky", message: "Seven again?" }])
    expect(checkLimits({ quantity: 20 }, limits, { labels: { quantityAbove: "Zu groß: {n} über {max}." } })[0]?.message).toBe("Zu groß: 20 über 10.")
  })

  it("splits blocks from confirms and prints the first message per field", () => {
    const problems = checkLimits({ side: "sell", quantity: 60_000_000, price: 99.0 }, { maxQuantity: { confirm: 10_000_000, block: 50_000_000 }, maxDistance: { ticks: 4, level: "confirm" }, sides: ["buy"] }, { market, convention: ust })
    expect(blocks(problems).map((p) => p.rule)).toEqual(["maxQuantity", "sides"])
    expect(confirms(problems).map((p) => p.rule)).toEqual(["maxDistance"])
    expect(Object.keys(problemsByField(problems))).toEqual(["quantity", "price", "side"])
  })
})

describe("the market side and the distance", () => {
  it("measures a bid against the bid, an offer against the offer, a buyer against the offer, a seller against the bid, and falls back to the mid then the last", () => {
    expect(marketSideFor("bid", undefined, market)).toBe(99.5)
    expect(marketSideFor("ask", undefined, market)).toBe(99.515625)
    expect(marketSideFor("price", "buy", market)).toBe(99.515625)
    expect(marketSideFor("price", "sell", market)).toBe(99.5)
    expect(marketSideFor("price", undefined, market)).toBe(99.5078125)
    expect(marketSideFor("price", "buy", { last: 100 })).toBe(100)
    expect(marketSideFor("price", "buy", { mid: 99.6 })).toBe(99.6)
    expect(marketSideFor("price", "buy", undefined)).toBeNull()
    expect(marketSideFor("price", "buy", {})).toBeNull()
    expect(distanceFromMarket(99.625, 99.515625, ust)).toEqual({ value: 7, unit: "ticks" })
    expect(distanceFromMarket(4.3, 4.25, bill)).toEqual({ value: 5, unit: "bps" })
    expect(distanceFromMarket(203, 200, credit)).toEqual({ value: 3, unit: "bps" })
    expect(distanceFromMarket(200.1, 200, credit)).toEqual({ value: 0.1, unit: "bps" })
    expect(distanceFromMarket(101, 100, undefined)).toEqual({ value: 1, unit: "ticks" })
  })
})
