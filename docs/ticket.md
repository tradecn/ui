# Ticket

Enter an order in the instrument's notation and pass a checked draft to an allowed action.

## Usage

```tsx
import { useState } from "react"
import { Ticket, describeDraft, type TicketInstrument } from "@/components/ticket"

const ZN: TicketInstrument = { symbol: "ZN", convention: { price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 }, quantityStep: 1 }

function OrderEntry() {
  const [submitted, setSubmitted] = useState("No draft submitted.")
  return (
    <div className="w-80 max-w-full space-y-2 text-xs lining-nums tabular-nums">
      <Ticket
        instrument={ZN}
        reference={{ bid: 99.484375, ask: 99.5 }}
        defaultDraft={{ quantity: 5, price: 99.5 }}
        actions={[{ id: "send", label: (draft) => draft.side === "buy" ? "Submit buy" : "Submit sell", run: (draft) => setSubmitted(describeDraft(draft, ZN)) }]}
        allowedActions={["send"]}
      />
      <p role="status" className="text-muted-foreground">{submitted}</p>
    </div>
  )
}
```

Enter quantity and price, choose a side, then submit the draft. This local handler displays the checked draft; it sends no order. Clear the quantity or price to see validation stop a priced submission. Choose Market to submit with a null price instead.

The instrument supplies ZN's fractional notation and tick size. Click Bid or Ask to use that reference; type `99-16+` to enter a half tick. Field arrows step by one tick or quantity unit, and Shift takes ten steps. A `HotkeysProvider` is only needed for the registry shortcuts in the next example.

## Shortcuts and draft changes

The provider enables Ticket's editing shortcuts while focus is inside the ticket. Try mod+3 for the third quick size, mod+up to raise the price, mod+shift+x to flip the side, and mod+enter to submit. Here `mod` means Command on Mac and Ctrl elsewhere; the submit button shows the current binding. Plain Enter in a field submits nothing. The shortcuts run anywhere inside the ticket, its padding and symbol included.

Quick sizes and account choices are ordinary props. The Draft line follows `onDraftChange`; the separate submitted line changes only when the action runs. The initial draft is explicit because `onDraftChange` does not fire on mount. A Last reference supplies a starting price when the field is blank.

<!-- demo: ticket-shortcuts -->

## Server replies

Send order records a request and removes the allowed actions. The controls above the ticket stand in for server replies: acknowledge the order to assign a sample order id and offer Cancel order, or reject it to show a reason and allow a retry. Cancel order sends another request; acknowledge the cancellation to make Send order available again.

Only an order acknowledgement changes the ring token. Rejection, cancellation and Reset server leave it alone. Cancel order uses `checked: false`, so clearing a draft field cannot stop cancellation of an acknowledged order. The submitted draft is captured before any later field edits.

Every state stays visible until you choose the next event. Reset server restores the initial permissions and status without discarding the fields. An integration should replace these controls with responses from its server; Ticket does not infer order state from an action callback.

<!-- demo: ticket-server -->

## API Reference

This is the registry's first block: `ticket.tsx` installs into your `components` alias, not `components/ui`. Its shared files use the same source as `quote-field`, `format`, `flash-cell`, `limits`, and `use-hotkeys`. Editing the installed file is the intended way to change its layout. Everything in `ticket.tsx` is then yours — the markup, the draft state, the handlers and keys, and the exported `checkDraft`, `describeDraft`, `parseQuantity`, and `formatQuickSize` — while the shared files it installs beside it, `quote-field`, `format`, `limits`, `use-flash`, and the hotkey files, keep taking updates from any item that installs them. Take later fixes to `ticket.tsx` itself by hand: read an update with `--diff` before taking it.

### Props

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `instrument` | `TicketInstrument` | Required | Symbol, price convention, and quantity step. |
| `actions` | `readonly TicketAction[]` | Required | Action definitions, in display order. |
| `allowedActions` | `readonly string[]` | None allowed | Server-authorized action ids. |
| `reference` | `TicketReference` | None | Bid, ask, and last for price buttons, stepping, and limits. |
| `orderTypes` | `readonly TicketOption[]` | `DEFAULT_ORDER_TYPES` | Limit and market. |
| `timeInForces` | `readonly TicketOption[]` | `DEFAULT_TIME_IN_FORCES` | Day, GTC, and IOC. |
| `accounts` | `readonly TicketOption[]` | No field | Account choices; an empty list also hides the field. Given, a checked action needs the draft to hold one of them. |
| `defaultDraft` | `Partial<TicketDraft>` | See [The draft](#the-draft) | Initial values. |
| `onDraftChange` | `(draft: TicketDraft) => void` | None | Receives draft updates after mount. |
| `limits` | `Limits` | None | Blocks and confirmation rules. |
| `limitsLabels` | `Partial<LimitsLabels>` | `DEFAULT_LIMITS_LABELS` | The words of the limits' sentences. |
| `quickSizes` | `readonly number[]` | No buttons | Quantities to select with a button or shortcut: whole numbers above zero, each once, and any other is left out. |
| `status` | `string` | None | Server status, printed as supplied and set as `data-status` on the group. |
| `message` | `string` | None | Server detail, such as a rejection reason, printed as supplied. |
| `acknowledged` | `unknown` | None | A changed value triggers the acknowledgement ring. |
| `disabled` | `boolean` | `false` | Disables fields and buttons; stops actions and every ticket shortcut — send, flip, price steps, and quick sizes. |
| `hotkeys` | `boolean` | `true` | Declares `TICKET_BINDINGS` as registry defaults, the size keys for the quick sizes passed. |
| `labels` | `Partial<TicketLabels>` | `DEFAULT_TICKET_LABELS` | Every word the ticket draws or says beside the limits' and the server's: field labels, validation messages, the unpriced placeholder, `at market`, the reference and step buttons' names, and the quick sizes' notional unit. The key caps the send target's button shows come from the hotkeys library. A word given as `undefined` keeps its default. |
| `className` | `string` | None | Classes on the outer group. |

`TicketInstrument` requires `symbol: string` and `convention: InstrumentConvention`; `quantityStep?: number` defaults to `1`, and anything but a whole number from `1` to `Number.MAX_SAFE_INTEGER` steps by `1`. See [`format`](format.md) for conventions. `TicketReference` has optional `bid`, `ask`, and `last` fields, each `number | null`.

`TicketOption` requires `id: string` and `label: string`. Its optional `priced: boolean` defaults to `true` and matters only in `orderTypes`. A type with `priced: false` disables the price field and reference buttons; actions receive `price: null`.

### What it does

The [`quote-field`](quote-field.md) parses through `parseQuote` and formats through `formatQuote`: `99-16+` becomes `99.515625` and prints back in the instrument's notation on blur. A typed decimal snaps to the printable grid when parsed, so the described draft, the limits check, and `run` all receive the grid price the field's text formats to. Invalid text is marked on blur; typing clears the mark. The field's arrows and step buttons use `stepQuote`; Shift multiplies arrow steps by ten.

Reference prices appear above the fields; click one to use it. Blank or invalid prices step from `last`, then the bid/ask midpoint, then whichever side exists, each snapped to the quote grid; a non-finite reference — a feed still warming up — counts as absent. Without a parsed value or reference, stepping does nothing. Reference buttons print with `formatQuote` and store the snapped value they show.

### Actions

| `TicketAction` field | Type | Default | Purpose |
|---|---|---|---|
| `id` | `string` | Required | Matches an id in `allowedActions`. |
| `label` | `string \| ((draft: TicketDraft) => string)` | Required | Button text, optionally derived from the current draft. |
| `run` | `(draft: TicketDraft, instrument: TicketInstrument) => void` | Required | Receives the draft and instrument. |
| `primary` | `boolean` | First allowed action | Styles the prominent button and steers `ticket.send` and its key hint toward this action while it checks the draft and is not `destructive`. |
| `checked` | `boolean` | `true` | Checks the draft and limits before calling `run`. |
| `destructive` | `boolean` | `false` | Draws the action in the destructive color on the outline button, which holds 4.5:1 at rest and turns to the foreground under the pointer. |

The first allowed action marked `primary` wins; otherwise the first allowed action is primary. Checked actions require a whole quantity above zero, a finite price for priced order types, and a type, time in force, and account that their lists hold. Problems appear under the fields and prevent `run`; a price problem clears when the price changes or the order type stops taking one, and a choice's when it changes. Use `checked: false` for an action such as cancel that needs neither draft validation nor limit checks. The send shortcut and its key caps pass by every unchecked or `destructive` action, since a shortcut named send must never cancel an order: when only those remain allowed, `mod+enter` does nothing.

### What it does not do

The ticket makes no network request and infers no order state from `run`. As with [`blotter`](blotter.md), the server supplies the allowed actions and status.

Only actions named in `allowedActions` render, in `actions` order. A missing or empty allowlist shows `labels.nothingAllowed`. Permission and `disabled` are checked again when an action runs. `status` and `message` print as supplied; clicking a button never sets “Sent.” A screen reader hears them from a status region that is in the page from the first render, so the first status after a send is heard too; the line that shows them is hidden from it, so nothing is read twice.

A press counts once: the second click of a double-click, within the system's double-click time and distance, and the clicks a held Enter repeats on a focused button, run nothing. Two separate presses run the action twice unless `run` takes it out of `allowedActions` at once, as the server-replies demo does; do the same, or have your server refuse the repeat.

Change `acknowledged` when the server acknowledges, using an order id or timestamp. After mount, each change under `Object.is` triggers a 900 ms `useFlash` ring in `primary`, with no direction, a counter's rise included. The initial value does not flash. When the control under focus leaves — a sent action's button unmounts or disables, with or without an acknowledgement, a window switch in between included — focus moves to the ticket itself, so the shortcuts stay live. A deliberate click elsewhere is remembered as leaving, and a re-keyed ticket starts fresh, owning no focus until the trader returns to it. Under `prefers-reduced-motion`, the ticket does not ring.

### Keys

| Key | Binding | Effect |
|---|---|---|
| `mod+enter` | `ticket.send` | Runs the first allowed action that checks the draft and is not `destructive`, preferring the primary one; does nothing when no such action is allowed. |
| `mod+shift+x` | `ticket.flip` | Swaps buy and sell. |
| `mod+up` / `mod+down` | `ticket.tick-up` / `ticket.tick-down` | Steps the price by the quote step from anywhere in the ticket, as the field's own arrows do. |
| `mod+1` … `mod+9` | `ticket.size-1` … `ticket.size-9` | Selects the corresponding quick size, if present. |
| Up / Down | Field behavior | Steps the focused price or quantity field. |
| Shift+Up / Shift+Down | Field behavior | Takes ten field steps. |

`mod` is Command on Mac and Ctrl elsewhere. Registry shortcuts need a [`HotkeysProvider`](use-hotkeys.md). The ticket declares `TICKET_BINDINGS` as registry defaults: your registration of an id shadows the ticket's default whenever it comes, unregistering yours brings the default back, and the defaults leave when no ticket with `hotkeys` enabled remains. `unregister("ticket.send")` does nothing while a ticket holds the default — register your own binding to change keys or wording, and `remap(id, "")` turns a key off as a user override the hotkey editor shows and Reset undoes. The send target's button shows the registry's current send keys.

`hotkeys={false}` skips declarations but still attaches handlers for bindings you supply. Each ticket has its own `HotkeyScope` and handlers, so shortcuts work while typing inside that ticket. They also work inside a dialog; global keys cannot reach a blotter behind it.

Price-step shortcuts do not check whether the order type is priced. They step by the instrument's quote step, exactly as the field's own arrows do, so the stored price never differs from the price the field shows. A disabled ticket runs no shortcuts at all, though its keys are still consumed. `mod+1` through `mod+9` declare only for the quick sizes you pass. While nobody declares an absent size's id, its keys pass through untouched; once the id is declared — by you, or by another ticket with more sizes on the shared registry — the registry consumes the key wherever the fence reaches, and a ticket without that size does nothing with it. An id you declare in the `editing` scope always meets the ticket's fence; keep ticket ids there, since a declaration in another scope dispatches unfenced.

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

`defaultDraft` applies on mount, and so does everything else the draft reads: the whole draft is built once, from the props of the first render. Changing `instrument`, `orderTypes`, `timeInForces`, `accounts`, or `defaultDraft` later never rewrites it: a new instrument under an old draft keeps the old price and its text, so change the React `key` whenever the ticket should start again, as for a new symbol or an amendment. A select whose list doesn't hold the draft's value, as when accounts load after mount or a list reloads without it, shows `labels.choose`, and a checked action asks for a choice rather than send a value the field doesn't show. A `defaultDraft` price snaps to the quote grid, as a reference click does, so the price sent is the one the field shows, and a `defaultDraft` quantity that isn't a whole number from zero up starts the field blank, holding `null`. `onDraftChange` receives draft updates, never the initial render. It retains the stored price for unpriced order types; only the draft passed to `run` replaces that price with `null`.

Typed quantities accept nonnegative safe integers, with commas only between thousands (`5,000`). Blank, negative, fractional, or invalid input becomes `null`, and so does any other comma, as in `2,5` typed on a decimal-comma keyboard. Text partway through a grouped number, such as `1,` or `,000` after deleting the first digit of `5,000`, reads as `null` until it is whole again. Quantity arrows add or subtract `quantityStep`, round to its nearest multiple, and clamp at zero. An empty field starts from zero.

| Helper | Result |
|---|---|
| `parseQuantity(text)` | Parsed quantity or `null`. |
| `checkDraft(draft, orderTypes, labels?, choices?)` | `TicketProblems`: optional `quantity`, `price`, `type`, `tif`, and `account` messages, or `{}`. `choices` takes `timeInForces` and `accounts`; an empty or missing list asks for nothing. Uses `DEFAULT_TICKET_LABELS`; does not check limits. |
| `describeDraft(draft, instrument, orderTypes?, labels?)` | Summary such as `Buy 5 ZN @ 99-16+` or `Buy 5 ZN at market`. Defaults to `DEFAULT_ORDER_TYPES` and the default `buy`, `sell`, and `atMarket` labels; the level prints with `formatQuote`, in the instrument's quote basis. |

Use these helpers in a confirmation dialog, palette row, or test.

### Limits

Pass a [`limits`](limits.md) table for quantity thresholds, distance from market, permitted sides, or custom rules. Checks run live and again when an action runs, using `reference` as the market. A buyer's price is measured against the offer, a seller's against the bid, falling back to `last` when that side is missing, since the reference carries no midpoint. Distance uses ticks for a price basis and basis points for other quote bases. The sentences take their words from `limitsLabels`, over `DEFAULT_LIMITS_LABELS`, and say one tick in the singular.

- A `block` appears under its quantity or price field and holds checked actions: each looks disabled, carries `aria-disabled`, and stays focusable, and a press on it is refused. Other fields, including side, appear below the actions. An action with `checked: false` can still run.
- A `confirm` makes the chosen checked action ask again: its label becomes `{action} anyway?`, and reasons appear below the actions. A reason added while the question stands makes the next press ask again, with every reason, rather than send. A question whose action the server takes away is withdrawn, so if the action comes back, the next press asks again. The next fresh press of that same action runs it if checks still pass: a double-click's second click or a held Enter's repeat does not count. Any draft update clears the confirmation; changes to the market or limits alone do not.
- A screen reader hears the limits when a press meets them, from one polite announcer: the blocks the press was refused for, or the question it asked, in the words they have as it lands. A held action stays in reach, so a press from a pointer, a key, touch, or assistive technology counts. Nothing is said as typing or the market changes the limits; the fields and the line below the actions keep the live words. A field shows a limit's block without an alert or a description, since its words follow each keystroke and, for a price, the market. A press's own problem with a field, such as a missing price, is the field's alert and its description, and a later press that meets it again is said by the announcer, since the alert's words haven't changed. What was said goes once the draft changes or any of it stops standing, and a block that comes back waits for the next press.

### Quick sizes

`quickSizes` renders your sizes below the quantity field; selecting one replaces the quantity. The matching size has `aria-pressed="true"`. `formatQuickSize(size, convention, millions?)` is exported: it prints a count, or millions such as `2.5mm` when `quantityUnit` is `"notional"`, with `millions` as the unit. Supply raw quantities such as `2_500_000`, not `2.5`; a size that isn't a whole number above zero is left out, and a repeated one shows once. The ticket adds no sizes of its own; the first nine have [shortcuts](#keys).

### Labels

`labels` overrides `DEFAULT_TICKET_LABELS`. Option labels, action labels, and server text come from their own props; custom limit messages come from limit rules. The group is named `"Order ticket ZN"` by default, side buttons use `aria-pressed`, and invalid fields use `aria-invalid` with a `FieldError` below them. Focus resting on the ticket itself draws a ring in the foreground at 60%, which holds 3:1.

### Tokens

The install adds `up`, `down`, and `flat` with their `-soft` variants, and `stale`, if absent, with the shared font tokens and the hyperlegible remap. Side buttons use `up` and `down`; the acknowledgement ring uses `primary`.
