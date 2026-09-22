import { useState } from "react"
import { LayoutManager, type LayoutTemplate } from "@/components/ui/layout-manager"
import { WORKSPACE_PERSISTENCE_BOUNDARIES, type WorkspaceLayout } from "@/lib/workspace-layout"

// A layout as a workspace would hand it over, without the workspace: the manager never touches the dock.
const CURRENT: WorkspaceLayout = {
  version: 1,
  kind: "tradecn-workspace",
  dockview: { grid: { root: {} }, panels: { "book-1": {}, "chart-1": {} } },
  panels: { "book-1": { kind: "book", title: "Book", state: { symbol: "ZN" } }, "chart-1": { kind: "chart", title: "Chart", state: {} } },
  boundaries: WORKSPACE_PERSISTENCE_BOUNDARIES,
}

export function LayoutManagerScene() {
  const [templates, setTemplates] = useState<LayoutTemplate[]>([])
  const [loaded, setLoaded] = useState("")
  const [exported, setExported] = useState("")
  const [resets, setResets] = useState(0)
  return (
    <div className="w-[44rem]" data-lm-loaded={loaded} data-lm-export={exported} data-lm-resets={resets}>
      <LayoutManager templates={templates} onTemplatesChange={setTemplates} current={CURRENT} kinds={["book", "chart"]} onLoad={(_, template) => setLoaded(template.name)} onExport={setExported} onReset={() => setResets((n) => n + 1)} now={() => 1_700_000_000_000} />
    </div>
  )
}
