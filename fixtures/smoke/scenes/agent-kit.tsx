import { cn } from "cn"
import { NUMERIC_CLASS } from "@/lib/format"

// Two samples for checkContract. The kept one follows the contract. The broken one breaks three rules on purpose:
// a number colored up with nothing else saying so, and an icon button with no name. The spec shrinks its small
// print under the floor at run time. It is marked data-contract-ignore, so the page-wide check leaves it out.

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
        <button type="button" aria-label="Refresh">
          ↻
        </button>
      </div>
      <div data-contract-sample="broken" data-contract-ignore="" className="flex items-center gap-3">
        <span className={cn(NUMERIC_CLASS, "text-up")}>0-01</span>
        <button type="button">
          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12">
            <circle cx="6" cy="6" r="5" fill="currentColor" />
          </svg>
        </button>
        <span data-small-print="">small print</span>
      </div>
    </div>
  )
}
