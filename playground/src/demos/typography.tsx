import { useState } from "react"
import "@fontsource/inter"
import "@fontsource/inter/700.css"
import "@fontsource/jetbrains-mono"
import "@fontsource/jetbrains-mono/700.css"
import "@fontsource/atkinson-hyperlegible-next"
import "@fontsource/atkinson-hyperlegible-next/700.css"
import "@fontsource/atkinson-hyperlegible-mono"
import "@fontsource/atkinson-hyperlegible-mono/700.css"
import { MONO_NUMERIC_CLASS, NUMERIC_CLASS, formatPrice } from "@/registry/tradecn/lib/format"

const PRICES = [1111.11, 8888.88, 1010.01, 7070.77]
const FRACTIONS = [99.515625, 98.03125, 101.75, 100.109375]
const FRACTION = { kind: "fraction", denominator: 32, half: "+" } as const
const SPECIMEN = "0O 1lI 5S 8B 69 3-5 4-6"
const SIZES = [12, 13, 14]

// Vary only the numeric features; the sample values stay fixed.
function Column({ label, variant, mono }: { label: string; variant: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground uppercase">{label}</span>
      {(mono ? FRACTIONS : PRICES).map((price) => (
        <span key={price} className={`text-right ${mono ? MONO_NUMERIC_CLASS : NUMERIC_CLASS}`} style={{ fontVariantNumeric: variant }}>
          {mono ? formatPrice(price, FRACTION) : formatPrice(price, { kind: "decimal", decimals: 2 })}
        </span>
      ))}
    </div>
  )
}

function Specimen({ family, label }: { family: string; label: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground uppercase">{label}</span>
      {SIZES.map((size) => (
        <span key={size} className="lining-nums tabular-nums" style={{ fontFamily: family, fontSize: size }}>
          {SPECIMEN} <span className="text-muted-foreground">{size}px</span>
        </span>
      ))}
    </div>
  )
}

export default function TypographyDemo() {
  const [tabular, setTabular] = useState(true)
  const [hyperlegible, setHyperlegible] = useState(false)
  const variant = tabular ? "lining-nums tabular-nums" : "normal"
  return (
    <>
      <div data-demo-controls className="mb-4 flex flex-wrap gap-2 font-(family-name:--tradecn-font-sans) text-xs">
        <button type="button" className="rounded-md border border-border px-2 py-1" aria-pressed={tabular} onClick={() => setTabular((on) => !on)}>{tabular ? "Tabular figures: on" : "Tabular figures: off"}</button>
        <button type="button" className="rounded-md border border-border px-2 py-1" aria-pressed={hyperlegible} onClick={() => setHyperlegible((on) => !on)}>{hyperlegible ? "Hyperlegible: on" : "Hyperlegible: off"}</button>
      </div>
      <div data-accessibility={hyperlegible ? "hyperlegible" : undefined} className="w-2xl max-w-full space-y-4 font-(family-name:--tradecn-font-sans) text-sm [--tradecn-font-numeric:var(--tradecn-font-sans)]">
        <div className="mx-auto grid w-fit max-w-full grid-cols-2 gap-8" data-numeric-columns>
          <Column label="Decimals" variant={variant} />
          <Column label="32nds" variant={variant} mono />
        </div>
        <p className="text-xs text-muted-foreground">Compare the decimal points with tabular figures on and off. The numeric family follows the sans; fraction quotes use mono, whose characters already have equal widths.</p>
        <div className="flex flex-wrap justify-center gap-6" data-specimens>
          <Specimen family="var(--tradecn-font-sans)" label="Sans" />
          <Specimen family="var(--tradecn-font-mono)" label="Mono" />
          <Specimen family="Georgia, serif" label="System serif" />
        </div>
        <p className="text-xs text-muted-foreground">Hyperlegible switches the sans, numeric, and mono families inside this specimen. The serif comparison uses Georgia when installed, otherwise the system's serif fallback. Compare the glyphs at each size; this is not a font ranking.</p>
      </div>
    </>
  )
}
