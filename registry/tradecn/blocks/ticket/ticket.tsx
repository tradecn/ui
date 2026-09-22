import { cn } from "cn"
import { useEffect, useId, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { useFlash } from "@/registry/tradecn/hooks/use-flash"
import { HotkeyScope, useMaybeHotkeys } from "@/registry/tradecn/hooks/use-hotkeys"
import { formatPrice, formatQuantity, stepByTick, type InstrumentConvention } from "@/registry/tradecn/lib/format"
import { formatKeys, type HotkeyBinding, type HotkeyRegistry } from "@/registry/tradecn/lib/hotkeys"
import { QuoteField } from "@/registry/tradecn/ui/quote-field"

// An order ticket. Its price field is a quote-field, so it types a price the way the instrument
// quotes it and steps it by the tick, and it hands a draft to whatever you named as an action. Two things it never does: work out a status, and
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
  /** What the arrows step the quantity by. Default 1. */
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
  /** What `ticket.send` runs. The first allowed action by default. */
  primary?: boolean
}

export interface TicketLabels {
  ticket: string
  buy: string
  sell: string
  quantity: string
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
}

export const DEFAULT_TICKET_LABELS: TicketLabels = {
  ticket: "Order ticket",
  buy: "Buy",
  sell: "Sell",
  quantity: "Quantity",
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

/** The keys a ticket answers to, all `editing`: they run while you type in it. Declared by the ticket when you have not. */
export const TICKET_BINDINGS: readonly HotkeyBinding[] = [
  { id: "ticket.send", keys: "mod+enter", scope: "editing", description: "Send the ticket", group: "Ticket" },
  { id: "ticket.flip", keys: "mod+shift+x", scope: "editing", description: "Flip buy and sell", group: "Ticket" },
  { id: "ticket.tick-up", keys: "mod+up", scope: "editing", description: "Price up one tick", group: "Ticket" },
  { id: "ticket.tick-down", keys: "mod+down", scope: "editing", description: "Price down one tick", group: "Ticket" },
]

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
  /** The server's word for where the order stands. Printed as it is. */
  status?: string
  /** What the server said about it, a rejection reason for one. Printed as it is. */
  message?: string
  /** Anything that changes identity when the server acknowledges: an order id, a timestamp. The ticket rings once in `primary`. */
  acknowledged?: unknown
  disabled?: boolean
  /** Declare `TICKET_BINDINGS` in the hotkey registry when they are not. Default true. */
  hotkeys?: boolean
  labels?: Partial<TicketLabels>
  className?: string
}

const isPriced = (types: readonly TicketOption[], id: string) => types.find((t) => t.id === id)?.priced !== false

/** "Buy 5 ZN @ 99-16+", or "Buy 5 ZN at market" for a type that takes no price. */
export function describeDraft(draft: TicketDraft, instrument: TicketInstrument, orderTypes: readonly TicketOption[] = DEFAULT_ORDER_TYPES, labels: Pick<TicketLabels, "buy" | "sell"> = DEFAULT_TICKET_LABELS): string {
  const side = draft.side === "buy" ? labels.buy : labels.sell
  const quantity = draft.quantity === null ? "" : ` ${formatQuantity(draft.quantity)}`
  const price = !isPriced(orderTypes, draft.type) ? " at market" : draft.price === null ? "" : ` @ ${formatPrice(draft.price, instrument.convention.price)}`
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
  if (isPriced(orderTypes, draft.type) && draft.price === null) problems.price = labels.priceRequired
  return problems
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

/** Whole numbers, with or without separators. A quantity is contracts or units of notional, never a fraction. */
export function parseQuantity(text: string): number | null {
  const clean = text.trim().replace(/,/g, "")
  if (!/^\d+$/.test(clean)) return null
  const n = Number(clean)
  return Number.isSafeInteger(n) ? n : null
}

const noop = () => () => {}

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
  const { convention, quantityStep = 1 } = instrument
  const [draft, setDraft] = useState<TicketDraft>(() => ({
    side: "buy",
    quantity: null,
    price: null,
    type: orderTypes[0]?.id ?? "",
    tif: timeInForces[0]?.id ?? "",
    account: accounts?.[0]?.id ?? null,
    ...defaultDraft,
  }))
  const [quantityText, setQuantityText] = useState(() => (draft.quantity === null ? "" : formatQuantity(draft.quantity)))
  const [problems, setProblems] = useState<TicketProblems>({})
  const priced = isPriced(orderTypes, draft.type)

  const box = useRef<HTMLDivElement>(null)
  const priceInput = useRef<HTMLInputElement>(null)
  const latest = useRef({ onDraftChange, actions, allowedActions, draft, orderTypes, labels, instrument, disabled })
  useEffect(() => {
    latest.current = { onDraftChange, actions, allowedActions, draft, orderTypes, labels, instrument, disabled }
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

  function update(patch: Partial<TicketDraft>) {
    setDraft((d) => ({ ...d, ...patch }))
    setProblems((p) => (patch.quantity !== undefined && p.quantity ? { ...p, quantity: undefined } : patch.price !== undefined && p.price ? { ...p, price: undefined } : p))
  }

  // The quote field is controlled and follows the draft, so a step or a reference click is one update.
  function setPrice(value: number | null) {
    update({ price: value })
  }

  /** Where a step starts when the field is blank: the last, then the mid, then whichever side there is. */
  function priceToStepFrom(): number | null {
    if (draft.price !== null) return draft.price
    const { bid, ask, last } = reference ?? {}
    if (typeof last === "number") return last
    if (typeof bid === "number" && typeof ask === "number") return stepByTick((bid + ask) / 2, convention.tick, 0)
    return typeof bid === "number" ? bid : typeof ask === "number" ? ask : null
  }

  function stepPrice(steps: number) {
    const from = priceToStepFrom()
    if (from === null) return
    setPrice(stepByTick(from, convention.tick, steps))
  }

  function stepQuantity(steps: number) {
    const from = draft.quantity ?? 0
    const next = Math.max(0, Math.round((from + steps * quantityStep) / quantityStep) * quantityStep)
    update({ quantity: next })
    setQuantityText(formatQuantity(next))
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
  const primary = allowed.find((action) => action.primary) ?? allowed[0]

  function run(action: TicketAction) {
    // Checked as the click lands, against the props as they are now: an action can stop being allowed.
    const { draft: current, allowedActions: allowedNow, orderTypes: types, labels: words, instrument: inst, disabled: off } = latest.current
    if (off || !allowedNow?.includes(action.id)) return
    const found = checkDraft(current, types, words)
    setProblems(found)
    if (found.quantity || found.price) return
    action.run({ ...current, price: isPriced(types, current.type) ? current.price : null }, inst)
  }

  // Keys: declared once per registry, bound to this ticket's box so another ticket's keys stay its own.
  const registry = useMaybeHotkeys()
  const handlers = useRef({ send: () => {}, flip: () => {}, up: () => {}, down: () => {} })
  useEffect(() => {
    handlers.current = {
      send: () => {
        const { actions: list, allowedActions: allowedNow } = latest.current
        const now = list.filter((action) => allowedNow?.includes(action.id))
        const first = now.find((action) => action.primary) ?? now[0]
        if (first) run(first)
      },
      flip: () => update({ side: draft.side === "buy" ? "sell" : "buy" }),
      up: () => stepPrice(1),
      down: () => stepPrice(-1),
    }
  })
  useEffect(() => {
    if (!registry) return
    const release = declareHotkeys ? declareBindings(registry, TICKET_BINDINGS) : noop()
    const within = { scope: "editing", element: () => box.current }
    const guard = (fn: () => void) => (event: KeyboardEvent | globalThis.KeyboardEvent) => {
      event.preventDefault()
      fn()
    }
    const unbind = [
      registry.bind("ticket.send", guard(() => handlers.current.send()), within),
      registry.bind("ticket.flip", guard(() => handlers.current.flip()), within),
      registry.bind("ticket.tick-up", guard(() => handlers.current.up()), within),
      registry.bind("ticket.tick-down", guard(() => handlers.current.down()), within),
    ]
    return () => {
      for (const u of unbind) u()
      release()
    }
  }, [registry, declareHotkeys])
  const sendKeys = useSyncExternalStore(
    registry?.subscribe ?? noop,
    () => registry?.list().find((entry) => entry.id === "ticket.send")?.keys ?? null,
    () => null,
  )

  const referencePrice = (name: keyof TicketReference, label: string) => {
    const value = reference?.[name]
    if (typeof value !== "number") return null
    return (
      <Button key={name} type="button" variant="ghost" size="sm" className="h-5 gap-1 px-1 font-mono text-xs" disabled={disabled || !priced} aria-label={`${label} ${formatPrice(value, convention.price)}, use it`} data-reference={name} onClick={() => setPrice(value)}>
        <span className="text-muted-foreground">{label}</span>
        {formatPrice(value, convention.price)}
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
    <HotkeyScope scope="editing" role="group" aria-label={`${labels.ticket} ${instrument.symbol}`} data-slot="tradecn-ticket" data-side={draft.side} className={cn("block outline-none", className)}>
      <div ref={box} className="flex flex-col gap-2 rounded-md border border-border bg-card p-2 text-xs text-card-foreground">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-semibold" data-ticket-symbol>
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
          <Field data-invalid={problems.quantity ? true : undefined}>
            <FieldLabel htmlFor={`${id}-quantity`}>{labels.quantity}</FieldLabel>
            <Input id={`${id}-quantity`} value={quantityText} inputMode="decimal" autoComplete="off" spellCheck={false} disabled={disabled} aria-invalid={problems.quantity ? true : undefined} className="h-7 font-mono text-xs md:text-xs" onChange={(event) => onQuantityChange(event.target.value)} onBlur={onQuantityBlur} onKeyDown={stepper(stepQuantity)} />
            {problems.quantity && <FieldError>{problems.quantity}</FieldError>}
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
            error={problems.price}
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
        </div>

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
