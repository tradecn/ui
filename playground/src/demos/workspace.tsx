import { PanelContent } from "@/registry/tradecn/ui/panel"
import { Workspace } from "@/registry/tradecn/ui/workspace"

function Orders() {
  return <PanelContent className="p-3">No open orders.</PanelContent>
}

function Positions() {
  return <PanelContent className="p-3">No positions.</PanelContent>
}

const PANELS = { orders: Orders, positions: Positions }

export default function WorkspaceDemo() {
  return (
    <Workspace
      className="h-64 rounded-md border border-border"
      panels={PANELS}
      watermark="No panels."
      seed={(api) => {
        const orders = api.addPanel({ kind: "orders", title: "Orders" })
        api.addPanel({ kind: "positions", title: "Positions", position: { reference: orders, direction: "right" } })
      }}
    />
  )
}
