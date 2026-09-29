import { cn } from "cn"
import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { CONTRACT_RULES, checkContract, type ContractReport } from "@/registry/tradecn/lib/agent-kit"
import { NUMERIC_CLASS } from "@/registry/tradecn/lib/format"

export default function AgentKitDemo() {
  const [cue, setCue] = useState(true)
  const [named, setNamed] = useState(true)
  const [report, setReport] = useState<ContractReport | null>(null)
  const row = useRef<HTMLDivElement>(null)

  // Check the row once each change is on screen.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (row.current) setReport(checkContract({ root: row.current }))
    })
    return () => cancelAnimationFrame(frame)
  }, [cue, named])

  return (
    <div className="flex w-full max-w-md flex-col gap-3 text-sm">
      <div data-demo-controls className="flex flex-wrap gap-4 text-xs">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={cue} onChange={(event) => setCue(event.target.checked)} />
          Direction cue
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={named} onChange={(event) => setNamed(event.target.checked)} />
          Refresh has a name
        </label>
      </div>
      <div ref={row} className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-x-4 rounded-md border border-border px-3 py-2">
        <span>UST 10Y</span>
        <span data-numeric="" className={NUMERIC_CLASS}>99-16+</span>
        <span data-numeric="" className={NUMERIC_CLASS}>99-17</span>
        <span data-numeric="" data-direction={cue ? "up" : undefined} className={cn(NUMERIC_CLASS, "text-up")}>
          {cue ? "+0-01" : "0-01"}
        </span>
        <Button type="button" variant="ghost" size="icon" aria-label={named ? "Refresh" : undefined}>
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6" />
          </svg>
        </Button>
      </div>
      {report && (
        <div className="flex flex-col gap-1 text-xs">
          <p className={cn("text-muted-foreground", NUMERIC_CLASS)}>Checked {CONTRACT_RULES.map((rule) => `${rule} ${report.checked[rule]}`).join(", ")}</p>
          {report.findings.length ? (
            <ul className="flex flex-col gap-0.5">
              {report.findings.map((finding) => (
                <li key={`${finding.rule} ${finding.where}`}>
                  <span className="font-medium">{finding.rule}</span> {finding.detail}
                </li>
              ))}
            </ul>
          ) : (
            <p>No findings.</p>
          )}
        </div>
      )}
    </div>
  )
}
