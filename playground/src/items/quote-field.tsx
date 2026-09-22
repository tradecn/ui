import { useState } from "react"
import { NULL_TOKEN, formatQuote, type InstrumentConvention } from "@/registry/tradecn/lib/format"
import { QuoteField } from "@/registry/tradecn/ui/quote-field"

const NOTE: InstrumentConvention = { price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 }
const BILL: InstrumentConvention = { price: { kind: "decimal", decimals: 3 }, tick: 0.0005, quoteBasis: "discount" }
const CREDIT: InstrumentConvention = { price: { kind: "decimal", decimals: 3 }, tick: 0.001, quoteBasis: "spread" }

function Row({ title, convention, stepFrom, label }: { title: string; convention: InstrumentConvention; stepFrom: number; label?: string }) {
  const [value, setValue] = useState<number | null>(null)
  return (
    <div className="flex w-64 flex-col gap-1">
      <span className="text-muted-foreground">{title}</span>
      <QuoteField convention={convention} value={value} onValueChange={setValue} stepFrom={stepFrom} label={label} />
      <span className="lining-nums tabular-nums text-muted-foreground" data-quote-value={value ?? ""}>
        value {value === null ? NULL_TOKEN : value} · prints {formatQuote(value, convention)}
      </span>
    </div>
  )
}

export function QuoteFieldScene() {
  return (
    <main className="mx-auto max-w-3xl space-y-4 p-6 font-(family-name:--tradecn-font-mono) text-xs">
      <h1 className="text-sm font-semibold">quote-field</h1>
      <p className="text-muted-foreground">
        One field, three bases. Type <code>99-16+</code> or <code>99.75</code> into the note and blur to see the notation come back; type <code>4.2531</code> into the bill and watch it snap to the tenth of a basis point; the credit spread steps by a tenth. Arrows step, Shift steps ten, a blank field steps from the reference beside it. A held
        modifier leaves the arrows to whoever listens above.
      </p>
      <div className="flex flex-wrap gap-6">
        <Row title="a note, on price in 32nds" convention={NOTE} stepFrom={99.5} />
        <Row title="a bill, on discount" convention={BILL} stepFrom={4.25} />
        <Row title="credit, on spread" convention={CREDIT} stepFrom={112.5} label="Spread (bp)" />
      </div>
    </main>
  )
}
