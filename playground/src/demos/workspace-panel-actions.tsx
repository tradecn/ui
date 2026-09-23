import { useState } from "react"
import { PanelActions, PanelContent, PanelHeader } from "@/registry/tradecn/ui/panel"
import { Workspace, useWorkspacePanel, type WorkspaceApi } from "@/registry/tradecn/ui/workspace"

function Notes() {
  const panel = useWorkspacePanel()
  const [note, setNote] = useState("")
  const [error, setError] = useState("")
  return (
    <>
      <PanelHeader className="h-auto min-h-7 flex-wrap py-1">
        <PanelActions className="flex-wrap gap-2">
          <button type="button" className="hover:underline disabled:opacity-50" disabled={panel.location !== "grid"} onClick={() => panel.float({ x: 8, y: 136, width: 240, height: 240 })}>Float</button>
          <button type="button" className="hover:underline disabled:opacity-50" disabled={panel.location === "popout"} onClick={async () => {
            setError("")
            if (!await panel.popout()) setError("Popout blocked. Allow popups and try again.")
          }}>Pop out</button>
          <button type="button" className="hover:underline disabled:opacity-50" disabled={panel.location !== "grid"} onClick={panel.toggleMaximize}>Maximize / restore</button>
        </PanelActions>
      </PanelHeader>
      <PanelContent className="space-y-2 p-3">
        <p>Location: {panel.location}</p>
        <label className="flex flex-col gap-2">
          Note
          <input className="min-w-0 rounded border border-input bg-background px-2 py-1" value={note} onChange={(event) => setNote(event.target.value)} />
        </label>
        {error && <p role="alert">{error}</p>}
      </PanelContent>
    </>
  )
}

const PANELS = { notes: Notes }

function seed(api: WorkspaceApi) {
  const first = api.addPanel({ kind: "notes", title: "Desk notes" })
  api.addPanel({ kind: "notes", title: "Handoff notes", position: { reference: first, direction: "below" } })
}

export default function WorkspacePanelActionsDemo() {
  const [api, setApi] = useState<WorkspaceApi | null>(null)
  return (
    <>
      <div data-demo-controls>
        <button type="button" disabled={!api} className="rounded border border-border px-2 py-1 text-xs hover:bg-muted" onClick={() => {
          if (!api) return
          api.clear()
          seed(api)
        }}>Reset layout</button>
      </div>
      <Workspace className="h-96 rounded-md border border-border" panels={PANELS} seed={seed} onReady={setApi} watermark="No docked panels. Reset the layout to start again." />
    </>
  )
}
