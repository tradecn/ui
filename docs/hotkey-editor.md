# HotkeyEditor

List, search, and remap the shortcuts in a hotkey registry, with grouped bindings, reset controls, and conflict messages.

## Usage

```tsx
import { HotkeysProvider } from "@/hooks/use-hotkeys"
import type { HotkeyBinding } from "@/lib/hotkeys"
import {
  HotkeyEditor,
  HotkeyEditorItem,
  HotkeyEditorKeys,
  HotkeyEditorChange,
  HotkeyEditorEdit,
  HotkeyEditorReset,
  HotkeyEditorCapture,
  HotkeyEditorInput,
  HotkeyEditorProblem,
  HotkeyEditorConflicts,
  useHotkeyEditorItem,
} from "@/components/ui/hotkey-editor"

const BINDINGS: HotkeyBinding[] = [
  { id: "palette.open", keys: "mod+k", scope: "editing", description: "Open the command palette" },
]

function Shortcut() {
  const { entry } = useHotkeyEditorItem()
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1">{entry.description}</span>
        {entry.remapped && <span className="text-muted-foreground">changed</span>}
        <HotkeyEditorKeys />
      </div>
      <div className="flex flex-wrap gap-1">
        <HotkeyEditorChange>Change</HotkeyEditorChange>
        <HotkeyEditorEdit>Type it</HotkeyEditorEdit>
        {entry.remapped && <HotkeyEditorReset>Reset</HotkeyEditorReset>}
      </div>
      <HotkeyEditorCapture />
      <HotkeyEditorInput />
      <HotkeyEditorProblem />
      <HotkeyEditorConflicts />
    </>
  )
}

function ShortcutSettings() {
  return (
    <HotkeysProvider bindings={BINDINGS}>
      <HotkeyEditor className="w-sm max-w-full">
        <HotkeyEditorItem bindingId="palette.open">
          <Shortcut />
        </HotkeyEditorItem>
      </HotkeyEditor>
    </HotkeysProvider>
  )
}
```

Keep bindings stable, as a module constant. Bindings declare the shortcuts; attach their handlers with [`useHotkey`](use-hotkeys.md). Reuse your application's `HotkeysProvider` when it already owns the registry.

## Composition

Use the following composition to build a `HotkeyEditor`:

```text
HotkeysProvider
└── HotkeyEditor
    ├── HotkeyEditorSearch
    ├── Caller groups and empty state
    │   └── HotkeyEditorItem
    │       ├── Caller description and changed indicator
    │       ├── HotkeyEditorKeys
    │       ├── HotkeyEditorChange
    │       ├── HotkeyEditorEdit
    │       ├── HotkeyEditorReset
    │       ├── HotkeyEditorCapture
    │       ├── HotkeyEditorInput
    │       ├── HotkeyEditorProblem
    │       └── HotkeyEditorConflicts
    ├── HotkeyEditorResetAll
    └── Caller import and export controls
```

The root coordinates the registry and search. Each item coordinates one binding's editing state. Choose the readings and controls your layout needs, and supply descriptions, action text, group headings, and empty states in your JSX.

To place the editor in a dialog, install shadcn `dialog` separately and give it a `DialogTitle`.

## Groups

Use `useHotkeyEditor().groups` to render filtered bindings under their group names and add an export control.

<!-- demo: hotkey-editor-groups -->

## Cards

Arrange items in a card grid and use `HotkeyEditorEdit` with `HotkeyEditorInput` for text editing.

<!-- demo: hotkey-editor-layout -->

## API Reference

### Props

`HotkeyEditor` reads the nearest `HotkeysProvider` registry. It renders a `div` with a region role and accepts native div props and a ref.

| Prop | Type | Default | Description |
|---|---|---|---|
| `children` | `ReactNode` | Required | The editor's composition. Conditional content is supported. |
| `hide` | `(entry: HotkeyEntry) => boolean` | Show all | Exclude entries from `groups`. Direct items and `entries` remain available. |
| `labels` | `Partial<HotkeyEditorLabels>` | `DEFAULT_HOTKEY_EDITOR_LABELS` | Accessible names and behavior messages. |
| `className` | `string` | - | Additional classes to apply to the editor. |

There is one registry subscription per root. Hooks and parts under it share that subscription; they add no timers or application shortcut handlers.

### HotkeyEditorItem

Coordinates capture, text editing, validation, and focus for one registered binding. It renders a named `div` group and accepts native div props and a ref. An unknown or removed binding renders nothing.

| Prop | Type | Default | Description |
|---|---|---|---|
| `bindingId` | `string` | Required | A registered binding's id. |
| `children` | `ReactNode` | Required | The item's readings, controls, and application content. |
| `className` | `string` | - | Additional classes to apply to the item. |

Keep React keys equal to binding ids when mapping items.

Edit state belongs to each mounted item; two presentations share the registry but have separate drafts.

A change to the binding's keys, declaration fields, or provider registry cancels an open draft. Unrelated registry updates preserve it.

### Search and editing fields

| Part | Renders | Behavior |
|---|---|---|
| `HotkeyEditorSearch` | Installed Input | Reads and updates the root's query. |
| `HotkeyEditorCapture` | Installed Button | Appears during capture and records one shortcut step. Optional children replace the visible prompt. |
| `HotkeyEditorInput` | Installed Input | Appears during text editing and updates the item's draft. |

Inputs accept their installed component's props except `value` and `defaultValue`, which are coordinated. Capture accepts installed Button props.

All three forward refs and native events. Caller handlers run first; `preventDefault()` skips the part's behavior for that event.

### Actions

`HotkeyEditorChange`, `HotkeyEditorEdit`, `HotkeyEditorReset`, and `HotkeyEditorResetAll` accept installed Button props and refs. Each requires `children` for its content. Caller `onClick` runs first and can cancel the action with `preventDefault()`.

| Part | Action | Disabled when |
|---|---|---|
| `HotkeyEditorChange` | Start single-step capture. | The item is already editing. |
| `HotkeyEditorEdit` | Edit the effective keys as text. | The item is already editing. |
| `HotkeyEditorReset` | Remove this binding's override and end its edit. | The binding is not remapped. |
| `HotkeyEditorResetAll` | Remove all overrides. | No registered entry is remapped. |

Passing `disabled` also disables an action. Reset controls remain rendered when disabled; render Reset conditionally when you want it to appear only for changed bindings.

### Readings

| Part | Native props and ref | Content |
|---|---|---|
| `HotkeyEditorKeys` | `span` | Effective keys as keycaps, or the unbound label. Remains visible during editing. |
| `HotkeyEditorProblem` | `p`, except coordinated `id` | Current validation error, with an alert role and a generated id linked from the editing field. Renders nothing without an error. |
| `HotkeyEditorConflicts` | `ul` | One message per conflict involving the item. Renders nothing without conflicts. |

These readings supply their own content. Use `useHotkeyEditorItem` to write a different reading or conflict list.

### Hooks

`useHotkeyEditor()` requires a root. `useHotkeyEditorItem()` requires an item. Both throw when their coordinating parent is absent.

| `useHotkeyEditor` value | Type | Description |
|---|---|---|
| `registry` | `HotkeyRegistry` | Registry used for remapping, reset, import, and export. |
| `entries` | `readonly HotkeyEntry[]` | All registered bindings in registry order. |
| `groups` | `readonly HotkeyEditorGroup[]` | Filtered and sorted groups; each has `name: string` and `entries: readonly HotkeyEntry[]`. |
| `conflicts` | `readonly HotkeyConflict[]` | Conflicts across all bindings. |
| `remapped` | `number` | Count of registered entries whose effective keys differ from defaults. |
| `query`, `setQuery` | `string`, `(query: string) => void` | Shared search state. |
| `labels` | `HotkeyEditorLabels` | Merged labels. |

| `useHotkeyEditorItem` value | Type | Description |
|---|---|---|
| `entry` | `HotkeyEntry` | This binding's current effective keys, defaults, and remapped flag. |
| `mode` | `"idle" \| "capture" \| "text"` | Current editing mode. |
| `draft`, `setDraft` | `string`, `(draft: string) => void` | Text being edited; changes require an active edit. |
| `problem`, `problemId` | `string \| null`, `string` | Validation error and its field-description id. |
| `conflicts` | `readonly HotkeyConflict[]` | Conflicts involving this binding. |
| `startCapture`, `startEdit` | `(trigger?: HTMLElement) => void` | Begin editing and remember the trigger for focus return. |
| `commit` | `(keys: string) => void` | Remap during an active edit; remain open on invalid input. |
| `cancel` | `() => void` | Discard the draft. |
| `reset` | `() => void` | Remove the binding's override and end editing. |

Use the public capture and input parts with custom triggers to retain keyboard handling and focus. Pass the trigger to `startCapture` or `startEdit`; without one, focus returns to the item.

### The list

Groups use the binding's `group`, falling back to its scope: `global`, `editing`, or the name after `panel:`. Named groups sort before scope-derived groups, then by group and description. Render `groups` in that order for the default arrangement, or reorder and limit entries at the call site.

Search trims the query and matches case-insensitive substrings of the description, group, id, normalized keys, or displayed keycaps (`ctrl` finds `Ctrl K` on non-Mac platforms). `hide` and search only filter `groups`: hidden bindings stay registered, can appear in another row's conflict message, and remain included in export and Reset all.

`HotkeyEntry` extends `HotkeyBinding` with normalized effective `keys`, normalized `defaultKeys`, and `remapped`. Registry types come from `@/lib/hotkeys`.

### Three ways to change a shortcut

| Control | Behavior |
|---|---|
| Capture | Records one key with its modifiers through `keysFromEvent`. Bare modifiers and other ignored keys leave capture open. Escape cancels; Backspace or Delete unbinds, even with modifiers held. |
| Text | Join modifiers and a key with `+` (`mod+k`); separate chord steps with spaces (`g b`). Enter commits, Escape cancels, and an empty field unbinds. Parse errors leave the binding unchanged. |
| Reset | Removes the binding's override. Reset all also removes hidden and unregistered overrides. |

Blur cancels an unfinished edit.

Capture consumes every keydown. Text editing stops keydown propagation to application handlers and prevents default behavior for Enter and Escape.

Use text to enter chords or Escape, Backspace, and Delete bindings.

Commit and Escape return focus to the initiating control, or the item if that control is unavailable. Blur preserves the destination's focus. Removing a focused item moves focus to the editor's search field, or its root when there is no search field.

Keep a public editing field mounted for every editing mode your triggers can start.

The plus key retains a registry limitation: capture can produce `ctrl++`, which remapping rejects. Typing `ctrl+plus` for a binding whose default is `x` stores `ctrl++`, then falls back to `x` without an editor error. Declaring or loading `ctrl+plus` can produce effective keys the keycap formatter cannot display.

See [remapping](use-hotkeys.md); neither entry method reliably supports plus-key shortcuts.

### Conflicts

The root reads `registry.conflicts()` when the registry changes. Mount `HotkeyEditorConflicts` under each item that should show its messages, or render the hook's conflicts yourself.

| Kind | Reported overlap | Default phrase |
|---|---|---|
| `duplicate` | Same keys in the same scope, or between global and editing. | `same keys as` |
| `prefix` | One sequence starts another in the same scope, or between global and editing. | `starts the chord of` |
| `shadow` | A panel and a global or editing binding share keys or a chord prefix. | `hides, while focus is in this panel,` |

Each phrase names the other binding. Prefix and shadow messages use the same wording on both rows and do not identify which is the shorter sequence or panel binding.

Reports compare declarations regardless of `when()`.

Unbound bindings and different panel scope names are excluded. A pair is also excluded when all its handlers are fenced to elements that do not contain one another; that pair is reported until both sides have such handlers.

Conflicts do not block remapping or decide which shortcut runs. See the registry's [conflict rules](use-hotkeys.md).

### Export and import

Use the hook's `registry.overrides()` in your own export button. `HotkeyOverrides` is `Record<string, string>`, keyed by binding id. Import with `registry.load(overrides)` after reading and validating your file.

`load` replaces all overrides and refreshes the list, but does not call `onChange`. An override that fails to parse remains stored while the binding falls back to its defaults, so exported values can differ from the effective keys shown. The Groups example displays an export snapshot; export again after editing to refresh it.

For persistence, create a registry with `createHotkeyRegistry` and pass it to the provider.

Load saved overrides during browser startup. Subscribe to `registry.onChange` to save remaps and resets, and unsubscribe when the owner is disposed.

Persist imports separately because `load` does not call `onChange`.

### Labels

`labels` merges with `DEFAULT_HOTKEY_EDITOR_LABELS`. Supply descriptions, group headings, changed indicators, empty states, import/export text, and action children in your composition.

| Labels | Defaults |
|---|---|
| `title`, `search` | `Keyboard shortcuts`, `Find a shortcut` |
| `change`, `edit`, `reset` | `Change`, `Type it`, `Reset` |
| `pressKeys`, `unbound`, `keysFor` | `Press the new shortcut`, `unbound`, `Keys for` |
| `cancelHint` | `Escape cancels, Backspace unbinds` |
| `notKeys` | `Not a shortcut. Write keys joined by +, steps of a chord separated by a space: mod+k, g b.` |
| `duplicate`, `prefix`, `shadow` | See Conflicts. |

The root's accessible name defaults to `title`. Search uses `search` for its name and placeholder.

Change, Edit, and Reset include the binding description in their accessible names. Input uses `keysFor` followed by the description. Capture links `cancelHint` as an accessible description, alongside any caller description and validation error.

Override native accessible-name props when replacing visible control text.

Problem supplies a live alert. Conflicts and changed indicators are ordinary text; add announcements at the call site if your application needs them.

### Helpers

These pure helpers remain exported from `@/components/ui/hotkey-editor`.

| Helper | Result |
|---|---|
| `scopeWord(scope: string)` | Removes a leading `panel:`; other names stay unchanged. |
| `groupOf(entry: HotkeyEntry)` | `entry.group ?? scopeWord(entry.scope)`. |
| `matchesQuery(entry: HotkeyEntry, query: string, platform: "mac" \| "other")` | Matches the fields described under The list. A blank query matches every entry. |

### What it does not do

The editor declares no bindings or handlers, persists no overrides, reads or writes no files, and does not resolve conflicts. Search and per-item drafts are its local state.

### Tokens

Installation adds `stale` for conflict text when absent. The input fields use the consumer's `--tradecn-font-mono` token.
