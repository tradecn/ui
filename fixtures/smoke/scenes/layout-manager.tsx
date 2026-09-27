import { useState } from "react"
import { Button } from "@/components/ui/button"
import { LayoutManager, LayoutManagerActive, LayoutManagerDelete, LayoutManagerDuplicate, LayoutManagerImportContent, LayoutManagerImportName, LayoutManagerImportProblem, LayoutManagerImportSubmit, LayoutManagerImportText, LayoutManagerImportTrigger, LayoutManagerItem, LayoutManagerLoad, LayoutManagerName, LayoutManagerPanelCount, LayoutManagerRename, LayoutManagerRenameField, LayoutManagerSave, LayoutManagerSaveName, LayoutManagerSavedAt, LayoutManagerTaken, LayoutManagerUnknownKinds, exportTemplate, useLayoutManager, useLayoutManagerItem, type LayoutTemplate } from "@/components/ui/layout-manager"
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
      <LayoutManager templates={templates}
          onTemplatesChange={setTemplates}
          current={CURRENT}
          kinds={["book", "chart"]}
          onLoad={(_, template) => setLoaded(template.name)}
          now={() => 1_700_000_000_000}><LayoutManagerControls onExport={setExported}
          onReset={() => setResets((n) => n + 1)} /></LayoutManager>
    </div>
  )
}

function LayoutManagerControls({ onReset, onExport }: { onReset?: () => void; onExport?: (text: string, template: LayoutTemplate) => void }) {
  const { templates, labels } = useLayoutManager()
  return <>
    <div className="flex flex-wrap items-center gap-1">
      <LayoutManagerSaveName className="min-w-40 flex-1" />
      <LayoutManagerSave />
      {onReset && <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" data-layout-reset="" onClick={onReset}>{labels.reset}</Button>}
      <LayoutManagerImportTrigger />
    </div>
    <LayoutManagerTaken />
    <LayoutManagerImportContent>
      <LayoutManagerImportText />
      <div className="flex items-center gap-1"><LayoutManagerImportName className="flex-1" /><LayoutManagerImportSubmit /></div>
      <LayoutManagerImportProblem />
    </LayoutManagerImportContent>
    {templates.length === 0 ? <p className="text-muted-foreground">{labels.empty}</p> : <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
      {templates.map((template) => <li key={template.id}>
        <LayoutManagerItem templateId={template.id} className="px-2 py-1.5">
          <LayoutManagerName /><LayoutManagerRenameField /><LayoutManagerActive />
          <LayoutManagerPanelCount /><LayoutManagerSavedAt /><LayoutManagerUnknownKinds />
          <span className="ms-auto flex flex-wrap items-center gap-0.5">
            <LayoutManagerLoad /><LayoutManagerRename /><LayoutManagerDuplicate />
            {onExport && <TemplateExport onExport={onExport} />}
            <LayoutManagerDelete />
          </span>
        </LayoutManagerItem>
      </li>)}
    </ul>}
  </>
}

function TemplateExport({ onExport }: { onExport: (text: string, template: LayoutTemplate) => void }) {
  const { template } = useLayoutManagerItem()
  const { labels } = useLayoutManager()
  return <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" aria-label={`${labels.export}: ${template.name}`} onClick={() => onExport(exportTemplate(template), template)}>{labels.export}</Button>
}
