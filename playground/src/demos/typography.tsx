import { useState, type CSSProperties } from "react"
import "@fontsource/atkinson-hyperlegible-next"
import "@fontsource/atkinson-hyperlegible-next/700.css"
import "@fontsource/atkinson-hyperlegible-mono"
import "@fontsource/atkinson-hyperlegible-mono/700.css"
import { Button } from "@/components/ui/button"
import { MONO_NUMERIC_CLASS, NUMERIC_CLASS, formatPrice } from "@/registry/tradecn/lib/format"

// The typography system, live: the numeric figures every component sets, on and off; the accessibility
// mode, which is one attribute on an ancestor; and the sans the tokens recommend beside a face the
// research does not. Inter and JetBrains Mono are loaded by the page; the two Atkinson faces are
// imported here, so the browser fetches them only when this demo runs.

const PRICES = [1111.11, 8888.88, 1010.01, 7070.77]
const FRACTIONS = [99.515625, 98.03125, 101.75, 100.109375]
const FRACTION = { kind: "fraction", denominator: 32, half: "+" } as const
const SPECIMEN = "0O 1lI 5S 8B 69 3-5 4-6"
const SIZES = [12, 13, 14]

/** A column of prices in one font-variant-numeric setting; the digits only line up when it is tabular. */
function Column({ label, variant, mono }: { label: string; variant: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-muted-foreground uppercase">{label}</span>
      {(mono ? FRACTIONS : PRICES).map((price) => (
        <span key={price} className={`text-right ${mono ? MONO_NUMERIC_CLASS : NUMERIC_CLASS}`} style={{ fontVariantNumeric: variant }}>
          {mono ? formatPrice(price, FRACTION) : formatPrice(price, { kind: "decimal", decimals: 2 })}
        </span>
      ))}
    </div>
  )
}

/** The disambiguation specimen at the three sizes a grid uses, in one family. */
function Specimen({ family, label }: { family: string; label: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-muted-foreground uppercase">{label}</span>
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
  const body: CSSProperties = { fontFamily: "var(--tradecn-font-sans)", fontSize: "var(--tradecn-text-size-body)", lineHeight: "var(--tradecn-line-height-body)", fontWeight: "var(--tradecn-font-weight-body)" }
  return (
    // The remap selector matches any element, so the mode can be a corner of a page as well as the whole app.
    <div data-accessibility={hyperlegible ? "hyperlegible" : undefined} className="flex flex-col gap-4" style={body}>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" aria-pressed={tabular} onClick={() => setTabular((on) => !on)}>
          {tabular ? "Tabular figures: on" : "Tabular figures: off"}
        </Button>
        <Button type="button" size="sm" variant="outline" aria-pressed={hyperlegible} onClick={() => setHyperlegible((on) => !on)}>
          {hyperlegible ? "Hyperlegible: on" : "Hyperlegible: off"}
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-4 text-sm" data-numeric-columns>
        <Column label="decimals, the numeric family" variant={variant} />
        <Column label="32nds, the mono" variant={variant} mono />
        <div className="text-xs text-muted-foreground">
          <p>Every component sets its numbers in lining, tabular figures. Turn them off and the decimal points wander with the width of a 1 against an 8. The numeric family is the sans by default; the terminal theme this page wears points it at the mono.</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4" data-specimens>
        <Specimen family="var(--tradecn-font-sans)" label="the sans" />
        <Specimen family="var(--tradecn-font-mono)" label="the mono" />
        <Specimen family="Georgia, serif" label="Georgia, for contrast" />
      </div>
      <p className="text-xs text-muted-foreground">Georgia is not one of the faces the research ranks; it is here because every machine has it, so the difference an open counter and a distinct 1, l, and I make is visible without a download.</p>
    </div>
  )
}
