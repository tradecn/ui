import type { ComponentType } from "react"
import { FormatScene } from "./format"

export interface SmokeScene {
  name: string
  Scene: ComponentType
}

// One entry per registry item, added as items land. Tokens are the cssVars the items declare.
export const scenes: SmokeScene[] = [{ name: "format", Scene: FormatScene }]
export const tokens: string[] = []
