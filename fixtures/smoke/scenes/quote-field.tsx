import { useState } from "react"
import { QuoteField } from "@/components/ui/quote-field"
import type { InstrumentConvention } from "@/lib/format"

const BILL: InstrumentConvention = { price: { kind: "decimal", decimals: 3 }, tick: 0.0005, quoteBasis: "discount" }

export function QuoteFieldScene() {
  const [value, setValue] = useState<number | null>(null)
  return (
    <div className="w-56" data-quote-value={value ?? ""}>
      <QuoteField convention={BILL} value={value} onValueChange={setValue} stepFrom={4.25} />
    </div>
  )
}
