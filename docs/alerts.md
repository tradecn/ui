# Alerts

The strip of notices: the newest few with the severity as your word and the tone beside it, the count when one stands for many, the actions the server allowed, a dismiss, a clear-all, and the whole list a click away, over a store that folds repeats and keeps to a cap.

## Usage

```tsx
import { Alerts, useToastBridge } from "@/components/ui/alerts"
import { createAlertStore } from "@/lib/alert-store"
```

```tsx
const alerts = createAlertStore({ max: 500 })

// From the feed: the venue's word for the severity, a key so repeats fold, the actions it allows.
alerts.push({ key: `feed:${feed.id}:slow`, severity: "warning", tone: "stale", title: `${feed.name} slow`, message: `${age} s behind`, allowedActions: ["reconnect"] })

useToastBridge(alerts, (alert) => toast(alert.title, { description: alert.message }))

<Alerts alerts={alerts} visible={3} assertive={["critical"]} ttlMs={20_000} actions={[{ id: "reconnect", label: "Reconnect", onAction: (a) => feeds.reconnect(a.meta?.feed) }, { id: "ack", label: "Acknowledge", onAction: (a) => api.ack(a.id) }]} />
```

## Composition

`Alerts` is the strip: the newest `visible` notices, a `{n} more` button that opens `AlertList` in your `dialog`, and `Clear all`. `AlertList` is the whole list in the [`data-grid`](data-grid.md), newest first, for a panel of your own; `alertColumns()` are its columns as a list to spread, and `useAlertView(alerts)` the view they share. `useToastBridge(alerts, toast)` sits beside either and forwards each new notice to whatever toast function you have. The store is [`alert-store`](alert-store.md), installed alongside.

## API Reference

### A store, not a toast each

At the close a thousand events land in a short window, and a pop-up per event buries the screen. Notices go into `createAlertStore()` instead, a row store on the ordered lane: a notice with the same `key` replaces the last one and grows its `count` rather than adding a row, and `max` (500 by default) keeps the list to a size, the oldest without an action going first and the oldest with one after. The strip shows the newest `visible` (three by default) and says how many more there are. Every read is through the row store, so the strip, the list, a view of your own, and the bridge all see one truth.

### The words are yours

`severity` is a string printed as it is, the venue's or your own: `info`, `warning`, `critical`, `fill`. `tone` is a token name beside it, `up`, `down`, `flat`, `stale`, `expiring`, `primary`, or `destructive`, drawn as a bar on the notice's edge and as the color of the severity word; the word is always there, so the color is a hint and never the message. `title` and `message` print as given. Nothing here decides what a notice means or when it is over.

### Actions are the server's

`actions` names what a notice may offer, by id, with your label and your handler, in your order. A notice offers only the ids in its `allowedActions`, and none without a list, the same rule the blotter and the tickets hold. The handler gets the notice; what happens next is yours.

### It never takes focus

A notice arriving moves nothing: no focus, no scroll, no dialog. Two visually hidden live regions carry it to a screen reader instead. The newest notice is announced politely, through `role="status"`, and at once, through `role="alert"`, only when its severity is in `assertive`. A trader typing a price hears about a rejected order and keeps typing.

### Dismissal

Each notice has a dismiss, and the strip a `Clear all`. With `ttlMs`, a notice with no allowed action is dismissed that long after it arrived; a notice with an action never dismisses itself, since something is waiting to be done about it. Without `ttlMs` nothing leaves on its own. The store's `dismiss` and `clear` are what the buttons call, so a key that dismisses from your own hotkeys calls the same.

### The whole list

`{n} more` opens `AlertList` in your dialog: the grid over the same store, newest first, in the `blotter` preset, so a notice arriving above the first visible row moves the viewport by exactly its height. Pass `listPreset` for another preset and `listColumns` for other columns. Render `AlertList` yourself for a notices panel that is always open.

### The toast bridge

`useToastBridge(alerts, toast)` calls `toast(alert)` once for each notice that is new to the store, oldest of a batch first, and not for one folded into an existing key, whose row has the count. It imports no toast package: hand it your shadcn `sonner`, your own, or nothing.

### Labels

Every word is in `labels`, a partial of `DEFAULT_ALERTS_LABELS`: the region's name, the list's title and line, the dismiss and clear buttons, the `{n} more` template, the count's `×`, the empty line, and the list's column headers.

### Tokens

The install adds the `up`, `down`, `flat`, `stale`, and `expiring` tokens with their soft variants, if you do not have them; the bars and the severity words draw from them.
