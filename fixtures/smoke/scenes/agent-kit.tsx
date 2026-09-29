import { cn } from "cn"
import { NUMERIC_CLASS } from "@/lib/format"

// Two samples for checkContract. The kept one follows the contract, a field, a select and SVG text among it. The
// broken one breaks three rules on purpose: numbers colored up with nothing else saying so, in text, in a field
// and in SVG text; an icon button and a field with no name; and small print, a select's among it, that the spec
// shrinks under the floor at run time. It is marked data-contract-ignore, so the page-wide check leaves it out.

export function AgentKitScene() {
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
      <div data-contract-sample="broken" data-contract-ignore="" className="flex items-center gap-3">
        <span className={cn(NUMERIC_CLASS, "text-up")}>0-01</span>
        <input readOnly value="0-02" className={cn(NUMERIC_CLASS, "w-14 bg-transparent text-up")} />
        <svg width="40" height="14">
          <text x="0" y="11" className="fill-up">
            0-01
          </text>
        </svg>
        <button type="button">
          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12">
            <circle cx="6" cy="6" r="5" fill="currentColor" />
          </svg>
        </button>
        <span data-small-print="">small print</span>
        <select aria-label="Size" defaultValue="10" data-small-print="">
          <option>5</option>
          <option>10</option>
        </select>
      </div>
    </div>
  )
}
