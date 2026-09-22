import type { ComponentType } from "react"
import { AlertStoreScene } from "./alert-store"
import { AlertsScene } from "./alerts"
import { BlotterScene } from "./blotter"
import { ColumnChooserScene } from "./column-chooser"
import { CommandPaletteScene } from "./command-palette"
import { CountdownScene } from "./countdown"
import { DataGridScene } from "./data-grid"
import { FeedHealthScene } from "./feed-health"
import { FlashCellScene } from "./flash-cell"
import { FormatScene } from "./format"
import { GridRulesScene } from "./grid-rules"
import { HotkeyEditorScene } from "./hotkey-editor"
import { PanelScene } from "./panel"
import { PerfMonitorScene } from "./perf-monitor"
import { PreferencesScene } from "./preferences"
import { QuoteFieldScene } from "./quote-field"
import { RfqStackScene } from "./rfq-stack"
import { RfqTicketScene } from "./rfq-ticket"
import { RowStoreScene } from "./row-store"
import { RulesEditorScene } from "./rules-editor"
import { SparklineScene } from "./sparkline"
import { TicketScene } from "./ticket"
import { UseHotkeysScene } from "./use-hotkeys"
import { WatchlistScene } from "./watchlist"
import { WorkspaceScene } from "./workspace"

export interface SmokeScene {
  name: string
  Scene: ComponentType
}

// One entry per registry item, added as items land. Tokens are the cssVars the items declare.
export const scenes: SmokeScene[] = [
  { name: "format", Scene: FormatScene },
  { name: "row-store", Scene: RowStoreScene },
  { name: "flash-cell", Scene: FlashCellScene },
  { name: "data-grid", Scene: DataGridScene },
  { name: "feed-health", Scene: FeedHealthScene },
  { name: "use-hotkeys", Scene: UseHotkeysScene },
  { name: "command-palette", Scene: CommandPaletteScene },
  { name: "panel", Scene: PanelScene },
  { name: "sparkline", Scene: SparklineScene },
  { name: "watchlist", Scene: WatchlistScene },
  { name: "blotter", Scene: BlotterScene },
  { name: "workspace", Scene: WorkspaceScene },
  { name: "ticket", Scene: TicketScene },
  { name: "countdown", Scene: CountdownScene },
  { name: "quote-field", Scene: QuoteFieldScene },
  { name: "rfq-ticket", Scene: RfqTicketScene },
  { name: "rfq-stack", Scene: RfqStackScene },
  { name: "perf-monitor", Scene: PerfMonitorScene },
  { name: "hotkey-editor", Scene: HotkeyEditorScene },
  { name: "column-chooser", Scene: ColumnChooserScene },
  { name: "rules-editor", Scene: RulesEditorScene },
  { name: "alerts", Scene: AlertsScene },
  { name: "grid-rules", Scene: GridRulesScene },
  { name: "preferences", Scene: PreferencesScene },
  { name: "alert-store", Scene: AlertStoreScene },
]
export const tokens: string[] = ["up", "down", "flat", "up-soft", "down-soft", "flat-soft", "stale", "stale-soft", "expiring", "expiring-soft", "panel-active", "panel-drag-target", "panel-error", "panel-sync", "link-1", "link-2", "link-3", "link-4"]
