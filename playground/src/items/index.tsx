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
}
