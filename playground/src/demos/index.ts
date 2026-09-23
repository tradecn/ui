import type { ComponentType } from "react"

// One demo per item, the file named for the item: playground/src/demos/<item>.tsx, default export. A variant
// of an item worth a block of its own on the page is a demo of its own, <item>-<variant>.tsx, placed where
// the item's doc says `<!-- demo: <item>-<variant> -->`. tradecn.dev embeds each one at /preview/<name>/ and
// shows its source under the Code tab, so a demo is written to be read as well as run, and kept small enough
// to paste whole; where it repeats a control, each copy carries its own accessible name (a `label` per row),
// since a screen reader walks them as a list. frame.json beside the demos names the frame contract they are
// written to (centered: a demo that wants the frame's width says w-full on its root, and its controls come first
// in a data-demo-controls element the frame pins in a bar), since tradecn.dev builds every tag's pages with main's
// template and a republished older tag, which has no marker, gets its demos stretched instead. Anything shared
// lives under demos/shared/, which the glob skips.
type Loader = () => Promise<{ default: ComponentType }>

const modules = import.meta.glob<{ default: ComponentType }>("./*.tsx")

export const demos: Record<string, Loader> = Object.fromEntries(
  Object.entries(modules).map(([path, load]) => [path.slice("./".length, -".tsx".length), load]),
)
