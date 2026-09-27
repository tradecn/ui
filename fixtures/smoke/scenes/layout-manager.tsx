import { useState } from "react"
import { Button } from "@/components/ui/button"
import { LayoutManager, LayoutManagerActive, LayoutManagerDelete, LayoutManagerDuplicate, LayoutManagerImportContent, LayoutManagerImportName, LayoutManagerImportProblem, LayoutManagerImportSubmit, LayoutManagerImportText, LayoutManagerImportTrigger, LayoutManagerItem, LayoutManagerLoad, LayoutManagerName, LayoutManagerPanelCount, LayoutManagerRename, LayoutManagerRenameField, LayoutManagerSave, LayoutManagerSaveName, LayoutManagerSavedAt, LayoutManagerTaken, LayoutManagerUnknownKinds, exportTemplate, useLayoutManager, useLayoutManagerItem, type LayoutTemplate } from "@/components/ui/layout-manager"
import { HotkeysProvider, useHotkey } from "@/hooks/use-hotkeys"
import type { HotkeyBinding } from "@/lib/hotkeys"
import { WORKSPACE_PERSISTENCE_BOUNDARIES, type WorkspaceLayout } from "@/lib/workspace-layout"

// A layout as a workspace would hand it over, without the workspace: the manager never touches the dock.
const CURRENT: WorkspaceLayout = {
  version: 1,
  kind: "tradecn-workspace",
  dockview: { grid: { root: {} }, panels: { "book-1": {}, "chart-1": {} } },
  panels: { "book-1": { kind: "book", title: "Book", state: { symbol: "ZN" } }, "chart-1": { kind: "chart", title: "Chart", state: {} } },
  boundaries: WORKSPACE_PERSISTENCE_BOUNDARIES,
}

// The command palette elsewhere on the smoke page owns mod+k.
const BINDINGS: HotkeyBinding[] = [{ id: "layout.rename", keys: "mod+shift+k", scope: "editing", description: "Name shortcut" }]

export function LayoutManagerScene() {
  return <HotkeysProvider bindings={BINDINGS}><Layouts /></HotkeysProvider>
}

function Layouts() {
  const [templates, setTemplates] = useState<LayoutTemplate[]>([])
  const [loaded, setLoaded] = useState("")
  const [exported, setExported] = useState("")
  const [resets, setResets] = useState(0)
  const [shortcuts, setShortcuts] = useState(0)
  useHotkey("layout.rename", () => setShortcuts((count) => count + 1))
  return (
    <div className="w-[44rem] space-y-4" data-lm-loaded={loaded} data-lm-export={exported} data-lm-resets={resets} data-lm-shortcuts={shortcuts}>
      <LayoutManager
        templates={templates}
        onTemplatesChange={setTemplates}
        current={CURRENT}
        kinds={["book", "chart"]}
        onLoad={(_, template) => setLoaded(template.name)}
        now={() => 1_700_000_000_000}
      >
        <LayoutManagerControls onExport={setExported} onReset={() => setResets((n) => n + 1)} />
      </LayoutManager>
      <LayoutManager aria-label="Layout cards" className="grid grid-cols-2 gap-3" templates={templates} onTemplatesChange={setTemplates} current={CURRENT} onLoad={(_, template) => setLoaded(template.name)}>
        <aside className="flex min-w-0 flex-col gap-2">
          <LayoutManagerSaveName /><LayoutManagerSave />
          <LayoutManagerImportText /><LayoutManagerImportName aria-label="Imported layout name" /><LayoutManagerImportSubmit /><LayoutManagerImportProblem />
        </aside>
        <ul className="grid gap-2">
          {templates.toReversed().map((template) => <li key={template.id}>
            <LayoutManagerItem templateId={template.id} className="rounded border p-2"><LayoutManagerName /><LayoutManagerLoad /></LayoutManagerItem>
          </li>)}
        </ul>
      </LayoutManager>
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
