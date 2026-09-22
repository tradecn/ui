import type { ComponentType } from "react"
import { AlertStoreScene } from "./alert-store"
import { AlertsScene } from "./alerts"
import { AuditTrailScene } from "./audit-trail"
import { BlotterScene } from "./blotter"
import { ColumnChooserScene } from "./column-chooser"
import { CommandPaletteScene } from "./command-palette"
import { CountdownScene } from "./countdown"
import { DataGridScene } from "./data-grid"
import { DepthLadderScene } from "./depth-ladder"
import { FeedHealthScene } from "./feed-health"
import { FlashCellScene } from "./flash-cell"
import { FormatScene } from "./format"
import { GridRulesScene } from "./grid-rules"
import { HotkeyEditorScene } from "./hotkey-editor"
import { InstrumentSearchScene } from "./instrument-search"
import { LayoutManagerScene } from "./layout-manager"
import { LimitsScene } from "./limits"
import { PanelScene } from "./panel"
import { ParameterGridScene } from "./parameter-grid"
import { PerfMonitorScene } from "./perf-monitor"
import { PositionsScene } from "./positions"
import { PreferencesScene } from "./preferences"
import { QuoteFieldScene } from "./quote-field"
import { RfqStackScene } from "./rfq-stack"
import { RfqTicketScene } from "./rfq-ticket"
import { RowStoreScene } from "./row-store"
import { RulesEditorScene } from "./rules-editor"
import { SessionCalendarScene } from "./session-calendar"
import { SparklineScene } from "./sparkline"
import { StatusBarScene } from "./status-bar"
import { TicketScene } from "./ticket"
import { TradecnSlateScene } from "./tradecn-slate"
import { TradecnSlateEastScene } from "./tradecn-slate-east"
import { TradecnAmberScene } from "./tradecn-amber"
import { UseHotkeysScene } from "./use-hotkeys"
import { WatchlistScene } from "./watchlist"
import { WorkspaceScene } from "./workspace"

export interface ItemScene {
  title: string
  Scene: ComponentType
}

// Each registry item registers one scene here as it lands.
export const items: Record<string, ItemScene> = {
  format: { title: "format", Scene: FormatScene },
  "flash-cell": { title: "flash-cell", Scene: FlashCellScene },
  "data-grid": { title: "data-grid", Scene: DataGridScene },
  "feed-health": { title: "feed-health", Scene: FeedHealthScene },
  "row-store": { title: "row-store", Scene: RowStoreScene },
  "use-hotkeys": { title: "use-hotkeys", Scene: UseHotkeysScene },
  "command-palette": { title: "command-palette", Scene: CommandPaletteScene },
  panel: { title: "panel", Scene: PanelScene },
  sparkline: { title: "sparkline", Scene: SparklineScene },
  watchlist: { title: "watchlist", Scene: WatchlistScene },
  blotter: { title: "blotter", Scene: BlotterScene },
  workspace: { title: "workspace", Scene: WorkspaceScene },
  ticket: { title: "ticket", Scene: TicketScene },
  countdown: { title: "countdown", Scene: CountdownScene },
  "quote-field": { title: "quote-field", Scene: QuoteFieldScene },
  "rfq-ticket": { title: "rfq-ticket", Scene: RfqTicketScene },
  "rfq-stack": { title: "rfq-stack", Scene: RfqStackScene },
  "perf-monitor": { title: "perf-monitor", Scene: PerfMonitorScene },
  "hotkey-editor": { title: "hotkey-editor", Scene: HotkeyEditorScene },
  "column-chooser": { title: "column-chooser", Scene: ColumnChooserScene },
  "rules-editor": { title: "rules-editor", Scene: RulesEditorScene },
  alerts: { title: "alerts", Scene: AlertsScene },
  "status-bar": { title: "status-bar", Scene: StatusBarScene },
  "parameter-grid": { title: "parameter-grid", Scene: ParameterGridScene },
  positions: { title: "positions", Scene: PositionsScene },
  "audit-trail": { title: "audit-trail", Scene: AuditTrailScene },
  "layout-manager": { title: "layout-manager", Scene: LayoutManagerScene },
  "instrument-search": { title: "instrument-search", Scene: InstrumentSearchScene },
  "depth-ladder": { title: "depth-ladder", Scene: DepthLadderScene },
  "grid-rules": { title: "grid-rules", Scene: GridRulesScene },
  preferences: { title: "preferences", Scene: PreferencesScene },
  "alert-store": { title: "alert-store", Scene: AlertStoreScene },
  "session-calendar": { title: "session-calendar", Scene: SessionCalendarScene },
  limits: { title: "limits", Scene: LimitsScene },
  "tradecn-slate": { title: "tradecn-slate", Scene: TradecnSlateScene },
  "tradecn-slate-east": { title: "tradecn-slate-east", Scene: TradecnSlateEastScene },
  "tradecn-amber": { title: "tradecn-amber", Scene: TradecnAmberScene },
}
