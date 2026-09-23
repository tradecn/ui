# useHotkeys

Declare keyboard shortcuts once, attach handlers where they're used, and let the focused panel's bindings take priority.

## Usage

```tsx
import { useState } from "react"
import { HotkeysProvider, useHotkey } from "@/hooks/use-hotkeys"
import type { HotkeyBinding } from "@/lib/hotkeys"

const BINDINGS: HotkeyBinding[] = [
  { id: "counter.increment", keys: "i", scope: "global", description: "Increment counter" },
]

function Counter() {
  const [count, setCount] = useState(0)
  const increment = () => setCount((value) => value + 1)
  useHotkey("counter.increment", increment)
  return (
    <div className="w-fit max-w-full space-y-3 text-sm">
      <button type="button" className="rounded border border-border px-3 py-2 hover:bg-muted" onClick={increment}>Increment</button>
      <p role="status" className="lining-nums tabular-nums">Count: {count}</p>
    </div>
  )
}

export default function UseHotkeysDemo() {
  return <HotkeysProvider bindings={BINDINGS}><Counter /></HotkeysProvider>
}
```

Click Increment, or focus it with Tab and press `i`. A binding declares the key, scope, and description; `useHotkey` supplies its handler beneath `HotkeysProvider`. Keep the binding array stable. This global shortcut stays out of text fields.

The previews have their own documents. Focus a control inside a preview before trying its keys.

## Scoped shortcuts

Click Refresh in one book, then press `r`. Only that book's counter changes. Tab to the other book's button to move the shortcut with focus. `repeat: true` lets a held `r` keep refreshing; bindings ignore repeated keydowns by default.

Both books share one declaration. Each `Book` calls `useHotkey` beneath its own `HotkeyScope`, so the handler belongs to that instance. Calling the hook in a component that returns the scope would register it outside that scope. The counters stand in for refresh requests.

<!-- demo: use-hotkeys-scopes -->

## While typing

Type `r` in the Note field: it stays in the text, and the global refresh count stays unchanged. Press `mod+enter` there to request a save: ⌘+Enter on a Mac, Ctrl+Enter elsewhere. Move focus to Refresh and `r` works again.

The save binding uses the `editing` scope, which runs both inside and outside text fields. Use it for shortcuts safe while typing; keep bare letters out of it. These handlers count requests; they do not persist the note.

<!-- demo: use-hotkeys-editing -->

## Chord sequences

Focus either button, then press `g` followed by `b` for the blotter or `w` for the watchlist. `usePendingChord` shows the prefix while it waits. The default timeout is one second between steps; Escape cancels, and an unrelated key clears the prefix and is tried on its own.

The buttons provide the same actions without a shortcut. This example changes a view label; replace the handlers with your application's navigation.

<!-- demo: use-hotkeys-chords -->

## Live shortcut list

Choose `U`, then focus Increment and press `u`. The old `i` binding no longer runs. Unbound disables the shortcut while leaving the button usable; Reset shortcut restores `I` without resetting the counter.

`useHotkeyList` supplies the current keys, and `formatKeys` turns them into display labels. Remapping changes the existing declaration, so the display and handler stay in sync. This preview keeps overrides in memory; [Remapping](#remapping) covers persistence and the settings editor.

<!-- demo: use-hotkeys-remapping -->

## API Reference

Bindings are data; handlers attach separately. The same list can feed the dispatcher, a command palette's shortcut column, and a help overlay, keeping them in sync after a remap.

### Bindings

| `HotkeyBinding` field | Type | Default | Purpose |
|---|---|---|---|
| `id` | `string` | Required | Nonempty identifier; registering it again replaces the binding. |
| `keys` | `string` | Required | Shortcut or chord; `""` leaves it unbound. |
| `scope` | `HotkeyScopeName` | Required | `"global"`, `"editing"`, or `"panel:<id>"`. |
| `description` | `string` | Required | Text for help and settings. |
| `group` | `string` | Unset | Grouping metadata for help and settings displays. |
| `when` | `() => boolean` | No condition | Checked at keydown; `false` skips this binding. |
| `repeat` | `boolean` | `false` | Accept repeated keydowns while a key is held. |
| `preventDefault` | `boolean` | `true` | Prevent the browser's default when the handler runs. Chord prefixes always prevent it. |

Join modifiers and one key with `+`; separate chord steps with spaces: `"mod+k"`, `"shift+/"`, `"?"`, `"alt+up"`, `"g b"`. `mod` is ⌘ on a Mac and Ctrl elsewhere. Use `plus` for the plus key. `"?"` and `"shift+/"` both match a shifted question mark; `"alt+k"` matches Option+K even when it produces `˚`.

### React API

`HotkeysProvider` supplies the registry and attaches its listener. Keep `bindings` stable, such as a module constant: changing the array removes the previous declarations and registers the new ones. Unmounting removes those declarations and detaches the listener.

| Provider prop | Type | Default | Purpose |
|---|---|---|---|
| `registry` | `HotkeyRegistry` | Created internally | Supply a registry configured or loaded before rendering. |
| `bindings` | `readonly HotkeyBinding[]` | Unset | Declare these bindings while mounted. |
| `target` | `HotkeyTarget` | `document` | Event target to listen on, such as a popout's document. |
| `children` | `ReactNode` | Unset | Content that uses the registry. |

| Hook | Result or behavior |
|---|---|
| `useHotkeys()` | Nearest provider's `HotkeyRegistry`; throws without a provider. |
| `useMaybeHotkeys()` | Same registry, or `null` without a provider. |
| `useHotkey(id: string, handler: HotkeyHandler, options?)` | Attach the latest `(event: KeyboardEvent) => void` handler while mounted. `options.enabled` is a boolean, default `true`; `false` detaches the handler but keeps the binding listed. |
| `useHotkeyList()` | Live `readonly HotkeyEntry[]`, including normalized `keys`, normalized `defaultKeys`, and `remapped` when they differ. |
| `usePendingChord()` | Normalized steps typed so far, or `null`, for a status-bar hint. |

All hooks except `useMaybeHotkeys` require a provider.

### Scopes

The dispatcher reads `[data-hotkey-scope]` ancestors from the event target outward, then adds `editing` and `global` outside dialogs. The innermost eligible binding wins. A false `when()` or missing handler lets another binding answer.

| Event context | Eligible scopes |
|---|---|
| Ordinary content | Enclosing scopes, then `editing` and `global`. |
| Text input, textarea, select, contenteditable, or `role="textbox"` | Only `editing`. Non-text inputs such as checkboxes do not count as typing. |
| Inside `role="menu"`, `menubar`, or `listbox` | None; the widget owns its keys. |
| Inside `role="dialog"` or `alertdialog` | Only scopes declared on or within the nearest dialog, still subject to the input and menu rules. |

Use `editing` for shortcuts safe while typing, such as `mod+k` and `mod+enter`; avoid bare letters. A ticket inside a dialog can declare `<HotkeyScope scope="editing">` to keep its shortcuts available.

`HotkeyScope` requires `scope: HotkeyScopeName` and accepts div props except `ref`, including `children`, `className`, and `style`. It marks the div with `data-hotkey-scope` and defaults `tabIndex` to `-1`, making the panel surface focusable on click.

For two instances of one panel, put each handler beneath its own `HotkeyScope`. If the nearest scope matches the binding's scope, `useHotkey` answers only for events inside that element. Without a matching nearest scope, the handler has no element restriction. The most recently attached eligible handler wins; a handler supplied to `register` is the fallback.

### Chords

`"g b"` waits 1,000 ms for `b`. Set `chordTimeoutMs` when creating the registry to change the wait between steps. A chord starting in a nearer scope outranks a completed binding farther out; at the same scope, the completed binding wins immediately.

Already-prevented events, IME composition, and ignored keys such as bare modifiers leave a pending chord untouched. Other keydowns from a menu clear it without consuming the key. Escape elsewhere cancels it and is consumed.

A key that does not continue the chord clears it and is tried on its own, so `g` then `mod+k` can still open the palette. An unmatched repeated keydown can also clear the chord. Scope and handler eligibility are checked again for each step.

### Conflicts

`register` and `remap` return the changed binding's conflicts. `conflicts()` returns all of them. Each result has `kind`, the normalized contested `keys` (the shorter sequence for a prefix), and the two binding `ids`.

| Kind | Reported overlap |
|---|---|
| `duplicate` | Same keys in the same scope, or between `global` and `editing`. |
| `prefix` | One sequence starts another in the same scope, or between `global` and `editing`. |
| `shadow` | A panel and a global or editing binding share keys or a chord prefix. |

These reports compare declarations, regardless of handlers or `when()`. They do not reject a binding or guarantee which one will run. A shadow may be intentional. Unbound bindings and pairs with different panel scope names are excluded, even when those panels are nested.

### Remapping

Persistence is yours. `onChange` receives the full override map after `remap` or `reset`; `load` restores it without calling `onChange`. Overrides can load before or after their bindings. An override that fails to parse falls back to the binding's default keys.

For the plus key, strings such as `"ctrl++"` returned by normalization or capture cannot be parsed again. If a binding defaults to `"x"`, `remap(id, "ctrl+plus")` stores that invalid form and falls back to `"x"`.

For persistence, create a registry once, restore saved overrides with `load`, and pass it to `HotkeysProvider`. Subscribe to `onChange` to save the override map, for example as JSON in `localStorage`; unsubscribe when the owner unmounts. Handle missing or invalid stored data in the application. The [live shortcut list](#live-shortcut-list) shows `remap` and `reset` without storage.

| Registry method | Result or behavior |
|---|---|
| `remap(id: string, keys: string)` | Override a declared binding; `""` unbinds it, and its default keys remove the override. Returns `HotkeyConflict[]`; throws for unknown ids or keys that do not parse. |
| `reset(id?: string)` | Remove one override, or all when omitted. |
| `load(overrides: HotkeyOverrides)` | Replace all overrides. `HotkeyOverrides` is `Record<string, string>`, keyed by binding id. |
| `overrides()` | Return the current override map. |
| `onChange(callback)` | Subscribe with `(overrides: HotkeyOverrides) => void`; returns an unsubscribe function. |

`keysFromEvent(event: KeyboardEvent)` captures one step for a shortcut field, or returns `null` for ignored keys such as bare modifiers. The playground includes a capture field; [HotkeyEditor](hotkey-editor.md) provides a settings screen.

### The rest

`createHotkeyRegistry(options?)` accepts `chordTimeoutMs` (number, default `1000`) and `platform` (`"mac"` or `"other"`, default `detectPlatform()`). The selected platform is available as `registry.platform`.

| Registry method | Result or behavior |
|---|---|
| `register(binding: HotkeyBinding, handler?: HotkeyHandler)` | Declare or replace a binding; return its `HotkeyConflict[]`. |
| `unregister(id: string)` | Remove a declaration. |
| `bind(id: string, handler: HotkeyHandler, within?: HandlerScope \| null)` | Attach a handler before or after declaration; return a detach function. `within` optionally supplies `{ scope: string, element: () => Element \| null }` for the element restriction described above. |
| `list()` | Current `readonly HotkeyEntry[]`, also read by `useHotkeyList`. |
| `conflicts()` | All reported `HotkeyConflict[]`. |
| `pending()` | Normalized pending chord, or `null`. |
| `subscribe(callback: () => void)` | Subscribe to list or pending-chord changes; return an unsubscribe function. |
| `attach(target?: HotkeyTarget)` | Listen for `keydown`; return a detach function. `HotkeyTarget` supplies `addEventListener` and `removeEventListener`. Defaults to `document`, or does nothing when no document exists. |
| `handle(event: KeyboardEvent)` | Dispatch a forwarded event; return `true` when consumed. |

Attaching the same target more than once adds one listener; it stays until every attachment is detached. Use another document as the target to share bindings with a popout window.

| Key helper | Result |
|---|---|
| `normalizeKeys(keys: string, platform?)` | Resolve `mod`, fold aliases, and order modifiers; throw for keys that do not parse. |
| `formatKeys(keys: string, platform?)` | `string[][]`, one key-cap array per chord step, suitable for shadcn's `kbd`. |
| `matchesKeys(event: KeyboardEvent, keys: string, platform?)` | Whether a single-step shortcut matches; chords return `false`. This helper does not apply the dispatcher's scope or event guards. |

Each optional helper `platform` is `"mac"` or `"other"` and defaults to `detectPlatform()`. For example, `formatKeys("mod+shift+k")` returns `[["⇧", "⌘", "K"]]` on a Mac and `[["Ctrl", "Shift", "K"]]` elsewhere. Use `matchesKeys` when a component handles a shortcut itself inside a protected context.

The dispatcher ignores events already prevented, IME composition, and keys such as bare modifiers. Bindings run on repeated keydowns only with `repeat: true`. A binding without an eligible handler consumes nothing.

### What it does not do

No `keyup` handling or storage. Matching uses the character produced, with a physical-key fallback when Shift or Option changes it to a symbol; that fallback is disabled for AltGr. It does not infer keyboard layouts.
