import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { createPreferences, exportPreferences, parsePreferences, type Preferences } from "@/registry/tradecn/lib/preferences"
import type { WorkspaceLayout } from "@/registry/tradecn/lib/workspace-layout"
import { LayoutManager, readLayoutTemplates, writeLayoutTemplates } from "@/registry/tradecn/ui/layout-manager"
import { PanelContent, PanelHeader } from "@/registry/tradecn/ui/panel"
import { Workspace, useWorkspacePanel, type WorkspaceApi } from "@/registry/tradecn/ui/workspace"

// A workspace and its layouts. The list lives in a preferences envelope kept in localStorage here, under
// the template boundary, so an export of the envelope carries the desk's layouts and a reload keeps them.
// A third panel kind the workspace does not know can be imported, to see the warning before a load.

const STORAGE_KEY = "tradecn-playground-layout-manager"

function Book() {
  const panel = useWorkspacePanel()
  return (
    <>
      <PanelHeader>
        <span className="text-xs font-medium">{panel.title}</span>
      </PanelHeader>
      <PanelContent>
        <p className="p-2 text-xs text-muted-foreground">A book of {String(panel.state.symbol ?? "ZN")}.</p>
      </PanelContent>
    </>
  )
}

function Chart() {
  const panel = useWorkspacePanel()
  return (
    <>
      <PanelHeader>
        <span className="text-xs font-medium">{panel.title}</span>
      </PanelHeader>
      <PanelContent>
        <p className="p-2 text-xs text-muted-foreground">A chart.</p>
      </PanelContent>
    </>
  )
}

const PANELS = { book: Book, chart: Chart }

function seed(api: WorkspaceApi) {
  api.addPanel({ kind: "book", id: "book-1", title: "Book", state: { symbol: "ZN" }, focus: false })
  api.addPanel({ kind: "chart", id: "chart-1", title: "Chart", position: { reference: "book-1", direction: "right" }, focus: false })
}

export function LayoutManagerScene() {
  const api = useRef<WorkspaceApi | null>(null)
  const [prefs, setPrefs] = useState<Preferences>(() => parsePreferences(localStorage.getItem(STORAGE_KEY)) ?? createPreferences({ template: ["layouts"] }))
  const [current, setCurrent] = useState<WorkspaceLayout | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [log, setLog] = useState("")
  const templates = readLayoutTemplates(prefs)
  const keep = (next: Preferences) => {
    setPrefs(next)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }
  return (
    <main className="flex h-screen flex-col gap-3 p-4 font-(family-name:--tradecn-font-mono) text-xs">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-sm font-semibold">layout-manager</h1>
        <span className="text-muted-foreground">Arrange the panels, save the arrangement under a name, change it, load it back. The list is a preferences slot kept in localStorage.</span>
        <span className="ml-auto text-muted-foreground">{log}</span>
        <Button type="button" variant="outline" size="sm" onClick={() => api.current?.addPanel({ kind: "book", title: "Book", state: { symbol: "ES" } })}>
          Add a book
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => api.current?.addPanel({ kind: "chart", title: "Chart", position: { direction: "below" } })}>
          Add a chart
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => navigator.clipboard?.writeText(exportPreferences(prefs, { boundary: "template" })).then(() => setLog("the envelope's template export is on the clipboard"))}>
          Export the envelope
        </Button>
      </div>
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[1fr_26rem]">
        <Workspace className="min-h-0" panels={PANELS} seed={seed} onReady={(a) => (api.current = a)} onLayoutChange={setCurrent} />
        <LayoutManager
          className="min-h-0 overflow-auto"
          templates={templates}
          onTemplatesChange={(next) => keep(writeLayoutTemplates(prefs, next))}
          current={current}
          kinds={Object.keys(PANELS)}
          activeId={activeId}
          onLoad={(layout, template) => {
            const ok = api.current?.load(layout)
            setActiveId(ok ? template.id : null)
            setLog(ok ? `loaded ${template.name}` : `the workspace refused ${template.name}`)
          }}
          onReset={() => {
            if (!api.current) return
            api.current.clear()
            seed(api.current)
            setActiveId(null)
            setLog("back to the default")
          }}
          onExport={(text, template) => navigator.clipboard?.writeText(text).then(() => setLog(`${template.name} is on the clipboard`))}
        />
      </div>
    </main>
  )
}
