import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { isCusip, isIsin, parseCoupon, parseCouponMaturity, parseMaturity, recognizeQuery } from "@/registry/tradecn/lib/instrument-query"
import { InstrumentSearch, matchedIdentifier, toSymbolAdapter, type InstrumentHit, type InstrumentSearchFn } from "@/registry/tradecn/ui/instrument-search"

describe("the recognizers", () => {
  it("checks a CUSIP's modulus-10 digit and an ISIN's Luhn digit", () => {
    expect(isCusip("037833100")).toBe(true)
    expect(isCusip("037833101")).toBe(false)
    expect(isCusip("912828XG0")).toBe(true)
    expect(isCusip("912828XG1")).toBe(false)
    expect(isCusip("38259P508")).toBe(true)
    expect(isCusip("38259p508")).toBe(true)
    expect(isCusip("0378331")).toBe(false)
    expect(isIsin("US0378331005")).toBe(true)
    expect(isIsin("US0378331006")).toBe(false)
    expect(isIsin("GB0002634946")).toBe(true)
    expect(isIsin("us0378331005")).toBe(true)
    expect(isIsin("US03783310")).toBe(false)
  })

  it("reads a coupon as a run prints it and a maturity in the forms a desk types", () => {
    expect(parseCoupon("4 1/8")).toBe(4.125)
    expect(parseCoupon("4.125")).toBe(4.125)
    expect(parseCoupon("4")).toBe(4)
    expect(parseCoupon("0")).toBe(0)
    expect(parseCoupon("7/8")).toBe(0.875)
    expect(parseCoupon("4 1/3")).toBeNull()
    expect(parseCoupon("abc")).toBeNull()
    expect(parseMaturity("05/34")).toEqual({ month: 5, year: 34, text: "05/34" })
    expect(parseMaturity("5/15/2034")).toEqual({ month: 5, day: 15, year: 2034, text: "5/15/2034" })
    expect(parseMaturity("2034-05-15")).toEqual({ month: 5, day: 15, year: 2034, text: "2034-05-15" })
    expect(parseMaturity("13/34")).toBeNull()
    expect(parseMaturity("05")).toBeNull()
    expect(parseCouponMaturity("4 1/8 05/34")).toEqual({ coupon: 4.125, maturity: "05/34", maturityParts: { month: 5, day: undefined, year: 34 } })
    expect(parseCouponMaturity("4.125 5/15/2034")).toEqual({ coupon: 4.125, maturity: "5/15/2034", maturityParts: { month: 5, day: 15, year: 2034 } })
    expect(parseCouponMaturity("T 4 1/8 05/15/34")).toMatchObject({ coupon: 4.125, maturity: "05/15/34", prefix: "T" })
    expect(parseCouponMaturity("4 1/8")).toBeNull()
    expect(parseCouponMaturity("zn 05/34")).toBeNull()
  })

  it("recognizes a query in the order a desk means it: identifiers first, then a run's phrase, then a ticker, else text", () => {
    expect(recognizeQuery("037833100")).toMatchObject({ kind: "cusip", cusip: "037833100" })
    expect(recognizeQuery(" us0378331005 ")).toMatchObject({ kind: "isin", isin: "US0378331005", normalized: "US0378331005" })
    expect(recognizeQuery("4 1/8  05/34")).toMatchObject({ kind: "coupon-maturity", coupon: 4.125, maturity: "05/34", normalized: "4 1/8 05/34" })
    expect(recognizeQuery("T 4 1/8 05/15/34")).toMatchObject({ kind: "coupon-maturity", ticker: "T", coupon: 4.125 })
    expect(recognizeQuery("zn")).toMatchObject({ kind: "ticker", ticker: "ZN" })
    expect(recognizeQuery("BRK.B")).toMatchObject({ kind: "ticker", ticker: "BRK.B" })
    expect(recognizeQuery("ESZ6")).toMatchObject({ kind: "ticker", ticker: "ESZ6" })
    expect(recognizeQuery("apple inc")).toMatchObject({ kind: "text", normalized: "apple inc" })
    expect(recognizeQuery("   ")).toEqual({ kind: "empty", normalized: "" })
    // Nine characters that fail the check digit are never a CUSIP; starting with a digit, they are not a ticker either.
    expect(recognizeQuery("037833101").kind).toBe("text")
    expect(recognizeQuery("A37833101").kind).toBe("ticker")
  })
})

const HITS: InstrumentHit[] = [
  { id: "t10", symbol: "T 4 1/8 05/34", name: "T 4 1/8 05/15/34", kind: "UST", cusip: "91282CKQ7", isin: "US91282CKQ71" },
  { id: "aapl", symbol: "AAPL", name: "Apple Inc.", kind: "Equity", exchange: "NASDAQ", cusip: "037833100", isin: "US0378331005" },
  { id: "zn", symbol: "ZN", name: "10-Year T-Note future", kind: "Future", exchange: "CBOT" },
]

describe("InstrumentSearch", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // cmdk scrolls the highlighted row into view; happy-dom has no layout to scroll.
    Element.prototype.scrollIntoView = vi.fn()
  })
  afterEach(() => vi.useRealTimers())

  const search: InstrumentSearchFn = vi.fn(async (query, hint) => {
    if (hint.kind === "cusip") return HITS.filter((h) => h.cusip === hint.cusip)
    if (hint.kind === "coupon-maturity") return HITS.filter((h) => h.kind === "UST")
    const q = query.trim().toUpperCase()
    return HITS.filter((h) => h.symbol.toUpperCase().startsWith(q))
  })

  const type = (text: string) => {
    fireEvent.change(screen.getByRole("combobox"), { target: { value: text } })
    act(() => {
      vi.advanceTimersByTime(150)
    })
    return act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
  }

  it("recognizes what was typed, says so under the field, hands the server the hint, lists the answers, and selects on Enter", async () => {
    const onSelect = vi.fn()
    render(<InstrumentSearch search={search} onSelect={onSelect} />)
    const root = document.querySelector("[data-slot='tradecn-instrument-search']")!
    expect(root).not.toHaveAttribute("data-query-kind")
    expect(screen.queryByRole("listbox")).toBeNull()
    await type("037833100")
    expect(root).toHaveAttribute("data-query-kind", "cusip")
    expect(screen.getByText("Read as CUSIP")).toBeInTheDocument()
    expect(search).toHaveBeenLastCalledWith("037833100", expect.objectContaining({ kind: "cusip", cusip: "037833100" }), expect.any(AbortSignal))
    const row = document.querySelector("[data-instrument-hit='aapl']")!
    expect(row).toHaveTextContent("AAPL")
    expect(row).toHaveTextContent("Apple Inc.")
    expect(row).toHaveTextContent("037833100")
    expect(row).toHaveTextContent("Equity")
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" })
    expect(onSelect).toHaveBeenCalledWith(HITS[1], expect.objectContaining({ kind: "cusip" }))
    // The pick clears the field.
    expect(screen.getByRole("combobox")).toHaveValue("")
    expect(root).not.toHaveAttribute("data-query-kind")
  })

  it("reads a coupon-and-maturity phrase, shows nothing for a query the server does not know, and shows only answers to the query on screen", async () => {
    const onSelect = vi.fn()
    render(<InstrumentSearch search={search} onSelect={onSelect} clearOnSelect={false} />)
    await type("4 1/8 05/34")
    expect(document.querySelector("[data-instrument-hint='coupon-maturity']")).toHaveTextContent("Read as Coupon and maturity 4.125 05/34")
    expect(document.querySelector("[data-instrument-hit='t10']")).toBeInTheDocument()
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "qqq" } })
    // Before the debounce lands the old rows are gone, not left to be picked.
    expect(document.querySelector("[data-instrument-hit='t10']")).toBeNull()
    expect(screen.getByText("Searching…")).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(150)
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(screen.getByText("Nothing matches qqq.")).toBeInTheDocument()
    expect(document.querySelector("[data-slot='tradecn-instrument-search']")).toHaveAttribute("data-query-kind", "ticker")
  })

  it("adapts the same search to the palette's symbols, and names the identifier a hit matched on", async () => {
    const adapter = toSymbolAdapter(search, { minLength: 2 })
    const results = await adapter.search("us0378331005", new AbortController().signal)
    expect(search).toHaveBeenLastCalledWith("us0378331005", expect.objectContaining({ kind: "isin" }), expect.any(AbortSignal))
    expect(results).toEqual([])
    const zn = await adapter.search("zn", new AbortController().signal)
    expect(zn).toEqual([{ symbol: "ZN", name: "10-Year T-Note future", exchange: "CBOT", kind: "Future" }])
    expect(adapter.minLength).toBe(2)
    expect(matchedIdentifier(HITS[1]!, recognizeQuery("037833100"))).toBe("037833100")
    expect(matchedIdentifier(HITS[1]!, recognizeQuery("US0378331005"))).toBe("US0378331005")
    expect(matchedIdentifier(HITS[1]!, recognizeQuery("aapl"))).toBeNull()
  })
})
