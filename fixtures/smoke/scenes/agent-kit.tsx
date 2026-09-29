import { cn } from "cn"
import { useId } from "react"
import { NUMERIC_CLASS } from "@/lib/format"

// Three samples for checkContract. The kept one follows the contract, a word for a cue, a word and a number in two
// spans a gap apart, a drawn sign a screen reader skips, a sign in a boxless wrapper, a colored run the spec also
// checks as its own root, a field, a select, SVG text, SVG text painted in nothing and screen-reader-only small print
// among it. The unseen one says its direction only to a screen reader, through a description it points to, a native
// label, a faded sign, a sign painted transparent, a grid rule's highlight that its description explains, a
// description on the run around the value, a label on an element that takes its role from a fallback token, and a
// cell marked with its side: that passes by default and fails under visibleCue. The broken one breaks three rules on
// purpose: numbers colored up with nothing else saying so (in text, in a field, in SVG text, with units, in a price
// split across two spans at its dash, behind a description that points at nothing, a label that names no direction, a
// label on a plain span, which no screen reader hears, a side marked on a container rather than on the value, a
// highlight from a rule whose tone is no direction, a hidden sign, and a faded sign and a description under
// aria-hidden, which reach nobody); an icon button and a field with no name; and text under the floor, an SVG label
// drawn at half size and small print the spec shrinks at run time, a select's and a placeholder's among it. It is
// marked data-contract-ignore, so the page-wide check leaves it out.

export function AgentKitScene() {
  const id = useId()
  return (
    <div data-slot="tradecn-agent-kit" className="flex flex-col gap-2 text-xs lining-nums tabular-nums">
      <div data-contract-sample="kept" className="flex items-center gap-3">
        <span>UST 10Y</span>
        <span data-numeric="" className={NUMERIC_CLASS}>
          99-16+
        </span>
        <span data-numeric="" data-direction="up" className={cn(NUMERIC_CLASS, "text-up")}>
          +0-01
        </span>
        <span data-numeric="" className={cn(NUMERIC_CLASS, "text-up")}>
          Up 0-01
        </span>
        <span data-numeric="" className={cn(NUMERIC_CLASS, "inline-flex gap-1 text-up")}>
          <span>Up</span>
          <span>0-06</span>
        </span>
        <span data-numeric="" className={cn(NUMERIC_CLASS, "text-up")}>
          <span aria-hidden="true">+</span>0-03
        </span>
        <span data-numeric="" className={cn(NUMERIC_CLASS, "text-up")}>
          <span className="contents">+</span>0-07
        </span>
        <span data-cue-root="" className={cn(NUMERIC_CLASS, "text-up")}>
          <span>+</span>
          <span>0-15</span>
        </span>
        <span data-small-print="" className="sr-only">
          Refreshes each second
        </span>
        <input aria-label="Change" readOnly value="+0-02" className={cn(NUMERIC_CLASS, "w-14 bg-transparent text-up")} />
        <svg role="img" aria-label="Up 0-01" width="40" height="14">
          <text x="0" y="11" className="fill-up">
            +0-01
          </text>
        </svg>
        <svg width="40" height="14">
          <text x="0" y="11" className="fill-up stroke-down" style={{ fillOpacity: 0, strokeWidth: 0 }}>
            0-13
          </text>
        </svg>
        <select aria-label="Size" defaultValue="10" className={NUMERIC_CLASS}>
          <option>5</option>
          <option>10</option>
        </select>
        <button type="button" aria-label="Refresh">
          ↻
        </button>
      </div>
      <div data-contract-sample="unseen" className="flex items-center gap-3">
        <span id={`${id}-up`} className="sr-only">
          Up
        </span>
        <span aria-describedby={`${id}-up`} data-cue="describedby" className={cn(NUMERIC_CLASS, "text-up")}>
          0-03
        </span>
        <label htmlFor={`${id}-change`} className="sr-only">
          Up
        </label>
        <input id={`${id}-change`} readOnly value="0-04" data-cue="label" className={cn(NUMERIC_CLASS, "w-14 bg-transparent text-up")} />
        <span data-cue="transparent" className={cn(NUMERIC_CLASS, "text-up")}>
          <span className="opacity-0">+</span>0-05
        </span>
        <span data-cue="clear" className={cn(NUMERIC_CLASS, "text-up")}>
          <span className="text-transparent">+</span>0-08
        </span>
        <span data-cue="rule" data-rule="rich" data-tone="up" aria-description="Rich" className={cn(NUMERIC_CLASS, "text-up")}>
          100.25
        </span>
        <span aria-description="Up" className={cn(NUMERIC_CLASS, "text-up")}>
          <span data-cue="run-description">0-12</span>
        </span>
        <span role="unsupported img" aria-label="Up 0-08" data-cue="fallback-role" className={cn(NUMERIC_CLASS, "text-up")}>
          0-08
        </span>
        <table>
          <tbody>
            <tr>
              <td data-side="bid">
                <span data-cue="cell" className={cn(NUMERIC_CLASS, "text-up")}>
                  0-10
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div data-contract-sample="broken" data-contract-ignore="" className="flex items-center gap-3">
        <span className={cn(NUMERIC_CLASS, "text-up")}>0-01</span>
        <input readOnly value="0-02" className={cn(NUMERIC_CLASS, "w-14 bg-transparent text-up")} />
        <svg width="40" height="14">
          <text x="0" y="11" className="fill-up">
            0-01
          </text>
        </svg>
        <span className={cn(NUMERIC_CLASS, "text-up")}>
          <span data-cue="handle">99</span>
          <span data-cue="ticks">-16</span>
        </span>
        <span aria-describedby={`${id}-nowhere`} data-cue="dangling" className={cn(NUMERIC_CLASS, "text-up")}>
          0-03
        </span>
        <span aria-label="Price" data-cue="named" className={cn(NUMERIC_CLASS, "text-up")}>
          0-06
        </span>
        <span aria-label="Up" data-cue="generic-label" className={cn(NUMERIC_CLASS, "text-up")}>
          0-14
        </span>
        <div data-side="buy">
          <span data-cue="side" className={cn(NUMERIC_CLASS, "text-up")}>
            0-09
          </span>
        </div>
        <div data-rule="large" data-tone="primary" aria-description="Large">
          <span data-cue="other-rule" className={cn(NUMERIC_CLASS, "text-up")}>
            0-11
          </span>
        </div>
        <span data-cue="hidden" className={cn(NUMERIC_CLASS, "text-up")}>
          <span hidden>+</span>0-04
        </span>
        <span data-cue="unheard" className={cn(NUMERIC_CLASS, "text-up")}>
          <span aria-hidden="true" className="opacity-0">+</span>0-05
        </span>
        <span aria-hidden="true" aria-description="Up" data-cue="unheard-description" className={cn(NUMERIC_CLASS, "text-up")}>
          0-07
        </span>
        <span data-cue="units" className={cn(NUMERIC_CLASS, "text-up")}>
          10 lots
        </span>
        <button type="button">
          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12">
            <circle cx="6" cy="6" r="5" fill="currentColor" />
          </svg>
        </button>
        <svg viewBox="0 0 80 28" width="40" height="14">
          <text x="0" y="22" data-cue="scaled">
            half size
          </text>
        </svg>
        <span data-small-print="">small print</span>
        <input aria-label="Size" placeholder="Size" readOnly data-placeholder-print="" className="w-14 bg-transparent" />
        <select aria-label="Size" defaultValue="10" data-small-print="">
          <option>5</option>
          <option>10</option>
        </select>
      </div>
    </div>
  )
}
