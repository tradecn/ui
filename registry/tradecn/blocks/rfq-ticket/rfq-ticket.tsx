import { cn } from "cn"
import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { useFlash } from "@/registry/tradecn/hooks/use-flash"
import { HotkeyScope, useMaybeHotkeys } from "@/registry/tradecn/hooks/use-hotkeys"
import { NUMERIC_CLASS, formatBps, formatNotional, formatQuantity, formatQuote, formatTicks, numericFontClass, quoteBasisOf, quoteInvertedOf, stepQuote, ticksBetween, type InstrumentConvention } from "@/registry/tradecn/lib/format"
import { formatKeys, type HotkeyBinding, type HotkeyRegistry } from "@/registry/tradecn/lib/hotkeys"
import { blocks, checkLimits, confirms, problemsByField, type Limits } from "@/registry/tradecn/lib/limits"
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
  /** The size the quote is for: the inquiry's, unless a quick size was taken. */
  quantity?: number
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
  /** Preferred by `rfq.send` among quote-sending actions; a `needsQuote: false` action never runs on the key. */
  primary?: boolean
}

export interface RfqTicketLabels {
  /** The quick-size row's word: the size the quote is for. */
  quoteFor: string
  ticket: string
  client: string
  buys: string
  sells: string
  asksMarket: string
  bid: string
  ask: string
  market: string
  /** The invalid-text both level fields show. */
  invalidLevel?: string
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
  /** The primary action's words while a limit asks again; `{action}` is its label. */
  anyway: string
}

export const DEFAULT_RFQ_TICKET_LABELS: RfqTicketLabels = {
  quoteFor: "For",
  ticket: "Inquiry",
  client: "A client",
  buys: "buys",
  sells: "sells",
  asksMarket: "asks a market in",
  bid: "Bid",
  ask: "Offer",
  market: "Market",
  invalidLevel: "Not a level in this instrument's notation.",
  quoted: "Quoted",
  suggested: "Auto",
  takeSuggested: "Take the suggested levels",
  vsMarket: "vs market",
  settlement: "Settles",
  bidNeeded: "A bid is needed.",
  askNeeded: "An offer is needed.",
  crossed: "The quote is crossed.",
  nothingAllowed: "Nothing can be done with this inquiry right now.",
  for: "for",
  anyway: "{action} anyway?",
}

/** `mod+1` to `mod+9`: the quick sizes, in order. */
export const QUICK_SIZE_KEYS: readonly string[] = ["mod+1", "mod+2", "mod+3", "mod+4", "mod+5", "mod+6", "mod+7", "mod+8", "mod+9"]

/** The keys a ticket answers to, all `editing`: they run while you type in it. Declared by the ticket as registry defaults your own registration shadows. */
export const RFQ_TICKET_BINDINGS: readonly HotkeyBinding[] = [
  { id: "rfq.send", keys: "mod+enter", scope: "editing", description: "Send the quote", group: "Inquiry" },
  { id: "rfq.tick-up", keys: "mod+up", scope: "editing", description: "Level up one tick", group: "Inquiry" },
  { id: "rfq.tick-down", keys: "mod+down", scope: "editing", description: "Level down one tick", group: "Inquiry" },
  { id: "rfq.suggested", keys: "mod+shift+a", scope: "editing", description: "Take the suggested levels", group: "Inquiry" },
  ...QUICK_SIZE_KEYS.map((keys, i) => ({ id: `rfq.size-${i + 1}`, keys, scope: "editing" as const, description: `Quote for quick size ${i + 1}`, group: "Inquiry" })),
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

/** What stops a quote from being sent: a needed side that is blank or non-finite, or a crossed pair of finite levels read through the instrument's quote direction — bid above offer normally, bid below offer where a higher quote means a lower price, as `quoteInvertedOf` reads it. Empty when nothing does. */
export function checkQuote(draft: RfqQuoteDraft, inquiry: RfqInquiry, labels: RfqTicketLabels = DEFAULT_RFQ_TICKET_LABELS): RfqQuoteProblems {
  const problems: RfqQuoteProblems = {}
  const sides = quotedSides(inquiry.side)
  // Levels read through level(): a non-finite value counts as absent here too, as the page
  // promises for every reader of a level.
  const bid = level(draft.bid)
  const ask = level(draft.ask)
  if (sides.includes("bid") && bid === null) problems.bid = labels.bidNeeded
  if (sides.includes("ask") && ask === null) problems.ask = labels.askNeeded
  // A crossed quote bids above its offer, unless a higher quote means a lower price. A
  // declared quoteInverted decides for any basis; the defaults are yield and discount
  // inverted, price and spread not, since CDS quotes bid below offer while cash credit
  // quotes the other way.
  const inverted = quoteInvertedOf(inquiry.instrument.convention)
  if (bid !== null && ask !== null && (inverted ? bid < ask : bid > ask)) problems.ask = labels.crossed
  return problems
}

/** "Offer 5mm T 4 1/8 05/15/34 @ 99-16+", "Bid 5mm … @ 99-15+", or "99-15+ / 99-16 for 5mm …" for a market. */
export function describeQuote(draft: RfqQuoteDraft, inquiry: RfqInquiry, labels: RfqTicketLabels = DEFAULT_RFQ_TICKET_LABELS): string {
  const { convention } = inquiry.instrument
  const what = `${formatSize(draft.quantity ?? inquiry.quantity, convention)} ${inquiry.instrument.description ?? inquiry.instrument.symbol}`
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

// Every ticket declares the bindings as registry defaults: the registry refcounts them, a
// consumer registration of an id shadows its default, and unregistering surfaces it again, so
// no mount order can delete a consumer's declaration or strand a remaining ticket without one.
function declareBindings(registry: HotkeyRegistry, bindings: readonly HotkeyBinding[]): () => void {
  const releases = bindings.map((binding) => registry.declareDefault(binding))
  return () => {
    for (const release of releases) release()
  }
}

const noop = () => () => {}
/** The one action the send key runs: it sends the quote, so a pass never rides mod+enter. */
function sendTarget(allowed: readonly RfqAction[]): RfqAction | undefined {
  const sending = allowed.filter((action) => action.needsQuote !== false)
  return sending.find((action) => action.primary) ?? sending[0]
}
const RFQ_CORE_BINDINGS = RFQ_TICKET_BINDINGS.filter((binding) => !binding.id.startsWith("rfq.size-"))
const RFQ_SIZE_BINDINGS = RFQ_TICKET_BINDINGS.filter((binding) => binding.id.startsWith("rfq.size-"))
const level = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : null)

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
  /** Declare `RFQ_TICKET_BINDINGS` as registry defaults. Default true. */
  hotkeys?: boolean
  /** The desk's lines, from `limits`: a block shows under its field and holds the actions that send a quote; a confirm makes the action ask again. Each level is checked against the inquiry's market. */
  limits?: Limits
  /** Sizes the quote may be for besides the inquiry's, as buttons and `mod+1` to `mod+9`, printed in the convention's unit. */
  quickSizes?: readonly number[]
  labels?: Partial<RfqTicketLabels>
  className?: string
}

const TONE_CLASS = { up: "text-up", down: "text-down", flat: "text-muted-foreground" } as const

export function RfqTicket({ inquiry, actions, defaultDraft, onDraftChange, acknowledged, autoFocus = false, disabled = false, hotkeys: declareHotkeys = true, limits, quickSizes, labels: labelsProp, className }: RfqTicketProps) {
  const labels = { ...DEFAULT_RFQ_TICKET_LABELS, ...labelsProp }
  const id = useId()
  const { convention } = inquiry.instrument
  const sides = quotedSides(inquiry.side)
  const [draft, setDraft] = useState<RfqQuoteDraft>(() => ({ inquiryId: inquiry.id, bid: level(defaultDraft?.bid), ask: level(defaultDraft?.ask), quantity: inquiry.quantity }))
  const [problems, setProblems] = useState<RfqQuoteProblems>({})
  // The action a limit asked again about; the next click on it sends. Any change to a level withdraws the question.
  const [confirming, setConfirming] = useState<string | null>(null)

  const box = useRef<HTMLDivElement>(null)
  const inputs = { bid: useRef<HTMLInputElement>(null), ask: useRef<HTMLInputElement>(null) }
  const allowed = actions.filter((action) => inquiry.allowedActions?.includes(action.id))
  const primary = allowed.find((action) => action.primary) ?? allowed.find((action) => action.needsQuote !== false) ?? allowed[0]
  // The key hint rides the action the send key actually runs, which can differ from primary.
  const sendAction = sendTarget(allowed)
  // The fields are live while some allowed action would send what is in them.
  const quoting = !disabled && allowed.some((action) => action.needsQuote !== false)

  const latest = useRef({ onDraftChange, actions, inquiry, draft, labels, disabled, limits, confirming, quickSizes, quoting })
  // Layout phase, not passive: a keydown can land between the commit that withdrew an action
  // and the passive effects, and the check at run time must see what the dealer sees.
  useLayoutEffect(() => {
    latest.current = { onDraftChange, actions, inquiry, draft, labels, disabled, limits, confirming, quickSizes, quoting }
  })

  // When the control under focus leaves — quoting stops and both fields disable, a sent
  // action's button unmounts — focus falls to body, outside every fence, and the shortcuts go
  // dead. The scope root takes it instead.
  const focusedInside = useRef<HTMLElement | null>(null)
  useLayoutEffect(() => {
    const node = box.current ? box.current.parentElement ?? box.current : null
    const previous = focusedInside.current
    if (!node || !previous) return
    const doc = node.ownerDocument
    const gone = !previous.isConnected || previous.matches(":disabled")
    if (gone && (doc.activeElement === previous || doc.activeElement === doc.body)) {
      // Once parked, the record is spent: a later commit must not take focus again, and a
      // sibling ticket's stale record must not outrank the one the user was in. Never
      // scroll: the park can fire while the dealer reads elsewhere.
      focusedInside.current = null
      node.focus({ preventScroll: true })
    }
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

  /** The size the quote is for: the inquiry's own, or the n-th quick size (from 1). */
  function setQuantity(quantity: number) {
    setDraft((d) => (d.quantity === quantity ? d : { ...d, quantity }))
    setConfirming(null)
  }
  function quick(n: number) {
    const size = latest.current.quickSizes?.[n - 1]
    if (size !== undefined && latest.current.quoting) setQuantity(size)
  }

  function setLevel(side: QuoteSide, value: number | null) {
    setDraft((d) => (d[side] === value ? d : { ...d, [side]: value }))
    setProblems((p) => (p[side] ? { ...p, [side]: undefined } : p))
    setConfirming(null)
  }

  // The limits, live: a block shows under its field and holds the actions that send a quote; a confirm waits for the click.
  const quotedDraft = { bid: sides.includes("bid") ? draft.bid : null, ask: sides.includes("ask") ? draft.ask : null }
  const limitProblems = limits ? checkLimits(quotedDraft, limits, { market: inquiry.market, convention }) : []
  const blocking = blocks(limitProblems)
  const blockedBy = problemsByField(blocking)
  const blocked = blocking.length > 0
  const shownProblems = { bid: problems.bid ?? blockedBy.bid, ask: problems.ask ?? blockedBy.ask }
  const otherBlocks = blocking.filter((p) => p.field !== "bid" && p.field !== "ask")
  const asking = confirming !== null ? confirms(limitProblems) : []

  /** Where a step starts when a field is blank: the market's same side, the suggested level, the market's other side, then its mid. */
  function stepFrom(side: QuoteSide): number | null {
    const market = inquiry.market ?? {}
    const suggested = inquiry.suggested ?? {}
    const own = level(market[side])
    if (own !== null) return own
    const hint = level(suggested[side])
    if (hint !== null) return hint
    // The same side is blank here, so at most one market side remains.
    return level(market.bid) ?? level(market.ask) ?? level(market.mid)
  }

  function step(side: QuoteSide, steps: number) {
    const from = level(latest.current.draft[side]) ?? stepFrom(side)
    if (from === null) return
    setLevel(side, stepQuote(from, convention, steps))
  }

  /** The side the key came from: the event's target, else focus in this ticket's own document — a popout runs in the opener's JavaScript, so the global document never holds its fields — a side's step buttons counting as the side; else the first side the client asked for. */
  function focusedSide(target?: EventTarget | null): QuoteSide {
    // A popout's nodes come from another realm, where instanceof Element fails; nodeType is
    // realm-proof.
    const isElement = (node: EventTarget | null | undefined): node is Element => typeof node === "object" && node !== null && (node as Node).nodeType === 1
    const from = isElement(target) ? target : (box.current?.ownerDocument ?? (typeof document === "undefined" ? null : document))?.activeElement ?? null
    for (const side of sides) {
      const input = inputs[side].current
      if (!input) continue
      if (from === input || (isElement(from) && input.closest("[data-slot='tradecn-quote-field']")?.contains(from))) return side
    }
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
    const { draft: current, inquiry: now, labels: words, disabled: off, limits: lines, confirming: asked } = latest.current
    if (off || !now.allowedActions?.includes(action.id)) return
    if (action.needsQuote !== false) {
      const found = checkQuote(current, now, words)
      // The limits, as the click lands: a block stops here and shows under its field; a confirm asks once, and the next click on the same action sends.
      const quoted = quotedSides(now.side)
      const over = lines ? checkLimits({ bid: quoted.includes("bid") ? current.bid : null, ask: quoted.includes("ask") ? current.ask : null }, lines, { market: now.market, convention: now.instrument.convention }) : []
      const blocking = blocks(over)
      const stopped = problemsByField(blocking)
      setProblems({ bid: found.bid ?? stopped.bid, ask: found.ask ?? stopped.ask })
      if (found.bid || found.ask || blocking.length) return
      if (confirms(over).length && asked !== action.id) {
        setConfirming(action.id)
        return
      }
    }
    setConfirming(null)
    action.run(current, now)
  }

  // Keys: defaults declared per ticket, handlers fenced to this ticket so another's keys stay its own.
  const registry = useMaybeHotkeys()
  const handlers = useRef({ send: () => {}, up: (target?: EventTarget | null) => {
      void target
    }, down: (target?: EventTarget | null) => {
      void target
    }, suggested: () => {}, quick: (n: number) => {
      void n
    } })
  useLayoutEffect(() => {
    handlers.current = {
      send: () => {
        const { actions: list, inquiry: now, disabled: locked } = latest.current
        if (locked) return
        // The send key runs only an action that sends the quote — the same selection the key
        // hint renders — so a heading click and mod+enter can never fall back to a pass.
        const first = sendTarget(list.filter((action) => now.allowedActions?.includes(action.id)))
        if (first) run(first)
      },
      // The draft moves only while the fields are live: the same quoting condition that
      // enables the controls, so a pass-only inquiry's keys change nothing either.
      up: (target?: EventTarget | null) => {
        if (latest.current.quoting) step(focusedSide(target), 1)
      },
      down: (target?: EventTarget | null) => {
        if (latest.current.quoting) step(focusedSide(target), -1)
      },
      suggested: () => {
        if (latest.current.quoting) takeSuggested()
      },
      quick,
    }
  })
  const quickCount = quickSizes?.length ?? 0
  useEffect(() => {
    if (!registry) return
    const release = declareHotkeys ? declareBindings(registry, RFQ_CORE_BINDINGS) : noop()
    // Fenced to the scope root, so the shortcuts run from the heading, the market, and the padding too.
    const within = { scope: "editing", element: () => (box.current ? box.current.parentElement ?? box.current : null) }
    const guard = (fn: (event: KeyboardEvent) => void) => (event: KeyboardEvent) => {
      event.preventDefault()
      fn(event)
    }
    const unbind = [
      registry.bind("rfq.send", guard(() => handlers.current.send()), within),
      registry.bind("rfq.tick-up", guard((event) => handlers.current.up(event.target)), within),
      registry.bind("rfq.tick-down", guard((event) => handlers.current.down(event.target)), within),
      registry.bind("rfq.suggested", guard(() => handlers.current.suggested()), within),
      // Fenced handlers for all nine, acting only on a present size: an id anyone declares in
      // the editing scope meets this fence, and an undeclared absent size's event passes
      // through untouched.
      ...RFQ_SIZE_BINDINGS.map((binding, i) => registry.bind(binding.id, (event) => {
        if (i >= (latest.current.quickSizes?.length ?? 0)) return
        event.preventDefault()
        handlers.current.quick(i + 1)
      }, within)),
    ]
    return () => {
      for (const u of unbind) u()
      release()
    }
  }, [registry, declareHotkeys])
  // The sizes declare only for the quick sizes passed, in their own effect, so a size-count
  // change never re-declares the core bindings and an absent id never stands fenceless.
  useEffect(() => {
    if (!registry || quickCount === 0) return
    const release = declareHotkeys ? declareBindings(registry, RFQ_SIZE_BINDINGS.slice(0, quickCount)) : noop()
    return release
  }, [registry, declareHotkeys, quickCount])
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
    <HotkeyScope scope="editing" role="group" aria-label={`${labels.ticket} ${inquiry.id}`} data-slot="tradecn-rfq-ticket" data-inquiry={inquiry.id} data-side={inquiry.side} data-status={inquiry.status} className={cn("block rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/40 lining-nums tabular-nums", className)}>
      <div ref={box} className="flex flex-col gap-2 rounded-md border border-border bg-card p-2 text-xs text-card-foreground" onFocusCapture={(event) => { focusedInside.current = event.target as HTMLElement }} onBlurCapture={(event) => {
        // Focus moving somewhere outside the ticket on purpose: the leaving control is still
        // in the document and enabled, so there is nothing to recover from. A window switch
        // also blurs with no destination, but the document loses focus with it — the record
        // stays, so a control withdrawn while the dealer is away still parks on return.
        const leaving = event.target as HTMLElement
        const next = event.relatedTarget as HTMLElement | null
        if (!next && !event.currentTarget.ownerDocument.hasFocus()) return
        if (focusedInside.current === leaving && leaving.isConnected && !leaving.matches(":disabled") && (!next || !event.currentTarget.contains(next))) focusedInside.current = null
      }}>
        <div className="flex items-start gap-2">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex flex-wrap items-baseline gap-x-1.5" data-rfq-headline>
              <span className="font-semibold">{inquiry.client?.name ?? labels.client}</span>{" "}
              <span className="text-muted-foreground">{sideWord}</span>{" "}
              <span className="font-(family-name:--tradecn-font-mono) font-semibold lining-nums tabular-nums" data-numeric="">
                {size}
              </span>{" "}
              <span className="font-(family-name:--tradecn-font-mono) font-semibold" data-rfq-instrument>
                {description}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1 text-muted-foreground">
              {inquiry.client?.tier && (
                <Badge variant="outline" className="h-4 px-1 text-xs" data-rfq-tier>
                  {inquiry.client.tier}
                </Badge>
              )}
              {inquiry.tags?.map((tag) => (
                <Badge key={tag} variant="secondary" className="h-4 px-1 text-xs" data-rfq-tag>
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
            <Badge variant="secondary" className="h-5 px-1.5 text-xs font-medium" data-rfq-status>
              {inquiry.status}
            </Badge>
            <Countdown expiresAt={inquiry.expiresAt} startsAt={inquiry.receivedAt} label={`${labels.ticket} ${inquiry.id}`} className="text-sm" />
          </div>
        </div>

        {inquiry.context && inquiry.context.length > 0 && (
          <dl className="flex flex-wrap gap-x-3 gap-y-0.5 lining-nums tabular-nums" data-rfq-context>
            {inquiry.context.map((item) => (
              <div key={item.label} className="flex gap-1">
                <dt className="text-muted-foreground">{item.label}</dt>
                <dd className={cn("font-medium", item.tone && TONE_CLASS[item.tone])}>{item.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {showMarket && (
          <div className={cn("grid gap-x-3 gap-y-0.5", numericFontClass(convention))} style={{ gridTemplateColumns: `auto repeat(${sides.length}, minmax(0, 1fr))` }} data-rfq-market data-numeric="">
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
                <QuoteField id={`${id}-${side}`} convention={convention} label={labels[side]} side={side} value={draft[side]} onValueChange={(value) => setLevel(side, value)} stepFrom={stepFrom(side)} invalidText={labels.invalidLevel} disabled={!quoting} error={shownProblems[side]} inputRef={inputs[side]} />
                <span className="h-4 text-right text-muted-foreground lining-nums tabular-nums" data-rfq-distance={side} data-numeric="" aria-live="off">
                  {distance ? `${distance.text} ${labels.vsMarket}` : " "}
                </span>
              </div>
            )
          })}
        </div>

        {quickSizes && quickSizes.length > 0 && (
          <div role="group" aria-label={labels.quoteFor} data-rfq-quick-sizes="" className="flex flex-wrap items-center gap-1">
            <span className="text-muted-foreground">{labels.quoteFor}</span>
            {[inquiry.quantity, ...quickSizes.filter((size) => size !== inquiry.quantity)].map((size) => (
              <Button key={size} type="button" variant="outline" size="sm" className={cn("h-6 px-1.5 text-xs aria-pressed:bg-accent aria-pressed:text-accent-foreground dark:aria-pressed:bg-accent dark:aria-pressed:text-accent-foreground", NUMERIC_CLASS)} disabled={!quoting} aria-pressed={(draft.quantity ?? inquiry.quantity) === size} aria-label={`${labels.quoteFor} ${formatSize(size, convention)}`} data-quick-size={size} onClick={() => setQuantity(size)}>
                {formatSize(size, convention)}
              </Button>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2" data-rfq-actions={allowed.length}>
          {hasSuggested && (
            <Button type="button" variant="ghost" size="sm" className={cn("h-7 gap-1 px-1.5", numericFontClass(convention))} disabled={!quoting} aria-label={`${labels.takeSuggested}: ${suggestedText}`} data-rfq-suggested onClick={takeSuggested}>
              <span className="text-muted-foreground">{labels.suggested}</span>
              {suggestedText}
            </Button>
          )}
          <span className="ml-auto flex items-center gap-2">
            {allowed.length === 0 ? (
              <p className="text-muted-foreground">{labels.nothingAllowed}</p>
            ) : (
              allowed.map((action) => (
                <Button
                  key={action.id}
                  type="button"
                  variant={action.destructive ? "destructive" : action === primary ? "default" : "outline"}
                  size="sm"
                  className="h-7 gap-2"
                  disabled={disabled || (blocked && action.needsQuote !== false)}
                  data-action={action.id}
                  data-confirming={confirming === action.id || undefined}
                  onClick={() => run(action)}
                >
                  {confirming === action.id ? labels.anyway.replace("{action}", typeof action.label === "function" ? action.label(draft) : action.label) : typeof action.label === "function" ? action.label(draft) : action.label}
                  {action === sendAction && sendKeys && (
                    <KbdGroup aria-hidden>
                      {formatKeys(sendKeys)[0]?.map((cap) => (
                        <Kbd key={cap} className="text-xs">{cap}</Kbd>
                      ))}
                    </KbdGroup>
                  )}
                </Button>
              ))
            )}
          </span>
        </div>

        {(otherBlocks.length > 0 || asking.length > 0) && (
          <p className={asking.length ? "text-stale" : "text-destructive"} data-rfq-limits={asking.length ? "confirm" : "block"}>
            {[...otherBlocks, ...asking].map((p) => p.message).join(" ")}
          </p>
        )}

        {inquiry.message && (
          <p className="border-t border-border pt-1.5 text-muted-foreground" data-rfq-message>
            {inquiry.message}
          </p>
        )}
      </div>
    </HotkeyScope>
  )
}
