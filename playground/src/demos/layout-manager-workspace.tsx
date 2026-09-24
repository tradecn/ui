import { useState } from "react"
import { createPreferences, parsePreferences, withBoundary } from "@/registry/tradecn/lib/preferences"
import type { WorkspaceLayout } from "@/registry/tradecn/lib/workspace-layout"
import { LayoutManager, readLayoutTemplates, writeLayoutTemplates } from "@/registry/tradecn/ui/layout-manager"
import { PanelContent } from "@/registry/tradecn/ui/panel"
import { Workspace, useWorkspacePanel, type WorkspaceApi } from "@/registry/tradecn/ui/workspace"

const STORAGE_KEY = "tradecn-layout-manager-example"

function Book() {
  const panel = useWorkspacePanel()
  return (
    <PanelContent className="p-3">
      <label className="flex flex-col gap-2 text-xs">
        Symbol for {panel.title}
        <input className="min-w-0 rounded border border-input bg-background px-2 py-1" value={String(panel.state.symbol ?? "")} onChange={(event) => panel.setState({ symbol: event.target.value })} />
      </label>
    </PanelContent>
  )
}

const PANELS = { book: Book }

function seed(api: WorkspaceApi) {
  api.addPanel({ kind: "book", id: "book-1", title: "Treasuries", state: { symbol: "ZN" }, focus: false })
}

export default function LayoutManagerWorkspaceDemo() {
  const [api, setApi] = useState<WorkspaceApi | null>(null)
  const [current, setCurrent] = useState<WorkspaceLayout | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [message, setMessage] = useState("Template changes are saved in this browser.")
  const [exported, setExported] = useState("")
  const [prefs, setPrefs] = useState(() => {
    try {
      return withBoundary(parsePreferences(localStorage.getItem(STORAGE_KEY)) ?? createPreferences(), "layouts", "template")
    } catch {
      return createPreferences({ template: ["layouts"] })
    }
  })

  return (
    <>
      <div data-demo-controls className="flex flex-wrap gap-2 text-xs">
        <button type="button" className="rounded border px-2 py-1 disabled:opacity-50" disabled={!api} onClick={() => {
          if (!api) return
          api.addPanel({ kind: "book", id: "equities", title: "Equities", state: { symbol: "ES" }, position: { direction: "right" }, focus: false })
          setCurrent(api.toLayout())
        }}>Add equities book</button>
      </div>
      <div className="w-[42rem] max-w-full space-y-3 text-xs lining-nums tabular-nums">
        <Workspace
          className="h-56 rounded-md border border-border"
          panels={PANELS}
          seed={seed}
          onReady={(next) => { setApi(next); setCurrent(next.toLayout()) }}
          onLayoutChange={setCurrent}
          onLayoutError={() => setMessage("Could not capture or restore the workspace.")}
          watermark="No panels. Reset to default to start again."
        />
        <div role="region" aria-label="Workspace layout controls" tabIndex={0} className="overflow-x-auto">
          <LayoutManager
            className="min-w-[32rem]"
            templates={readLayoutTemplates(prefs)}
            onTemplatesChange={(templates) => {
              const next = writeLayoutTemplates(prefs, templates)
              setPrefs(next)
              if (!templates.some((template) => template.id === activeId)) setActiveId(null)
              try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
                setMessage("Template list saved in this browser.")
              } catch {
                setMessage("Template list changed, but browser storage is unavailable.")
              }
            }}
            current={current}
            kinds={Object.keys(PANELS)}
            activeId={activeId}
            onLoad={(layout, template) => {
              if (!api) return
              const loaded = api.load(layout)
              setCurrent(api.toLayout())
              setActiveId(loaded ? template.id : null)
              setMessage(loaded ? `Loaded ${template.name}.` : `Could not load ${template.name}.`)
            }}
            onReset={() => {
              if (!api) return
              api.clear()
              seed(api)
              setCurrent(api.toLayout())
              setActiveId(null)
              setMessage("Default workspace restored. Saved templates are unchanged.")
            }}
            onExport={(text, template) => { setExported(text); setMessage(`Exported ${template.name}.`) }}
          />
        </div>
        <p role="status" className="text-muted-foreground">{message}</p>
        {exported && <label className="flex flex-col gap-2">Exported layout JSON<textarea readOnly value={exported} rows={5} className="w-full rounded border border-input bg-background p-2 font-(family-name:--tradecn-font-mono) text-xs" /></label>}
      </div>
    </>
  )
}
