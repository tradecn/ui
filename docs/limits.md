# limits

Check a draft against quantity, market-distance, and side limits. Each problem either blocks an action or asks for confirmation; the desk supplies the limits.

## Usage

```ts
import { checkLimits, type Limits } from "@/lib/limits"
import type { InstrumentConvention } from "@/lib/format"

const convention: InstrumentConvention = { price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 }
const limits: Limits = {
  maxQuantity: { confirm: 10_000_000, block: 50_000_000 },
  minQuantity: 1_000_000,
  maxDistance: { ticks: 4 },
  sides: ["buy", "sell"],
}

checkLimits({ side: "buy", quantity: 20_000_000, price: 99.625 }, limits, { market: { bid: 99.5, ask: 99.515625 }, convention })
// [{ field: "quantity", level: "confirm", rule: "maxQuantity", message: "20,000,000 is above 10,000,000. Send it anyway?" },
//  { field: "price", level: "block", rule: "maxDistance", message: "The price is 7 ticks from the market; the limit is 4 ticks." }]
```

The same draft can produce both a confirm and a block. The preview checks five fixed drafts: within limits, above each quantity threshold, too far from the market, and below the minimum quantity. Both buy and sell are allowed. See [Block and confirm](#block-and-confirm) for Ticket and RfqTicket integration.

## API Reference

### A limits table

Every `Limits` field is optional. Omitted rules do nothing.

| Field | Type | Behavior |
|---|---|---|
| `maxQuantity` | `Threshold` | Checks whether quantity exceeds a threshold. |
| `minQuantity` | `Threshold` | Checks whether quantity falls below a threshold. |
| `maxDistance` | `({ ticks: number } \| { bps: number }) & { level?: ProblemLevel }` | Checks each supplied price, bid, and ask against the market. Defaults to `level: "block"`. |
| `sides` | `readonly ("buy" \| "sell")[]` | Blocks a disallowed ticket side, bid (`buy`), or ask (`sell`). An empty array allows neither side. |
| `custom` | `(draft: LimitsDraft, context: LimitsContext) => Problem[]` | Appends your problems after the built-in checks. Receives the original draft and context, including any partial labels. |

`Threshold` accepts these forms. Quantity and thresholds use the same units; there is no conversion to thousands or millions.

| Form | Result when crossed |
|---|---|
| `number` | A `block`. |
| `{ confirm: number }` | A `confirm`. |
| `{ block: number }` | A `block`. |
| `{ confirm: number, block: number }` | A `block` if its threshold is crossed; otherwise a `confirm` if its threshold is crossed. |
| `{}` | No check. |

Comparisons are strict: `>` for a maximum and `<` for a minimum. Equality does not cross that threshold, though another threshold may still apply. Each quantity rule returns at most one problem, with block taking precedence over confirm within that rule. `maxQuantity` and `minQuantity` are checked independently.

### Draft and context

`checkLimits(draft, limits, context?)` accepts `limits: Limits | undefined` and defaults `context` to `{}`. Undefined limits return `[]`.

| `LimitsDraft` field | Type | Use |
|---|---|---|
| `side` | `"buy" \| "sell"` | Optional ticket side; also selects the market side for `price`. |
| `quantity` | `number \| null` | Optional size. |
| `price` | `number \| null` | Optional ticket level. |
| `bid`, `ask` | `number \| null` | Optional quote levels, each checked separately. |

| `LimitsContext` field | Type | Default | Use |
|---|---|---|---|
| `market` | `LimitsMarket` | Unset | Optional `bid`, `ask`, `mid`, and `last`, each `number \| null`. Without a usable reference, distance checks are skipped. |
| `convention` | `InstrumentConvention` | Price basis, tick `1` | Sets the distance unit and tick size through [`format`](format.md). |
| `labels` | `Partial<LimitsLabels>` | `DEFAULT_LIMITS_LABELS` | Overrides built-in messages, side names, and units. |

Quantity and distance checks skip missing, null, and non-finite values. A partial draft can still have problems: `sides` checks a supplied `side` before any number is entered, and checks any numeric bid or ask, including `NaN` and infinities. `custom` runs even on an empty draft. With neither of those rules producing a problem, a blank draft returns `[]`; required-field validation belongs to the caller.

### What comes back

`checkLimits` returns `Problem[]`, empty when no rule produces a problem.

| `Problem` field | Type | Meaning |
|---|---|---|
| `field` | `string` | Built-in rules use `quantity`, `price`, `bid`, `ask`, or `side`; custom rules can name other fields. |
| `level` | `ProblemLevel` (`"block" \| "confirm"`) | Whether to stop or ask again. |
| `message` | `string` | The sentence to display. |
| `rule` | `string` | `maxQuantity`, `minQuantity`, `maxDistance`, `sides`, or your custom rule's name. |

Problems stay in check order: maximum quantity, minimum quantity, distance for `price`/`bid`/`ask`, allowed sides for `side`/`bid`/`ask`, then custom problems. A block does not discard confirms from other rules.

| Helper | Returns | Behavior |
|---|---|---|
| `blocks(problems)` | `Problem[]` | Keeps only `block` problems, in their original order. |
| `confirms(problems)` | `Problem[]` | Keeps only `confirm` problems, in their original order. |
| `problemsByField(problems)` | `Record<string, string>` | Keeps the first message for each field, regardless of level, with the custom-name exception below. Pass `blocks(problems)` to collect blocking messages. |

All three helpers accept `readonly Problem[]`.

Use custom field names that are not inherited from `Object.prototype`. `problemsByField` omits names such as `constructor`, `toString`, and `__proto__`; both tickets use that field map to stop actions, so a custom block on one of those names cannot stop an action by itself.

### Distance from the market

`marketSideFor(field, side, market)` returns the first usable reference as `number | null`. `field` is `"price" | "bid" | "ask"`; `side` and `market` may be `undefined`.

| Draft field | First choice | Fallback |
|---|---|---|
| `bid` | Market `bid` | Mid, then `last`. |
| `ask` | Market `ask` | Mid, then `last`. |
| `price`, side `buy` | Market `ask` | Mid, then `last`. |
| `price`, side `sell` | Market `bid` | Mid, then `last`. |
| `price`, no side | Mid | `last`. |

Only finite references are usable. The mid is a finite explicit `market.mid`, or otherwise the average of numeric `bid` and `ask`. An unusable average is skipped. A missing market or no usable reference returns `null`; the check skips that field. It does not fall back directly to the opposite side.

`distanceFromMarket(level, market, convention)` takes two numbers and an `InstrumentConvention | undefined`, returning `{ value: number, unit: "ticks" | "bps" }`. Distance is absolute, so levels on either side of the reference can exceed a limit.

| Quote basis | Calculation | Unit |
|---|---|---|
| `price` (also the default basis) | Difference divided by `convention.tick`, rounded to the nearest eighth of a tick, then made absolute. Without a convention, tick size is `1`. | `ticks` |
| `yield`, `discount` | Absolute difference × `100`, rounded to `0.001` basis points. Inputs are percentage points: `4.30` against `4.25` gives `5`. | `bps` |
| `spread` | Absolute difference, rounded to `0.001` basis points. Inputs are already basis points: `203` against `200` gives `3`. | `bps` |

`quoteStep` and `quoteDecimals` do not affect this helper. For price quotes, a nonpositive tick produces `NaN`, which does not trigger a distance problem.

`maxDistance` produces a problem only when the calculated distance is strictly greater than the limit and the units match. A `ticks` rule on a yield, discount, or spread convention is skipped; a `bps` rule on a price convention is skipped too.

### Block and confirm

[`ticket`](ticket.md) and [`rfq-ticket`](rfq-ticket.md) take a `limits` prop and check it live and again when an action is invoked, alongside their own draft validation. A block in the `problemsByField` map stops a checked action before confirmation. Blocks appear under quantity/price in Ticket or bid/ask in RfqTicket; problems for other fields appear on the limits line.

A confirm changes the invoked action's label to ask again. A second click on the same action sends if validation and limits still permit it. Editing the draft clears confirmation; changes to market or limits props alone do not. Every click checks those current props again.

| Component | Draft passed to limits | Actions that bypass checks |
|---|---|---|
| `Ticket` | `side`, `quantity`, and `price`; price is `null` for an order type that does not require it. | `checked: false` |
| `RfqTicket` | Only the bid and/or ask requested by the inquiry; unrequested sides are `null`. Quantity is not passed, so quantity limits do not apply. | `needsQuote: false` |

### Labels

Pass `context.labels` to `checkLimits` to override any string in `DEFAULT_LIMITS_LABELS`:

| Label | Default |
|---|---|
| `quantityAbove` | `{n} is above the size limit of {max}.` |
| `quantityAboveConfirm` | `{n} is above {max}. Send it anyway?` |
| `quantityBelow` | `{n} is below the minimum of {min}.` |
| `quantityBelowConfirm` | `{n} is below {min}. Send it anyway?` |
| `tooFar` | `The {field} is {distance} from the market; the limit is {max}.` |
| `tooFarConfirm` | `The {field} is {distance} from the market, past {max}. Send it anyway?` |
| `sideNotAllowed` | `The book does not take a {side}.` |
| `buy`, `sell` | `buy`, `sell` |
| `ticks`, `bps` | `ticks`, `bp` |

Quantity templates receive `{n}` and `{max}` or `{min}`, formatted by `formatQuantity`. Distance templates receive the raw field name (`price`, `bid`, or `ask`), plus `{distance}` and `{max}` formatted by `formatTicks` without a positive sign and with the translated unit appended. `{side}` uses the `buy` or `sell` label.

Custom messages are returned unchanged. Ticket and RfqTicket do not pass labels into `checkLimits`; their own `labels` props control ticket text, not these templates.

### What it does not do

It holds no desk's numbers and calls no server. A limit the server enforces is still the server's; this is the check before the click leaves the screen.
