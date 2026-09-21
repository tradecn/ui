import type { ComponentType } from "react"
import { CommandPaletteScene } from "./command-palette"
import { DataGridScene } from "./data-grid"
import { FeedHealthScene } from "./feed-health"
import { FlashCellScene } from "./flash-cell"
import { FormatScene } from "./format"
import { PanelScene } from "./panel"
import { RowStoreScene } from "./row-store"
import { SparklineScene } from "./sparkline"
import { UseHotkeysScene } from "./use-hotkeys"
import { WatchlistScene } from "./watchlist"

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
]
export const tokens: string[] = ["up", "down", "flat", "up-soft", "down-soft", "flat-soft", "stale", "stale-soft", "panel-active", "panel-drag-target", "panel-error", "panel-sync", "link-1", "link-2", "link-3", "link-4"]
