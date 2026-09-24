# HotkeyEditor

List, search, and remap the shortcuts in a hotkey registry, with grouped bindings, reset controls, and conflict messages.

## Usage

```tsx
import { HotkeyEditor } from "@/components/ui/hotkey-editor"
import { HotkeysProvider } from "@/hooks/use-hotkeys"
import type { HotkeyBinding } from "@/lib/hotkeys"

const BINDINGS: HotkeyBinding[] = [
  { id: "palette.open", keys: "mod+k", scope: "editing", description: "Open the command palette", group: "General" },
  { id: "go.blotter", keys: "g b", scope: "global", description: "Go to the blotter", group: "Go" },
]

function ShortcutSettings() {
  return (
    <HotkeysProvider bindings={BINDINGS}>
      <HotkeyEditor className="w-xl max-w-full" />
    </HotkeysProvider>
  )
}
```

Keep `BINDINGS` stable, as a module constant. Bindings declare the shortcuts; attach their handlers with [`useHotkey`](use-hotkeys.md). Reuse the application's provider when it already owns the registry.

The preview remaps declarations without running application commands. Try typing `g b` for “Go to the inquiries” to see a conflict with “Go to the blotter,” then reset the row. Export shows a snapshot of the override map; export again after another edit to refresh it. Reloading restores the defaults.

## Composition

For persistence, create a registry with `createHotkeyRegistry` from `@/lib/hotkeys` and pass it to the provider. During browser startup, read and validate your stored overrides, then call `registry.load`. Subscribe to `registry.onChange` to save remaps and resets, and call the returned unsubscribe when the owner is disposed. Imported overrides need a separate save because `load` does not call `onChange`.

To place the editor in a dialog, install shadcn `dialog` separately and give it a `DialogTitle`. The editor's installation supplies the inline controls; file downloads and storage belong to your application.

## API Reference

### Props

All `HotkeyEditorProps` are optional. The editor reads and updates the nearest `HotkeysProvider` registry; it has no controlled value or binding-list prop.

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `onExport` | `(overrides: HotkeyOverrides) => void` | Unset | Show Export and receive the current override map. |
| `onImport` | `() => void` | Unset | Show Import and start your import flow. |
| `hide` | `(entry: HotkeyEntry) => boolean` | Show all entries | Omit rows for which the callback returns `true`. |
| `labels` | `Partial<HotkeyEditorLabels>` | `DEFAULT_HOTKEY_EDITOR_LABELS` | Replace individual labels and messages. |
| `className` | `string` | Unset | Classes merged onto the outer region. |

`HotkeyOverrides` is `Record<string, string>`, keyed by binding id. `HotkeyEntry` extends `HotkeyBinding` with normalized effective `keys`, normalized `defaultKeys`, and `remapped` when those strings differ. These types come from `@/lib/hotkeys`.

### The list

`useHotkeyList` supplies every registered binding. Rows use the binding's `group`, falling back to its scope name: `global`, `editing`, or the name after `panel:`. Named groups sort before scope-derived groups, then by group and description. Each row shows its description, effective keys as key caps, a `changed` badge when `remapped`, and any conflicts.

Search trims the query and matches case-insensitive substrings of the description, group, id, normalized keys, or displayed key caps (`ctrl` finds `Ctrl K` on non-Mac platforms). `hide` and search only filter rows: hidden bindings stay registered, can appear in another row's conflict message, and remain included in export and Reset all.

### Three ways to change a shortcut

| Control | Behavior |
|---|---|
| `Change` | Focus a capture button and record one key with its modifiers through `keysFromEvent`. Bare modifiers and other ignored keys leave capture open. Escape cancels; Backspace or Delete unbinds, even with modifiers held. |
| `Type it` | Edit the effective keys as text. Join modifiers and a key with `+` (`mod+k`); separate chord steps with spaces (`g b`). Enter commits, Escape cancels, and an empty field unbinds. Parse errors appear below the row without changing the binding. |
| `Reset` | Remove that row's override. Shown only when its effective keys differ from its defaults. |
| `Reset all` | Remove every override, including those for hidden or unregistered bindings. Disabled when no registered entry is `remapped`. |

Capture and text editing both end on blur without committing an unfinished edit. The capture button prevents default behavior and stops propagation for every keydown, keeping those events out of the registry's normal document listener. It records one step; use text for chords or for Escape, Backspace, and Delete bindings.

Changes go through `registry.remap` and `registry.reset`. Both notify `registry.onChange` with the full override map, so persistence belongs there. The editor only owns its search and editing state.

The plus key has a current limitation: capture can produce `ctrl++`, which remapping rejects. Typing `ctrl+plus` for a binding whose default is `x` stores `ctrl++`, then falls back to `x` without an editor error. Declaring or loading `ctrl+plus` also produces effective keys the editor cannot format. See [remapping](use-hotkeys.md); neither entry method reliably supports plus-key shortcuts.

### Conflicts

The editor reads `registry.conflicts()` whenever the registry wakes it and shows each conflict under both affected rows that are visible.

| Kind | Reported overlap | Default phrase |
|---|---|---|
| `duplicate` | Same keys in the same scope, or between `global` and `editing`. | `same keys as` |
| `prefix` | One sequence starts another in the same scope, or between `global` and `editing`. | `starts the chord of` |
| `shadow` | A panel and a global or editing binding share keys or a chord prefix. | `hides, while focus is in this panel,` |

Each phrase names the other binding. The same phrase appears on both rows, so prefix and shadow messages do not indicate which row is the shorter sequence or panel binding.

Reports compare declarations regardless of `when()`. Unbound bindings and pairs with different panel scope names are excluded, and so is a pair whose handlers are all fenced to elements that do not hold one another, the way two tickets on one desk share `mod+enter`; that pair is reported until both sides have such handlers. Conflicts do not block a remap or decide which shortcut runs; a shadow may be intentional. See the registry's [conflict rules](use-hotkeys.md).

### Export and import

Export calls `onExport(registry.overrides())` with the stored override map, for your file or clipboard handler. Import invokes your `onImport` callback: open your picker, read the overrides, and call `registry.load(overrides)`.

`load` replaces all overrides and refreshes the list, but does not call `onChange`. Persist imported overrides yourself if they should survive a reload. An override that fails to parse remains stored while the binding falls back to its defaults, so exported values can differ from the effective keys shown.

### Labels

`labels` merges with the exported `DEFAULT_HOTKEY_EDITOR_LABELS`. It covers control text, placeholders, badges, empty and error messages, conflict phrases, and the capture hint; descriptions and group names come from your bindings.

The outer region's accessible name defaults to `Keyboard shortcuts` (`title`). Search uses `Find a shortcut` (`search`) as its label and placeholder. Change, Type it, and Reset buttons include the binding description in their accessible names; the text field is named `Keys for` (`keysFor`) that description and sets `aria-invalid` after a failed commit. The capture button includes the screen-reader hint `Escape cancels, Backspace unbinds` (`cancelHint`).

### Helpers

These pure helpers are exported from `@/components/ui/hotkey-editor`.

| Helper | Result |
|---|---|
| `scopeWord(scope: string)` | Scope name with a leading `panel:` removed; other names stay unchanged. |
| `groupOf(entry: HotkeyEntry)` | `entry.group ?? scopeWord(entry.scope)`. |
| `matchesQuery(entry: HotkeyEntry, query: string, platform: "mac" \| "other")` | Whether the trimmed, case-insensitive query matches the fields described under The list. A blank query matches every entry. |

### What it does not do

The editor requires a `HotkeysProvider` and declares no bindings or handlers. It does not persist overrides, read or write files, or resolve conflicts.

### Tokens

The install adds the `stale` token, which the conflict lines draw from, if you do not have it.
