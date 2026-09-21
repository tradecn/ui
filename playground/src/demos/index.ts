import type { ComponentType } from "react"

// One demo per item, the file named for the item: playground/src/demos/<item>.tsx, default export.
// tradecn.dev embeds each one at /preview/<item>/ and shows its source under the Code tab, so a demo
// is written to be read as well as run. Anything shared lives under demos/shared/, which the glob skips.
type Loader = () => Promise<{ default: ComponentType }>

const modules = import.meta.glob<{ default: ComponentType }>("./*.tsx")

export const demos: Record<string, Loader> = Object.fromEntries(
  Object.entries(modules).map(([path, load]) => [path.slice("./".length, -".tsx".length), load]),
)
