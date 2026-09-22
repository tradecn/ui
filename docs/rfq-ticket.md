# rfq-ticket

A dealer's ticket for a request for quote: the inquiry as it came, the market beside it, a countdown to its end, the fields to type a level in the instrument's basis, and the actions the server allows.

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

## API Reference

This is a block: `rfq-ticket.tsx` lands in your `components` alias, not `components/ui`. If you already installed `quote-field`, `countdown`, `format`, `flash-cell`, or `use-hotkeys`, the shared files are byte-identical and nothing of yours changes.

### The inquiry

An `RfqInquiry` is what the venue sent and what the server knows about it, and the ticket draws it as given. The headline is who, which way, how much, and in what: `Client A buys 5mm T 4 1/8 05/15/34`. The size prints as millions of notional, or as a count when the convention's `quantityUnit` is `contracts`. Under it, the client's tier and the venue's `tags` as badges (the protocol, how many dealers are in competition, a list), the client's trader and the salesperson, and the settlement. `context` is a row of labels and values the server formatted, a book, a position, a risk number, each with an optional tone; the ticket prints the strings and colors nothing it did not receive. `market` is the reference beside the quote, `quoted` the levels the server holds as this desk's live quote, `suggested` the levels an auto-quoter proposes. `status` is the venue's word, printed in a badge and on the root as `data-status`; `message` is the server's second line under the actions.

The client's `side` decides the fields: a client who buys gets one `Offer`, one who sells gets one `Bid`, and `two-way` asks for a market and gets both. `quotedSides(side)` is that rule as a function.

### The quote

Each field is a [`quote-field`](quote-field.md) in the instrument's convention, so a note takes `99-16+` and a bill on discount takes `4.253`, and each steps by the instrument's own step with the arrows and its buttons. A blank field steps from the market's same side, then the suggested level, then the market's mid. Under each field the ticket says how far the typed level sits from the market's same side, in ticks for a price and basis points otherwise, `+1 vs market`; `quoteDistance(level, market, convention)` is that measure as a pure function. When the server suggests levels, one button and one key fill the fields with them; the ticket never sends them on its own.

`onDraftChange` fires with the `RfqQuoteDraft` (the inquiry id, a bid, an offer, and the size the quote is for) after each change and not on the first render. `defaultDraft` is where the fields start. `checkQuote` and `describeQuote` are exported for a confirmation, a palette row, or a test: the check wants a level on every side the client asked for and refuses a market whose bid is above its offer.

### The actions are the server's

You declare `actions` with ids; the ticket renders the ones whose id is in the inquiry's `allowedActions`, in your order, and none when the list is empty or missing, with a line saying so. An action that `needsQuote` (the default) runs the check first and says what is wrong under the field; a pass, a stop, or a quote the server prices itself sets `needsQuote: false` and goes with the fields as they are. The check is made again as the click lands, against the props as they are then. The fields are live only while some allowed action would send what is in them, so a ticket that may only pass, or may do nothing, is read-only, and a closed inquiry keeps its levels on screen and loses its buttons. `acknowledged` is anything that changes identity when the server takes a quote, and the ticket rings once in `primary`; it never sets a status for itself.

### Arrival never moves anything

A ticket is one inquiry. Mount it with `key={inquiry.id}`, and a new inquiry never lands in a ticket someone is working: the parent decides which inquiry is active, the ticket draws the one it was given, and the draft belongs to that inquiry alone. Focus is the parent's too. `autoFocus` puts the keyboard in the first field on mount when you ask; by default the ticket takes nothing, so a stack that makes the next inquiry active can decide whether the hand is mid-motion. The [`countdown`](countdown.md) in the corner runs from `receivedAt` to `expiresAt` and speaks the label and the time left as the last seconds begin; whether the inquiry is over is the venue's word in `status`, not the digits.

### Keys

Four `editing` bindings, declared by the ticket when you have not: `rfq.send` on `mod+enter` runs the primary action (the one marked `primary`, else the first allowed action that needs a quote, else the first allowed), `rfq.tick-up` and `rfq.tick-down` on `mod+up` and `mod+down` step the field the keyboard is in, or the first one, and `rfq.suggested` on `mod+shift+a` takes the suggested levels. Several tickets share one declaration and the last one to leave takes it back; handlers are bound to each ticket's own box, so two tickets side by side each answer for themselves, and a dialog is a wall the keys stay inside. Spread `RFQ_TICKET_BINDINGS` into your own list to change the keys or the wording. Plain Enter sends nothing; there is no `<form>`.

### Limits

`limits` is a [`limits`](limits.md) table, the desk's lines as data. Each level is measured against the inquiry's market on its own side, a bid against the bid and an offer against the offer, in ticks for an instrument quoted on price and basis points for the rest; `sides` names what the book may take, and for a quote a bid is a buy and an offer a sell. A block shows under its field as the ticket's own problems do and holds every action that needs a quote; a pass still runs. A confirm turns the primary action into a two-step: the button says `Quote anyway?`, the reason is said under the actions, and the next click on the same action sends; a new level withdraws the question. Both run live and again as the click lands.

### Quick sizes

A dealer may quote for less than the client asked, where the venue takes it. `quickSizes` puts a row under the fields, `For 5mm 1mm 2mm`, the inquiry's own size first and then yours, printed in the convention's unit; a press makes the quote for that size and the draft carries it as `quantity`, which `describeQuote` reads. `mod+1` to `mod+9` pick yours in order, as `rfq.size-1` to `rfq.size-9` in `RFQ_TICKET_BINDINGS`, declared beside the four above. Without `quickSizes` the draft's `quantity` is the inquiry's, and nothing is drawn.

### Labels

Every word on the ticket is in `labels`, a partial of `DEFAULT_RFQ_TICKET_LABELS`: the side words, `Bid` and `Offer`, `Market`, `Quoted`, `Auto`, the check's sentences, and the line for an inquiry that allows nothing. The group is named `Inquiry Q-1` for a screen reader, and so is its timer.

### Tokens

The install adds the `up`, `down`, and `flat` tokens for the context tones and the `expiring` pair for the countdown's last seconds, if you do not have them.
