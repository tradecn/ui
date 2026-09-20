import type { ComponentType } from "react"

export interface SmokeScene {
  name: string
  Scene: ComponentType
}

// One entry per registry item with a UI, added as items land. Tokens are the cssVars the items declare.
export const scenes: SmokeScene[] = []
export const tokens: string[] = []
