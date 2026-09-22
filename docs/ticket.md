# Ticket

Enter an order in the instrument's notation and pass a checked draft to an allowed action.

## Usage

```tsx
import { Ticket, type TicketInstrument } from "@/components/ticket"
```

```tsx
const ZN: TicketInstrument = { symbol: "ZN", convention: { price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 }, quantityStep: 1 }

<Ticket
  instrument={ZN}
  reference={{ bid: quote.bid, ask: quote.ask, last: quote.last }}
  actions={[{ id: "send", label: (d) => (d.side === "buy" ? "Buy" : "Sell"), run: (draft) => oms.send(draft), primary: true }]}
  allowedActions={ticket.allowedActions}
  status={ticket.status}
  message={ticket.message}
  acknowledged={ticket.orderId}
/>
```

## API Reference

This is the registry's first block: `ticket.tsx` installs into your `components` alias, not `components/ui`. Its shared files use the same source as `quote-field`, `format`, `flash-cell`, and `use-hotkeys`.

### Props

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `instrument` | `TicketInstrument` | Required | Symbol, price convention, and quantity step. |
| `actions` | `readonly TicketAction[]` | Required | Action definitions, in display order. |
| `allowedActions` | `readonly string[]` | None allowed | Server-authorized action ids. |
| `reference` | `TicketReference` | None | Bid, ask, and last for price buttons, stepping, and limits. |
| `orderTypes` | `readonly TicketOption[]` | `DEFAULT_ORDER_TYPES` | Limit and market. |
| `timeInForces` | `readonly TicketOption[]` | `DEFAULT_TIME_IN_FORCES` | Day, GTC, and IOC. |
| `accounts` | `readonly TicketOption[]` | No field | Account choices; an empty list also hides the field. |
| `defaultDraft` | `Partial<TicketDraft>` | See [The draft](#the-draft) | Initial values. |
| `onDraftChange` | `(draft: TicketDraft) => void` | None | Receives draft updates after mount. |
| `limits` | `Limits` | None | Blocks and confirmation rules. |
| `quickSizes` | `readonly number[]` | No buttons | Quantities to select with a button or shortcut. |
| `status` | `string` | None | Server status, printed as supplied. |
| `message` | `string` | None | Server detail, such as a rejection reason. |
| `acknowledged` | `unknown` | None | A changed value triggers the acknowledgement ring. |
| `disabled` | `boolean` | `false` | Disables fields and buttons; stops actions and quick-size shortcuts. |
| `hotkeys` | `boolean` | `true` | Declares missing bindings in the nearest hotkey registry. |
| `labels` | `Partial<TicketLabels>` | `DEFAULT_TICKET_LABELS` | Built-in labels and validation messages. |
| `className` | `string` | None | Classes on the outer group. |

`TicketInstrument` requires `symbol: string` and `convention: InstrumentConvention`; `quantityStep?: number` defaults to `1`. See [`format`](format.md) for conventions. `TicketReference` has optional `bid`, `ask`, and `last` fields, each `number | null`.

`TicketOption` requires `id: string` and `label: string`. Its optional `priced: boolean` defaults to `true` and matters only in `orderTypes`. A type with `priced: false` disables the price field and reference buttons; actions receive `price: null`.

### What it does

The [`quote-field`](quote-field.md) parses through `parseQuote` and formats through `formatQuote`: `99-16+` becomes `99.515625` and prints back in the instrument's notation on blur. Invalid text is marked on blur; typing clears the mark. The field's arrows and step buttons use `stepQuote`; Shift multiplies arrow steps by ten.

Reference prices appear above the fields; click one to use it. Blank or invalid prices step from `last`, then the bid/ask midpoint snapped to `convention.tick`, then whichever side exists. Without a parsed value or reference, stepping does nothing. Reference buttons format with `formatPrice`; see [Keys](#keys) for the modifier shortcuts' step.

### Actions

| `TicketAction` field | Type | Default | Purpose |
|---|---|---|---|
| `id` | `string` | Required | Matches an id in `allowedActions`. |
| `label` | `string \| ((draft: TicketDraft) => string)` | Required | Button text, optionally derived from the current draft. |
| `run` | `(draft: TicketDraft, instrument: TicketInstrument) => void` | Required | Receives the draft and instrument. |
| `primary` | `boolean` | First allowed action | Selects the action for `ticket.send` and its key hint. |
| `checked` | `boolean` | `true` | Checks the draft and limits before calling `run`. |
| `destructive` | `boolean` | `false` | Uses the destructive button variant. |

The first allowed action marked `primary` wins; otherwise the first allowed action is primary. Checked actions require a quantity above zero and a non-null price for priced order types. Problems appear under the fields and prevent `run`. Use `checked: false` for an action such as cancel that needs neither draft validation nor limit checks.

### What it does not do

The ticket makes no network request and infers no order state from `run`. As with [`blotter`](blotter.md), the server supplies the allowed actions and status.

Only actions named in `allowedActions` render, in `actions` order. A missing or empty allowlist shows `labels.nothingAllowed`. Permission and `disabled` are checked again when an action runs. `status` and `message` print as supplied; clicking a button never sets “Sent.”

Change `acknowledged` when the server acknowledges, using an order id or timestamp. After mount, each change under `Object.is` triggers a 900 ms `useFlash` ring in `primary`, without direction coloring. The initial value does not flash. Under `prefers-reduced-motion`, the ticket does not ring.

### Keys

| Key | Binding | Effect |
|---|---|---|
| `mod+enter` | `ticket.send` | Runs the primary allowed action, including its checks. |
| `mod+shift+x` | `ticket.flip` | Swaps buy and sell. |
| `mod+up` / `mod+down` | `ticket.tick-up` / `ticket.tick-down` | Steps the price by `convention.tick` from any field. |
| `mod+1` … `mod+9` | `ticket.size-1` … `ticket.size-9` | Selects the corresponding quick size, if present. |
| Up / Down | Field behavior | Steps the focused price or quantity field. |
| Shift+Up / Shift+Down | Field behavior | Takes ten field steps. |

`mod` is Command on Mac and Ctrl elsewhere. Registry shortcuts need a [`HotkeysProvider`](use-hotkeys.md). The ticket declares missing `TICKET_BINDINGS` as `editing` bindings and removes its shared declarations when no ticket with `hotkeys` enabled uses them. Declare your own bindings or remap them to change keys or wording. The primary button shows the registry's current send keys.

`hotkeys={false}` skips declarations but still attaches handlers for bindings you supply. Each ticket has its own `HotkeyScope` and handlers, so shortcuts work while typing inside that ticket. They also work inside a dialog; global keys cannot reach a blotter behind it.

The flip and price-step shortcuts do not check `disabled`, and price-step shortcuts do not check whether the order type is priced. Those shortcuts use `convention.tick`, even when the quote field uses another quote basis or step.

Plain Enter in a field does not submit an order. The ticket has no `<form>` or implicit submit.

### The draft

| `TicketDraft` field | Type | Initial value before `defaultDraft` overrides |
|---|---|---|
| `side` | `"buy" \| "sell"` | `"buy"` |
| `quantity` | `number \| null` | `null` |
| `price` | `number \| null` | `null` |
| `type` | `string` | First order-type id, or `""`. |
| `tif` | `string` | First time-in-force id, or `""`. |
| `account` | `string \| null` | First account id, or `null`. |

`defaultDraft` applies on mount. Change the React `key` to start again, such as when opening an order for amendment. `onDraftChange` receives draft updates, never the initial render. It retains the stored price for unpriced order types; only the draft passed to `run` replaces that price with `null`.

Typed quantities accept nonnegative safe integers, with optional commas. Blank, negative, fractional, or invalid input becomes `null`. Quantity arrows add or subtract `quantityStep`, round to its nearest multiple, and clamp at zero. An empty field starts from zero.

| Helper | Result |
|---|---|
| `parseQuantity(text)` | Parsed quantity or `null`. |
| `checkDraft(draft, orderTypes, labels?)` | `TicketProblems`: optional `quantity` and `price` messages, or `{}`. Uses `DEFAULT_TICKET_LABELS`; does not check limits. |
| `describeDraft(draft, instrument, orderTypes?, labels?)` | Summary such as `Buy 5 ZN @ 99-16+` or `Buy 5 ZN at market`. Defaults to `DEFAULT_ORDER_TYPES` and the default buy/sell labels; prices use `formatPrice`. |

Use these helpers in a confirmation dialog, palette row, or test.

### Limits

Pass a [`limits`](limits.md) table for quantity thresholds, distance from market, permitted sides, or custom rules. Checks run live and again when an action runs, using `reference` as the market. A buyer's price is measured against the offer, a seller's against the bid, falling back to the midpoint and then last. Distance uses ticks for a price basis and basis points for other quote bases.

- A `block` appears under its quantity or price field and disables checked actions. Other fields, including side, appear below the actions. An action with `checked: false` can still run.
- A `confirm` makes the chosen checked action ask again: its label becomes `{action} anyway?`, and reasons appear below the actions. The next activation of that same action runs it if checks still pass. Any draft update clears the confirmation; changes to the market or limits alone do not.

### Quick sizes

`quickSizes` renders your sizes below the quantity field; selecting one replaces the quantity. The matching size has `aria-pressed="true"`. `formatQuickSize(size, convention)` is exported: it prints a count, or millions such as `2.5mm` when `quantityUnit` is `"notional"`. Supply raw quantities such as `2_500_000`, not `2.5`. The ticket adds no sizes of its own; the first nine have [shortcuts](#keys).

### Labels

`labels` overrides `DEFAULT_TICKET_LABELS`. Option labels, action labels, and server text come from their own props; custom limit messages come from limit rules. The group is named `"Order ticket ZN"` by default, side buttons use `aria-pressed`, and invalid fields use `aria-invalid` with a `FieldError` below them.

### Tokens

The install adds `up`, `down`, and their `-soft` variants if absent. Side buttons use `up` and `down`; the acknowledgement ring uses `primary`.
