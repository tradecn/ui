# LayoutManager

Save, load, rename, duplicate, delete, import, and export named workspace layouts. You own the list, storage, and workspace callbacks.

## Usage

```tsx
import { useState } from "react"
import { WORKSPACE_PERSISTENCE_BOUNDARIES, type WorkspaceLayout } from "@/lib/workspace-layout"
import { LayoutManager, type LayoutTemplate } from "@/components/ui/layout-manager"

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

function SavedLayouts() {
  const [templates, setTemplates] = useState<LayoutTemplate[]>([{ id: "t-1", name: "Treasury book", layout: BOOK, savedAt: Date.parse("2026-09-22T14:00:00Z") }])
  const [current, setCurrent] = useState(BOOK)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [message, setMessage] = useState("Current snapshot: one ZN book.")

  return (
    <div className="w-[36rem] max-w-full space-y-3 text-xs lining-nums tabular-nums">
      <div role="region" aria-label="Layout controls" tabIndex={0} className="overflow-x-auto">
        <LayoutManager
          className="min-w-96"
          templates={templates}
          onTemplatesChange={(next) => {
            setTemplates(next)
            if (!next.some((template) => template.id === activeId)) setActiveId(null)
          }}
          current={current}
          kinds={["book"]}
          activeId={activeId}
          onLoad={(layout, template) => {
            setCurrent(layout)
            setActiveId(template.id)
            setMessage(`Selected ${template.name}.`)
          }}
        />
      </div>
      <p role="status" className="text-muted-foreground">{message}</p>
    </div>
  )
}
```

Start with a controlled list and the current layout. This example uses a real one-panel snapshot, so save, rename, duplicate, delete, and import work without mounting a workspace. **Load** selects a snapshot in local state and reports its name. The workspace example below restores the panels themselves.

Give a new name to **Save current**, or use an existing name to replace that template. The opening template has a fixed sample date; new saves use the current time. At narrow widths, the manager's controls scroll horizontally.

## Saving and restoring a workspace

Install [`workspace`](workspace.md) as well; it supplies the Workspace and Panel components used here. Change a symbol or add the equities book, then save a named layout. Change the workspace again and load that template to restore its arrangement and panel state. **Reset to default** restores the initial ZN book and keeps the saved list.

The template list is written to this browser under `tradecn-layout-manager-example`, in a preferences slot assigned to the template boundary. Reloading restores the list; choose **Load** to restore a workspace. This is local example storage. Your application chooses its own storage and handles failures.

**Export** shows the layout JSON in a read-only field. Copy it into **Import** and give it a name to add or replace a template; import does not load it. The example takes a fresh current snapshot on ready, load, and reset, while ordinary workspace edits arrive through `onLayoutChange`.

<!-- demo: layout-manager-workspace -->

## API Reference

### Props

`LayoutManagerProps` accepts these inputs:

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `templates` | `readonly LayoutTemplate[]` | Required | Controlled template list. |
| `onTemplatesChange` | `(templates: LayoutTemplate[]) => void` | Required | Receives the whole list after an edit. |
| `current` | `WorkspaceLayout \| null` | `null` | Layout captured by Save current. |
| `onLoad` | `(layout: WorkspaceLayout, template: LayoutTemplate) => void` | Required | Requests a workspace load. |
| `kinds` | `Iterable<string>` | Omitted | Nonempty known kinds enable missing-kind warnings and load confirmation. |
| `activeId` | `string \| null` | `null` | Marks a row as loaded; the caller updates it. |
| `onExport` | `(text: string, template: LayoutTemplate) => void` | Omitted | Enables each row's Export button. |
| `onReset` | `() => void` | Omitted | Enables Reset to default. |
| `now` | `() => number` | `Date.now` | Clock in milliseconds since the epoch. |
| `labels` | `Partial<LayoutManagerLabels>` | `DEFAULT_LAYOUT_MANAGER_LABELS` | Label overrides. |
| `className` | `string` | Omitted | Outer region classes. |

### Template fields

All `LayoutTemplate` fields are required. Keep ids unique when supplying your own list.

| Field | Type | Purpose |
|---|---|---|
| `id` | `string` | Row identity for actions and `activeId`. Generated ids use the lowest available `t-1`, `t-2`, and so on. |
| `name` | `string` | Display name and save/import replacement key. |
| `layout` | `WorkspaceLayout` | Workspace arrangement and panel records. |
| `savedAt` | `number` | Milliseconds since the epoch. Positive values display a date/time in the browser's locale and time zone. |

### The list is yours

[`workspace`](workspace.md) emits layouts through `onLayoutChange` and stores nothing. Accept each new list from `onTemplatesChange` into `templates`; the manager keeps only transient form and confirmation state.

`readLayoutTemplates` and `writeLayoutTemplates` use a [`preferences`](preferences.md) slot named `layouts` by default. Writing returns an envelope with slot version 1 and value `{ version: 1, templates }`; it neither persists the envelope nor assigns a boundary. Put the slot under `template` with `createPreferences` or `withBoundary` to include it in desk-template exports. An unclassified slot defaults to `user`.

Preferences exports select whole slots. A layout's `boundaries` describe its contents; they do not remove fields from a layout export.

### Save, load, and the default

`Save current` and Enter in the save field capture `current` under the trimmed name. Both require a layout and a nonblank name. Save clears the field after emitting the list.

Names match exactly, including case. A matching name shows a replacement warning; saving replaces the first matching template's layout and timestamp while keeping its id and position. A new name appends a template. Save stores the supplied layout reference, so treat layouts as immutable.

`Load` calls `onLoad(layout, template)`; call the workspace's `api.load` there. The manager does not update `activeId` or verify that loading succeeded. `Reset to default` calls `onReset`, where you can clear and reseed the workspace.

Refresh `current` from `api.toLayout()` after loading: the workspace does not emit `onLayoutChange` merely because a layout was restored. The example also snapshots on ready and after reset, so Save captures those changes immediately. Ordinary workspace edits arrive through its debounced `onLayoutChange`.

### A kind the workspace does not have

Pass a nonempty `kinds` iterable to show a badge for unknown panel kinds, sorted and deduplicated by `unknownPanelKinds`. The first Load press becomes `Load anyway?`; the second calls `onLoad`. The workspace draws placeholders for missing kinds. Omitting `kinds` or passing an empty iterable skips both the badge and confirmation.

### Rename, duplicate, delete

`Rename` edits inline. Enter or blur commits a trimmed name; Escape cancels. A blank name leaves the template unchanged. Renaming preserves the timestamp and allows a name already in use.

`Duplicate` inserts a new id and timestamp immediately after the source, named `Copy of <name>`. It copies a valid layout through `parseWorkspaceLayout`; if parsing fails, the helper falls back to the source layout reference. Duplicate names are allowed.

`Delete` becomes `Delete?` on the first press and removes the row on the second. Delete and missing-kind Load share one pending confirmation: another Delete or warning Load replaces it, and completing a load or delete clears it. Other clicks, including Rename, Duplicate, and clicks outside the manager, do not cancel it.

### Import and export

`Import` toggles fields for a layout's JSON and an optional name. `Add` requires nonblank JSON and parses it with `parseWorkspaceLayout`. Invalid input shows an alert and leaves the list unchanged. Editing the JSON clears the alert; success clears and closes the form.

Import uses the same name-replacement rule as Save, but has no taken-name warning or confirmation. A blank name becomes `Imported <local date/time>`; that generated name can also collide. Import does not load the layout.

`Export` calls `onExport` with JSON for the template's layout only, without its id, name, or timestamp. The caller handles the file, clipboard, or message.

### Helpers

These helpers are exported from `@/components/ui/layout-manager`. Here `templates` means `readonly LayoutTemplate[]`, `prefs` means `Preferences`, `layout` means `WorkspaceLayout`, and `savedAt` means a timestamp in milliseconds.

| Helper | Return type | Behavior |
|---|---|---|
| `parseLayoutTemplates(value: unknown)` | `LayoutTemplate[]` | Reads an array or `{ templates: [...] }`, including JSON text. Drops invalid entries and copies accepted layouts. |
| `readLayoutTemplates(prefs, slot = "layouts")` | `LayoutTemplate[]` | Parses the slot's value; a missing slot gives `[]`. |
| `writeLayoutTemplates(prefs, templates, slot = "layouts")` | `Preferences` | Writes a JSON copy at `LAYOUT_TEMPLATES_VERSION` (`1`); the default slot is `LAYOUT_TEMPLATES_SLOT`. |
| `saveTemplate(templates, name: string, layout, savedAt: number)` | `LayoutTemplate[]` | Trims the name, then replaces the first match or appends. Unlike the UI, accepts a blank name. |
| `renameTemplate(templates, id: string, name: string)` | `LayoutTemplate[]` | Renames matching ids; blank names leave entries unchanged. |
| `duplicateTemplate(templates, id: string, savedAt: number, name?: string, labels = DEFAULT_LAYOUT_MANAGER_LABELS)` | `LayoutTemplate[]` | Inserts a copy after the first matching id; a missing id leaves entries unchanged. A nonblank custom name overrides `labels.copyOf`. |
| `deleteTemplate(templates, id: string)` | `LayoutTemplate[]` | Removes all matching ids. |
| `exportTemplate(template: LayoutTemplate, indent = 2)` | `string` | Serializes `template.layout` with the given indentation. |
| `importTemplate(templates, text: string, name: string, savedAt: number)` | `LayoutTemplate[] \| null` | Parses the layout and calls `saveTemplate`; returns `null` for invalid input. |

Parsing requires nonempty string ids/names and layouts accepted by `parseWorkspaceLayout`. Missing or nonnumeric `savedAt` becomes `0`; ids and names are not deduplicated or trimmed. Neither the wrapper's version nor the preference slot's version is checked by these readers. Invalid JSON or an unsupported list shape returns `[]`.

List-editing helpers return new arrays, retaining unchanged entries. They do not show warnings or request confirmation; custom menus and hotkeys supply that behavior.

### Labels

`labels` overrides the region title, fields, buttons, confirmations, copy name, replacement warning, import error, panel count, unknown-kinds badge, empty message, and loaded badge. `taken` and `copyOf` interpolate `{name}`, `panels` uses `{n}`, and `unknownKinds` uses `{kinds}`. The generated `Imported` prefix and date/time formatting are not label overrides.

The title names the outer region. Rows expose `data-layout-template=<id>` and active rows have `data-active="true"`. Rename, Duplicate, Delete, and Export accessible names include the template name; the import error uses `role="alert"`.

### What it does not do

The manager never calls the workspace API or writes storage. Stored/imported layouts pass through `parseWorkspaceLayout`, while a Load click forwards the supplied template as-is. The workspace's `api.load` parses again and returns `false` if parsing or dock restoration fails.

### Tokens

The install adds the `stale` token if you do not have it; the unknown-kinds badge draws from it.
