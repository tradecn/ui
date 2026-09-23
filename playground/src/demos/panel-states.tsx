import { useState } from "react"
import { Panel, PanelContent, PanelHeader, PanelTitle } from "@/registry/tradecn/ui/panel"

export default function PanelStatesDemo() {
  const [active, setActive] = useState("auto")
  const [dragTarget, setDragTarget] = useState(false)
  const [error, setError] = useState(false)
  return (
    <>
      <div data-demo-controls className="text-xs">
        <label className="flex items-center gap-2">
          Active border
          <select className="rounded border border-border bg-background px-2 py-1" value={active} onChange={(event) => setActive(event.target.value)}>
            <option value="auto">Follow focus</option>
            <option value="active">Always active</option>
            <option value="inactive">Always inactive</option>
          </select>
        </label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={dragTarget} onChange={(event) => setDragTarget(event.target.checked)} />Drag target</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={error} onChange={(event) => setError(event.target.checked)} />Error</label>
      </div>
      <Panel kind="states" className="h-40 w-72 max-w-full" active={active === "auto" ? undefined : active === "active"} dragTarget={dragTarget} error={error}>
        <PanelHeader><PanelTitle>Border states</PanelTitle></PanelHeader>
        <PanelContent className="p-3 text-sm">
          <label className="flex flex-col gap-2">Note<input className="min-w-0 rounded border border-input bg-background px-2 py-1" placeholder="Focus here" /></label>
        </PanelContent>
      </Panel>
    </>
  )
}
