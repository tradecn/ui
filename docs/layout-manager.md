# LayoutManager

Named layouts for a workspace: save the current one, load, rename, duplicate, delete with an ask-again, import and export the JSON, and go back to the default, over a list the consumer keeps in a preferences slot.

## Usage

```tsx
import { LayoutManager, readLayoutTemplates, writeLayoutTemplates } from "@/components/ui/layout-manager"
import { Workspace, type WorkspaceApi } from "@/components/ui/workspace"
```

```tsx
const [prefs, setPrefs] = useState(() => parsePreferences(localStorage.getItem("prefs")) ?? createPreferences({ template: ["layouts"] }))
const [current, setCurrent] = useState<WorkspaceLayout | null>(null)
const api = useRef<WorkspaceApi | null>(null)

<Workspace panels={PANELS} seed={seed} onReady={(a) => (api.current = a)} onLayoutChange={setCurrent} />
<LayoutManager
  templates={readLayoutTemplates(prefs)}
  onTemplatesChange={(templates) => setPrefs(writeLayoutTemplates(prefs, templates))}
  current={current}
  kinds={Object.keys(PANELS)}
  onLoad={(layout) => api.current?.load(layout)}
  onReset={() => { api.current?.clear(); seed(api.current!) }}
  onExport={(text, template) => download(`${template.name}.json`, text)}
/>
```

## API Reference

### The list is yours

[`workspace`](workspace.md) hands its layout back through `onLayoutChange` and stores nothing. This item keeps nothing either: `templates` is a list of `{ id, name, layout, savedAt }` you pass in, and every change, a save, a rename, a duplicate, a delete, an import, is a whole new list handed to `onTemplatesChange`. Where the list lives is yours. `readLayoutTemplates(prefs)` and `writeLayoutTemplates(prefs, templates)` put it in a [`preferences`](preferences.md) slot named `layouts` (or one you name) at version 1, so a desk template travels with the rest of a person's settings and leaves in an export under the `template` boundary when you put the slot there. `parseLayoutTemplates(value)` reads a stored list taking nothing on trust: a template whose layout does not parse is dropped, the rest stay, and a copy comes back.

### Save, load, and the default

`current` is the layout the workspace last handed over; `Save current` puts it in the list under the typed name, Enter in the field does the same, and a name already in the list is said under the field and replaced on save. `Load` hands a template's layout to `onLoad`, and you call the workspace's `api.load`. `Reset to default` calls `onReset`, where you clear the workspace and seed it again; there is no button without it. `activeId` marks the template that is open.

### A kind the workspace does not have

Give `kinds`, the workspace's panel kinds, and a template that asks for others wears a badge naming them, from `unknownPanelKinds`. Its `Load` asks again before it opens, `Load anyway?`, because the workspace would draw a placeholder for every panel of a kind it lacks. That is the warning before, not instead of, the load.

### Rename, duplicate, delete

`Rename` opens the name in place; Enter or leaving the field commits, Escape leaves it as it was, and a blank name changes nothing. `Duplicate` puts a copy beside the original, named `Copy of <name>`, with the layout copied so the two never share an object. `Delete` asks again, the blotter's pattern: the button says `Delete?` and the next press deletes; a press anywhere else withdraws the question.

### Import and export

`Import` opens a field to paste a layout's JSON into, with a name for it; `Add` puts it in the list through `parseWorkspaceLayout`, and text that is not a layout is said and refused. `Export` hands `onExport` the template's layout as JSON text; a file, the clipboard, a message are yours. There is no export button without `onExport`. The pure parts, `saveTemplate`, `renameTemplate`, `duplicateTemplate`, `deleteTemplate`, `exportTemplate`, and `importTemplate`, are exported for a menu or a hotkey of your own.

### Labels

Every word is in `labels`, a partial of `DEFAULT_LAYOUT_MANAGER_LABELS`: the region's title, the field's name, the buttons, both ask-again words, the copy's name, the taken-name line, the panel count, the unknown-kinds badge, the empty line, and the `loaded` badge. The region is named by the title; each row is `data-layout-template=<id>`.

### What it does not do

It does not hold the workspace's api, store the list, download a file, or decide what a layout may contain. It never loads a layout by itself: every load is `onLoad`, and the workspace's `parseWorkspaceLayout` is the last word on what opens.

### Tokens

The install adds the `stale` token if you do not have it; the unknown-kinds badge draws from it.
