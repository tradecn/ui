import { useState } from "react"
import { PanelContent } from "@/registry/tradecn/ui/panel"
import { Workspace, useWorkspacePanel, type WorkspaceApi } from "@/registry/tradecn/ui/workspace"

const STORAGE_KEY = "tradecn-workspace-example"

function Watch() {
  const panel = useWorkspacePanel()
  return (
    <PanelContent className="p-3">
      <label className="flex flex-col gap-2">
        Starting symbol
        <input className="min-w-0 rounded border border-input bg-background px-2 py-1" value={String(panel.state.symbol ?? "")} onChange={(event) => panel.setState({ symbol: event.target.value })} />
      </label>
    </PanelContent>
  )
}

const PANELS = { watch: Watch }

function seed(api: WorkspaceApi) {
  const first = api.addPanel({ kind: "watch", title: "Treasuries", state: { symbol: "ZN" } })
  api.addPanel({ kind: "watch", title: "Equities", state: { symbol: "ES" }, position: { reference: first, direction: "right" } })
}

export default function WorkspaceSavedLayoutDemo() {
  const [api, setApi] = useState<WorkspaceApi | null>(null)
  const [saves, setSaves] = useState(0)
  const [error, setError] = useState("")
  const [layout] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY)
    } catch {
      return null
    }
  })
  return (
    <>
      <div data-demo-controls className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={!api} className="rounded border border-border px-2 py-1 text-xs hover:bg-muted" onClick={() => {
          if (!api) return
          api.clear()
          seed(api)
        }}>Reset layout</button>
        <span className="text-xs text-muted-foreground lining-nums tabular-nums" role="status">{error || `Saves: ${saves}`}</span>
      </div>
      <Workspace
        className="h-64 rounded-md border border-border"
        panels={PANELS}
        seed={seed}
        defaultLayout={layout}
        onReady={setApi}
        onLayoutChange={(next) => {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
          setSaves((count) => count + 1)
          setError("")
        }}
        onLayoutError={() => setError("Could not save or restore the layout.")}
        watermark="No panels. Reset the layout to start again."
      />
    </>
  )
}
