import type { ComponentType } from "react"
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
  "row-store": { title: "row-store", Scene: RowStoreScene },
}
