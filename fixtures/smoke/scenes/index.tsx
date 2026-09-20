import type { ComponentType } from "react"
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
]
export const tokens: string[] = []
