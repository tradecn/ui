import { cn } from "cn"
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { useFlash } from "@/registry/tradecn/hooks/use-flash"
import { HotkeyScope, useMaybeHotkeys } from "@/registry/tradecn/hooks/use-hotkeys"
import { formatBps, formatNotional, formatQuantity, formatQuote, formatTicks, quoteBasisOf, stepQuote, ticksBetween, type InstrumentConvention } from "@/registry/tradecn/lib/format"
import { formatKeys, type HotkeyBinding, type HotkeyRegistry } from "@/registry/tradecn/lib/hotkeys"
import { Countdown } from "@/registry/tradecn/ui/countdown"
import { QuoteField } from "@/registry/tradecn/ui/quote-field"

// A dealer's ticket for a request for quote. A client asks for a price on a size; this shows the
// inquiry as it came (who, which way, how much, in what, with the venue's words on it), the market
// beside it, what is already quoted, the auto price when there is one, a countdown to its end, and
// the fields to type a level in the instrument's own basis. The actions are the server's, the status
// is the server's word, and nothing here decides either.
//
// Three rules hold it together. The ticket is one inquiry: mount it with `key={inquiry.id}` and a
// new inquiry never lands in a ticket someone is working, because the parent decides which inquiry
// is active and this component only ever draws the one it was given. The buttons are the actions
// the server allowed, checked again as the click lands. And the status is printed as it arrives:
// "Quoted" is what the venue said, never what a button press implied.

export type RfqSide = "buy" | "sell" | "two-way"
export type QuoteSide = "bid" | "ask"

export interface RfqInstrument {
  symbol: string
  /** What the ticket prints: "T 4 1/8 05/15/34". The symbol when left out. */
  description?: string
  /** How a quote prints, parses, and steps, and in what basis. */
  convention: InstrumentConvention
}

export interface RfqClient {
  name: string
  tier?: string
  trader?: string
  salesperson?: string
}

export interface RfqLevels {
  bid?: number | null
  ask?: number | null
}

export interface RfqMarket extends RfqLevels {
  /** "Composite", "Mid", the name of the reference. Default "Market". */
  label?: string
  /** A mid when the reference has no sides; a blank field steps from it when nothing else is there. */
  mid?: number | null
}

export interface RfqContextItem {
  label: string
  /** Printed as given: a position, a risk number, a book. Format it before it gets here. */
  value: string
  tone?: "up" | "down" | "flat"
}

export interface RfqInquiry {
  id: string
  instrument: RfqInstrument
  /** The client's side. `two-way` asks for a market: a bid and an offer. */
  side: RfqSide
  /** Notional, or contracts when the convention says so. */
  quantity: number
  client?: RfqClient
  /** The venue's words: the protocol, dealers in competition, a list. Printed as tags. */
  tags?: readonly string[]
  settlement?: string
  /** When it arrived, for the countdown's full width. */
  receivedAt?: number
  /** When the venue ends it. */
  expiresAt: number
  context?: readonly RfqContextItem[]
  /** The market beside the quote. */
  market?: RfqMarket
  /** The levels the server holds as this desk's live quote, if any. */
  quoted?: RfqLevels
  /** Levels the server suggests, an auto-quoter's for one. Offered as one click and one key. */
  suggested?: RfqLevels
  /** The venue's word for where the inquiry stands. Printed as it is. */
  status: string
  /** The server's second line: a reason, a cover, a note. Printed as it is. */
  message?: string
  /** What the server says may be done now. No list means nothing, and no buttons. */
  allowedActions?: readonly string[]
}

export interface RfqQuoteDraft {
  inquiryId: string
  bid: number | null
  ask: number | null
}

export interface RfqAction {
  /** Matched against `allowedActions`. */
  id: string
  /** A verb: "Quote", "Pass". A function of the draft may say more. */
  label: string | ((draft: RfqQuoteDraft) => string)
  /** The draft, checked when the action needs a quote. */
  run: (draft: RfqQuoteDraft, inquiry: RfqInquiry) => void
  /** The action sends the levels in the fields, so the check wants them. Default true; a pass, a stop, or a quote the server prices itself wants none. */
  needsQuote?: boolean
  destructive?: boolean
  /** What `rfq.send` runs. The first allowed action that needs a quote by default, else the first allowed. */
  primary?: boolean
}

export interface RfqTicketLabels {
  ticket: string
  client: string
  buys: string
  sells: string
  asksMarket: string
  bid: string
  ask: string
  market: string
  quoted: string
  suggested: string
  takeSuggested: string
  vsMarket: string
  settlement: string
  bidNeeded: string
  askNeeded: string
  crossed: string
  nothingAllowed: string
  for: string
}

export const DEFAULT_RFQ_TICKET_LABELS: RfqTicketLabels = {
  ticket: "Inquiry",
  client: "A client",
  buys: "buys",
  sells: "sells",
  asksMarket: "asks a market in",
  bid: "Bid",
  ask: "Offer",
  market: "Market",
  quoted: "Quoted",
  suggested: "Auto",
  takeSuggested: "Take the suggested levels",
  vsMarket: "vs market",
  settlement: "Settles",
  bidNeeded: "A bid is needed.",
  askNeeded: "An offer is needed.",
  crossed: "The bid is above the offer.",
  nothingAllowed: "Nothing can be done with this inquiry right now.",
  for: "for",
}

/** The keys a ticket answers to, all `editing`: they run while you type in it. Declared by the ticket when you have not. */
export const RFQ_TICKET_BINDINGS: readonly HotkeyBinding[] = [
  { id: "rfq.send", keys: "mod+enter", scope: "editing", description: "Send the quote", group: "Inquiry" },
  { id: "rfq.tick-up", keys: "mod+up", scope: "editing", description: "Level up one tick", group: "Inquiry" },
  { id: "rfq.tick-down", keys: "mod+down", scope: "editing", description: "Level down one tick", group: "Inquiry" },
  { id: "rfq.suggested", keys: "mod+shift+a", scope: "editing", description: "Take the suggested levels", group: "Inquiry" },
]

/** The sides the dealer quotes: a client who buys gets an offer, one who sells gets a bid, a market gets both. */
export function quotedSides(side: RfqSide): readonly QuoteSide[] {
  return side === "buy" ? ["ask"] : side === "sell" ? ["bid"] : ["bid", "ask"]
}

/** The inquiry's size the way the desk says it: millions of notional, or a count of contracts. */
export function formatSize(quantity: number, convention: InstrumentConvention): string {
  return convention.quantityUnit === "contracts" ? formatQuantity(quantity) : formatNotional(quantity, { unit: "mm" })
}

export interface RfqQuoteProblems {
  bid?: string
  ask?: string
}

/** What stops a quote from being sent: a needed side that is blank, or a market whose bid is above its offer. Empty when nothing does. */
export function checkQuote(draft: RfqQuoteDraft, inquiry: RfqInquiry, labels: RfqTicketLabels = DEFAULT_RFQ_TICKET_LABELS): RfqQuoteProblems {
  const problems: RfqQuoteProblems = {}
  const sides = quotedSides(inquiry.side)
  if (sides.includes("bid") && draft.bid === null) problems.bid = labels.bidNeeded
  if (sides.includes("ask") && draft.ask === null) problems.ask = labels.askNeeded
  if (draft.bid !== null && draft.ask !== null && draft.bid > draft.ask) problems.ask = labels.crossed
  return problems
}

/** "Offer 5mm T 4 1/8 05/15/34 @ 99-16+", "Bid 5mm … @ 99-15+", or "99-15+ / 99-16 for 5mm …" for a market. */
export function describeQuote(draft: RfqQuoteDraft, inquiry: RfqInquiry, labels: RfqTicketLabels = DEFAULT_RFQ_TICKET_LABELS): string {
  const { convention } = inquiry.instrument
  const what = `${formatSize(inquiry.quantity, convention)} ${inquiry.instrument.description ?? inquiry.instrument.symbol}`
  const level = (v: number | null) => (v === null ? "" : ` @ ${formatQuote(v, convention)}`)
  if (inquiry.side === "buy") return `${labels.ask} ${what}${level(draft.ask)}`
  if (inquiry.side === "sell") return `${labels.bid} ${what}${level(draft.bid)}`
  return `${formatQuote(draft.bid, convention)} / ${formatQuote(draft.ask, convention)} ${labels.for} ${what}`
}

/** How far a level sits from the market's same side, in the instrument's own steps: ticks for a price, basis points for a yield, discount, or spread. Null when a side is missing. */
export function quoteDistance(level: number | null | undefined, market: number | null | undefined, convention: InstrumentConvention): { value: number; text: string } | null {
  if (typeof level !== "number" || typeof market !== "number" || !Number.isFinite(level) || !Number.isFinite(market)) return null
  const basis = quoteBasisOf(convention)
  if (basis === "price") {
    const value = ticksBetween(level, market, convention.tick)
    return { value, text: formatTicks(value) }
  }
  const value = Number(((level - market) * (basis === "spread" ? 1 : 100)).toFixed(2))
  return { value, text: formatBps(value, { signed: true }) }
}

// Several tickets can be up at once, so the bindings are declared once per registry and taken
// back when the last ticket that leaned on them leaves. A consumer that declared an id owns it.
const declared = new WeakMap<HotkeyRegistry, Map<string, { count: number; ours: boolean }>>()

function declareBindings(registry: HotkeyRegistry, bindings: readonly HotkeyBinding[]): () => void {
  let table = declared.get(registry)
  if (!table) declared.set(registry, (table = new Map()))
  const have = new Set(registry.list().map((entry) => entry.id))
  for (const binding of bindings) {
    const entry = table.get(binding.id)
    if (entry) entry.count += 1
    else {
      const ours = !have.has(binding.id)
      if (ours) registry.register(binding)
      table.set(binding.id, { count: 1, ours })
    }
  }
  return () => {
    for (const binding of bindings) {
      const entry = table.get(binding.id)
      if (!entry) continue
      entry.count -= 1
      if (entry.count > 0) continue
      table.delete(binding.id)
      if (entry.ours) registry.unregister(binding.id)
    }
  }
}

const noop = () => () => {}
const level = (v: number | null | undefined) => (typeof v === "number" ? v : null)

export interface RfqTicketProps {
  inquiry: RfqInquiry
  actions: readonly RfqAction[]
  /** Where the fields start. Change the `key` to start again. */
  defaultDraft?: Partial<RfqLevels>
  onDraftChange?: (draft: RfqQuoteDraft) => void
  /** Anything that changes identity when the server acknowledges a send: a quote id, a timestamp. The ticket rings once in `primary`. */
  acknowledged?: unknown
  /** Put the keyboard in the first quote field on mount. Off by default: the parent decides where focus goes when an inquiry becomes active. */
  autoFocus?: boolean
  disabled?: boolean
  /** Declare `RFQ_TICKET_BINDINGS` in the hotkey registry when they are not. Default true. */
  hotkeys?: boolean
  labels?: Partial<RfqTicketLabels>
  className?: string
}

const TONE_CLASS = { up: "text-up", down: "text-down", flat: "text-muted-foreground" } as const

export function RfqTicket({ inquiry, actions, defaultDraft, onDraftChange, acknowledged, autoFocus = false, disabled = false, hotkeys: declareHotkeys = true, labels: labelsProp, className }: RfqTicketProps) {
  const labels = { ...DEFAULT_RFQ_TICKET_LABELS, ...labelsProp }
  const id = useId()
  const { convention } = inquiry.instrument
  const sides = quotedSides(inquiry.side)
  const [draft, setDraft] = useState<RfqQuoteDraft>(() => ({ inquiryId: inquiry.id, bid: level(defaultDraft?.bid), ask: level(defaultDraft?.ask) }))
  const [problems, setProblems] = useState<RfqQuoteProblems>({})

  const box = useRef<HTMLDivElement>(null)
  const inputs = { bid: useRef<HTMLInputElement>(null), ask: useRef<HTMLInputElement>(null) }
  const latest = useRef({ onDraftChange, actions, inquiry, draft, labels, disabled })
  useEffect(() => {
    latest.current = { onDraftChange, actions, inquiry, draft, labels, disabled }
  })

  // The draft is told after it changed, never on the first render.
  const told = useRef(draft)
  useEffect(() => {
    if (told.current === draft) return
    told.current = draft
    latest.current.onDraftChange?.(draft)
  }, [draft])

  useEffect(() => {
    if (autoFocus) inputs[sides[0]!].current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The acknowledgement: a ring in primary, once, when the server says so. No direction, because it has none.
  useFlash(box, acknowledged, { variant: "ring", color: "var(--primary)" })

  const allowed = actions.filter((action) => inquiry.allowedActions?.includes(action.id))
  const primary = allowed.find((action) => action.primary) ?? allowed.find((action) => action.needsQuote !== false) ?? allowed[0]
  // The fields are live while some allowed action would send what is in them.
  const quoting = !disabled && allowed.some((action) => action.needsQuote !== false)

  function setLevel(side: QuoteSide, value: number | null) {
    setDraft((d) => (d[side] === value ? d : { ...d, [side]: value }))
    setProblems((p) => (p[side] ? { ...p, [side]: undefined } : p))
  }

  /** Where a step starts when a field is blank: the market's same side, the suggested level, the market's mid, then its other side. */
  function stepFrom(side: QuoteSide): number | null {
    const market = inquiry.market ?? {}
    const suggested = inquiry.suggested ?? {}
    const own = level(market[side])
    if (own !== null) return own
    const hint = level(suggested[side])
    if (hint !== null) return hint
    const bid = level(market.bid)
    const ask = level(market.ask)
    if (bid !== null && ask !== null) return stepQuote((bid + ask) / 2, convention, 0)
    return bid ?? ask ?? level(market.mid)
  }

  function step(side: QuoteSide, steps: number) {
    const from = latest.current.draft[side] ?? stepFrom(side)
    if (from === null) return
    setLevel(side, stepQuote(from, convention, steps))
  }

  /** The field the keyboard is in, else the first side the client asked for. */
  function focusedSide(): QuoteSide {
    const active = typeof document === "undefined" ? null : document.activeElement
    for (const side of sides) if (inputs[side].current && inputs[side].current === active) return side
    return sides[0]!
  }

  function takeSuggested() {
    const suggested = latest.current.inquiry.suggested
    if (!suggested) return
    for (const side of sides) {
      const value = level(suggested[side])
      if (value !== null) setLevel(side, value)
    }
  }

  function run(action: RfqAction) {
    // Checked as the click lands, against the props as they are now: an action can stop being allowed.
    const { draft: current, inquiry: now, labels: words, disabled: off } = latest.current
    if (off || !now.allowedActions?.includes(action.id)) return
    if (action.needsQuote !== false) {
      const found = checkQuote(current, now, words)
      setProblems(found)
      if (found.bid || found.ask) return
    }
    action.run(current, now)
  }

  // Keys: declared once per registry, bound to this ticket's box so another ticket's keys stay its own.
  const registry = useMaybeHotkeys()
  const handlers = useRef({ send: () => {}, up: () => {}, down: () => {}, suggested: () => {} })
  useEffect(() => {
    handlers.current = {
      send: () => {
        const { actions: list, inquiry: now } = latest.current
        const open = list.filter((action) => now.allowedActions?.includes(action.id))
        const first = open.find((action) => action.primary) ?? open.find((action) => action.needsQuote !== false) ?? open[0]
        if (first) run(first)
      },
      up: () => step(focusedSide(), 1),
      down: () => step(focusedSide(), -1),
      suggested: takeSuggested,
    }
  })
  useEffect(() => {
    if (!registry) return
    const release = declareHotkeys ? declareBindings(registry, RFQ_TICKET_BINDINGS) : noop()
    const within = { scope: "editing", element: () => box.current }
    const guard = (fn: () => void) => (event: KeyboardEvent) => {
      event.preventDefault()
      fn()
    }
    const unbind = [
      registry.bind("rfq.send", guard(() => handlers.current.send()), within),
      registry.bind("rfq.tick-up", guard(() => handlers.current.up()), within),
      registry.bind("rfq.tick-down", guard(() => handlers.current.down()), within),
      registry.bind("rfq.suggested", guard(() => handlers.current.suggested()), within),
    ]
    return () => {
      for (const u of unbind) u()
      release()
    }
  }, [registry, declareHotkeys])
  const sendKeys = useSyncExternalStore(
    registry?.subscribe ?? noop,
    () => registry?.list().find((entry) => entry.id === "rfq.send")?.keys ?? null,
    () => null,
  )

  const sideWord = inquiry.side === "buy" ? labels.buys : inquiry.side === "sell" ? labels.sells : labels.asksMarket
  const size = formatSize(inquiry.quantity, convention)
  const description = inquiry.instrument.description ?? inquiry.instrument.symbol
  const market = inquiry.market
  const marketLabel = market?.label ?? labels.market
  const quotedLevels = inquiry.quoted
  const showMarket = Boolean(market || quotedLevels)
  const suggestedText = inquiry.suggested ? sides.map((side) => formatQuote(level(inquiry.suggested![side]), convention)).join(" / ") : null
  const hasSuggested = Boolean(inquiry.suggested && sides.some((side) => level(inquiry.suggested![side]) !== null))

  return (
    <HotkeyScope scope="editing" role="group" aria-label={`${labels.ticket} ${inquiry.id}`} data-slot="tradecn-rfq-ticket" data-inquiry={inquiry.id} data-side={inquiry.side} data-status={inquiry.status} className={cn("block outline-none", className)}>
      <div ref={box} className="flex flex-col gap-2 rounded-md border border-border bg-card p-2 text-xs text-card-foreground">
        <div className="flex items-start gap-2">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex flex-wrap items-baseline gap-x-1.5" data-rfq-headline>
              <span className="font-semibold">{inquiry.client?.name ?? labels.client}</span>{" "}
              <span className="text-muted-foreground">{sideWord}</span>{" "}
              <span className="font-mono font-semibold tabular-nums">{size}</span>{" "}
              <span className="font-mono font-semibold" data-rfq-instrument>
                {description}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1 text-muted-foreground">
              {inquiry.client?.tier && (
                <Badge variant="outline" className="h-4 px-1 text-[10px]" data-rfq-tier>
                  {inquiry.client.tier}
                </Badge>
              )}
              {inquiry.tags?.map((tag) => (
                <Badge key={tag} variant="secondary" className="h-4 px-1 text-[10px]" data-rfq-tag>
                  {tag}
                </Badge>
              ))}
              {inquiry.client?.trader && <span>{inquiry.client.trader}</span>}
              {inquiry.client?.salesperson && <span>· {inquiry.client.salesperson}</span>}
              {inquiry.settlement && (
                <span>
                  · {labels.settlement} {inquiry.settlement}
                </span>
              )}
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <Badge variant="secondary" className="h-5 px-1.5 font-medium" data-rfq-status>
              {inquiry.status}
            </Badge>
            <Countdown expiresAt={inquiry.expiresAt} startsAt={inquiry.receivedAt} label={`${labels.ticket} ${inquiry.id}`} className="text-sm" />
          </div>
        </div>

        {inquiry.context && inquiry.context.length > 0 && (
          <dl className="flex flex-wrap gap-x-3 gap-y-0.5 tabular-nums" data-rfq-context>
            {inquiry.context.map((item) => (
              <div key={item.label} className="flex gap-1">
                <dt className="text-muted-foreground">{item.label}</dt>
                <dd className={cn("font-medium", item.tone && TONE_CLASS[item.tone])}>{item.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {showMarket && (
          <div className="grid gap-x-3 gap-y-0.5 font-mono tabular-nums" style={{ gridTemplateColumns: `auto repeat(${sides.length}, minmax(0, 1fr))` }} data-rfq-market>
            <span />
            {sides.map((side) => (
              <span key={side} className="text-right text-muted-foreground">
                {labels[side]}
              </span>
            ))}
            {market && (
              <>
                <span className="text-muted-foreground">{marketLabel}</span>
                {sides.map((side) => (
                  <span key={side} className="text-right" data-rfq-market-level={side}>
                    {formatQuote(level(market[side]), convention)}
                  </span>
                ))}
              </>
            )}
            {quotedLevels && (
              <>
                <span className="text-muted-foreground">{labels.quoted}</span>
                {sides.map((side) => (
                  <span key={side} className="text-right font-semibold" data-rfq-quoted={side}>
                    {formatQuote(level(quotedLevels[side]), convention)}
                  </span>
                ))}
              </>
            )}
          </div>
        )}

        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${sides.length}, minmax(0, 1fr))` }}>
          {sides.map((side) => {
            const distance = quoteDistance(draft[side], level(market?.[side]), convention)
            return (
              <div key={side} className="flex flex-col gap-0.5">
                <QuoteField id={`${id}-${side}`} convention={convention} label={labels[side]} side={side} value={draft[side]} onValueChange={(value) => setLevel(side, value)} stepFrom={stepFrom(side)} disabled={!quoting} error={problems[side]} inputRef={inputs[side]} />
                <span className="h-4 text-right text-muted-foreground tabular-nums" data-rfq-distance={side} aria-live="off">
                  {distance ? `${distance.text} ${labels.vsMarket}` : " "}
                </span>
              </div>
            )
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2" data-rfq-actions={allowed.length}>
          {hasSuggested && (
            <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-1.5 font-mono" disabled={!quoting} aria-label={`${labels.takeSuggested}: ${suggestedText}`} data-rfq-suggested onClick={takeSuggested}>
              <span className="text-muted-foreground">{labels.suggested}</span>
              {suggestedText}
            </Button>
          )}
          <span className="ml-auto flex items-center gap-2">
            {allowed.length === 0 ? (
              <p className="text-muted-foreground">{labels.nothingAllowed}</p>
            ) : (
              allowed.map((action) => (
                <Button key={action.id} type="button" variant={action.destructive ? "destructive" : action === primary ? "default" : "outline"} size="sm" className="h-7 gap-2" disabled={disabled} data-action={action.id} onClick={() => run(action)}>
                  {typeof action.label === "function" ? action.label(draft) : action.label}
                  {action === primary && sendKeys && (
                    <KbdGroup aria-hidden>
                      {formatKeys(sendKeys)[0]?.map((cap) => (
                        <Kbd key={cap}>{cap}</Kbd>
                      ))}
                    </KbdGroup>
                  )}
                </Button>
              ))
            )}
          </span>
        </div>

        {inquiry.message && (
          <p className="border-t border-border pt-1.5 text-muted-foreground" data-rfq-message>
            {inquiry.message}
          </p>
        )}
      </div>
    </HotkeyScope>
  )
}

