import type { ComponentType } from "react"
import { DataGridScene } from "./data-grid"
import { FeedHealthScene } from "./feed-health"
import { FlashCellScene } from "./flash-cell"
import { FormatScene } from "./format"
import { RowStoreScene } from "./row-store"

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
}
