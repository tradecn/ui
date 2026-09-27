import { useState } from "react"
import { Button } from "@/components/ui/button"
import { WORKSPACE_PERSISTENCE_BOUNDARIES, type WorkspaceLayout } from "@/registry/tradecn/lib/workspace-layout"
import { LayoutManager, LayoutManagerItem, LayoutManagerName, LayoutManagerRenameField, LayoutManagerActive, LayoutManagerPanelCount, LayoutManagerSavedAt, LayoutManagerUnknownKinds, LayoutManagerLoad, LayoutManagerRename, LayoutManagerDuplicate, LayoutManagerDelete, LayoutManagerSaveName, LayoutManagerSave, LayoutManagerTaken, LayoutManagerImportText, LayoutManagerImportName, LayoutManagerImportSubmit, LayoutManagerImportProblem, useLayoutManagerItem, exportTemplate, type LayoutTemplate } from "@/registry/tradecn/ui/layout-manager"

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


function ExportButton({ onExport }: { onExport: (text: string) => void }) {
  const { template } = useLayoutManagerItem()
  return <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" aria-label={`Export: ${template.name}`} onClick={() => onExport(exportTemplate(template))}>Export</Button>
}

export default function LayoutManagerCardsDemo() {
  const [templates, setTemplates] = useState<LayoutTemplate[]>([
    { id: "t-1", name: "Morning", layout: BOOK, savedAt: Date.parse("2026-09-22T14:00:00Z") },
    { id: "t-2", name: "Afternoon", layout: BOOK, savedAt: Date.parse("2026-09-22T19:00:00Z") },
  ])
  const [current, setCurrent] = useState(BOOK)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [message, setMessage] = useState("Choose a template.")
  const [exported, setExported] = useState("")
  return <div className="w-[48rem] max-w-full space-y-3 text-xs lining-nums tabular-nums">
    <LayoutManager className="grid items-start gap-4 sm:grid-cols-[14rem_1fr]" templates={templates} onTemplatesChange={(next) => {
      const before = templates.find((template) => template.id === activeId)
      const after = next.find((template) => template.id === activeId)
      const layout = JSON.stringify(after?.layout)
      if (!after || (layout !== JSON.stringify(before?.layout) && layout !== JSON.stringify(current))) setActiveId(null)
      setTemplates(next)
    }} current={current} kinds={["book"]} activeId={activeId} onLoad={(layout, template) => { setCurrent(layout); setActiveId(template.id); setMessage(`Selected ${template.name}.`) }}>
      <aside className="flex min-w-0 flex-col gap-3">
        <h3 className="font-medium">Save a snapshot</h3>
        <LayoutManagerSaveName /><LayoutManagerSave /><LayoutManagerTaken />
        <h3 className="mt-2 font-medium">Import a layout</h3>
        <LayoutManagerImportText /><LayoutManagerImportName aria-label="Imported layout name" /><LayoutManagerImportSubmit /><LayoutManagerImportProblem />
      </aside>
      <div className="flex min-w-0 flex-col gap-3">
        <p className="text-muted-foreground">Saved templates in reverse list order.</p>
        {templates.length === 0 ? <p>No saved layouts.</p> : <ul className="grid gap-3">
          {templates.toReversed().map((template) => <li key={template.id}>
            <LayoutManagerItem templateId={template.id} className="flex-col items-stretch gap-3 rounded-md border border-border p-3">
              <header className="flex flex-wrap items-center gap-2"><LayoutManagerName /><LayoutManagerRenameField /><LayoutManagerActive /></header>
              <p className="flex flex-wrap gap-x-3 gap-y-1"><LayoutManagerPanelCount /><LayoutManagerSavedAt /></p>
              <LayoutManagerUnknownKinds />
              <div className="flex flex-wrap gap-1"><LayoutManagerRename /><LayoutManagerDuplicate /><ExportButton onExport={setExported} /></div>
              <footer className="flex flex-wrap justify-between gap-2"><LayoutManagerLoad /><LayoutManagerDelete /></footer>
            </LayoutManagerItem>
          </li>)}
        </ul>}
      </div>
    </LayoutManager>
    <p role="status" className="text-muted-foreground">{message}</p>
    {exported && <label className="flex flex-col gap-2">Exported layout JSON<textarea readOnly value={exported} rows={4} className="w-full rounded border border-input bg-background p-2 font-(family-name:--tradecn-font-mono) text-xs" /></label>}
  </div>
}
