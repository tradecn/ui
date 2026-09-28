import { cn } from "cn"
import { createContext, useCallback, useContext, useEffect, useId, useInsertionEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from "react"
import { Command, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { QUERY_KIND_LABELS, recognizeQuery, type QueryHint } from "@/registry/tradecn/lib/instrument-query"

// A typed field over the consumer's instrument search: it recognizes what was typed (a CUSIP with its
// check digit, an ISIN with its Luhn digit, a ticker, a coupon-and-maturity phrase) and hands the
// server the query with that hint, then lists what came back on the consumer's own `command`.
// Keyboard first: type, arrows, Enter. It knows no instruments; the server does.

export interface InstrumentHit {
  id: string
  /** The name the desk types: a ticker, a run's short form. */
  symbol: string
  /** The long name, "T 4 1/8 05/15/34", "Apple Inc." */
  name?: string
  /** Asset class or instrument type, drawn as a badge. */
  kind?: string
  exchange?: string
  cusip?: string
  isin?: string
}

/** The consumer's search: the query as typed, what it looks like, and a signal that aborts when the query moves on. */
export type InstrumentSearchFn = (query: string, hint: QueryHint, signal: AbortSignal) => Promise<readonly InstrumentHit[]>

export interface InstrumentSearchLabels {
  placeholder: string
  /** While a search is out. */
  searching: string
  /** A search that came back with nothing. `{query}`. */
  empty: string
  /** The list's heading. */
  results: string
  /** Under the field, what the query was taken for. `{kind}`. */
  recognized: string
}

export const DEFAULT_INSTRUMENT_SEARCH_LABELS: InstrumentSearchLabels = {
  placeholder: "Ticker, CUSIP, ISIN, or coupon and maturity",
  searching: "Searching…",
  empty: "Nothing matches {query}.",
  results: "Instruments",
  recognized: "Read as {kind}",
}

const NO_HITS: readonly InstrumentHit[] = []
const fill = (template: string, values: Record<string, string>) => template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "")

/** The debounced, abortable search: only answers to the query on screen come back. */
export function useInstrumentSearch(search: InstrumentSearchFn | undefined, query: string, options: { minLength?: number; debounceMs?: number } = {}) {
  const minLength = options.minLength ?? 1
  const debounceMs = options.debounceMs ?? 150
  const hint = useMemo(() => recognizeQuery(query), [query])
  const [found, setFound] = useState<{ search?: InstrumentSearchFn; query: string; hits: readonly InstrumentHit[] }>({ query: "", hits: NO_HITS })
  const active = search !== undefined && hint.kind !== "empty" && query.trim().length >= minLength
  useEffect(() => {
    if (!search || !active) return
    const controller = new AbortController()
    const settle = (hits: readonly InstrumentHit[]) => {
      if (!controller.signal.aborted) setFound({ search, query, hits })
    }
    const timer = setTimeout(async () => {
      try {
        settle(await search(query, hint, controller.signal))
      } catch {
        settle(NO_HITS)
      }
    }, debounceMs)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [search, active, query, hint, debounceMs])
  // Only answers to the query on screen. Enter on a row left over from three letters ago is how the wrong instrument gets loaded.
  const current = active && found.search === search && found.query === query
  return { hint, hits: current ? found.hits : NO_HITS, loading: active && !current }
}

/** An adapter the command palette's `symbols` takes, over the same search function. */
export function toSymbolAdapter(search: InstrumentSearchFn, options: { minLength?: number; debounceMs?: number } = {}) {
  return {
    search: async (query: string, signal: AbortSignal) => {
      const hits = await search(query, recognizeQuery(query), signal)
      return hits.map((hit) => ({ symbol: hit.symbol, name: hit.name, exchange: hit.exchange, kind: hit.kind }))
    },
    minLength: options.minLength,
    debounceMs: options.debounceMs,
  }
}

export interface InstrumentSearchProps extends Omit<ComponentProps<"div">, "children" | "onSelect" | "autoFocus"> {
  search: InstrumentSearchFn
  onSelect: (hit: InstrumentHit, hint: QueryHint) => void
  children: ReactNode
  /** Controlled query, with `onQueryChange`. */
  query?: string
  onQueryChange?: (query: string) => void
  /** Default 1. */
  minLength?: number
  /** Default 150. */
  debounceMs?: number
  /** Clear the field after a pick. Default true. */
  clearOnSelect?: boolean
  labels?: Partial<InstrumentSearchLabels>
}

/** The identifier on a hit that the query named, for the row to show beside the name. */
export function matchedIdentifier(hit: InstrumentHit, hint: QueryHint): string | null {
  if (hint.kind === "cusip" && hit.cusip) return hit.cusip
  if (hint.kind === "isin" && hit.isin) return hit.isin
  return null
}

export interface InstrumentSearchState {
  query: string
  setQuery: (query: string) => void
  hint: QueryHint
  hits: readonly InstrumentHit[]
  /** The nonblank query meets minLength. */
  active: boolean
  loading: boolean
  labels: InstrumentSearchLabels
  emptyMessage: string
  /** Select the currently offered hit with this id. Stale or missing ids do nothing. */
  select: (hit: InstrumentHit) => void
}

interface SearchContextState extends InstrumentSearchState {
  descriptions: readonly string[]
  registerDescription: (id: string) => () => void
}

const SearchContext = createContext<SearchContextState | null>(null)

function useSearchContext() {
  const state = useContext(SearchContext)
  if (!state) throw new Error("InstrumentSearch parts require InstrumentSearch")
  return state
}

/** Share the root's reading and commands without starting another search. */
export function useInstrumentSearchState(): InstrumentSearchState {
  return useSearchContext()
}

export function InstrumentSearch({ search, onSelect, children, query: queryProp, onQueryChange, minLength = 1, debounceMs, clearOnSelect = true, labels: labelsProp, className, ...props }: InstrumentSearchProps) {
  const labels = { ...DEFAULT_INSTRUMENT_SEARCH_LABELS, ...labelsProp }
  const [ownQuery, setOwnQuery] = useState("")
  const query = queryProp ?? ownQuery
  const { hint, hits, loading } = useInstrumentSearch(search, query, { minLength, debounceMs })
  const active = hint.kind !== "empty" && query.trim().length >= minLength
  const latest = useRef({ queryProp, onSelect, onQueryChange, clearOnSelect, hint, hits })
  useInsertionEffect(() => {
    latest.current = { queryProp, onSelect, onQueryChange, clearOnSelect, hint, hits }
  })
  const setQuery = useCallback((next: string) => {
    const current = latest.current
    if (current.queryProp === undefined) setOwnQuery(next)
    current.onQueryChange?.(next)
  }, [])
  const select = useCallback((hit: InstrumentHit) => {
    const current = latest.current
    const offered = current.hits.find((candidate) => candidate.id === hit.id)
    if (!offered) return
    current.onSelect(offered, current.hint)
    if (current.clearOnSelect) setQuery("")
  }, [setQuery])
  const [descriptions, setDescriptions] = useState<string[]>([])
  const registerDescription = useCallback((id: string) => {
    setDescriptions((ids) => [...ids, id])
    return () => setDescriptions((ids) => {
      const index = ids.indexOf(id)
      return index < 0 ? ids : [...ids.slice(0, index), ...ids.slice(index + 1)]
    })
  }, [])
  return (
    <SearchContext value={{ query, setQuery, hint, hits, active, loading, labels, emptyMessage: fill(labels.empty, { query: query.trim() }), select, descriptions, registerDescription }}>
      <div {...props} data-slot="tradecn-instrument-search" data-query-kind={hint.kind === "empty" ? undefined : hint.kind} className={cn("flex flex-col gap-1 text-xs lining-nums tabular-nums", className)}>{children}</div>
    </SearchContext>
  )
}

export type InstrumentSearchContentProps = Omit<ComponentProps<typeof Command>, "children" | "shouldFilter" | "filter"> & { children: ReactNode }

/** The installed command owns keyboard navigation. Server results are never filtered again. */
export function InstrumentSearchContent({ children, className, label = "Instrument search", ...props }: InstrumentSearchContentProps) {
  useSearchContext()
  return <Command {...props} label={label} shouldFilter={false} className={cn("rounded-md border border-border", className)}>{children}</Command>
}

type InputOwnedProps = "value" | "defaultValue" | "onValueChange" | "onChange" | "id" | "type" | "role" | "autoComplete" | "autoCorrect" | "spellCheck" | "aria-autocomplete" | "aria-expanded" | "aria-controls" | "aria-labelledby" | "aria-label" | "aria-activedescendant"

export type InstrumentSearchInputProps = Omit<ComponentProps<typeof CommandInput>, InputOwnedProps> & Partial<Record<InputOwnedProps, never>>

export function InstrumentSearchInput({ className, "aria-describedby": describedBy, ...props }: InstrumentSearchInputProps) {
  const { query, setQuery, labels, descriptions } = useSearchContext()
  const ids = [...new Set([describedBy, ...descriptions].flatMap((id) => id?.split(/\s+/).filter(Boolean) ?? []))]
  return <CommandInput placeholder={labels.placeholder} {...props} value={query} onValueChange={setQuery} aria-describedby={ids.join(" ") || undefined} className={cn("h-8 text-xs", className)} />
}

type ListOwnedProps = "id" | "role" | "tabIndex" | "aria-activedescendant" | "aria-label"

export type InstrumentSearchListProps = Omit<ComponentProps<typeof CommandList>, ListOwnedProps | "children"> & Partial<Record<ListOwnedProps, never>> & { children: ReactNode }

export function InstrumentSearchList({ children, ...props }: InstrumentSearchListProps) {
  const { active } = useSearchContext()
  // cmdk exposes an expanded inline combobox, so retain its listbox target even before a query.
  return <CommandList {...props}>{active ? children : null}</CommandList>
}

type ItemOwnedProps = "value" | "onSelect" | "onClick" | "onPointerMove" | "id" | "role" | "aria-disabled" | "aria-selected"

export type InstrumentSearchItemProps = Omit<ComponentProps<typeof CommandItem>, ItemOwnedProps | "children"> & Partial<Record<ItemOwnedProps, never>> & { hit: InstrumentHit; children: ReactNode }

export function InstrumentSearchItem({ hit, children, disabled, ...props }: InstrumentSearchItemProps) {
  const { select } = useSearchContext()
  return <CommandItem {...props} disabled={disabled} value={hit.id} data-instrument-hit={hit.id} onSelect={() => { if (!disabled) select(hit) }}>{children}</CommandItem>
}

export function InstrumentSearchHint({ id: idProp, children, className, ...props }: ComponentProps<"p">) {
  const { hint, labels, registerDescription } = useSearchContext()
  const generatedId = useId()
  const id = idProp ?? generatedId
  const shown = hint.kind !== "empty"
  useLayoutEffect(() => {
    if (shown) return registerDescription(id)
  }, [shown, id, registerDescription])
  if (!shown) return null
  return (
    <p {...props} id={id} data-slot="tradecn-instrument-hint" data-instrument-hint={hint.kind} className={cn("px-1 text-muted-foreground lining-nums tabular-nums", className)}>
      {children !== undefined ? children : <>
        {fill(labels.recognized, { kind: QUERY_KIND_LABELS[hint.kind] })}
        {hint.kind === "coupon-maturity" && hint.coupon !== undefined && <> <span className="font-(family-name:--tradecn-font-mono) lining-nums tabular-nums">{hint.ticker ? `${hint.ticker} ` : ""}{hint.coupon} {hint.maturity}</span></>}
      </>}
    </p>
  )
}
