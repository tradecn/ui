import { cn } from "cn"
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent, type MouseEvent } from "react"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { useFlash } from "@/registry/tradecn/hooks/use-flash"
import { HotkeyScope, useMaybeHotkeys } from "@/registry/tradecn/hooks/use-hotkeys"
import { NUMERIC_CLASS, formatNotional, formatQuantity, formatQuote, numericFontClass, stepQuote, type InstrumentConvention } from "@/registry/tradecn/lib/format"
import { blocks, checkLimits, confirms, problemsByField, type Limits, type Problem as LimitProblem } from "@/registry/tradecn/lib/limits"
import { formatKeys, type HotkeyBinding, type HotkeyRegistry } from "@/registry/tradecn/lib/hotkeys"
import { QuoteField } from "@/registry/tradecn/ui/quote-field"

// An order ticket. Its price field is a quote-field, so it types a price the way the instrument
// quotes it and steps it by the quote step, and it hands a draft to whatever you named as an action. Two things it never does: work out a status, and
// offer an action the server did not allow. The status is a string the server said, printed as is.
// The buttons are the actions whose ids are in `allowedActions`, and no list means no buttons.
//
// Its keys are `editing` bindings inside its own scope, so they work while you type in it and
// nowhere else, and they keep working when the ticket is inside a dialog.

export type TicketSide = "buy" | "sell"

export interface TicketOption {
  id: string
  label: string
  /** False for an order that takes no price, such as a market order. Default true. */
  priced?: boolean
}

export interface TicketInstrument {
  symbol: string
  /** How prices print, parse, and step. */
  convention: InstrumentConvention
  /** What the arrows step the quantity by: a whole number from 1 to `Number.MAX_SAFE_INTEGER`, else 1. Default 1. */
  quantityStep?: number
}

export interface TicketDraft {
  side: TicketSide
  quantity: number | null
  /** Null while blank or not a price, and for an order type that takes none. */
  price: number | null
  type: string
  tif: string
  account: string | null
}

/** Prices to start from: click one to take it, and the arrows step from `last` when the field is blank. */
export interface TicketReference {
  bid?: number | null
  ask?: number | null
  last?: number | null
}

export interface TicketAction {
  /** Matched against `allowedActions`. */
  id: string
  /** A verb: "Send", "Amend". A function of the draft may say more. */
  label: string | ((draft: TicketDraft) => string)
  /** The draft, checked: a positive quantity, and a price when the order type takes one. */
  run: (draft: TicketDraft, instrument: TicketInstrument) => void
  destructive?: boolean
  /** The prominent action. `ticket.send` prefers it while it checks the draft; an action with `checked: false` never takes the send key. */
  primary?: boolean
  /** The draft is checked, and held by a limit, before this runs. Default true; false for an action that sends nothing of the draft. */
  checked?: boolean
}

export interface TicketLabels {
  ticket: string
  buy: string
  sell: string
  quantity: string
  /** The quick-size row's name. */
  quickSizes: string
  price: string
  type: string
  tif: string
  account: string
  bid: string
  ask: string
  last: string
  quantityInvalid: string
  priceInvalid: string
  priceRequired: string
  nothingAllowed: string
  /** The primary action's words while a limit asks again; `{action}` is its label. */
  anyway: string
}

export const DEFAULT_TICKET_LABELS: TicketLabels = {
  ticket: "Order ticket",
  buy: "Buy",
  sell: "Sell",
  quantity: "Quantity",
  quickSizes: "Quick sizes",
  price: "Price",
  type: "Type",
  tif: "Time in force",
  account: "Account",
  bid: "Bid",
  ask: "Ask",
  last: "Last",
  quantityInvalid: "Enter a quantity above zero.",
  priceInvalid: "Not a price in this instrument's notation.",
  priceRequired: "This order type needs a price.",
  nothingAllowed: "Nothing can be done with this ticket right now.",
  anyway: "{action} anyway?",
}

export const DEFAULT_ORDER_TYPES: readonly TicketOption[] = [
  { id: "limit", label: "Limit" },
  { id: "market", label: "Market", priced: false },
]

export const DEFAULT_TIME_IN_FORCES: readonly TicketOption[] = [
  { id: "day", label: "Day" },
  { id: "gtc", label: "GTC" },
  { id: "ioc", label: "IOC" },
]

/** `mod+1` to `mod+9`: the quick sizes, in order. */
export const QUICK_SIZE_KEYS: readonly string[] = ["mod+1", "mod+2", "mod+3", "mod+4", "mod+5", "mod+6", "mod+7", "mod+8", "mod+9"]

/** The keys a ticket answers to, all `editing`: they run while you type in it. Declared by the ticket as registry defaults your own registration shadows. */
export const TICKET_BINDINGS: readonly HotkeyBinding[] = [
  { id: "ticket.send", keys: "mod+enter", scope: "editing", description: "Send the ticket", group: "Ticket" },
  { id: "ticket.flip", keys: "mod+shift+x", scope: "editing", description: "Flip buy and sell", group: "Ticket" },
  { id: "ticket.tick-up", keys: "mod+up", scope: "editing", description: "Price up one step", group: "Ticket" },
  { id: "ticket.tick-down", keys: "mod+down", scope: "editing", description: "Price down one step", group: "Ticket" },
  ...QUICK_SIZE_KEYS.map((keys, i) => ({ id: `ticket.size-${i + 1}`, keys, scope: "editing" as const, description: `Quick size ${i + 1}`, group: "Ticket" })),
]

/** A quick size the way the desk says it: millions of notional when the convention quotes notional, a count otherwise. */
export function formatQuickSize(size: number, convention: InstrumentConvention): string {
  return convention.quantityUnit === "notional" ? formatNotional(size, { unit: "mm" }) : formatQuantity(size)
}

export interface TicketProps {
  instrument: TicketInstrument
  reference?: TicketReference
  /** Default: limit and market. */
  orderTypes?: readonly TicketOption[]
  /** Default: day, GTC, IOC. */
  timeInForces?: readonly TicketOption[]
  /** Left out, there is no account field. */
  accounts?: readonly TicketOption[]
  /** Where the ticket starts. Change the `key` to start again. */
  defaultDraft?: Partial<TicketDraft>
  onDraftChange?: (draft: TicketDraft) => void
  actions: readonly TicketAction[]
  /** What the server says may be done with this ticket now. No list means nothing, and no buttons. */
  allowedActions?: readonly string[]
  /** The desk's lines, from `limits`: a block shows under its field and holds the actions that send the draft; a confirm makes the action ask again. Checked against `reference` as the market. */
  limits?: Limits
  /** Sizes a press or `mod+1` to `mod+9` puts in the quantity, as buttons under the field, printed in the convention's unit. */
  quickSizes?: readonly number[]
  /** The server's word for where the order stands. Printed as it is. */
  status?: string
  /** What the server said about it, a rejection reason for one. Printed as it is. */
  message?: string
  /** Anything that changes identity when the server acknowledges: an order id, a timestamp. The ticket rings once in `primary`. */
  acknowledged?: unknown
  disabled?: boolean
  /** Declare `TICKET_BINDINGS` as registry defaults. Default true. */
  hotkeys?: boolean
  labels?: Partial<TicketLabels>
  className?: string
}

const isPriced = (types: readonly TicketOption[], id: string) => types.find((t) => t.id === id)?.priced !== false

/** "Buy 5 ZN @ 99-16+", or "Buy 5 ZN at market" for a type that takes no price. The level prints in the instrument's quote basis, as the field shows it. */
export function describeDraft(draft: TicketDraft, instrument: TicketInstrument, orderTypes: readonly TicketOption[] = DEFAULT_ORDER_TYPES, labels: Pick<TicketLabels, "buy" | "sell"> = DEFAULT_TICKET_LABELS): string {
  const side = draft.side === "buy" ? labels.buy : labels.sell
  const quantity = draft.quantity === null ? "" : ` ${formatQuantity(draft.quantity)}`
  const price = !isPriced(orderTypes, draft.type) ? " at market" : draft.price === null ? "" : ` @ ${formatQuote(draft.price, instrument.convention)}`
  return `${side}${quantity} ${instrument.symbol}${price}`
}

export interface TicketProblems {
  quantity?: string
  price?: string
}

/** What stops a draft from being sent. Empty when nothing does. */
export function checkDraft(draft: TicketDraft, orderTypes: readonly TicketOption[], labels: TicketLabels = DEFAULT_TICKET_LABELS): TicketProblems {
  const problems: TicketProblems = {}
  if (draft.quantity === null || !(draft.quantity > 0)) problems.quantity = labels.quantityInvalid
  if (isPriced(orderTypes, draft.type) && (draft.price === null || !Number.isFinite(draft.price))) problems.price = labels.priceRequired
  return problems
}

// A limit's identity apart from its words, which the market can change under it.
const ruleOf = (p: LimitProblem) => `${p.field}\u0000${p.rule}`

// What a press met, as it landed: the question an action asked, or (no action) the blocks it was refused for, by rule.
interface Said {
  text: string
  revision: number
  draft: TicketDraft | null
  action: string | null
  rules: readonly string[]
}

// A press counts once: the second click of a double-click, and the clicks a held Enter repeats on a focused
// button, run nothing and answer no question the first press asked. The hold belongs to the button it repeats
// on, and ends when the key is let go or focus leaves that button.
function useFreshPress() {
  const held = useRef<EventTarget | null>(null)
  const release = () => {
    held.current = null
  }
  return {
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      held.current = event.key === "Enter" && event.repeat ? event.currentTarget : null
    },
    onKeyUp: release,
    onBlur: release,
    fresh: (event: MouseEvent<HTMLElement>) => event.detail <= 1 && !(event.detail === 0 && held.current === event.currentTarget),
  }
}

/** The send shortcut's target: the first allowed action that checks the draft, preferring the primary one. An unchecked action sends nothing of the draft and a destructive one cancels or pulls, so a shortcut named send runs neither. */
function sendTarget(allowed: readonly TicketAction[]): TicketAction | null {
  const sending = allowed.filter((action) => action.checked !== false && !action.destructive)
  return sending.find((action) => action.primary) ?? sending[0] ?? null
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

/** Whole numbers, with or without separators. A quantity is contracts or units of notional, never a fraction. */
export function parseQuantity(text: string): number | null {
  const clean = text.trim().replace(/,/g, "")
  if (!/^\d+$/.test(clean)) return null
  const n = Number(clean)
  return Number.isSafeInteger(n) ? n : null
}

const noop = () => () => {}
const guardKey = (fn: () => void) => (event: KeyboardEvent | globalThis.KeyboardEvent) => {
  event.preventDefault()
  fn()
}
const TICKET_CORE_BINDINGS = TICKET_BINDINGS.filter((binding) => !binding.id.startsWith("ticket.size-"))
const TICKET_SIZE_BINDINGS = TICKET_BINDINGS.filter((binding) => binding.id.startsWith("ticket.size-"))

export function Ticket({
  instrument,
  reference,
  orderTypes = DEFAULT_ORDER_TYPES,
  timeInForces = DEFAULT_TIME_IN_FORCES,
  accounts,
  defaultDraft,
  onDraftChange,
  actions,
  allowedActions,
  limits,
  quickSizes,
  status,
  message,
  acknowledged,
  disabled = false,
  hotkeys: declareHotkeys = true,
  labels: labelsProp,
  className,
}: TicketProps) {
  const labels = { ...DEFAULT_TICKET_LABELS, ...labelsProp }
  const id = useId()
  const { convention } = instrument
  // Quantities are whole: a step that is not a whole number from 1 to the safe-integer limit steps by one.
  const quantityStep = Number.isSafeInteger(instrument.quantityStep) && instrument.quantityStep! > 0 ? instrument.quantityStep! : 1
  const [draft, setDraft] = useState<TicketDraft>(() => ({
    side: "buy",
    quantity: null,
    type: orderTypes[0]?.id ?? "",
    tif: timeInForces[0]?.id ?? "",
    account: accounts?.[0]?.id ?? null,
    ...defaultDraft,
    // Snapped to the quote grid, as a reference click is: the field prints the grid value.
    price: typeof defaultDraft?.price === "number" && Number.isFinite(defaultDraft.price) ? stepQuote(defaultDraft.price, convention, 0) : (defaultDraft?.price ?? null),
  }))
  const [quantityText, setQuantityText] = useState(() => (draft.quantity === null ? "" : formatQuantity(draft.quantity)))
  const [problems, setProblems] = useState<TicketProblems>({})
  // The action a limit asked again about; the next click on it sends. Any change to the draft withdraws the question.
  const [confirming, setConfirming] = useState<string | null>(null)
  const press = useFreshPress()
  const priced = isPriced(orderTypes, draft.type)

  // The limits, live: a block shows under its field and holds the actions that send the draft; a confirm waits for the click.
  const limitProblems = limits ? checkLimits({ side: draft.side, quantity: draft.quantity, price: priced ? draft.price : null }, limits, { market: reference, convention }) : []
  const blocking = blocks(limitProblems)
  const blockedBy = problemsByField(blocking)
  const blocked = blocking.length > 0
  const shownProblems = { quantity: problems.quantity ?? blockedBy.quantity, price: problems.price ?? blockedBy.price }
  const otherBlocks = blocking.filter((p) => p.field !== "quantity" && p.field !== "price")
  const asking = confirming !== null ? confirms(limitProblems) : []
  const limitsText = [...otherBlocks, ...asking].map((p) => p.message).join(" ")
  // What a screen reader hears from the limits: what a press met, as it landed — the blocks it was refused for, or
  // the question it asked. Nothing is said as the market or the trader's typing rewords them; the line and the
  // fields keep the live words on screen. A message goes for good once the draft changes or what it said no longer
  // stands (a block it named stops blocking, or the question is answered or withdrawn), so a block the market brings
  // back waits for the next press. Each message is a new node, so the same words said again are still heard.
  const [said, setSaid] = useState<Said>({ text: "", revision: 0, draft: null, action: null, rules: [] })
  const blockingRules = new Set(blocking.map(ruleOf))
  const stands = said.draft === draft && (said.action === null ? said.rules.every((rule) => blockingRules.has(rule)) : confirming === said.action)
  if (said.draft !== null && !stands) setSaid({ ...said, text: "", draft: null, action: null, rules: [] })
  const heard = stands ? said : null
  // The reasons the standing question asked about: a reason the market adds since makes the next press ask again.
  const askedRules = useRef<ReadonlySet<string>>(new Set())

  const box = useRef<HTMLDivElement>(null)
  const priceInput = useRef<HTMLInputElement>(null)
  const latest = useRef({ onDraftChange, actions, allowedActions, draft, orderTypes, labels, instrument, disabled, limits, reference, confirming, quickSizes })
  // Layout phase, not passive: a keydown can land between the commit that removed a button
  // and the passive effects, and the check at run time must see what the trader sees.
  useLayoutEffect(() => {
    latest.current = { onDraftChange, actions, allowedActions, draft, orderTypes, labels, instrument, disabled, limits, reference, confirming, quickSizes }
  })

  // The draft is told after it changed, never on the first render.
  const told = useRef(draft)
  useEffect(() => {
    if (told.current === draft) return
    told.current = draft
    latest.current.onDraftChange?.(draft)
  }, [draft])

  // The acknowledgement: a ring in primary, once, when the server says so. No direction, because it has none.
  useFlash(box, acknowledged, { variant: "ring", color: "var(--primary)" })

  // When the control under focus leaves — a sent action's button unmounts or disables with
  // the acknowledgement — focus falls to body, outside every fence, and the shortcuts go
  // dead. The scope root, which carries the fence's tabIndex, takes it instead. A deliberate
  // blur clears the record, or a later removal of that button would steal focus back in.
  const focusedInside = useRef<HTMLElement | null>(null)
  useLayoutEffect(() => {
    const node = box.current ? box.current.parentElement ?? box.current : null
    const previous = focusedInside.current
    if (!node || !previous) return
    const doc = node.ownerDocument
    const gone = !previous.isConnected || previous.matches(":disabled")
    if (gone && (doc.activeElement === previous || doc.activeElement === doc.body)) {
      focusedInside.current = null
      // Never scroll: the park can fire while the trader reads elsewhere, and a focus move
      // is what the page promises.
      node.focus({ preventScroll: true })
    }
  })

  function update(patch: Partial<TicketDraft>) {
    setDraft((d) => ({ ...d, ...patch }))
    setProblems((p) => {
      if (patch.quantity !== undefined && p.quantity) return { ...p, quantity: undefined }
      // A new price, or a type that takes none, answers the price problem.
      if (p.price && (patch.price !== undefined || (patch.type !== undefined && !isPriced(orderTypes, patch.type)))) return { ...p, price: undefined }
      return p
    })
    setConfirming(null)
  }

  // The quote field is controlled and follows the draft, so a step or a reference click is one update.
  function setPrice(value: number | null) {
    update({ price: value })
  }

  /** Where a step starts when the field is blank: the last, then the mid, then whichever side there is. A warming feed's NaN is no reference at all. */
  function priceToStepFrom(): number | null {
    if (draft.price !== null && Number.isFinite(draft.price)) return draft.price
    const { bid, ask, last } = reference ?? {}
    if (Number.isFinite(last)) return last as number
    if (Number.isFinite(bid) && Number.isFinite(ask)) return stepQuote(((bid as number) + (ask as number)) / 2, convention, 0)
    return Number.isFinite(bid) ? (bid as number) : Number.isFinite(ask) ? (ask as number) : null
  }

  function stepPrice(steps: number) {
    const from = priceToStepFrom()
    if (from === null) return
    // The field steps in the instrument's quote basis, so the shortcut steps the same way,
    // or the price sent would differ from the price shown on a discount, yield, or spread
    // instrument.
    setPrice(stepQuote(from, convention, steps))
  }

  function stepQuantity(steps: number) {
    const from = draft.quantity ?? 0
    const next = Math.max(0, Math.round((from + steps * quantityStep) / quantityStep) * quantityStep)
    update({ quantity: next })
    setQuantityText(formatQuantity(next))
  }

  /** The n-th quick size (from 1) into the quantity, when there is one. */
  function quick(n: number) {
    const size = latest.current.quickSizes?.[n - 1]
    if (size === undefined || latest.current.disabled) return
    update({ quantity: size })
    setQuantityText(formatQuantity(size))
  }

  function onQuantityChange(text: string) {
    setQuantityText(text)
    update({ quantity: parseQuantity(text) })
  }

  function onQuantityBlur() {
    const value = parseQuantity(quantityText)
    if (value !== null) setQuantityText(formatQuantity(value))
  }

  // Arrows step the quantity, Shift ten at a time. With a modifier held the key belongs to the
  // registry: `mod+up` steps the price from any field. The quote field does the same for the price.
  const stepper = (step: (steps: number) => void) => (event: KeyboardEvent<HTMLInputElement>) => {
    if ((event.key !== "ArrowUp" && event.key !== "ArrowDown") || event.ctrlKey || event.metaKey || event.altKey) return
    event.preventDefault()
    step((event.key === "ArrowUp" ? 1 : -1) * (event.shiftKey ? 10 : 1))
  }

  const allowed = actions.filter((action) => allowedActions?.includes(action.id))
  // A question whose action the server took away no longer stands: if the action comes back, it asks again.
  if (confirming !== null && !allowed.some((action) => action.id === confirming)) setConfirming(null)
  const primary = allowed.find((action) => action.primary) ?? allowed[0]
  const sendAction = sendTarget(allowed)
  // A block holds a checked action without taking it out of reach: it looks disabled and stays focusable, and a
  // press on it, from any input, is refused and says why.
  const heldByLimit = (action: TicketAction) => blocked && action.checked !== false

  function run(action: TicketAction) {
    // Checked as the click lands, against the props as they are now: an action can stop being allowed.
    const { draft: current, allowedActions: allowedNow, orderTypes: types, labels: words, instrument: inst, disabled: off, limits: lines, reference: market, confirming: asked } = latest.current
    if (off || !allowedNow?.includes(action.id)) return
    const price = isPriced(types, current.type) ? current.price : null
    const send = () => {
      setConfirming(null)
      action.run({ ...current, price }, inst)
    }
    if (action.checked === false) return send()
    const found = checkDraft(current, types, words)
    // The limits, as the click lands: a block stops here and shows under its field; a confirm asks once, and the next click on the same action sends.
    const over = lines ? checkLimits({ side: current.side, quantity: current.quantity, price }, lines, { market, convention: inst.convention }) : []
    const blocking = blocks(over)
    setProblems({ quantity: found.quantity, price: found.price })
    if (blocking.length) setSaid((now) => ({ text: blocking.map((p) => p.message).join(" "), revision: now.revision + 1, draft: current, action: null, rules: blocking.map(ruleOf) }))
    if (found.quantity || found.price || blocking.length) return
    const reasons = confirms(over)
    if (reasons.length && (asked !== action.id || !reasons.every((p) => askedRules.current.has(ruleOf(p))))) {
      askedRules.current = new Set(reasons.map(ruleOf))
      setConfirming(action.id)
      setSaid((now) => ({ text: reasons.map((p) => p.message).join(" "), revision: now.revision + 1, draft: current, action: action.id, rules: [] }))
      return
    }
    send()
  }

  // Keys: defaults declared per ticket, handlers fenced to this ticket so another's keys stay its own.
  const registry = useMaybeHotkeys()
  const handlers = useRef({ send: () => {}, flip: () => {}, up: () => {}, down: () => {}, quick: (n: number) => {
      void n
    } })
  useLayoutEffect(() => {
    handlers.current = {
      send: () => {
        const { actions: list, allowedActions: allowedNow } = latest.current
        const now = list.filter((action) => allowedNow?.includes(action.id))
        const first = sendTarget(now)
        if (first) run(first)
      },
      flip: () => {
        if (latest.current.disabled) return
        update({ side: draft.side === "buy" ? "sell" : "buy" })
      },
      up: () => {
        if (!latest.current.disabled) stepPrice(1)
      },
      down: () => {
        if (!latest.current.disabled) stepPrice(-1)
      },
      quick,
    }
  })
  const quickCount = quickSizes?.length ?? 0
  // Fenced to the scope root, so the shortcuts run from the symbol, the status, and the padding too.
  const within = useMemo(() => ({ scope: "editing", element: () => (box.current ? box.current.parentElement ?? box.current : null) }), [])
  useEffect(() => {
    if (!registry) return
    const release = declareHotkeys ? declareBindings(registry, TICKET_CORE_BINDINGS) : noop()
    const unbind = [
      registry.bind("ticket.send", guardKey(() => handlers.current.send()), within),
      registry.bind("ticket.flip", guardKey(() => handlers.current.flip()), within),
      registry.bind("ticket.tick-up", guardKey(() => handlers.current.up()), within),
      registry.bind("ticket.tick-down", guardKey(() => handlers.current.down()), within),
    ]
    return () => {
      for (const u of unbind) u()
      release()
    }
  }, [registry, declareHotkeys, within])
  // The sizes declare only for the quick sizes passed — a declared id needs its handler or it
  // has no fence and conflicts with another ticket's — and a size-count change never touches
  // the core four. Handlers still bind fenced for all nine so an id anyone else declares —
  // spreading TICKET_BINDINGS is the documented pattern — always meets a fence. An undeclared
  // absent size passes through untouched; a declared one is consumed by the registry before
  // this handler runs, which then does nothing for a size this ticket lacks.
  useEffect(() => {
    if (!registry || quickCount === 0) return
    const release = declareHotkeys ? declareBindings(registry, TICKET_SIZE_BINDINGS.slice(0, quickCount)) : noop()
    return release
  }, [registry, declareHotkeys, quickCount])
  useEffect(() => {
    if (!registry) return
    const unbind = TICKET_SIZE_BINDINGS.map((binding, i) => registry.bind(binding.id, (event) => {
      if (i >= (latest.current.quickSizes?.length ?? 0)) return
      event.preventDefault()
      handlers.current.quick(i + 1)
    }, within))
    return () => {
      for (const u of unbind) u()
    }
  }, [registry, within])
  const sendKeys = useSyncExternalStore(
    registry?.subscribe ?? noop,
    () => registry?.list().find((entry) => entry.id === "ticket.send")?.keys ?? null,
    () => null,
  )

  const referencePrice = (name: keyof TicketReference, label: string) => {
    const value = reference?.[name]
    if (typeof value !== "number" || !Number.isFinite(value)) return null
    // Snapped to the quote grid and printed in the quote basis: what the click stores is what
    // the field will show.
    const quote = stepQuote(value, convention, 0)
    return (
      <Button key={name} type="button" variant="ghost" size="sm" className={cn("h-5 gap-1 px-1 text-xs", numericFontClass(convention))} disabled={disabled || !priced} aria-label={`${label} ${formatQuote(quote, convention)}, use it`} data-reference={name} onClick={() => setPrice(quote)}>
        <span className="text-muted-foreground">{label}</span>
        {formatQuote(quote, convention)}
      </Button>
    )
  }

  const sideButton = (side: TicketSide) => (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-pressed={draft.side === side}
      disabled={disabled}
      data-side={side}
      // Stacked with dark: too, or a style's own dark:bg-* on the outline button paints over the fill.
      className={cn(
        "h-7 flex-1 font-semibold aria-pressed:text-background dark:aria-pressed:text-background",
        side === "buy" ? "aria-pressed:border-up aria-pressed:bg-up dark:aria-pressed:border-up dark:aria-pressed:bg-up" : "aria-pressed:border-down aria-pressed:bg-down dark:aria-pressed:border-down dark:aria-pressed:bg-down",
      )}
      onClick={() => update({ side })}
    >
      {side === "buy" ? labels.buy : labels.sell}
    </Button>
  )

  return (
    <HotkeyScope scope="editing" role="group" aria-label={`${labels.ticket} ${instrument.symbol}`} data-slot="tradecn-ticket" data-side={draft.side} data-status={status} className={cn("block rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/40 lining-nums tabular-nums", className)}>
      <div ref={box} className="flex flex-col gap-2 rounded-md border border-border bg-card p-2 text-xs text-card-foreground" onFocusCapture={(event) => { focusedInside.current = event.target as HTMLElement }} onBlurCapture={(event) => {
        // Focus moving somewhere outside the ticket on purpose: the leaving control is still
        // in the document and enabled, so there is nothing to recover from. A window switch
        // also blurs with no destination, but the document loses focus with it — the record
        // stays, so a control withdrawn while the trader is away still parks on return.
        const leaving = event.target as HTMLElement
        const next = event.relatedTarget as HTMLElement | null
        if (!next && !event.currentTarget.ownerDocument.hasFocus()) return
        if (focusedInside.current === leaving && leaving.isConnected && !leaving.matches(":disabled") && (!next || !event.currentTarget.contains(next))) focusedInside.current = null
      }}>
        <div className="flex items-center gap-2">
          <span className="font-(family-name:--tradecn-font-mono) text-sm font-semibold" data-ticket-symbol>
            {instrument.symbol}
          </span>
          <span className="ml-auto flex items-center gap-1">
            {referencePrice("bid", labels.bid)}
            {referencePrice("ask", labels.ask)}
            {referencePrice("last", labels.last)}
          </span>
        </div>

        <ButtonGroup className="w-full" aria-label={`${labels.buy} / ${labels.sell}`}>
          {sideButton("buy")}
          {sideButton("sell")}
        </ButtonGroup>

        <div className="grid grid-cols-2 gap-2">
          <Field data-invalid={shownProblems.quantity ? true : undefined}>
            <FieldLabel htmlFor={`${id}-quantity`}>{labels.quantity}</FieldLabel>
            <Input id={`${id}-quantity`} value={quantityText} inputMode="decimal" autoComplete="off" spellCheck={false} disabled={disabled} aria-invalid={shownProblems.quantity ? true : undefined} aria-describedby={problems.quantity ? `${id}-quantity-error` : undefined} data-numeric="" className={cn("h-7 text-xs md:text-xs", NUMERIC_CLASS)} onChange={(event) => onQuantityChange(event.target.value)} onBlur={onQuantityBlur} onKeyDown={stepper(stepQuantity)} />
            {/* A press's own problem is an alert tied to the field; a live limit block is said when a press meets it. */}
            {shownProblems.quantity && (
              <FieldError id={`${id}-quantity-error`} {...(problems.quantity ? {} : { role: "none" })}>
                {shownProblems.quantity}
              </FieldError>
            )}
            {quickSizes && quickSizes.length > 0 && (
              <div role="group" aria-label={labels.quickSizes} data-ticket-quick-sizes="" className="flex flex-wrap gap-1">
                {quickSizes.map((size, i) => (
                  <Button key={size} type="button" variant="outline" size="sm" className={cn("h-6 px-1.5 text-xs aria-pressed:bg-accent aria-pressed:text-accent-foreground dark:aria-pressed:bg-accent dark:aria-pressed:text-accent-foreground", NUMERIC_CLASS)} disabled={disabled} aria-pressed={draft.quantity === size} aria-label={`${labels.quantity} ${formatQuickSize(size, convention)}`} data-quick-size={size} onClick={() => quick(i + 1)}>
                    {formatQuickSize(size, convention)}
                  </Button>
                ))}
              </div>
            )}
          </Field>
          <QuoteField
            id={`${id}-price`}
            convention={convention}
            label={labels.price}
            value={draft.price}
            onValueChange={setPrice}
            stepFrom={priceToStepFrom()}
            disabled={disabled || !priced}
            placeholder={priced ? undefined : "market"}
            error={shownProblems.price}
            announceError={problems.price !== undefined}
            invalidText={labels.priceInvalid}
            inputRef={priceInput}
          />
          <Field>
            <FieldLabel htmlFor={`${id}-type`}>{labels.type}</FieldLabel>
            <NativeSelect id={`${id}-type`} value={draft.type} disabled={disabled} className="w-full" onChange={(event) => update({ type: event.target.value })}>
              {orderTypes.map((option) => (
                <NativeSelectOption key={option.id} value={option.id}>
                  {option.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor={`${id}-tif`}>{labels.tif}</FieldLabel>
            <NativeSelect id={`${id}-tif`} value={draft.tif} disabled={disabled} className="w-full" onChange={(event) => update({ tif: event.target.value })}>
              {timeInForces.map((option) => (
                <NativeSelectOption key={option.id} value={option.id}>
                  {option.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          {accounts && accounts.length > 0 && (
            <Field className="col-span-2">
              <FieldLabel htmlFor={`${id}-account`}>{labels.account}</FieldLabel>
              <NativeSelect id={`${id}-account`} value={draft.account ?? ""} disabled={disabled} className="w-full" onChange={(event) => update({ account: event.target.value })}>
                {accounts.map((option) => (
                  <NativeSelectOption key={option.id} value={option.id}>
                    {option.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
          )}
        </div>

        <div className="flex items-center gap-2" data-ticket-actions={allowed.length}>
          {allowed.length === 0 ? (
            <p className="text-muted-foreground">{labels.nothingAllowed}</p>
          ) : (
            allowed.map((action) => (
              <Button
                key={action.id}
                type="button"
                variant={action.destructive ? "destructive" : action === primary ? "default" : "outline"}
                size="sm"
                className="h-7 gap-2 aria-disabled:opacity-50"
                disabled={disabled}
                aria-disabled={heldByLimit(action) || undefined}
                data-action={action.id}
                data-confirming={confirming === action.id || undefined}
                onKeyDown={press.onKeyDown}
                onKeyUp={press.onKeyUp}
                onBlur={press.onBlur}
                onClick={(event) => {
                  if (press.fresh(event)) run(action)
                }}
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
        </div>

        {limitsText && (
          <p className={asking.length ? "text-stale" : "text-destructive"} data-ticket-limits={asking.length ? "confirm" : "block"}>
            {limitsText}
          </p>
        )}
        <span aria-live="polite" aria-atomic="true" className="sr-only" data-ticket-announcer>
          {heard && <span key={heard.revision}>{heard.text}</span>}
        </span>

        {(status || message) && (
          <div className="flex flex-wrap items-baseline gap-x-2 border-t border-border pt-1.5">
            {status && (
              <output className="font-medium" data-ticket-status>
                {status}
              </output>
            )}
            {message && (
              <span className="text-muted-foreground" data-ticket-message>
                {message}
              </span>
            )}
          </div>
        )}
      </div>
    </HotkeyScope>
  )
}
