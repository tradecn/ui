import { useState } from "react"
import { NULL_TOKEN, formatQuote, type InstrumentConvention } from "@/registry/tradecn/lib/format"
import { QuoteField } from "@/registry/tradecn/ui/quote-field"

// Three instruments, three bases. The field learns everything from the convention.
const NOTE: InstrumentConvention = { price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 }
const BILL: InstrumentConvention = { price: { kind: "decimal", decimals: 3 }, tick: 0.0005, quoteBasis: "discount" }
const CREDIT: InstrumentConvention = { price: { kind: "decimal", decimals: 3 }, tick: 0.001, quoteBasis: "spread" }

function Quote({ title, convention, stepFrom, label }: { title: string; convention: InstrumentConvention; stepFrom: number; label?: string }) {
  const [value, setValue] = useState<number | null>(null)
  return (
    <div className="flex w-56 flex-col gap-1">
      <span className="text-muted-foreground">{title}</span>
      <QuoteField convention={convention} value={value} onValueChange={setValue} stepFrom={stepFrom} label={label} />
      <span className="tabular-nums text-muted-foreground">{value === null ? NULL_TOKEN : `${value} prints ${formatQuote(value, convention)}`}</span>
    </div>
  )
}

export default function QuoteFieldDemo() {
  return (
    <div className="space-y-3 font-mono text-xs">
      <div className="flex flex-wrap gap-6">
        <Quote title="a note, in 32nds" convention={NOTE} stepFrom={99.5} />
        <Quote title="a bill, on discount" convention={BILL} stepFrom={4.25} />
        <Quote title="credit, on spread" convention={CREDIT} stepFrom={112.5} label="Spread (bp)" />
      </div>
      <p className="text-muted-foreground">Type 99.75 into the note and leave the field: it comes back as 99-24. Arrows step by the instrument's step, Shift by ten, and a blank field steps from the reference.</p>
    </div>
  )
}
