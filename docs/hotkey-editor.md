# hotkey-editor

The settings screen for the hotkey registry: every binding under its group with its keys in force, and three ways to change one.

## Usage

```tsx
import { HotkeyEditor } from "@/components/ui/hotkey-editor"
import { HotkeysProvider } from "@/hooks/use-hotkeys"
```

```tsx
const hotkeys = createHotkeyRegistry()
hotkeys.load(JSON.parse(localStorage.getItem("hotkeys") ?? "{}"))
hotkeys.onChange((overrides) => localStorage.setItem("hotkeys", JSON.stringify(overrides)))

<HotkeysProvider registry={hotkeys} bindings={BINDINGS}>
  <Dialog>
    <DialogContent>
      <HotkeyEditor onExport={(overrides) => download("hotkeys.json", overrides)} />
    </DialogContent>
  </Dialog>
</HotkeysProvider>
```

## API Reference

### The list

Every binding the registry holds, from `useHotkeyList`, grouped under its `group` or, without one, the word for its scope (`global`, `editing`, or a panel's kind), and sorted by group and description. Each row shows the description, the keys in force as key caps, a `changed` badge when the keys are not the binding's own, and any conflicts the keys take part in, in words. The field above finds a shortcut by its words, its group, its id, or its keys as shown (`ctrl` finds `Ctrl K`). `hide` keeps a binding off the list without unregistering it.

### Three ways to change a shortcut

**Press it.** `Change` turns the row into a button that says to press the new shortcut. The next key pressed with its modifiers becomes the keys, through `keysFromEvent`; Escape cancels; Backspace or Delete unbinds. The keydown is the editor's, so the registry's own listener never runs a binding under it.

**Type it.** `Type it` opens the keys as text, for a chord or a key the keyboard cannot press here: `mod+k`, `g b`. Enter commits, Escape cancels, and text that is not a shortcut is said under the row and changes nothing.

**Reset it.** A changed row has `Reset`, and `Reset all` above the list takes every binding back to its own keys.

All three go through the registry's `remap` and `reset`, so the registry's `onChange` fires with the full override map and your persistence hears it; the editor keeps nothing of its own.

### Conflicts

After every change the registry's `conflicts()` are read and each is said under both rows it touches: `same keys as "…"` for a duplicate, `starts the chord of "…"` for a prefix, and `hides, while focus is in this panel, "…"` for a panel binding that shadows a global or editing one. A shadow is often what you meant; it is said so a trader can decide.

### Export and import

`onExport` shows an Export button and is called with the overrides as the registry holds them, for a file or a clipboard. `onImport` shows an Import button and is called with nothing: you open your picker, read the overrides, and call `registry.load(overrides)`, which the list then shows. Both are left out when the props are.

### Labels

Every word is in `labels`, a partial of `DEFAULT_HOTKEY_EDITOR_LABELS`, the conflict phrases included. The region is named `Keyboard shortcuts` for a screen reader; each row's buttons say what they do and to which binding, and the text field is `Keys for` the binding.

### What it does not do

It needs a `HotkeysProvider` above it and declares no bindings of its own. It does not persist anything, and it does not decide what a conflict means: it says the words and leaves the keys where the trader put them.

### Tokens

The install adds the `stale` token, which the conflict lines draw from, if you do not have it.
