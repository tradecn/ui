# preferences

The envelope everything a trader or a desk changes without a build travels in: slots with a version and a JSON value, and a payload that says which slots may leave as a desk template, which are one person's, and which never leave a session.

## Usage

```ts
import { createPreferences, exportPreferences, importPreferences, parsePreferences, setSlot, readSlot } from "@/lib/preferences"
```

```ts
let prefs = parsePreferences(localStorage.getItem("prefs")) ?? createPreferences({ template: ["layout", "rules", "columns:blotter"], user: ["hotkeys"], session: ["threshold"] })

// Each item keeps its controlled prop; the consumer wires a slot to it.
prefs = setSlot(prefs, "layout", layout)
prefs = setSlot(prefs, "columns:blotter", columnState)
prefs = setSlot(prefs, "hotkeys", registry.overrides())
prefs = setSlot(prefs, "rules", rules)
prefs = setSlot(prefs, "threshold", threshold)
localStorage.setItem("prefs", JSON.stringify(prefs))

download("desk.json", exportPreferences(prefs, { boundary: "template" }))
prefs = importPreferences(prefs, await file.text(), { boundary: "template" }) ?? prefs
const columns = readSlot<ColumnState>(prefs, "columns:blotter")
```

## API Reference

### The envelope

`{ tradecn: "preferences", version: 1, slots, boundaries }`. Each slot is `{ version, value }`: the version of the shape as the item that owns it numbers it, and the value as JSON. `createPreferences(boundaries)` is an empty one; `parsePreferences(objectOrText)` reads a stored one back and takes nothing on trust, refusing anything that is not a version 1 envelope, dropping a slot that is not an object with a whole-number version and a JSON value, keeping the rest, and returning a copy. `setSlot(prefs, name, value, version?)` returns a new envelope with the value stored as JSON (functions and `undefined` gone) at the given version, else the slot's own, else 1, and hands back the same envelope when nothing changed, so an autosave or a subscriber comparing by identity sees no change. `getSlot`, `removeSlot`, and `diffPreferences(a, b)` (which slots were added, removed, changed, and kept, for a support view or a save prompt) round it out.

### Boundaries

Three, in the language [`workspace`](workspace.md)'s layout already uses. `template`: shareable as a desk template, handed to a colleague, restored next quarter, so nothing tied to a person or a session may be in it. `user`: belongs to the person, whichever desk they sit at. `session`: never leaves a session, whatever else does. A slot named under no boundary is the person's. `boundaryOf(prefs, name)` says where a slot goes and `withBoundary(prefs, name, boundary)` moves it. The lists travel in the payload, so a reader knows what an envelope holds without knowing who wrote it.

### Export and import

`exportPreferences(prefs, { boundary })` is the envelope as JSON text with the slots allowed out: `template` keeps the template slots alone, `user` (the default) keeps those and the person's own, and a `session` slot never goes out. `importPreferences(target, text, { boundary })` merges another envelope's slots into this one under the boundary allowed in, the incoming slot winning where both have one, its boundaries coming with it, a `session` slot never landing, and null when the text is not an envelope. `exportableSlots(prefs, boundary)` is the list either one works from.

### Versions and migrators

A shape changes between builds. A migrator per slot, `{ version, migrate(value, from) }`, is the consumer's: the version its code reads, and a function that brings an older value up or returns null to drop it. `migratePreferences(prefs, migrators)` brings every slot with a migrator up, leaves a current or newer slot alone (a newer build wrote it), and hands back the same envelope when nothing moved. `readSlot(prefs, name, migrator?)` is one slot's value at the version the code reads, through the migrator when the stored one is older, and undefined when the slot is missing, newer than the migrator reads, or dropped; it does not write the envelope.

### The slots are the items' own shapes

Nothing here knows what a slot holds. A workspace slot is a `WorkspaceLayout`, a grid's is a `ColumnState`, the hotkeys' is `HotkeyOverrides`, the rules' is `GridRules`, a threshold is a number, each the export of the item that owns it, so the item's own parser (`parseWorkspaceLayout`, for one) is what checks a slot's value before it reaches a prop. The demo carries one envelope with a layout, two grids' column states, hotkey overrides, rules, and a threshold.

### What it does not do

It is not a store and not a provider. It does not subscribe, notify, or persist. Where the envelope lives, `localStorage`, a file in a desktop shell, a server, and when it is written, are the consumer's. The items keep their controlled props; a slot is wired to a prop by the consumer, and a change on either side is a `setSlot` and a `readSlot` away.
