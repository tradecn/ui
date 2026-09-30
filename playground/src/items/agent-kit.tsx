import { useState } from "react"
import AgentKitDemo from "@/demos/agent-kit"
import { CONTRACT_RULES, checkContract, type ContractReport } from "@/registry/tradecn/lib/agent-kit"

// The check on its own row, then on this whole page: what an agent's end-to-end test sees when it hands
// checkContract to the browser. The page button reads every rule and lists each finding with where it is.

export function AgentKitScene() {
  const [report, setReport] = useState<ContractReport | null>(null)
  return (
    <main className="flex min-h-screen flex-col gap-4 p-4 text-sm">
      <div className="flex items-center gap-3">
        <h1 className="text-sm font-semibold">agent-kit</h1>
        <button type="button" className="rounded border border-border px-2 py-1 text-xs" onClick={() => setReport(checkContract())}>
          Check this page
        </button>
      </div>
      <AgentKitDemo />
      {report && (
        <section className="flex flex-col gap-1 text-xs lining-nums tabular-nums">
          <p>Checked {CONTRACT_RULES.map((rule) => `${rule} ${report.checked[rule]}`).join(", ")}</p>
          <pre data-contract-report="" className="overflow-auto rounded border border-border p-2">
            {JSON.stringify(report.findings, null, 2)}
          </pre>
        </section>
      )}
    </main>
  )
}
