# useHotkeys

A hotkey registry: bindings declared once as data, one keydown listener, and scopes read from the DOM so a panel's keys beat global ones.

## Usage

```tsx
import { HotkeysProvider, useHotkey } from "@/hooks/use-hotkeys"
import type { HotkeyBinding } from "@/lib/hotkeys"
```

```tsx
const BINDINGS: HotkeyBinding[] = [
  { id: "palette.open", keys: "mod+k", scope: "editing", description: "Open the command palette" },
  { id: "go.blotter", keys: "g b", scope: "global", description: "Go to the blotter" },
  { id: "book.cancel", keys: "x", scope: "panel:book", description: "Cancel the selected order" },
]

<HotkeysProvider bindings={BINDINGS}>
  <App />
</HotkeysProvider>

// in a component
useHotkey("go.blotter", () => navigate("/blotter"))
```

## API Reference

A binding is data: an id, keys, a scope, a description. You declare it once. The same list then runs the dispatcher, fills a command palette's shortcut column, and draws a help overlay, so a remap changes all three at once. Handlers attach separately and live as long as the component that owns them.

Keys are modifiers and one key joined by `+`, and a chord is steps separated by a space: `"mod+k"`, `"shift+/"`, `"?"`, `"alt+up"`, `"g b"`. `mod` is ⌘ on a Mac and Ctrl elsewhere. Write the plus key as `plus`. A shifted symbol works either way you write it, and `alt+k` still matches on a Mac, where Option turns the character into `˚`.

### Scopes

Scope is where the key came from. The chain runs from the event target outward through every `[data-hotkey-scope]` ancestor, then `editing`, then `global`. The innermost binding wins, and a binding whose `when()` is false steps aside for the next one out.

- `global` runs anywhere except while you type.
- `editing` runs anywhere, inputs included. It is the opt-in for keys that are safe mid-word: `mod+k`, `mod+enter`, never a bare letter.
- `panel:<id>` runs with focus inside `<HotkeyScope scope="panel:<id>">`. The scope element takes focus on click, so clicking a panel is enough to aim the keyboard at it.

Three places are protected. Inside a text input, textarea, select, or contenteditable, only `editing` bindings run (a checkbox is not typing). Inside a menu, menubar, or listbox nothing runs, because those own their arrows and letters. A dialog is a wall: with focus inside `role="dialog"` or `alertdialog`, only scopes declared inside that dialog are active, so `x` cannot cancel an order under a confirmation. A ticket in a dialog wraps itself in `<HotkeyScope scope="editing">` and keeps its keys.

Two instances of one panel share a binding. `useHotkey` called inside a `HotkeyScope` of the binding's own scope answers only for events from that element, so the book with focus is the book that cancels. Called anywhere else it answers for every match.

### Chords

`"g b"` waits one second for the `b` (`chordTimeoutMs`). Escape cancels and is swallowed. A key that does not continue the chord drops it and is read on its own, so `g` then `mod+k` still opens the palette. A chord that starts in a panel outranks a finished global binding on the same first key. `usePendingChord()` gives the steps typed so far for a status-bar hint.

### Conflicts

`register` and `remap` return the conflicts the binding takes part in, and `conflicts()` returns all of them: `duplicate` for the same keys where both can fire, `prefix` when one binding is the start of another's chord and would always win, `shadow` when a panel binding hides a global or editing one while focus is in that panel. A shadow is often what you meant; it is reported so a settings screen can say so. Two different panels never conflict.

### Remapping

`remap(id, keys)` overrides a binding, `remap(id, "")` unbinds it, `reset(id?)` goes back. Persistence is yours: `onChange` fires with the full override map after a remap or reset, and `load(overrides)` puts it back at startup, before or after the bindings are declared. An override that no longer parses falls back to the default instead of throwing. `keysFromEvent(event)` turns a keydown into the string `remap` takes, for a "press the new shortcut" field. The playground scene has one.

```ts
const hotkeys = createHotkeyRegistry()
hotkeys.load(JSON.parse(localStorage.getItem("hotkeys") ?? "{}"))
hotkeys.onChange((overrides) => localStorage.setItem("hotkeys", JSON.stringify(overrides)))

<HotkeysProvider registry={hotkeys} bindings={BINDINGS}>
```

### The rest

`useHotkeyList()` is the live list, each entry with `keys` in force, `defaultKeys`, and `remapped`. `formatKeys("mod+shift+k")` is `[["⇧", "⌘", "K"]]` on a Mac and `[["Ctrl", "Shift", "K"]]` elsewhere, one array per chord step, shaped for shadcn's `kbd` if you have it. `matchesKeys(event, keys)` is for a component that has to answer a binding itself, behind a wall the dispatcher will not cross. `attach(target)` listens on another document, which is how a popout window gets the same keys; attaching one target twice adds one listener.

The dispatcher stays out of events that already had `preventDefault` called, so a grid or a combobox that handled the key keeps it. It ignores IME composition and key repeat, unless a binding sets `repeat`. It calls `preventDefault` on a match unless the binding says otherwise. A binding with no handler attached consumes nothing.

### What it does not do

`keyup`, a settings screen, or storage. It does not guess at keyboard layouts: it matches the character the key produced, and reads the physical key only when Shift or Option changed that character.
