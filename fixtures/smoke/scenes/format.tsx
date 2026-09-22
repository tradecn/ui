import { formatPrice, formatSigned } from "@/lib/format"

// A lib has no element of its own; the scene wraps its output in the slot the smoke test counts.
export function FormatScene() {
  return (
    <div data-slot="tradecn-format" className="text-xs font-(family-name:--tradecn-font-mono) lining-nums tabular-nums">
      {formatPrice(99.515625, { kind: "fraction", denominator: 32, half: "+" })} {formatSigned(-0.12)}
    </div>
  )
}
