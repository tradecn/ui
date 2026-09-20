import type { ComponentType } from "react"
import { FormatScene } from "./format"

export interface ItemScene {
  title: string
  Scene: ComponentType
}

// Each registry item registers one scene here as it lands.
export const items: Record<string, ItemScene> = {
  format: { title: "format", Scene: FormatScene },
}
