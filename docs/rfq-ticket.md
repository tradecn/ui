# rfq-ticket

A client inquiry with market and quoted levels, a countdown, and quote fields in the instrument's notation. The server supplies the status and allowed actions.

## Usage

```tsx
import { RfqTicket, type RfqAction, type RfqInquiry } from "@/components/rfq-ticket"
```

```tsx
const ACTIONS: RfqAction[] = [
  { id: "quote", label: "Quote", run: (draft, inquiry) => api.quote(inquiry.id, draft), primary: true },
  { id: "quote-auto", label: "Quote auto", needsQuote: false, run: (_, inquiry) => api.quoteAuto(inquiry.id) },
  { id: "stop-auto", label: "Stop auto", needsQuote: false, run: (_, inquiry) => api.stopAuto(inquiry.id) },
  { id: "pass", label: "Pass", needsQuote: false, destructive: true, run: (_, inquiry) => api.pass(inquiry.id) },
]

<RfqTicket key={active.id} inquiry={active} actions={ACTIONS} acknowledged={active.quoteId} />
```

`active` is your `RfqInquiry` with a server quote id added for acknowledgement. Keep `key={active.id}` so each inquiry gets its own draft. Add a [`HotkeysProvider`](use-hotkeys.md) around the ticket to enable shortcuts.

## API Reference

This block installs `rfq-ticket.tsx` in your `components` alias. It shares source files with `quote-field`, `countdown`, `format`, `flash-cell`, and `use-hotkeys` at a given registry version. Locally edited or older installed files may differ.

### Props

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `inquiry` | `RfqInquiry` | Required | Server data for this ticket. |
| `actions` | `readonly RfqAction[]` | Required | Available action definitions, in display order. |
| `defaultDraft` | `Partial<RfqLevels>` | Both levels `null` | Initial bid and ask; read only on mount. |
| `onDraftChange` | `(draft: RfqQuoteDraft) => void` | None | Reports the current draft after a change. |
| `acknowledged` | `unknown` | `undefined` | Change this value when the server acknowledges a quote. |
| `autoFocus` | `boolean` | `false` | Requests focus on the first quote field on mount. |
| `disabled` | `boolean` | `false` | Disables fields and buttons and blocks action execution; see Keys for draft shortcuts. |
| `hotkeys` | `boolean` | `true` | Declares missing bindings in the hotkey registry. |
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
| `context` | `readonly RfqContextItem[]` | None | Preformatted `label` and `value` strings, with optional `tone: "up" \| "down" \| "flat"`. |
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

Each [`quote-field`](quote-field.md) parses and steps in the instrument's convention: `99-16+` for a fractional note price or `4.253` for a bill on discount. Arrows and step buttons use the convention's step. A blank field starts from the market's same side, then the suggested same side, then the other market side, then `market.mid`. With no starting level, stepping does nothing.

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
| `checkQuote(draft, inquiry, labels?)` | `RfqQuoteProblems`: optional `bid` and `ask` messages for required `null` levels or a bid above the ask. |
| `describeQuote(draft, inquiry, labels?)` | Text such as `Offer 5mm T 4 1/8 05/15/34 @ 99-16+`; uses `draft.quantity ?? inquiry.quantity`. |

The last two helpers default to `DEFAULT_RFQ_TICKET_LABELS` and accept a full `RfqTicketLabels` object. `checkQuote` does not check limits, quantity, or finiteness; it rejects crossed levels whenever both are non-null, including an unused side supplied through `defaultDraft`.

### The actions are the server's

| `RfqAction` field | Type | Required / default | Purpose |
|---|---|---|---|
| `id` | `string` | Required | Matches an `allowedActions` id. |
| `label` | `string \| ((draft: RfqQuoteDraft) => string)` | Required | Button text, optionally derived from the draft. |
| `run` | `(draft: RfqQuoteDraft, inquiry: RfqInquiry) => void` | Required | Executes the action with the current draft and inquiry. |
| `needsQuote` | `boolean` | `true` | Requires quote and limit checks. |
| `destructive` | `boolean` | `false` | Uses the destructive button style. |
| `primary` | `boolean` | Automatic | Selects the action for `rfq.send`; uses primary styling unless destructive. |

Only matching actions render, in your `actions` order. No matches produces the nothing-allowed message. The primary action is the first allowed action marked `primary`, otherwise the first that needs a quote, otherwise the first allowed action.

On execution, the ticket rechecks `disabled`, permission, and any required quote and limit checks against current props. Quote errors appear under their fields. Set `needsQuote: false` for pass, stop, or server-priced actions; these receive the current draft without quote or limit validation.

Fields, size buttons, and the suggestion button are disabled unless an allowed action needs a quote and `disabled` is false. Removing allowed actions preserves the displayed draft. `status` alone does not disable anything, and countdown expiry does not remove actions.

Changing `acknowledged` triggers the `primary` ring flash; the first render and equal values do not. Changes use `Object.is` equality. The flash follows [`useFlash`](flash-cell.md) motion behavior and never changes the inquiry's status.

### Arrival never moves anything

The parent chooses the active inquiry and owns focus. Key the ticket by inquiry id: reusing a mounted ticket for another inquiry retains the old draft, including its `inquiryId` and quantity. `autoFocus` acts only on mount and cannot focus a disabled field.

The [`countdown`](countdown.md) uses `receivedAt` to `expiresAt` for its bar, falling back to first render when `receivedAt` is omitted. It announces the label and time left on tier changes, including the provisional last-10-seconds threshold and expiry. Your app decides whether the inquiry has ended from venue status.

### Keys

Inside a `HotkeysProvider`, the ticket declares these `editing` bindings when their ids are missing:

| Binding | Default key | Action |
|---|---|---|
| `rfq.send` | `mod+enter` | Runs the primary action. |
| `rfq.tick-up`, `rfq.tick-down` | `mod+up`, `mod+down` | Steps the focused quote field, or the first field. |
| `rfq.suggested` | `mod+shift+a` | Copies suggested levels. |
| `rfq.size-1` … `rfq.size-9` | `mod+1` … `mod+9` | Selects an entry from `quickSizes`, in supplied order. |

`mod` is Command on Mac and Control elsewhere. `QUICK_SIZE_KEYS` exports the nine size shortcuts. Spread `RFQ_TICKET_BINDINGS` into your own registry list to change keys or descriptions. Tickets share declarations; the last declaring ticket's unmount removes only ticket-owned bindings. Handlers are scoped to each ticket's inner box, and dialog boundaries keep outside handlers from running.

`hotkeys={false}` skips declarations but still binds handlers for ids already in the registry. Without a provider, there are no shortcuts or key hints. Plain Enter sends nothing; the ticket has no form.

Draft shortcuts have narrower guards than the controls: step and suggestion shortcuts can change the draft while fields are disabled. Quick-size shortcuts check `disabled` but do not check allowed actions. Sending still checks both. Use registry binding conditions to suppress draft shortcuts when needed.

### Limits

The [`limits`](limits.md) check receives only requested bid and ask levels, plus the inquiry's market and convention. It receives no quantity, so `maxQuantity` and `minQuantity` do not constrain RFQ quick sizes. Custom rules receive that same limited draft.

`maxDistance` compares each level with the market's same side, falling back to `market.mid` when that side is absent. Use ticks for price and basis points for other quote bases. The current limit calculation multiplies all non-price differences by 100, including spreads; this differs from the spread distance shown below the field. `sides` checks the dealer's side: a bid is a buy and an offer is a sell.

A block shows under its field, or below the actions for other fields, and disables actions that need a quote. A confirm applies to any action that needs a quote: its button becomes `Quote anyway?` (using that action's label), the reason appears below, and the next activation of the same action sends if checks pass. Editing a level or choosing a size clears the confirmation. Both checks run live and again on execution; `needsQuote: false` actions bypass them.

### Quick sizes

`quickSizes={[1_000_000, 2_000_000]}` adds `For 5mm 1mm 2mm` beneath a 5mm inquiry's fields. The inquiry's size comes first; matching entries are removed from the displayed alternatives. Shortcuts still index your original array. Sizes use the convention's unit, and the selected button has `aria-pressed="true"`.

Choosing a size changes the draft's `quantity`. Supply sizes the venue accepts; the ticket does not restrict them to less than the inquiry's size. An absent or empty array hides the row. Removing it later retains the selected draft quantity.

### Labels

`labels` overrides entries in `DEFAULT_RFQ_TICKET_LABELS`: side words, field and reference labels, quote-check messages, the nothing-allowed message, and confirmation text (`anyway`, with an `{action}` placeholder). Action labels and server text come from their own inputs. Limit messages, quote-field internal wording, and hotkey descriptions are separate from this prop.

The group and timer are both named `Inquiry Q-1` by default, using `labels.ticket` and the inquiry id. Fields have visible labels and use `aria-invalid` when an error is shown.

### Tokens

The install includes `up`, `down`, and `flat` tokens and their soft variants, plus `expiring` and `expiring-soft` for the countdown. Context tones use `up`, `down`, and `muted-foreground` for `flat`.
