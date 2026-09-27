import { useState } from "react"
import { WORKSPACE_PERSISTENCE_BOUNDARIES, type WorkspaceLayout } from "@/registry/tradecn/lib/workspace-layout"
import {
  LayoutManager,
  LayoutManagerItem,
  LayoutManagerName,
  LayoutManagerRenameField,
  LayoutManagerActive,
  LayoutManagerPanelCount,
  LayoutManagerSavedAt,
  LayoutManagerUnknownKinds,
  LayoutManagerLoad,
  LayoutManagerRename,
  LayoutManagerDuplicate,
  LayoutManagerDelete,
  LayoutManagerSaveName,
  LayoutManagerSave,
  LayoutManagerTaken,
  type LayoutTemplate,
} from "@/registry/tradecn/ui/layout-manager"

// A snapshot captured from a workspace with one Book panel.
const BOOK: WorkspaceLayout = {
  version: 1,
  kind: "tradecn-workspace",
  dockview: {
    grid: {
      root: { type: "branch", data: [{ type: "leaf", data: { views: ["book-1"], activeView: "book-1", id: "1" }, size: 478 }], size: 115 },
      width: 478, height: 115, orientation: "HORIZONTAL",
    },
    panels: { "book-1": { id: "book-1", contentComponent: "tradecn-panel", tabComponent: "props.defaultTabComponent", title: "Book" } },
    activeGroup: "1",
  },
  panels: { "book-1": { kind: "book", title: "Book", state: { symbol: "ZN" } } },
  boundaries: WORKSPACE_PERSISTENCE_BOUNDARIES,
}

export default function LayoutManagerDemo() {
  const [templates, setTemplates] = useState<LayoutTemplate[]>([{ id: "t-1", name: "Treasury book", layout: BOOK, savedAt: Date.parse("2026-09-22T14:00:00Z") }])
  const [current, setCurrent] = useState(BOOK)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [message, setMessage] = useState("Current snapshot: one ZN book.")

  return (
    <div className="w-[36rem] max-w-full space-y-3 text-xs lining-nums tabular-nums">
      <LayoutManager
        templates={templates}
        onTemplatesChange={(next) => {
          const previous = templates.find((template) => template.id === activeId)
          const active = next.find((template) => template.id === activeId)
          const layout = JSON.stringify(active?.layout)
          if (!active || (layout !== JSON.stringify(previous?.layout) && layout !== JSON.stringify(current))) setActiveId(null)
          setTemplates(next)
        }}
        current={current}
        kinds={["book"]}
        activeId={activeId}
        onLoad={(layout, template) => {
          setCurrent(layout)
          setActiveId(template.id)
          setMessage(`Selected ${template.name}.`)
        }}
      >
        <div className="flex items-center gap-1"><LayoutManagerSaveName className="min-w-40 flex-1" /><LayoutManagerSave /></div>
        <LayoutManagerTaken />
        {templates.length === 0 ? <p className="text-muted-foreground">No saved layouts. Save the current one under a name.</p> : <ul className="divide-y divide-border rounded-md border border-border">
          {templates.map((template) => <li key={template.id}>
            <LayoutManagerItem templateId={template.id} className="px-2 py-2">
              <LayoutManagerName /><LayoutManagerRenameField /><LayoutManagerActive />
              <LayoutManagerPanelCount /><LayoutManagerSavedAt /><LayoutManagerUnknownKinds />
              <div className="flex w-full flex-wrap items-center gap-1">
                <LayoutManagerLoad /><LayoutManagerRename /><LayoutManagerDuplicate /><LayoutManagerDelete />
              </div>
            </LayoutManagerItem>
          </li>)}
        </ul>}
      </LayoutManager>
      <p role="status" className="text-muted-foreground">{message}</p>
    </div>
  )
}
