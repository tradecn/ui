# LayoutManager

Compose saved workspace layouts, editing fields, and template actions.

## Usage

```tsx
import { useState } from "react"
import { WORKSPACE_PERSISTENCE_BOUNDARIES, type WorkspaceLayout } from "@/lib/workspace-layout"
import {
  LayoutManager,
  LayoutManagerItem,
  LayoutManagerName,
  LayoutManagerRenameField,
  LayoutManagerActive,
  LayoutManagerPanelCount,
  LayoutManagerSavedAt,
  LayoutManagerUnknownKinds,
  LayoutManagerLoad,
  LayoutManagerRename,
  LayoutManagerDuplicate,
  LayoutManagerDelete,
  LayoutManagerSaveName,
  LayoutManagerSave,
  LayoutManagerTaken,
  type LayoutTemplate,
} from "@/components/ui/layout-manager"

// A snapshot captured from a workspace with one Book panel.
const BOOK: WorkspaceLayout = {
  version: 1,
  kind: "tradecn-workspace",
  dockview: {
    grid: {
      root: { type: "branch", data: [{ type: "leaf", data: { views: ["book-1"], activeView: "book-1", id: "1" }, size: 478 }], size: 115 },
      width: 478, height: 115, orientation: "HORIZONTAL",
    },
    panels: { "book-1": { id: "book-1", contentComponent: "tradecn-panel", tabComponent: "props.defaultTabComponent", title: "Book" } },
    activeGroup: "1",
  },
  panels: { "book-1": { kind: "book", title: "Book", state: { symbol: "ZN" } } },
  boundaries: WORKSPACE_PERSISTENCE_BOUNDARIES,
}

export default function LayoutManagerDemo() {
  const [templates, setTemplates] = useState<LayoutTemplate[]>([{ id: "t-1", name: "Treasury book", layout: BOOK, savedAt: Date.parse("2026-09-22T14:00:00Z") }])
  const [current, setCurrent] = useState(BOOK)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [message, setMessage] = useState("Current snapshot: one ZN book.")

  return (
    <div className="w-[36rem] max-w-full space-y-3 text-xs lining-nums tabular-nums">
      <LayoutManager
        templates={templates}
        onTemplatesChange={(next) => {
          const previous = templates.find((template) => template.id === activeId)
          const active = next.find((template) => template.id === activeId)
          const layout = JSON.stringify(active?.layout)
          if (!active || (layout !== JSON.stringify(previous?.layout) && layout !== JSON.stringify(current))) setActiveId(null)
          setTemplates(next)
        }}
        current={current}
        kinds={["book"]}
        activeId={activeId}
        onLoad={(layout, template) => {
          setCurrent(layout)
          setActiveId(template.id)
          setMessage(`Selected ${template.name}.`)
        }}
      >
        <div className="flex items-center gap-1"><LayoutManagerSaveName className="min-w-40 flex-1" /><LayoutManagerSave /></div>
        <LayoutManagerTaken />
        {templates.length === 0 ? <p className="text-muted-foreground">No saved layouts. Save the current one under a name.</p> : <ul className="divide-y divide-border rounded-md border border-border">
          {templates.map((template) => <li key={template.id}>
            <LayoutManagerItem templateId={template.id} className="px-2 py-2">
              <LayoutManagerName /><LayoutManagerRenameField /><LayoutManagerActive />
              <LayoutManagerPanelCount /><LayoutManagerSavedAt /><LayoutManagerUnknownKinds />
              <div className="flex w-full flex-wrap items-center gap-1">
                <LayoutManagerLoad /><LayoutManagerRename /><LayoutManagerDuplicate /><LayoutManagerDelete />
              </div>
            </LayoutManagerItem>
          </li>)}
        </ul>}
      </LayoutManager>
      <p role="status" className="text-muted-foreground">{message}</p>
    </div>
  )
}
```

## Composition

Use the following composition to build a `LayoutManager`:

```text
LayoutManager
├── LayoutManagerSaveName
├── LayoutManagerSave
├── LayoutManagerTaken
├── LayoutManagerImportTrigger
├── LayoutManagerImportContent
│   ├── LayoutManagerImportText
│   ├── LayoutManagerImportName
│   ├── LayoutManagerImportSubmit
│   └── LayoutManagerImportProblem
└── LayoutManagerItem
    ├── LayoutManagerName
    ├── LayoutManagerRenameField
    ├── LayoutManagerActive
    ├── LayoutManagerPanelCount
    ├── LayoutManagerSavedAt
    ├── LayoutManagerUnknownKinds
    ├── LayoutManagerLoad
    ├── LayoutManagerRename
    ├── LayoutManagerDuplicate
    └── LayoutManagerDelete
```

`LayoutManagerItem` renders a named group. Wrap each item in an `li` when using a list.

Choose the collection markup, order, empty state, and action placement in your own JSX. Add application content inside the root or an item, and use the hooks for custom readings and controls.

## Cards

Move save and import fields into a sidebar and arrange templates as cards.

<!-- demo: layout-manager-cards -->

## Saving and restoring a workspace

Install [`workspace`](workspace.md) to save and restore panel arrangements. This example persists templates in browser storage and reports storage failures.

Copy `DeskTab` from the [Workspace Usage example](workspace.md#usage) into an application `workspace.tsx` beside this example, outside `components/ui`.

<!-- demo: layout-manager-workspace -->

## API Reference

### Props

`LayoutManager` renders a section with `tabIndex={-1}` and accepts native props and refs, except the native `onLoad` and `onReset` events. Its `onLoad` requests a workspace load.

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `children` | `ReactNode` | Required | Fields, template items, and application content. |
| `templates` | `readonly LayoutTemplate[]` | Required | Controlled template list. |
| `onTemplatesChange` | `(templates: LayoutTemplate[]) => void` | Required | Receives the whole list after an edit. |
| `current` | `WorkspaceLayout \| null` | `null` | Layout captured by Save current. |
| `onLoad` | `(layout: WorkspaceLayout, template: LayoutTemplate) => void` | Required | Requests a workspace load. |
| `kinds` | `Iterable<string>` | - | Nonempty known kinds enable missing-kind warnings and confirmation. |
| `activeId` | `string \| null` | `null` | Marks a template as loaded. |
| `now` | `() => number` | `Date.now` | Clock in milliseconds since the epoch. |
| `labels` | `Partial<LayoutManagerLabels>` | `DEFAULT_LAYOUT_MANAGER_LABELS` | Label overrides shared with the parts and hooks. |
| `className` | `string` | - | Additional classes to apply to the root. |

### LayoutManagerItem

Provides template readings and actions. It renders a `div` with `role="group"` and `tabIndex={-1}`, and accepts native props and refs.

A missing template renders nothing.

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `templateId` | `string` | Required | Identifies a template in the root list. |
| `children` | `ReactNode` | Required | Readings, controls, and application content. |
| `className` | `string` | - | Additional classes to apply to the item. |

### Fields and controls

Inputs accept the installed Input's props and refs, except `value` and `defaultValue`. `LayoutManagerImportText` accepts textarea props with the same exceptions.

Drafts belong to the root or item hook. Change, click, blur, and key handlers run first. `preventDefault()` cancels the built-in action.

| Part | Element | Behavior |
|---|---|---|
| `LayoutManagerSaveName` | Input | Edits the save name. Enter saves. Composing text does not submit. Pair with `LayoutManagerTaken`. |
| `LayoutManagerSave` | Button | Saves when `current` and a nonblank name are available. |
| `LayoutManagerImportTrigger` | Button | Toggles import content and exposes its expanded state. |
| `LayoutManagerImportContent` | `div` | Requires children. Renders them while import is open. Its id is managed internally. |
| `LayoutManagerImportText` | `textarea` | Edits JSON and links to the import error. Pair with `LayoutManagerImportProblem`. |
| `LayoutManagerImportName` | Input | Edits the optional import name. |
| `LayoutManagerImportSubmit` | Button | Parses nonblank JSON and adds or replaces a template. |
| `LayoutManagerRenameField` | Input | Renders while renaming. Enter or blur commits. Escape cancels. |
| `LayoutManagerLoad` | Button | Loads, with confirmation for unknown kinds. |
| `LayoutManagerRename` | Button | Starts renaming and focuses the rename field. |
| `LayoutManagerDuplicate` | Button | Inserts a copy after its source. |
| `LayoutManagerDelete` | Button | Asks on the first press and deletes on the second. |

Buttons accept the installed Button's props, refs, and optional children. Omitted children use the corresponding label.

Custom Load/Delete content must show the confirmation state from `useLayoutManagerItem().asking`. Caller `disabled` props remain effective.

Rename, Duplicate, and Delete default accessible names include the action and template name. Use `aria-label` or `aria-labelledby` to customize them.

Mount one save field and import editor per root. Keep a `LayoutManagerRenameField` or custom rename editor mounted in each item that offers Rename. The import fields also work without a trigger or content wrapper, as in the Cards example.

A custom import dialog owns its opening, closing, and focus behavior.

### Readings

Readings accept native props, refs, and `className`. Their children are managed. `LayoutManagerActive` and `LayoutManagerUnknownKinds` accept the installed Badge's props.

Use the hooks to format your own readings.

| Part | Element | Content |
|---|---|---|
| `LayoutManagerName` | `span` | Template name. Wraps long names and hides while renaming. |
| `LayoutManagerActive` | Badge | Loaded label when the item matches `activeId`. |
| `LayoutManagerPanelCount` | `span` | Panel count using `labels.panels`. |
| `LayoutManagerSavedAt` | `time` | Positive timestamp in the browser's locale and time zone. `dateTime` is managed. |
| `LayoutManagerUnknownKinds` | Badge | Sorted, deduplicated missing kinds with a visible Needs label. |
| `LayoutManagerTaken` | `p` | Save replacement warning with a managed id. |
| `LayoutManagerImportProblem` | `p` | Import error with `role="alert"` and a managed id. |

### useLayoutManager()

Reads the nearest root. `LayoutManagerState` exposes these values and operations:

| Member | Type | Description |
|---|---|---|
| `templates`, `labels` | `readonly LayoutTemplate[]`, `LayoutManagerLabels` | Controlled list and resolved labels. |
| `saveName`, `setSaveName` | `string`, `(name: string) => void` | Save draft. |
| `canSave`, `nameTaken` | `boolean` | Save availability and replacement warning. |
| `takenId` | `string` | Warning id for a custom field or reading. |
| `save` | `() => void` | Saves and clears the name. |
| `importing`, `setImporting` | `boolean`, `(open: boolean, trigger?: HTMLElement) => void` | Import visibility and optional focus return target. |
| `importText`, `setImportText` | `string`, `(text: string) => void` | JSON draft. Editing clears the error. |
| `importName`, `setImportName` | `string`, `(name: string) => void` | Optional name draft. |
| `importProblem` | `string \| null` | Localized validation error. |
| `importProblemId`, `importContentId` | `string` | Error and content ids for custom composition. |
| `add` | `() => void` | Imports, clears drafts, and closes built-in import content on success. |

### useLayoutManagerItem()

Reads the nearest item. `LayoutManagerItemState` exposes these values and operations:

| Member | Type | Description |
|---|---|---|
| `template` | `LayoutTemplate` | Current template. |
| `active`, `panelCount` | `boolean`, `number` | Loaded state and panel count. |
| `missingKinds` | `readonly string[]` | Unknown panel kinds. |
| `asking` | `"load" \| "delete" \| null` | Pending confirmation. |
| `renaming`, `name`, `setName` | `boolean`, `string`, `(name: string) => void` | Rename state and draft. |
| `rename` | `(trigger?: HTMLElement) => void` | Starts editing and records a focus return target. |
| `commitRename` | `(options?: { restoreFocus?: boolean }) => void` | Commits editing. Focus restoration defaults to `true`. |
| `cancelRename` | `() => void` | Cancels editing and restores focus. Calling this on blur can override the destination's focus. |
| `load`, `duplicate`, `remove` | `() => void` | Performs the same actions as the public buttons, including confirmation. |

Hooks and coordinated parts throw outside their required root or item. They add no timers, persistence, subscriptions, or permission checks.

Custom controls own their disabled conditions.

For a custom rename input, add `data-layout-rename-field=""` so `rename()` can focus it. Preserve IME composition and let keys other than Enter and Escape reach application handlers. Pass `{ restoreFocus: false }` on blur to keep its destination.

```tsx
import { useLayoutManagerItem } from "@/components/ui/layout-manager"

function CustomName() {
  const item = useLayoutManagerItem()
  if (!item.renaming) return <span>{item.name}</span>

  return (
    <input
      data-layout-rename-field=""
      aria-label="Template name"
      value={item.name}
      onChange={(event) => item.setName(event.target.value)}
      onBlur={() => item.commitRename({ restoreFocus: false })}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return
        if (event.key === "Enter" || event.key === "Escape") {
          event.preventDefault()
          event.stopPropagation()
          if (event.key === "Enter") item.commitRename()
          else item.cancelRename()
        }
      }}
    />
  )
}
```

### Template fields

All `LayoutTemplate` fields are required. Keep ids unique when supplying your own list.

| Field | Type | Purpose |
|---|---|---|
| `id` | `string` | Row identity for actions and `activeId`. Generated ids use the lowest available `t-1`, `t-2`, and so on. |
| `name` | `string` | Display name and save/import replacement key. |
| `layout` | `WorkspaceLayout` | Workspace arrangement and panel records. |
| `savedAt` | `number` | Milliseconds since the epoch. `LayoutManagerSavedAt` displays positive values in the browser's locale and time zone. |

### The list is yours

[`workspace`](workspace.md) emits layouts through `onLayoutChange` and stores nothing. Accept each new list from `onTemplatesChange` into `templates`. The manager keeps only transient form and confirmation state.

`readLayoutTemplates` and `writeLayoutTemplates` use a [`preferences`](preferences.md) slot named `layouts` by default. Writing returns an envelope with slot version 1 and value `{ version: 1, templates }`. It neither persists the envelope nor assigns a boundary.

Put the slot under `template` with `createPreferences` or `withBoundary` to include it in desk-template exports. An unclassified slot defaults to `user`.

Preferences exports select whole slots. A layout's `boundaries` describe its contents without removing fields from a layout export.

### Save, load, and the default

`Save current` and Enter in the save field capture `current` under the trimmed name. Both require a layout and a nonblank name.

Save clears the field after emitting the list.

Names match exactly, including case. A matching name shows a replacement warning. Saving replaces the first matching template's layout and timestamp while keeping its id and position.

A new name appends a template. Save stores the supplied layout reference, so treat layouts as immutable.

`Load` calls `onLoad(layout, template)`. Call the workspace's `api.load` there. The manager does not update `activeId` or verify that loading succeeded.

Clear `activeId` when its saved layout changes to a snapshot other than `current`. Renaming and saving the current snapshot can retain the loaded marker. Compose Reset to default as a caller-owned button that clears and reseeds the workspace.

Refresh `current` from `api.toLayout()` on ready, after loading, and after reset so Save captures those changes immediately. The workspace does not emit `onLayoutChange` merely because a layout was restored.

Ordinary workspace edits arrive through its debounced `onLayoutChange`.

### A kind the workspace does not have

Pass a nonempty `kinds` iterable to show a badge for unknown panel kinds, sorted and deduplicated by `unknownPanelKinds`. The first Load press becomes `Load anyway?`. The second calls `onLoad`.

The workspace draws placeholders for missing kinds. Omitting `kinds` or passing an empty iterable skips both the badge and confirmation.

### Rename, duplicate, delete

`Rename` edits inline. Enter or blur commits a trimmed name. Escape cancels.

A blank name leaves the template unchanged. Renaming preserves the timestamp and allows a name already in use.

Changing the source name or layout externally cancels an open edit. Enter and Escape leave IME composition untouched.

`Duplicate` inserts a new id and timestamp immediately after the source, named `Copy of <name>`. It copies a valid layout through `parseWorkspaceLayout`. If parsing fails, the helper falls back to the source layout reference.

Duplicate names are allowed.

`Delete` becomes `Delete?` on the first press and removes the row on the second. Delete and missing-kind Load share one pending confirmation: another Delete or warning Load replaces it, and completing a load or delete clears it.

Other clicks, including Rename, Duplicate, and clicks outside the manager, do not cancel it. Removing the target or changing its layout cancels its confirmation. Equivalent copied layouts keep it.

### Import and export

`Import` toggles fields for a layout's JSON and an optional name. `Add` requires nonblank JSON and parses it with `parseWorkspaceLayout`.

Invalid input shows an alert and leaves the list unchanged. Editing the JSON clears the alert. Success clears and closes the form.

Import uses the same name-replacement rule as Save, but has no taken-name warning or confirmation. A blank name becomes `Imported <local date/time>`. That generated name can also collide.

Import does not load the layout.

Use `exportTemplate(template)` in a caller-owned button to serialize the layout without its id, name, or timestamp. The caller handles the file, clipboard, or message.

### Helpers

These helpers are exported from `@/components/ui/layout-manager`. Here `templates` means `readonly LayoutTemplate[]`, `prefs` means `Preferences`, `layout` means `WorkspaceLayout`, and `savedAt` means a timestamp in milliseconds.

| Helper | Return type | Behavior |
|---|---|---|
| `parseLayoutTemplates(value: unknown)` | `LayoutTemplate[]` | Reads an array or `{ templates: [...] }`, including JSON text. Drops invalid entries and copies accepted layouts. |
| `readLayoutTemplates(prefs, slot = "layouts")` | `LayoutTemplate[]` | Parses the slot's value. A missing slot gives `[]`. |
| `writeLayoutTemplates(prefs, templates, slot = "layouts")` | `Preferences` | Writes a JSON copy at `LAYOUT_TEMPLATES_VERSION` (`1`). The default slot is `LAYOUT_TEMPLATES_SLOT`. |
| `saveTemplate(templates, name: string, layout, savedAt: number)` | `LayoutTemplate[]` | Trims the name, then replaces the first match or appends. Unlike the UI, accepts a blank name. |
| `renameTemplate(templates, id: string, name: string)` | `LayoutTemplate[]` | Renames matching ids. Blank names leave entries unchanged. |
| `duplicateTemplate(templates, id: string, savedAt: number, name?: string, labels = DEFAULT_LAYOUT_MANAGER_LABELS)` | `LayoutTemplate[]` | Inserts a copy after the first matching id. A missing id leaves entries unchanged. A nonblank custom name overrides `labels.copyOf`. |
| `deleteTemplate(templates, id: string)` | `LayoutTemplate[]` | Removes all matching ids. |
| `exportTemplate(template: LayoutTemplate, indent = 2)` | `string` | Serializes `template.layout` with the given indentation. |
| `importTemplate(templates, text: string, name: string, savedAt: number)` | `LayoutTemplate[] \| null` | Parses the layout and calls `saveTemplate`. Returns `null` for invalid input. |

Parsing requires nonempty string ids/names and layouts accepted by `parseWorkspaceLayout`. Missing or nonnumeric `savedAt` becomes `0`. Ids and names are not deduplicated or trimmed.

Neither the wrapper's version nor the preference slot's version is checked by these readers. Invalid JSON or an unsupported list shape returns `[]`.

List-editing helpers return new arrays, retaining unchanged entries. Custom menus and hotkeys supply warnings and confirmation.

### Labels

`labels` overrides the region title and public parts. All v1 keys remain available through `useLayoutManager().labels`, including `empty`, `export`, and `reset` for caller-owned content.

`taken` and `copyOf` interpolate `{name}`, `panels` uses `{n}`, and `unknownKinds` uses `{kinds}`. The generated `Imported` prefix and date/time formatting are not label overrides.

The title names the outer region unless an accessible name is supplied through native props. Rows expose `data-layout-template=<id>` and active rows have `data-active="true"`.

The import error uses `role="alert"`.

### Focus

The root and items use `tabIndex={-1}` as programmatic focus targets. They stay out of the Tab order unless you override it.

A focused Save or Add button that becomes disabled moves focus to the save field, falling back to the root when that field is absent.

The rename field receives focus when editing starts. Enter and Escape return focus to the initiating control, or the item if that control is gone or disabled.

Blur commits without moving focus from its destination. Removing a focused item moves focus to the save field, falling back to the root when that field is absent.

A successful import through `LayoutManagerImportContent` restores focus to its trigger when focus would otherwise be lost, falling back to the save field or root. If you replace the built-in field's blur behavior, your handler owns closing the edit and choosing its focus destination.

### What it does not do

The manager never calls the workspace API or writes storage. Stored/imported layouts pass through `parseWorkspaceLayout`, while a Load click forwards the supplied template as-is.

The workspace's `api.load` parses again and returns `false` if parsing or dock restoration fails.

### Tokens

Installation adds `stale` for the unknown-kinds badge when absent.
