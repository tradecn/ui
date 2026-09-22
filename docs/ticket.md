# ticket

An order ticket that types a price the way the instrument quotes it and hands a checked draft to the action you named.

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

This is the registry's first block: `ticket.tsx` lands in your `components` alias, not `components/ui`. If you already installed `quote-field`, `format`, `flash-cell`, or `use-hotkeys`, the shared files are byte-identical and nothing of yours changes.

### What it does

It takes a side, a quantity, a price, an order type, a time in force, and an account when you give it accounts. The price field is a [`quote-field`](quote-field.md), so it speaks the instrument's notation: `99-16+` parses through `parseQuote`, prints back through `formatQuote`, and steps by `stepQuote` with the arrows and the two buttons beside it, ten ticks with Shift held. The quantity steps by `quantityStep`. A bid, ask, or last you pass shows above the fields, and a click on one takes it as the price. When the field is blank the arrows start from `last`, then the mid, then whichever side there is.

When an action runs, the draft is checked first: a quantity above zero, and a price when the order type takes one. What is wrong is said under the field, and nothing is sent. What passes goes to your `run` as a `TicketDraft`, with `price` null for a type that takes none. `checkDraft` and `describeDraft` are exported for a confirmation dialog, a palette row, or a test.

### What it does not do

It does not send anything, and it does not decide anything about the order after your `run` returns. Three things are the server's, and this item holds the line on them the same way [`blotter`](blotter.md) does:

- **The buttons are the actions the server allowed.** You declare `actions` with ids; the ticket renders the ones whose id is in `allowedActions`, in your order, and none when the list is empty or missing, with a line saying so. A closed market, an account without permission, an order that can no longer be amended: the server says, and the ticket shows what it said. The check is made again as the click lands, against the props as they are then.
- **The status is the server's word.** `status` is a string and the ticket prints it as it arrives. It never sets "Sent" for itself when a button is pressed, because the server may reject, hold, or lose the order, and a screen that is ahead of it is a screen that is sometimes wrong about money. `message` is the server's second line, a rejection reason for one, printed the same way.
- **The acknowledgement is the server's too.** Pass anything that changes identity when the server acknowledges, an order id or a timestamp, as `acknowledged`, and the ticket rings once in `primary`. It is `useFlash` in its ring variant with a color instead of a direction, because an acknowledgement has none. Under `prefers-reduced-motion` it does not ring.

### Keys

Four `editing` bindings, so they work while you type in the ticket and nowhere else: `ticket.send` on `mod+enter` runs the primary action (the one marked `primary`, or the first allowed), `ticket.flip` on `mod+shift+x` swaps buy and sell, and `ticket.tick-up` and `ticket.tick-down` on `mod+up` and `mod+down` step the price from any field. Inside a `HotkeysProvider` the ticket declares them when you have not; several tickets share one declaration and the last one to leave takes it back. Spread `TICKET_BINDINGS` into your own list to change the keys or the wording, or remap them like any binding. The primary button shows the send keys from the registry, so a remap shows.

The ticket is a `HotkeyScope` of its own, and its handlers are bound to its box, so two tickets side by side each answer for themselves. A dialog is a wall, and a ticket inside one keeps its keys because its scope is inside the wall: `mod+enter` sends, and a global `x` cannot reach a blotter behind it.

Plain Enter does nothing. There is no `<form>` here on purpose: an implicit submit on Enter in a price field would send an order while someone was still typing it.

### The draft

`defaultDraft` is where the ticket starts, and a new `key` starts it again, which is how an amend ticket takes an order's values. `onDraftChange` fires on every change and not on the first render. Quantities are whole numbers; `parseQuantity` reads them with or without thousands separators.

`orderTypes` and `timeInForces` are lists of `{ id, label, priced? }`, defaulting to limit and market, and day, GTC, and IOC. A type with `priced: false` disables the price field and sends `price: null`. `accounts` is the same shape; leave it out and there is no account field.

### Limits

`limits` is a [`limits`](limits.md) table, the desk's lines as data: a size to ask again past and a size to stop at, a distance from the market in ticks, the sides the book takes, and rules of your own. A block shows under its field as the ticket's own problems do, and holds every action that sends the draft (an action with `checked: false`, a cancel, still runs). A confirm turns the primary action into a two-step: the button says `Send anyway?`, the reason is said under the actions, and the next click on the same action sends; any change to the draft withdraws the question. Both run live and again as the click lands, against `reference` as the market: a buyer's price is measured against the offer, a seller's against the bid. A side with no field of its own is said on the same line under the actions.

### Labels

Every word on the ticket is in `labels`, a partial of `DEFAULT_TICKET_LABELS`. The group is named `"Order ticket ZN"` for a screen reader; the side buttons carry `aria-pressed`; the errors are `FieldError`s tied to their fields.

### Tokens

The install adds the `up` and `down` tokens and their `-soft` variants if you do not have them; the side buttons and the acknowledgement draw from them and from `primary`.
