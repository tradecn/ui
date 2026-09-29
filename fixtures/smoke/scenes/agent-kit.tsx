import { cn } from "cn"
import { useId } from "react"
import { NUMERIC_CLASS } from "@/lib/format"

// Three samples for checkContract. The kept one follows the contract, a word for a cue, a sign in a boxless wrapper,
// a field, a select, SVG text and screen-reader-only small print among it. The unseen one says its direction only to
// a screen reader, through a label it points to, a native label, a faded sign and a sign painted transparent, and
// carries a grid rule's highlight that its description explains: that passes by default and fails under visibleCue. The broken one breaks three rules on purpose: numbers colored up with nothing
// else saying so (in text, in a field, in SVG text, with units, behind a description that points at nothing, a label
// that names no direction and a hidden sign); an icon button and a field with no name; and text under the floor, an
// SVG label drawn at half size and small print the spec shrinks at run time, a select's among it. It is marked
// data-contract-ignore, so the page-wide check leaves it out.

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
        <span data-numeric="" className={cn(NUMERIC_CLASS, "text-up")}>
          <span className="contents">+</span>0-07
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
        <span aria-labelledby={`${id}-up`} data-cue="labelledby" className={cn(NUMERIC_CLASS, "text-up")}>
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
      </div>
      <div data-contract-sample="broken" data-contract-ignore="" className="flex items-center gap-3">
        <span className={cn(NUMERIC_CLASS, "text-up")}>0-01</span>
        <input readOnly value="0-02" className={cn(NUMERIC_CLASS, "w-14 bg-transparent text-up")} />
        <svg width="40" height="14">
          <text x="0" y="11" className="fill-up">
            0-01
          </text>
        </svg>
        <span aria-describedby={`${id}-nowhere`} data-cue="dangling" className={cn(NUMERIC_CLASS, "text-up")}>
          0-03
        </span>
        <span aria-label="Price" data-cue="named" className={cn(NUMERIC_CLASS, "text-up")}>
          0-06
        </span>
        <span data-cue="hidden" className={cn(NUMERIC_CLASS, "text-up")}>
          <span hidden>+</span>0-04
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
        <select aria-label="Size" defaultValue="10" data-small-print="">
          <option>5</option>
          <option>10</option>
        </select>
      </div>
    </div>
  )
}
