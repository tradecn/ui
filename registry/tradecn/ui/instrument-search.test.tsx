import { StrictMode, createRef, useLayoutEffect, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { act, fireEvent, render, renderHook, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { isCusip, isIsin, parseCoupon, parseCouponMaturity, parseMaturity, recognizeQuery } from "@/registry/tradecn/lib/instrument-query"
import { InstrumentSearch, InstrumentSearchContent, InstrumentSearchInput, InstrumentSearchList, InstrumentSearchItem, InstrumentSearchHint, useInstrumentSearchState, matchedIdentifier, toSymbolAdapter, useInstrumentSearch, type InstrumentHit, type InstrumentSearchFn, type InstrumentSearchProps, type InstrumentSearchState } from "@/registry/tradecn/ui/instrument-search"

import { InstrumentOptions } from "@/demos/instrument-search"

type SearchRecipeProps = Omit<InstrumentSearchProps, "children"> & { renderHit?: (hit: InstrumentHit, hint: InstrumentSearchState["hint"]) => ReactNode }

function SearchRecipe({ renderHit, ...props }: SearchRecipeProps) {
  return <InstrumentSearch {...props}>
    <InstrumentSearchContent>
      <InstrumentSearchInput />
      <InstrumentSearchList>{renderHit ? <CustomOptions renderHit={renderHit} /> : <InstrumentOptions />}</InstrumentSearchList>
    </InstrumentSearchContent>
    <InstrumentSearchHint />
  </InstrumentSearch>
}

function CustomOptions({ renderHit }: { renderHit: NonNullable<SearchRecipeProps["renderHit"]> }) {
  const { hits, hint } = useInstrumentSearchState()
  return hits.map(hit => <InstrumentSearchItem key={hit.id} hit={hit}>{renderHit(hit, hint)}</InstrumentSearchItem>)
}

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
    render(<SearchRecipe search={search} onSelect={onSelect} />)
    const root = document.querySelector("[data-slot='tradecn-instrument-search']")!
    expect(root).not.toHaveAttribute("data-query-kind")
    expect(screen.getByRole("listbox")).toHaveTextContent("")
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
    render(<SearchRecipe search={search} onSelect={onSelect} clearOnSelect={false} />)
    await type("4 1/8 05/34")
    expect(document.querySelector("[data-instrument-hint='coupon-maturity']")).toHaveTextContent("Read as Coupon and maturity 4.125 05/34")
    expect(document.querySelector("[data-instrument-hit='t10']")).toBeInTheDocument()
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "qqq" } })
    // Before the debounce lands the old rows are gone, not left to be picked.
    expect(document.querySelector("[data-instrument-hit='t10']")).toBeNull()
    expect(screen.getByText("Searching…")).toBeInTheDocument()
    expect(within(screen.getByRole("listbox")).queryByRole("paragraph")).toBeNull()
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

  it("removes the previous provider's hits before a replacement search starts", async () => {
    const first: InstrumentSearchFn = async () => [HITS[1]!]
    const second: InstrumentSearchFn = async () => [HITS[2]!]
    const onSelect = vi.fn()
    const view = render(<SearchRecipe search={first} query="a" onSelect={onSelect} />)
    await act(async () => { await vi.advanceTimersByTimeAsync(150) })
    expect(document.querySelector("[data-instrument-hit='aapl']")).toBeInTheDocument()
    view.rerender(<SearchRecipe search={second} query="a" onSelect={onSelect} />)
    expect(document.querySelector("[data-instrument-hit='aapl']")).toBeNull()
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" })
    expect(onSelect).not.toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(150) })
    expect(document.querySelector("[data-instrument-hit='zn']")).toBeInTheDocument()
  })

  it("settles a synchronous search failure as an empty result", async () => {
    const search: InstrumentSearchFn = () => { throw new Error("Unavailable") }
    const { result } = renderHook(() => useInstrumentSearch(search, "zn"))
    await act(async () => { await vi.advanceTimersByTimeAsync(150) })
    expect(result.current).toMatchObject({ hits: [], loading: false })
  })

  it("uses the newly committed callback when a result child selects in a layout effect", async () => {
    const first = vi.fn()
    const second = vi.fn()
    const search: InstrumentSearchFn = async () => [HITS[1]!]
    function PickAfterCommit({ pick }: { pick: boolean }) {
      useLayoutEffect(() => {
        if (pick) fireEvent.click(document.querySelector("[data-instrument-hit='aapl']")!)
      }, [pick])
      return <>AAPL</>
    }
    const view = render(<SearchRecipe search={search} query="a" onSelect={first} clearOnSelect={false} renderHit={() => <PickAfterCommit pick={false} />} />)
    await act(async () => { await vi.advanceTimersByTimeAsync(150) })
    view.rerender(<SearchRecipe search={search} query="a" onSelect={second} clearOnSelect={false} renderHit={() => <PickAfterCommit pick />} />)
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledWith(HITS[1], expect.objectContaining({ kind: "ticker", ticker: "A" }))
  })

  it("names the field and retains its listbox target before a search", () => {
    render(<SearchRecipe search={search} onSelect={() => {}} />)
    const input = screen.getByRole("combobox", { name: "Instrument search" })
    expect(input).toHaveAttribute("aria-expanded", "true")
    expect(document.getElementById(input.getAttribute("aria-controls")!)).toBe(screen.getByRole("listbox", { name: "Suggestions" }))
    expect(screen.queryByRole("option")).toBeNull()
  })

  it("aborts replaced requests, ignores late answers, and retains exact-query cache only while active", async () => {
    const requests: { query: string; signal: AbortSignal; resolve: (hits: readonly InstrumentHit[]) => void }[] = []
    const provider: InstrumentSearchFn = (query, _hint, signal) => new Promise(resolve => requests.push({ query, signal, resolve }))
    const { result, rerender, unmount } = renderHook(({ query, minLength }) => useInstrumentSearch(provider, query, { minLength }), { initialProps: { query: " a ", minLength: 1 } })
    await act(async () => { await vi.advanceTimersByTimeAsync(150) })
    expect(requests[0]!.query).toBe(" a ")
    await act(async () => requests[0]!.resolve([HITS[1]!]))
    rerender({ query: "b", minLength: 1 })
    expect(requests[0]!.signal.aborted).toBe(true)
    expect(result.current).toMatchObject({ hits: [], loading: true })
    await act(async () => { await vi.advanceTimersByTimeAsync(150) })
    rerender({ query: " a ", minLength: 1 })
    expect(requests[1]!.signal.aborted).toBe(true)
    await act(async () => requests[1]!.resolve([HITS[2]!]))
    expect(result.current).toMatchObject({ hits: [HITS[1]], loading: false })
    rerender({ query: " a ", minLength: 2 })
    expect(result.current).toMatchObject({ hits: [], loading: false })
    rerender({ query: " a ", minLength: 1 })
    expect(result.current.hits).toEqual([HITS[1]])
    await act(async () => { await vi.advanceTimersByTimeAsync(150) })
    unmount()
    expect(requests[2]!.signal.aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("shares one search with repeated readers and associates only mounted hints across portals", async () => {
    const provider = vi.fn(async () => HITS)
    const inputRef = createRef<HTMLInputElement>()
    const hintRef = createRef<HTMLParagraphElement>()
    const portal = document.createElement("aside")
    document.body.append(portal)
    function Reading() { return <span>{useInstrumentSearchState().query}</span> }
    function View({ hint = true, id = "hint", query = "a" }: { hint?: boolean; id?: string; query?: string }) {
      return <StrictMode><InstrumentSearch search={provider} query={query} onSelect={() => {}}>
        <InstrumentSearchContent label="Find a bond"><InstrumentSearchInput ref={inputRef} aria-describedby="external external" /><InstrumentSearchList>{null}</InstrumentSearchList></InstrumentSearchContent>
        <p id="external">External description</p>
        {hint && <InstrumentSearchHint id={id} ref={hintRef}>Custom hint</InstrumentSearchHint>}
        {createPortal(<InstrumentSearchHint id="portal-hint" />, portal)}
        <Reading /><Reading />
      </InstrumentSearch></StrictMode>
    }
    const view = render(<View />)
    const input = screen.getByRole("combobox", { name: "Find a bond" })
    const ids = () => input.getAttribute("aria-describedby")?.split(" ").sort()
    expect(inputRef.current).toBe(input)
    expect(hintRef.current).toBe(document.getElementById("hint"))
    expect(ids()).toEqual(["external", "hint", "portal-hint"])
    await act(async () => { await vi.advanceTimersByTimeAsync(150) })
    expect(provider).toHaveBeenCalledTimes(1)
    view.rerender(<View id="replacement" />)
    expect(ids()).toEqual(["external", "portal-hint", "replacement"])
    expect(document.getElementById("hint")).toBeNull()
    view.rerender(<View hint={false} />)
    expect(ids()).toEqual(["external", "portal-hint"])
    expect(provider).toHaveBeenCalledTimes(1)
    view.rerender(<View hint={false} query="" />)
    expect(ids()).toEqual(["external"])
    expect(document.getElementById("portal-hint")).toBeNull()
    view.unmount()
    portal.remove()
    expect(vi.getTimerCount()).toBe(0)
  })

  it("keeps commands stable, rejects stale IDs, and selects the current record before requesting controlled clearing", async () => {
    let reading: InstrumentSearchState | undefined
    function Reading() {
      const state = useInstrumentSearchState()
      useLayoutEffect(() => { reading = state })
      return null
    }
    const first: InstrumentSearchFn = async () => [HITS[1]!]
    const updated = { ...HITS[1]!, name: "Updated name" }
    const replacement: InstrumentSearchFn = async () => [updated]
    const calls: string[] = []
    const onSelect = vi.fn((hit: InstrumentHit) => calls.push(hit.name!))
    const onQueryChange = vi.fn((query: string) => calls.push(query))
    const compose = (provider: InstrumentSearchFn) => <InstrumentSearch search={provider} query="a" onSelect={onSelect} onQueryChange={onQueryChange}><Reading /></InstrumentSearch>
    const view = render(compose(first))
    await act(async () => { await vi.advanceTimersByTimeAsync(150) })
    const { select, setQuery } = reading!
    view.rerender(compose(replacement))
    expect(reading!.select).toBe(select)
    expect(reading!.setQuery).toBe(setQuery)
    act(() => select(HITS[1]!))
    expect(onSelect).not.toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(150) })
    act(() => select(HITS[1]!))
    expect(onSelect).toHaveBeenCalledWith(updated, expect.objectContaining({ ticker: "A" }))
    expect(calls).toEqual(["Updated name", ""])
    expect(reading!.query).toBe("a")
    act(() => select(HITS[2]!))
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it("forwards root and item refs and events while disabled items cannot select", async () => {
    const provider: InstrumentSearchFn = async () => [HITS[1]!]
    const selected = vi.fn()
    const rootRef = createRef<HTMLDivElement>()
    const itemRef = createRef<HTMLDivElement>()
    const keydown = vi.fn()
    function View({ disabled }: { disabled: boolean }) {
      return <InstrumentSearch search={provider} query="a" onSelect={selected} clearOnSelect={false} ref={rootRef} id="find-instrument" onKeyDown={keydown}>
        <InstrumentSearchContent><InstrumentSearchInput /><InstrumentSearchList>
          <InstrumentSearchItem hit={HITS[1]!} ref={itemRef} disabled={disabled}>Apple</InstrumentSearchItem>
        </InstrumentSearchList></InstrumentSearchContent>
      </InstrumentSearch>
    }
    const view = render(<View disabled />)
    await act(async () => { await vi.advanceTimersByTimeAsync(150) })
    expect(rootRef.current).toBe(document.getElementById("find-instrument"))
    expect(itemRef.current).toBe(screen.getByRole("option"))
    fireEvent.click(itemRef.current!)
    expect(selected).not.toHaveBeenCalled()
    view.rerender(<View disabled={false} />)
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" })
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" })
    expect(keydown).toHaveBeenCalledTimes(2)
    expect(selected).toHaveBeenCalledWith(HITS[1], expect.anything())
  })
})

// These calls run through the real compiler in the repository typecheck.
function publicComposition(search: InstrumentSearchFn, onSelect: InstrumentSearchProps["onSelect"], shown: boolean) {
  // @ts-expect-error Released minimal calls require explicit composition.
  const minimal = <InstrumentSearch search={search} onSelect={onSelect} />
  // @ts-expect-error Retained settings must not allow the released empty-root call.
  const retained = <InstrumentSearch search={search} onSelect={onSelect} query="a" onQueryChange={() => {}} minLength={2} debounceMs={50} clearOnSelect={false} labels={{ empty: "None" }} className="w-full" />
  // @ts-expect-error Autofocus belongs to Input.
  const autofocus = <InstrumentSearch search={search} onSelect={onSelect} autoFocus>{null}</InstrumentSearch>
  // @ts-expect-error Omit Hint to hide it.
  const hint = <InstrumentSearch search={search} onSelect={onSelect} showHint={false}>{null}</InstrumentSearch>
  // @ts-expect-error Result markup belongs to Item children.
  const renderer = <InstrumentSearch search={search} onSelect={onSelect} renderHit={() => null}>{null}</InstrumentSearch>
  // @ts-expect-error Content requires caller markup.
  const content = <InstrumentSearchContent />
  // @ts-expect-error Server results are never filtered again.
  const filter = <InstrumentSearchContent shouldFilter>{null}</InstrumentSearchContent>
  // @ts-expect-error Search query belongs to the root.
  const value = <InstrumentSearchInput value="a" />
  // @ts-expect-error The command owns combobox relationships, including hyphenated JSX attributes.
  const controls = <InstrumentSearchInput aria-controls="custom" />
  // @ts-expect-error Name the input with Content label.
  const label = <InstrumentSearchInput aria-label="custom" />
  // @ts-expect-error List requires caller-owned content.
  const list = <InstrumentSearchList />
  // @ts-expect-error Name the list with its label prop.
  const listLabel = <InstrumentSearchList aria-label="custom">{null}</InstrumentSearchList>
  // @ts-expect-error Items require caller-owned content.
  const item = <InstrumentSearchItem hit={HITS[0]!} />
  // @ts-expect-error Item selection binds the current hit through the root.
  const select = <InstrumentSearchItem hit={HITS[0]!} onSelect={() => {}}>Hit</InstrumentSearchItem>
  // @ts-expect-error cmdk owns selected state.
  const selected = <InstrumentSearchItem hit={HITS[0]!} aria-selected>Hit</InstrumentSearchItem>
  const composition = <InstrumentSearch search={search} onSelect={onSelect} ref={createRef<HTMLDivElement>()} id="search" onKeyDown={() => {}}>
    <InstrumentSearchContent label="Find a bond"><InstrumentSearchInput autoFocus ref={createRef<HTMLInputElement>()} aria-describedby="help" /><InstrumentSearchList label="Bonds">{shown && <InstrumentSearchItem hit={HITS[0]!} ref={createRef<HTMLDivElement>()}>Bond</InstrumentSearchItem>}</InstrumentSearchList></InstrumentSearchContent>
    {shown && <InstrumentSearchHint id="help" />}
  </InstrumentSearch>
  return [minimal, retained, autofocus, hint, renderer, content, filter, value, controls, label, list, listLabel, item, select, selected, composition]
}
void publicComposition
