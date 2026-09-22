# quote-field

A field that types a quote the way the instrument quotes it, steps it by the instrument's own step, and hands the number up.

## Usage

```tsx
import { QuoteField } from "@/components/ui/quote-field"
import type { InstrumentConvention } from "@/lib/format"
```

```tsx
const BILL: InstrumentConvention = { price: { kind: "decimal", decimals: 3 }, tick: 0.0005, quoteBasis: "discount" }

const [discount, setDiscount] = useState<number | null>(null)

<QuoteField convention={BILL} value={discount} onValueChange={setDiscount} stepFrom={composite.mid} />
```

## API Reference

### The basis

The convention says what a quote is: a price in the instrument's notation (`99-16+`), or a yield, a discount rate, or a spread in basis points as a plain decimal. The label is the basis word unless you give one, `Price`, `Yield`, `Discount`, `Spread`, and the root carries it as `data-basis`. The field parses through `parseQuote` and prints through `formatQuote` from [`format`](format.md), so a price takes its notation or a decimal, and the others take a decimal and snap to the quote step. Nothing here knows an instrument by name; a new kind of instrument is a new convention object.

### Typing and stepping

On every keystroke the text is read and `onValueChange` gets the number, or null while the text is blank or not a quote. On blur a good quote is printed back in the notation (`99.75` becomes `99-24`) and a bad one is marked, with a line under the field that names the basis, or says `invalidText`. The mark clears as soon as anything else is typed; a blank field is not wrong.

The arrows step by the instrument's step, `stepQuote`, and Shift steps ten (`shiftMultiplier`). The two buttons do the same, named `<label> up one tick` and `<label> down one tick`. When the field is blank a step starts from `stepFrom`, the last, a mid, whichever side there is, as you choose; with nothing to start from the arrows do nothing. An arrow with a modifier held is not the field's: it lets the key through to whoever listens above, which is how a ticket's `mod+up` reaches the hotkey registry from inside this field.

The field is controlled. When you move the value, from a key, a click on a reference price, a reset, the text follows and any mark clears. When the text already reads as the value you set, because someone is typing it, the text stays as typed under the cursor and is tidied on blur.

### Two sides

A two-sided quote is two fields. Give each a `side`, `bid` or `ask`, and it lands on the root as `data-side` for your styling; the fields share the convention and step alike. `error` prints a problem your own check found, a bid above the ask for one, over the field's own.

### What it does not do

It does not check the quote against a market, a limit, or the other side; that is the check your ticket runs before it sends, and `error` is where you say what it found. It declares no keys. It does not send anything and knows nothing about orders or inquiries. [`ticket`](ticket.md) is built on it.
