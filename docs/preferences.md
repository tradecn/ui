# preferences

Keep trader and desk settings in versioned JSON slots, with boundaries for desk templates, personal settings, and session values.

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

`Preferences` is `{ tradecn: "preferences", version: 1, slots, boundaries }`. The marker and envelope version are exported as `PREFERENCES_MARK` and `PREFERENCES_VERSION`.

`slots` is a `Record<string, PreferenceSlot>`. Each slot has its own numeric `version` and a `value` of type `PreferencesJson`: a JSON primitive, array, or object. The item that owns the value defines its shape and version, separately from the envelope version.

In the functions below, `prefs`, `target`, `a`, and `b` are `Preferences`; slot names are strings.

| Function | Inputs / defaults | Result |
|---|---|---|
| `createPreferences(boundaries?)` | Partial `PreferenceBoundaries`; omitted lists default to `[]` | Empty envelope with copied boundary lists. |
| `parsePreferences(value)` | `unknown`; object or JSON text | A checked copy, or `null` for an invalid envelope. |
| `getSlot(prefs, name)` | Slot name | Stored `PreferenceSlot`, or `undefined`. |
| `setSlot(prefs, name, value, version?)` | `value: unknown`; numeric version defaults to the existing slot's version, then `1` | Envelope with a JSON copy of the value. |
| `removeSlot(prefs, name)` | Slot name | Envelope without that slot; leaves boundary lists intact. |
| `diffPreferences(a, b)` | Before and after envelopes | `PreferencesDiff`: sorted name lists in `added`, `removed`, `changed`, and `same`. |
| `toJson(value)` | `unknown` | JSON round-trip copy, or `null` when serialization fails. |

`parsePreferences` requires the marker, envelope version `1`, and an object for `slots`. It drops malformed slots individually: each needs a nonnegative integer version and a serializable value. A non-null value that serializes to `null`, such as `NaN`, is also dropped; literal `null` is valid. Missing or malformed boundary lists become empty lists; nonstring entries are removed.

JSON serialization removes functions and `undefined` from objects, turns them into `null` in arrays, and converts dates to strings. `setSlot` ignores a value that cannot be serialized or becomes `null`, unless the input is literal `null`. It returns the same envelope when the version and serialized value match; otherwise it returns a new one. `removeSlot` returns the same envelope when the slot is absent.

`diffPreferences` compares slot versions and serialized values, ignoring boundaries. Both diffing and `setSlot` compare `JSON.stringify` output, so object key order matters. Use the diff for a support view or save prompt; identity checks can skip unchanged saves.

### Boundaries

Like [`workspace`](workspace.md)'s layout, the envelope records its persistence boundaries in the payload. `PreferenceBoundary` names the three categories below; `PreferenceBoundaries` maps each to a readonly list of slot names.

| Boundary | Purpose |
|---|---|
| `"template"` | Shared desk settings; keep personal and session data out. |
| `"user"` | Personal settings that follow a trader between desks. |
| `"session"` | Values excluded from import and export. |

Name each slot under one boundary. An unlisted slot uses `DEFAULT_BOUNDARY`, `"user"`. If lists overlap, the first match in `PREFERENCE_BOUNDARIES` wins: `template`, then `user`, then `session`.

| Function | Result |
|---|---|
| `boundaryOf(prefs, name)` | Effective `PreferenceBoundary` for the slot name, even if no slot exists. |
| `withBoundary(prefs, name, boundary)` | Same envelope if the requested boundary is already effective and explicitly lists the name; otherwise a new envelope with the name removed from every list and added to the requested one. |

### Export and import

The transfer boundary accepts `"template"` or `"user"`, defaulting to `"user"`:

| Slot's effective boundary | Template transfer | User transfer |
|---|---|---|
| `"template"` | Included | Included |
| `"user"` or unlisted | Excluded | Included |
| `"session"` | Excluded | Excluded |

| Function | Inputs / defaults | Result |
|---|---|---|
| `exportableSlots(prefs, boundary?)` | Transfer boundary | Names of existing slots allowed by the table. |
| `exportPreferences(prefs, options?)` | `boundary`; numeric `indent` defaults to `2` | JSON text containing allowed slots and all boundary lists. Use `indent: 0` for compact text. |
| `importPreferences(target, incoming, options?)` | `incoming: unknown`, object or JSON text; `boundary` | Merged envelope, or `null` when parsing fails. |

Export filters slot values, not the boundary lists: excluded slots' names can still appear in the JSON. Import checks the incoming envelope's boundaries. Each allowed slot replaces the target's same-named slot and takes the incoming boundary, even if the target classified it as `session`. Other target slots and their boundaries stay intact.

Import returns the original target when no allowed values, versions, or boundary assignments change. Parsing and importing do not migrate slot versions; use a migrator when reading or updating older values.

### Versions and migrators

Supply a `PreferenceMigrator` when a slot's shape changes:

| Field | Type | Purpose |
|---|---|---|
| `version` | `number` | Required target version your code reads. |
| `migrate` | `(value: PreferencesJson, from: number) => PreferencesJson \| null` | Required function that converts an older value directly to the target version; `null` rejects it. |

`PreferenceMigrators` is a record of slot names to migrators. `migratePreferences(prefs, migrators)` returns an updated envelope; `readSlot<V>(prefs, name, migrator?)` returns one value without writing the result back.

| Stored slot | `migratePreferences` | `readSlot` |
|---|---|---|
| Missing | Leave absent | `undefined` |
| No migrator | Keep slot | Stored value, regardless of version |
| Older than migrator | Pass migrated value to `setSlot` at target version; remove slot on `null` | Migrated value, or `undefined` on `null` |
| Same version | Keep slot | Stored value |
| Newer than migrator | Keep slot | `undefined` |

`migratePreferences` applies `setSlot`'s JSON conversion and returns the same envelope when nothing changes. `readSlot` returns a non-null migrator result directly. Migrators run only for older slots; thrown errors propagate.

`readSlot` returns `V | undefined`, with `V` defaulting to `PreferencesJson`; the generic supplies a TypeScript type, not runtime validation.

### The slots are the items' own shapes

Envelope parsing checks JSON structure, not the value's domain schema. Use the owning item's parser, such as `parseWorkspaceLayout`, before passing a slot value to a controlled prop.

| Setting | Value shape |
|---|---|
| Workspace layout | `WorkspaceLayout` |
| Grid columns | `ColumnState` |
| Hotkey overrides | `HotkeyOverrides` |
| Grid rules | `GridRules` |
| Threshold | `number` |

The demo carries a layout, two grids' column states, hotkey overrides, rules, and a threshold in one envelope.

### What it does not do

These functions do not subscribe, notify, or persist. Your application owns storage and save timing, whether it uses `localStorage`, a desktop file, or a server. Keep settings in your own state and wire `readSlot` and `setSlot` to each item's controlled props.
