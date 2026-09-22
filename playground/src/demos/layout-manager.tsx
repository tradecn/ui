import { useRef, useState } from "react"
import { createPreferences, type Preferences } from "@/registry/tradecn/lib/preferences"
import type { WorkspaceLayout } from "@/registry/tradecn/lib/workspace-layout"
import { LayoutManager, readLayoutTemplates, writeLayoutTemplates } from "@/registry/tradecn/ui/layout-manager"
import { PanelContent, PanelHeader } from "@/registry/tradecn/ui/panel"
import { Workspace, useWorkspacePanel, type WorkspaceApi } from "@/registry/tradecn/ui/workspace"

// A workspace and its layouts side by side. Arrange the panels, save the arrangement under a name, change
// it, load the name back. The list lives in a preferences envelope the demo keeps in state; a real desk
// stores that envelope wherever it stores the rest.

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

export default function LayoutManagerDemo() {
  const api = useRef<WorkspaceApi | null>(null)
  const [prefs, setPrefs] = useState<Preferences>(() => createPreferences({ template: ["layouts"] }))
  const [current, setCurrent] = useState<WorkspaceLayout | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const templates = readLayoutTemplates(prefs)
  return (
    <div className="grid h-80 gap-3 font-(family-name:--tradecn-font-mono) text-xs md:grid-cols-[1fr_22rem]">
      <div className="flex flex-col gap-1">
        <div className="flex gap-2">
          <button type="button" className="rounded border border-border px-2 py-0.5" onClick={() => api.current?.addPanel({ kind: "book", title: "Book", state: { symbol: "ES" } })}>
            add a book
          </button>
          <button type="button" className="rounded border border-border px-2 py-0.5" onClick={() => api.current?.addPanel({ kind: "chart", title: "Chart", position: { direction: "below" } })}>
            add a chart
          </button>
        </div>
        <Workspace className="min-h-0 flex-1" panels={PANELS} seed={seed} onReady={(a) => (api.current = a)} onLayoutChange={setCurrent} />
      </div>
      <LayoutManager
        templates={templates}
        onTemplatesChange={(next) => setPrefs(writeLayoutTemplates(prefs, next))}
        current={current}
        kinds={Object.keys(PANELS)}
        activeId={activeId}
        onLoad={(layout, template) => {
          api.current?.load(layout)
          setActiveId(template.id)
        }}
        onReset={() => {
          if (!api.current) return
          api.current.clear()
          seed(api.current)
          setActiveId(null)
        }}
        onExport={(text) => navigator.clipboard?.writeText(text)}
      />
    </div>
  )
}
