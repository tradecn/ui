import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { PanelContent } from "@/registry/tradecn/ui/panel"
import { Workspace, WorkspaceTab, WorkspaceTabActions, WorkspaceTabTitle, useWorkspacePanel, useWorkspaceTab } from "@/registry/tradecn/ui/workspace"

function Quotes() {
  const panel = useWorkspacePanel()
  return <PanelContent className="p-3">Following {String(panel.state.symbol ?? "no symbol")}.</PanelContent>
}

const PANELS = { quotes: Quotes }

export default function WorkspaceTabControlsDemo() {
  return (
    <Workspace
      className="isolate h-64 rounded-md border border-border"
      panels={PANELS}
      tabComponent={QuoteTab}
      watermark="No panels."
      seed={(api) => {
        const first = api.addPanel({ kind: "quotes", title: "Treasuries", state: { symbol: "ZN" }, focus: false })
        api.addPanel({ kind: "quotes", title: "Equities", state: { symbol: "ES" }, position: { reference: first, direction: "within" }, focus: false })
      }}
    />
  )
}

export function QuoteTab() {
  const panel = useWorkspaceTab()
  return (
    <WorkspaceTab className="gap-2">
      <WorkspaceTabActions>
        <DropdownMenu>
          <DropdownMenuTrigger aria-label={`Actions for ${panel.title}`} className="inline-flex size-5 items-center justify-center rounded-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50">…</DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem disabled={panel.location !== "grid"} onClick={() => panel.float()}>Float panel</DropdownMenuItem>
            <DropdownMenuItem disabled={panel.location !== "grid"} onClick={panel.toggleMaximize}>Maximize / restore</DropdownMenuItem>
            <DropdownMenuItem onClick={panel.close}>Close panel</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </WorkspaceTabActions>
      <WorkspaceTabTitle />
      {panel.tabLocation === "header" && <WorkspaceTabActions>
        <input
          aria-label={`Symbol for ${panel.title}`}
          className="h-6 w-12 rounded border border-input bg-background px-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          value={String(panel.state?.symbol ?? "")}
          onChange={(event) => panel.setState({ symbol: event.target.value || undefined })}
        />
      </WorkspaceTabActions>}
    </WorkspaceTab>
  )
}
