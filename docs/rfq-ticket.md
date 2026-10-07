# RfqTicket

A client inquiry with market and quoted levels, a countdown, and quote fields in the instrument's notation. The server supplies the status and allowed actions.

## Usage

```tsx
import { useState } from "react"
import { RfqTicket, describeQuote, type RfqAction, type RfqInquiry } from "@/components/rfq-ticket"

function InquiryTicket() {
  const [inquiry] = useState<RfqInquiry>(() => {
    const now = Date.now()
    return {
      id: "Q-1",
      instrument: { symbol: "T10", description: "10Y Treasury", convention: { price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 } },
      client: { name: "ALPHA" },
      side: "buy",
      quantity: 5_000_000,
      receivedAt: now,
      expiresAt: now + 60_000,
      market: { bid: 99.5, ask: 99.515625 },
      status: "Open",
      allowedActions: ["quote"],
    }
  })
  const [request, setRequest] = useState("None")
  const actions: RfqAction[] = [
    { id: "quote", label: "Quote", run: (draft, inquiry) => setRequest(describeQuote(draft, inquiry)) },
  ]
  return (
    <div className="w-[26rem] max-w-full space-y-2 text-xs lining-nums tabular-nums">
      <RfqTicket key={inquiry.id} inquiry={inquiry} actions={actions} />
      <p role="status" className="text-muted-foreground">Last request: {request}</p>
    </div>
  )
}
```

A buyer needs your offer. Enter `99-16+` or step from the market with the arrow keys, then choose Quote. The ticket checks the required level before calling the action. This example prints the request; connect `run` to your transport to send it.

Keep `key={inquiry.id}` so a new inquiry starts with its own draft. The countdown stops at zero, but status and permissions remain as supplied. Your app updates them from the venue. Render the ticket on the client: the countdown reads a shared clock that advances only while something in a browser subscribes, so server-rendered digits go stale and mismatch on hydration. Shortcuts require a [`HotkeysProvider`](use-hotkeys.md), shown below.

## Buyer, seller, and two-way inquiries

The client's side determines your fields: an offer for a buyer, a bid for a seller, or both for a two-way inquiry. Change the client side to load a different keyed inquiry and clear the previous draft. The market stays the same so the field choice is easy to compare.

Both sides are required for a two-way quote. Enter a crossed pair to see the crossed-quote check — a bid above the offer normally, below it where a higher quote means a lower price. A declared `quoteInverted` decides for any basis; the defaults are yield and discount inverted, price and spread not, since CDS quotes bid below offer while cash credit quotes the other way. The request caption changes only after a valid Quote action.

<!-- demo: rfq-ticket-sides -->

## Suggested levels and shortcuts

The Auto button copies suggested levels into the draft without sending, snapped to the quote grid, so the level sent is the one the button and the field show. Choose a quick size, then Quote; the request caption includes that quantity. The venue supplies the allowed sizes, which can include more than the original inquiry's size. This example also shows client details, venue tags, settlement, and preformatted risk context.

Inside a quote field, use `mod+shift+a` for suggestions, `mod+up` or `mod+down` to step the focused level, `mod+1` or `mod+2` for the first two quick sizes, and `mod+enter` to quote. `mod` is Command on Mac and Control elsewhere. `HotkeysProvider` enables these bindings and the send hint; plain Enter sends nothing.

<!-- demo: rfq-ticket-shortcuts -->

## Server responses

The controls above the ticket stand in for venue messages. Quote enters Sending; Acknowledge quote supplies the live levels and changes `acknowledged` to flash the ticket. Report done away supplies the terminal status and removes allowed actions. These transitions wait for you so each state remains inspectable.

Quote auto uses a fixed server price without reading or validating the fields. Pass needs no quote either and is available while waiting or quoted. Pass, Expire inquiry, and Next inquiry discard the pending request, so an acknowledgement cannot revive an ended inquiry or land on the next one. Next inquiry also resets the keyed draft and countdown. There are no delayed callbacks.

Let the timer reach zero to see that it leaves actions unchanged, then use Expire inquiry to supply the venue's end status. The ticket displays the status and permissions it receives; it does not infer either from the clock.

<!-- demo: rfq-ticket-server -->

## API Reference

This block installs `rfq-ticket.tsx` in your `components` alias. It shares source files with `quote-field`, `countdown`, `format`, `flash-cell`, `limits`, and `use-hotkeys` at a given registry version. Editing the installed file is the intended way to change its layout. Everything in `rfq-ticket.tsx` is then yours — the markup, the draft state, the handlers and keys, and the exported `quotedSides`, `formatSize`, `checkQuote`, `describeQuote`, and `quoteDistance` — while the shared files it installs beside it, `quote-field`, `countdown`, `format`, `limits`, `use-flash`, the clock files, and the hotkey files, keep taking updates from any item that installs them. Take later fixes to `rfq-ticket.tsx` itself by hand: read an update with `--diff` before taking it.

### Props

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `inquiry` | `RfqInquiry` | Required | Server data for this ticket. |
| `actions` | `readonly RfqAction[]` | Required | Available action definitions, in display order. |
| `defaultDraft` | `Partial<RfqLevels>` | Both levels `null` | Initial bid and ask, snapped to the quote grid; read only on mount, with the inquiry's quantity. A side the inquiry did not ask for still enters the draft, reaches `run`, and feeds the crossed check, so seed only the requested sides. |
| `onDraftChange` | `(draft: RfqQuoteDraft) => void` | None | Reports the current draft after a change. |
| `acknowledged` | `unknown` | `undefined` | Change this value when the server acknowledges a quote. |
| `autoFocus` | `boolean` | `false` | Requests focus on the first quote field on mount. |
| `disabled` | `boolean` | `false` | Disables fields and buttons, blocks action execution, and stops every ticket shortcut. |
| `hotkeys` | `boolean` | `true` | Declares `RFQ_TICKET_BINDINGS` as registry defaults, the size keys for the quick sizes passed. |
| `limits` | `Limits` | None | Checks quoted sides before sending. |
| `quickSizes` | `readonly number[]` | None | Alternative quote quantities in raw notional or contracts. |
| `labels` | `Partial<RfqTicketLabels>` | `DEFAULT_RFQ_TICKET_LABELS` | Overrides the ticket's own wording. |
| `className` | `string` | None | Styles the outer group. |

### The inquiry

| `RfqInquiry` field | Type | Required / default | Meaning |
|---|---|---|---|
| `id` | `string` | Required | Inquiry identity. |
| `instrument` | `RfqInstrument` | Required | Symbol, optional description, and required `InstrumentConvention`. |
| `side` | `"buy" \| "sell" \| "two-way"` | Required | Client's side. |
| `quantity` | `number` | Required | Raw notional or contract count. |
| `expiresAt` | `number` | Required | Deadline in milliseconds since the epoch. |
| `status` | `string` | Required | Venue text, printed in a badge and as `data-status`. |
| `client` | `RfqClient` | Name: `"A client"` | Required `name`; optional `tier`, `trader`, and `salesperson`, all strings. |
| `tags` | `readonly string[]` | None | Venue badges, such as protocol, dealer count, or list name. |
| `settlement` | `string` | None | Settlement text. |
| `receivedAt` | `number` | First countdown render | Arrival in milliseconds since the epoch; sets the countdown bar's full duration. |
| `context` | `readonly RfqContextItem[]` | None | Preformatted `label` and `value` strings, with optional `tone: "up" \| "down" \| "flat"`. The tone only colors the value, so put the direction in it as a sign or a word. |
| `market` | `RfqMarket` | None | Reference bid, ask, and optional mid; optional `label` defaults to `"Market"`. |
| `quoted` | `RfqLevels` | None | This desk's live quote from the server. |
| `suggested` | `RfqLevels` | None | Proposed levels to copy into the draft. |
| `message` | `string` | None | Server text below the actions. |
| `allowedActions` | `readonly string[]` | No actions | Ids matched against `actions`. |

The headline reads `Client A buys 5mm T 4 1/8 05/15/34`. `instrument.description` falls back to `instrument.symbol`. Size prints in millions of notional, or as a count when `convention.quantityUnit` is `"contracts"`. Tier and tags appear as badges; trader, salesperson, and settlement appear beneath the headline. Context values print unchanged, with tone applied only when supplied.

`RfqLevels` has optional `bid` and `ask` fields of type `number | null`. `RfqMarket` adds `label?: string` and `mid?: number | null`. A mid can seed a blank field but is not displayed as a bid or ask.

| Client's `side` | Quote fields |
|---|---|
| `"buy"` | Offer (`ask`) |
| `"sell"` | Bid (`bid`) |
| `"two-way"` | Bid and Offer |

### The quote

Each [`quote-field`](quote-field.md) parses and steps in the instrument's convention: `99-16+` for a fractional note price or `4.253` for a bill on discount. A typed decimal snaps to the printable grid when parsed, so the quoted level is the grid price the field's text formats to. Arrows and step buttons use the convention's step. A blank field starts from the market's same side, then the suggested same side, then the other market side, then `market.mid`. With neither a market side nor a suggestion nor `market.mid`, stepping does nothing, and `maxDistance` skips a field that has no market to measure from.

Distance below a field compares it with the market's same side: ticks for price, basis points for yield, discount, or spread. For example, one tick above shows `+1 vs market`. Missing or nonfinite levels show no distance. Yield and discount differences multiply by 100; spreads are already in basis points.

The suggested-level button appears when at least one requested side has a suggestion. It and `rfq.suggested` copy available suggestions without clearing other fields or sending a quote. Updating `quoted` or `suggested` does not automatically replace the draft.

| `RfqQuoteDraft` field | Type | Initial value |
|---|---|---|
| `inquiryId` | `string` | `inquiry.id` |
| `bid`, `ask` | `number \| null` | Corresponding `defaultDraft` level, otherwise `null` |
| `quantity` | `number` (optional in the type) | `inquiry.quantity`; the ticket includes it in emitted drafts |

`onDraftChange` reports changes to this draft after render. It does not report the initial draft, unchanged values, or inquiry-only updates. Changing `defaultDraft` later has no effect; remount to reset it.

These helpers are exported for confirmations, palette rows, and tests:

| Helper | Result |
|---|---|
| `quotedSides(side)` | Requested dealer sides as `readonly QuoteSide[]`, where `QuoteSide` is `"bid" \| "ask"`. |
| `formatSize(quantity, convention)` | Millions of notional (`5_000_000` → `5mm`) or a contract count. |
| `quoteDistance(level, market, convention)` | `{ value, text }`, or `null` for a missing or nonfinite input. Both levels accept `number \| null \| undefined`. |
| `checkQuote(draft, inquiry, labels?)` | `RfqQuoteProblems`: optional `bid` and `ask` messages for a required level that is null or non-finite, or a crossed pair read through the quote direction. |
| `describeQuote(draft, inquiry, labels?)` | Text such as `Offer 5mm T 4 1/8 05/15/34 @ 99-16+`; uses `draft.quantity ?? inquiry.quantity`. |

The last two helpers default to `DEFAULT_RFQ_TICKET_LABELS` and accept a full `RfqTicketLabels` object. `checkQuote` does not check limits or quantity; it rejects crossed levels through the instrument's quote direction whenever both are finite — bid above offer normally, bid below offer where `quoteInvertedOf` reads the instrument as inverted — including an unused side supplied through `defaultDraft`, and a required side that is null or non-finite gets its needed message instead.

### The actions are the server's

| `RfqAction` field | Type | Required / default | Purpose |
|---|---|---|---|
| `id` | `string` | Required | Matches an `allowedActions` id. |
| `label` | `string \| ((draft: RfqQuoteDraft) => string)` | Required | Button text, optionally derived from the draft. |
| `run` | `(draft: RfqQuoteDraft, inquiry: RfqInquiry) => void` | Required | Executes the action with the current draft and inquiry. |
| `needsQuote` | `boolean` | `true` | Requires quote and limit checks. |
| `destructive` | `boolean` | `false` | Uses the destructive button style. |
| `primary` | `boolean` | Automatic | Preferred by `rfq.send` among quote-sending actions that are not `destructive`; `rfq.send` never runs a destructive action. Uses primary styling unless destructive. |

Only matching actions render, in your `actions` order. No matches produces the nothing-allowed message. The primary action — for styling — is the first allowed action marked `primary`, otherwise the first that needs a quote, otherwise the first allowed action. The send key chooses separately: the first allowed quote-sending action that is not `destructive`, preferring one marked `primary`, so neither a `needsQuote: false` action nor a destructive one ever runs on it, however it is marked.

A press counts once: the second click of a double-click, and the clicks a held Enter repeats on a focused button, run nothing. Two separate presses run the action twice unless `run` takes it out of `allowedActions` at once; do that, or have your server refuse the repeat.

On execution, the ticket rechecks `disabled`, permission, and any required quote and limit checks against current props. Quote errors appear under their fields. Set `needsQuote: false` for pass, stop, or server-priced actions; these receive the current draft without quote or limit validation.

Fields, size buttons, and the suggestion button are disabled unless an allowed action needs a quote and `disabled` is false. Removing allowed actions preserves the displayed draft, and when the control under focus leaves with the change — a sent action's button unmounts — focus moves to the ticket itself, so the shortcuts stay live; this park is the one exception to the parent owning focus, it fires only while focus was in this ticket, a deliberate click elsewhere is remembered as leaving, and a window switch is not — a control withdrawn while the dealer is away still parks on return. A non-finite market, suggested, or default level — a feed still warming up — counts as absent everywhere: fields, steps, the suggestion button, and the market row's readout. `status` alone does not disable anything, and countdown expiry does not remove actions.

Changing `acknowledged` triggers the `primary` ring flash; the first render and equal values do not. Changes use `Object.is` equality. The flash follows [`useFlash`](flash-cell.md) motion behavior and never changes the inquiry's status. Under reduced motion the hook only marks `data-direction`, and the box styles nothing by it, so nothing visible happens.

### Arrival never moves anything

The parent chooses the active inquiry and owns focus. Key the ticket by inquiry id: reusing a mounted ticket for another inquiry retains the old draft, including its `inquiryId` and quantity. `autoFocus` acts only on mount and cannot focus a disabled field.

The [`countdown`](countdown.md) uses `receivedAt` to `expiresAt` for its bar, falling back to first render when `receivedAt` is omitted. It announces the label and time left on tier changes, including the provisional last-10-seconds threshold and expiry. Your app decides whether the inquiry has ended from venue status.

### Keys

Inside a `HotkeysProvider`, the ticket declares these `editing` bindings as registry defaults, the size keys only for the quick sizes passed:

| Binding | Default key | Action |
|---|---|---|
| `rfq.send` | `mod+enter` | Runs the first allowed quote-sending action that is not `destructive`, preferring the primary; its key caps render on that action's button, and it does nothing when no such action is allowed. |
| `rfq.tick-up`, `rfq.tick-down` | `mod+up`, `mod+down` | Steps the side the key came from — its field or step buttons — else the first field. |
| `rfq.suggested` | `mod+shift+a` | Copies suggested levels. |
| `rfq.size-1` … `rfq.size-N` | `mod+1` … `mod+N` | Selects an entry from `quickSizes`, in supplied order; declared through `N = quickSizes.length`, at most nine. |

`mod` is Command on Mac and Control elsewhere. `QUICK_SIZE_KEYS` exports the nine size shortcuts. Spread `RFQ_TICKET_BINDINGS` into your own registry list to change keys or descriptions. The defaults stand while any ticket with `hotkeys` enabled remains: your registration of an id shadows the ticket's default whenever it comes, unregistering yours brings the default back, and `unregister("rfq.send")` does nothing while a ticket holds the default — so a binding you declare stays yours through the per-inquiry remounts. Handlers run anywhere inside the ticket, and dialog boundaries keep outside handlers from running.

`hotkeys={false}` skips declarations but still binds handlers for these ids, declared before or after. Without a provider, there are no shortcuts or key hints. Plain Enter sends nothing; the ticket has no form.

A disabled ticket runs no shortcuts at all, though its keys are still consumed. While nobody declares an absent size's id, its keys pass through untouched; once the id is declared in the `editing` scope — by you, or by another ticket with more sizes on the shared registry — the registry consumes the key wherever the fence reaches, and a ticket without that size does nothing with it; keep ticket ids in `editing`, since a declaration in another scope dispatches unfenced. Draft shortcuts run only while the fields are live — an allowed action needs a quote — exactly as the controls do; the send key runs only an action that sends the quote; and sending checks everything again as the click lands. `remap(id, "")` turns a key off as a user override the hotkey editor shows and Reset undoes. Use registry binding conditions to suppress draft shortcuts when needed.

### Limits

The [`limits`](limits.md) check receives only requested bid and ask levels, plus the inquiry's market and convention. It receives no quantity, so `maxQuantity` and `minQuantity` do not constrain RFQ quick sizes. Custom rules receive that same limited draft.

`maxDistance` compares each level with the market's same side, falling back to `market.mid` when that side is absent. Use ticks for price and basis points for other quote bases; a spread is compared in the basis points it is quoted in, in the same unit the field's distance readout uses; on a one-sided market the limit measures from its fallback while the field shows no distance. `sides` checks the dealer's side: a bid is a buy and an offer is a sell.

A block shows under its field, or below the actions for other fields, and disables actions that need a quote. A confirm applies to any action that needs a quote: its button becomes `Quote anyway?` (using that action's label), the reason appears below on a `role="status"` line, announced as it appears, and the next fresh press of the same action sends if checks pass; a double-click's second click or a held Enter's repeat does not count. Editing a level or choosing a size clears the confirmation. Both checks run live and again on execution; `needsQuote: false` actions bypass them.

### Quick sizes

`quickSizes={[1_000_000, 2_000_000]}` adds `For 5mm 1mm 2mm` beneath a 5mm inquiry's fields. The inquiry's size comes first; matching entries are removed from the displayed alternatives. Shortcuts still index your original array. Sizes use the convention's unit, and the selected button has `aria-pressed="true"`.

Choosing a size changes the draft's `quantity`. Supply sizes the venue accepts; the ticket does not restrict them to less than the inquiry's size. An absent or empty array hides the row. Removing it later retains the selected draft quantity.

### Labels

`labels` overrides entries in `DEFAULT_RFQ_TICKET_LABELS`: side words, field and reference labels, quote-check messages, the nothing-allowed message, the unparsable-level message (`invalidLevel`, shown by the quote fields), and confirmation text (`anyway`, with an `{action}` placeholder). Action labels and server text come from their own inputs. Limit messages, the step buttons' fixed `up one tick` and `down one tick` name tails, and hotkey descriptions are separate from this prop.

The group and timer are both named `Inquiry Q-1` by default, using `labels.ticket` and the inquiry id. Fields have visible labels and use `aria-invalid` when an error is shown.

### Tokens

The install includes `up`, `down`, and `flat` tokens and their soft variants, `stale` for the confirm line, and `expiring` with `expiring-soft` for the countdown, along with the shared font tokens and the hyperlegible remap. Context tones use `up`, `down`, and `muted-foreground` for `flat`.
