import type { ComponentType } from "react"
import { DataGridScene } from "./data-grid"
import { FlashCellScene } from "./flash-cell"
import { FormatScene } from "./format"
import { RowStoreScene } from "./row-store"

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
]
export const tokens: string[] = ["up", "down", "flat", "up-soft", "down-soft", "flat-soft"]
