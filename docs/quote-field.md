# QuoteField

Enter a quote in the instrument's notation, step it by the convention's increment, and keep the numeric value in parent state.

## Usage

```tsx
import { useState } from "react"
import { QuoteField } from "@/components/ui/quote-field"
import type { InstrumentConvention } from "@/lib/format"
const BILL: InstrumentConvention = { price: { kind: "decimal", decimals: 3 }, tick: 0.0005, quoteBasis: "discount" }

function BillQuote() {
  const [discount, setDiscount] = useState<number | null>(null)

  return <QuoteField convention={BILL} value={discount} onValueChange={setDiscount} stepFrom={4.25} />
}
```

The bill starts blank. Its first upward step uses `4.25` as the reference and produces `4.251`; discount steps by `0.001`, independently of the price tick. Replace the sample reference with your current market value.

The preview compares a note on price, a bill on discount, and credit on spread. Type `99.75` into the note and leave the field to see `99-24`. Arrows move one step, Shift+arrows move ten, and the readout shows the value held by the parent.

## API Reference

`QuoteFieldProps` exposes these inputs. It does not forward arbitrary input or wrapper props.

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `convention` | `InstrumentConvention` | Required | Quote basis, notation, and step |
| `value` | `number \| null` | Required | Parent-owned quote; `null` for blank or invalid text |
| `onValueChange` | `(value: number \| null) => void` | Required | Receives parsed edits and stepped values |
| `stepFrom` | `number \| null` | `null` | Starting value for a step when `value` is `null` |
| `label` | `string` | Basis label below | Visible label and word used in button names |
| `error` | `string` | Unset | Parent validation message; takes precedence over the field's own error |
| `invalidText` | `string` | Message using the lowercase label | Text shown after invalid input loses focus |
| `placeholder` | `string` | `formatQuote(0, convention)` | Empty-input hint, such as `0-00` or `0.000` |
| `id` | `string` | Generated with `useId` | Input ID associated with the label |
| `disabled` | `boolean` | `false` | Disables the input and both step buttons |
| `shiftMultiplier` | `number` | `10` | Multiplier for Shift+Up and Shift+Down |
| `side` | `"bid" \| "ask"` | Unset | Root `data-side` for styling |
| `inputRef` | `RefObject<HTMLInputElement \| null>` | Unset | Ref to the input |
| `className` | `string` | Unset | Classes on the outer wrapper |

### The basis

`convention.quoteBasis` defaults to `"price"`. Yield and discount values use percentage points; spreads use basis points. The root carries the basis as `data-basis` and the slot `data-slot="tradecn-quote-field"`.

| Basis | Default label | Default step | Display precision |
|---|---|---|---|
| `"price"` | `Price` | `convention.tick` | From `convention.price` |
| `"yield"` | `Yield` | `0.001` | `quoteDecimals`, default `3` |
| `"discount"` | `Discount` | `0.001` | `quoteDecimals`, default `3` |
| `"spread"` | `Spread` | `0.1` | `quoteDecimals`, default `1` |

For non-price quotes, `quoteStep` overrides the default step. Price quotes ignore `quoteStep` and `quoteDecimals`. Set precision high enough to display the step; the bill above steps by `0.001` in discount, despite its price tick of `0.0005`.

The field uses [`format`](format.md)'s `parseQuote`, `formatQuote`, and `stepQuote`. Price input accepts the instrument's notation (`99-16+`) or a decimal. Decimal price conventions round to their decimal places, tick conventions snap to their price tick, and fraction conventions accept decimal input without snapping. Other bases accept decimals, snap to the quote step, and print without a unit suffix.

Parsing trims whitespace, removes commas, and accepts either minus sign; decimal input uses a point. Fraction prices use the mono font; other quotes use the numeric font. A new kind of instrument needs a new convention object, with no instrument-name lookup.

### Typing and stepping

Each text edit calls `onValueChange` with the parsed number, or `null` for blank or invalid text. Keep that value in parent state. Blur formats valid text (`99.75` becomes `99-24` for 32nds) or marks invalid text with `aria-invalid` and a message below the field. Blur does not call `onValueChange`.

The default message is `Not a <lowercase label> in this instrument's notation.` Typing clears the field's own error; blank text is not marked invalid. A supplied `error` remains until the parent clears it. `error=""` suppresses the field's message and invalid mark, as does `invalidText=""` when `error` is unset.

| Control | Behavior |
|---|---|
| Up / Down | Add or subtract one quote step |
| Shift+Up / Shift+Down | Add or subtract `shiftMultiplier` steps |
| Minus / plus buttons | Subtract or add one step, including when Shift is held |
| Ctrl, Meta, or Alt + arrow | Leave the event to listeners above the field |

The buttons are named `<label> down one tick` and `<label> up one tick`. A step uses `value ?? stepFrom`, snaps to the nearest quote grid value, then moves by the requested steps. Choose a last price, mid, or available side for `stepFrom`; it applies whenever `value` is null, including invalid text. Without either starting value, stepping does nothing, though bare and Shift arrows still prevent their default behavior.

When `value` changes and differs from the parsed text, the field replaces the text and clears its own error. If the text already parses to the new value, it stays as typed until blur. Passing the same value again does not reset the text: setting an already-null value to null leaves invalid text in place. Changing only `convention` does not reformat the current text either; remount the field when you need to reset that local state.

There is no separate commit or cancel operation. Enter and Escape have no field-specific handler; a ticket can handle them above the field, just as its `mod+up` can reach the hotkey registry.

### Two sides

Use two fields with the same convention and `side="bid"` or `side="ask"`. The side only sets `data-side`; it does not change parsing or stepping. Pass a parent validation problem, such as a bid above the ask, through `error`.

### What it does not do

The field checks notation only. Your ticket checks market prices, limits, and the other side before sending, and reports problems through `error`. The field registers no hotkeys, sends no orders or inquiries, and has no order state. [`ticket`](ticket.md) is built on it.
