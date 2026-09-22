# limits

Fat-finger checks as data: a size above a line, a level too far from the market, a side the book may not take, each a block or an ask-again, in the shape the tickets already print.

## Usage

```ts
import { checkLimits, type Limits } from "@/lib/limits"
```

```tsx
const limits: Limits = {
  maxQuantity: { confirm: 10_000_000, block: 50_000_000 },
  minQuantity: 1_000_000,
  maxDistance: { ticks: 4 },
  sides: ["buy", "sell"],
}

checkLimits({ side: "buy", quantity: 20_000_000, price: 99.625 }, limits, { market: { bid: 99.5, ask: 99.515625 }, convention })
// [{ field: "quantity", level: "confirm", rule: "maxQuantity", message: "20,000,000 is above 10,000,000. Send it anyway?" },
//  { field: "price", level: "block", rule: "maxDistance", message: "The price is 7 ticks from the market; the limit is 4 ticks." }]

<Ticket {...props} limits={limits} />
<RfqTicket {...props} limits={limits} />
```

## API Reference

### A limits table

`Limits` is data a desk keeps: `maxQuantity` and `minQuantity` as one number, which is a block, or `{ confirm, block }`, a line to ask again past and a line to stop at; `maxDistance` in `{ ticks }` for an instrument quoted on price or `{ bps }` for one quoted on yield, discount, or spread, a block unless `level: "confirm"` says otherwise; `sides`, the sides the book takes; and `custom`, your own rules in the same shape. Nothing here decides a limit; the numbers are the desk's.

### What comes back

`checkLimits(draft, limits, { market, convention, labels })` returns `Problem[]`: each with the `field` it is about (`quantity`, `price`, `bid`, `ask`, or `side`), its `level`, a `message` in sentences, and the `rule` that raised it. Empty when nothing is wrong, and empty for a draft with nothing to check yet, so a blank ticket has no problems until it has a number. `blocks(problems)` and `confirms(problems)` split the two levels; `problemsByField(problems)` is the first message per field, for printing under the fields the way the tickets do.

### Distance from the market

A level is measured against the market's same side: a bid against the bid, an offer against the offer, a buyer's price against the offer and a seller's against the bid, falling back to the mid and then the last when a side is missing, and saying nothing when there is no market at all. The unit follows the instrument's quote basis from [`format`](format.md): ticks for a price, basis points for the rest, so a rule in ticks says nothing about an instrument quoted in yield rather than something wrong. `marketSideFor` and `distanceFromMarket` are the two steps.

### Block and confirm

A `block` stops the action and shows under its field. A `confirm` turns the primary action into a two-step, the blotter's ask-again: the button changes its words, and the second click sends. [`ticket`](ticket.md) and [`rfq-ticket`](rfq-ticket.md) take `limits` and do both, and run the check again as the click lands, against the props as they are then, like their own checks.

### Labels

Every sentence is a template in `labels`, a partial of `DEFAULT_LIMITS_LABELS`: `{n}`, `{max}`, `{min}` for the sizes, `{field}`, `{distance}`, `{max}` for a level, `{side}` for a side, and the words for the two sides and the two units.

### What it does not do

It holds no desk's numbers and calls no server. A limit the server enforces is still the server's; this is the check before the click leaves the screen.
