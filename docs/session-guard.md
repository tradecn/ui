# SessionGuard

Warn before a session expires, then show a sign-in dialog over the desk. The guard leaves the surrounding UI mounted, so drafts and layout can survive re-authentication.

## Usage

```tsx
import { useState } from "react"
import { SessionGuard } from "@/components/ui/session-guard"

function GuardedDraft() {
  const [expiresAt, setExpiresAt] = useState(() => Date.now() + 30_000)
  const [note, setNote] = useState("")

  return (
    <>
      <div data-demo-controls className="flex flex-wrap gap-2 text-xs">
        <button type="button" className="rounded border border-border px-2 py-1" onClick={() => setExpiresAt(0)}>Expire session</button>
      </div>
      <div className="flex min-h-72 w-sm max-w-full flex-col justify-center gap-3 text-xs">
        <SessionGuard expiresAt={expiresAt} warnMs={60_000} onReauthenticate={async () => {
          setExpiresAt(Date.now() + 300_000)
          return true
        }}>
          <p className="text-sm text-muted-foreground">This example signs in immediately.</p>
        </SessionGuard>
        <label className="flex flex-col gap-1.5">
          Draft note
          <input className="rounded border border-border bg-background px-3 py-2" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Kept through sign-in" />
        </label>
      </div>
    </>
  )
}
```

`expiresAt` is milliseconds since the epoch. This example starts with thirty seconds left, inside its one-minute warning window. Type a draft, then choose **Expire session** or wait for the deadline. The sign-in dialog leaves the draft mounted. **Stay signed in** or **Sign in again** renews immediately for five minutes, clearing the banner or dialog.

The callback simulates success. In your application, await your session service, update the expiry in application state on success, and return its boolean result. Returning `true` alone does not close the guard. Put your sign-in UI in its `children` and keep the desk outside it.

## Pending and refused sign-ins

Choose **Show expired session**, then **Sign in again**. The request stays pending until you choose **Accept sign-in** or **Refuse sign-in** inside the dialog. These two controls stand in for the identity provider; keeping them inside the modal lets you retry after refusal.

Acceptance updates the expiry and closes the dialog. Refusal leaves it open with the guard's error message; choose **Sign in again** to retry. This variant uses `warnMs={0}` to skip the warning banner and keep every request inside the dialog, where its reply controls are available. The example settles an unfinished request when it unmounts and creates no timer for the simulated reply.

<!-- demo: session-guard-replies -->

## Session status readouts

`SessionStatus` can show the same expiry elsewhere on the desk, independently of the guard. This comparison uses one fixed clock to keep all four phases available to inspect. Real sessions use the shared ticking clock by default.

To place a readout in [`StatusBar`](status-bar.md), install that component separately and pass the readout to one of its slots.

<!-- demo: session-guard-status -->

## API Reference

The guard reads the expiry time you supply. Your application owns the session and renders its sign-in UI in the dialog's `children`.

### Props

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `expiresAt` | `number \| null \| undefined` | Required | Expiry time in epoch milliseconds. Null, undefined, or a non-finite number means no session. |
| `warnMs` | `number` | `120_000` | Warning window in milliseconds; exported as `DEFAULT_WARN_MS`. |
| `onReauthenticate` | `() => Promise<boolean>` | Required | Request a new session; resolve `true` on success or `false` on refusal. |
| `children` | `ReactNode` | None | Sign-in UI above the dialog's button. |
| `onExpire` | `() => void` | None | Called by an effect on entering the expired phase, including an already-expired mount. |
| `labels` | `Partial<SessionGuardLabels>` | `DEFAULT_SESSION_GUARD_LABELS` | Override the words listed below. |
| `clock` | `Clock` | `sharedClock()` | Clock for the phase and countdown; the default ticks once a second. |
| `className` | `string` | None | Classes on the root wrapper, which uses `block` during warning and `contents` otherwise. |

Changing an expired timestamp to another expired timestamp, or replacing `onExpire` while still expired, does not trigger another expiry notification. Leaving the expired phase and entering it again does. The callback follows a React effect's lifetime; it is not an exactly-once notification across remounts or development Strict Mode effect replay.

### Phases

The root carries `data-session-phase`. The pure helper and hook both return `SessionStatusValue`:

| API | Inputs | Result |
|---|---|---|
| `sessionStatus(expiresAt, now, warnMs?)` | `expiresAt: number \| null \| undefined`; `now: number` in epoch milliseconds; `warnMs: number = DEFAULT_WARN_MS` | The status at the supplied time. |
| `useSessionStatus(expiresAt, options?)` | The same expiry type; `options: UseSessionStatusOptions = {}` | Status updated on clock ticks. Options are `warnMs?: number` and `clock?: Clock`, with the same defaults as the guard. |

| Field | Type | Meaning |
|---|---|---|
| `phase` | `SessionPhase` | `"none"`, `"live"`, `"warning"`, or `"expired"`. |
| `remainingMs` | `number \| null` | Expiry minus the clock time; negative after expiry, null with no session. |
| `expiresAt` | `number \| null` | The supplied finite expiry, or null with no session. |

| Phase | When | What the guard shows |
|---|---|---|
| `none` | Null, undefined, `NaN`, or infinite expiry | Nothing |
| `live` | More than `warnMs` left, above zero | Nothing |
| `warning` | `warnMs` or less left, above zero | The banner |
| `expired` | Zero or less left | The dialog |

`warnMs` is compared directly; zero or negative values skip the warning phase. The hook uses the shared one-second clock from [`countdown`](countdown.md) unless you supply another. For tests, pass `createClock(1000, () => t)` and advance both `t` and the timer.

### The banner

The banner is a `role="status"` strip with a compact [`Countdown`](countdown.md), the warning sentence, and the extension button. It uses `expiring` and `expiring-soft`; the countdown uses `warnMs` as its soon threshold and disables its own announcements inside the status region.

### The wall

The consumer's modal `Dialog` is open whenever the phase is `expired`. It has no close button and ignores close requests from Escape or a click outside. A future expiry closes it: one inside the warning window shows the banner, while one beyond that window shows neither. Clearing the expiry or passing a non-finite value also closes it by moving to `none`.

The modal blocks pointer interaction underneath. For events inside its `role="dialog"`, the [`use-hotkeys`](use-hotkeys.md) dispatcher only considers scopes declared inside it. The guard does not unmount the surrounding desk; keeping drafts and stores alive during sign-in remains part of your application's lifecycle.

The dialog contains the title, description, `children`, and re-authentication button. The banner and dialog share pending and failure state.

### Re-authentication

Both buttons call `onReauthenticate`. While its promise is pending, the visible button is disabled, has `data-pending="true"`, and reads `Signing in…`. Further button presses are ignored until it settles. A phase change does not cancel the request or reset pending state.

Resolving `true` clears failure state but does not change the expiry or phase. Resolving `false`, throwing, or rejecting sets failure state and shows `That did not work. Try again.` as a `role="alert"` beside the button. The promise result alone never closes the banner or dialog.

Starting another attempt clears the failure. Entering `live` or `none` also clears it; moving between `warning` and `expired` preserves it. A request that fails after the phase has moved to `live` or `none` can set failure again, hidden until a banner or dialog next appears.

### The status readout

`SessionStatus` displays `Session` followed by the time left (`1:59:30` or `0:45`), `ended` at expiry, or `no session` without a finite expiry. Remaining time rounds up to the next second. It exposes the phase through `data-session-status` and words in its accessible name, such as `Session: ending soon, 1:30`. Warning uses `expiring`; expiry uses `destructive`.

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `expiresAt` | `number \| null \| undefined` | Required | Expiry time in epoch milliseconds; the same no-session values as the guard. |
| `warnMs` | `number` | `120_000` | Warning window in milliseconds. |
| `clock` | `Clock` | `sharedClock()` | Clock for the phase and remaining time. |
| `labels` | `Partial<SessionGuardLabels>` | `DEFAULT_SESSION_GUARD_LABELS` | Readout text and accessible phase names. |
| `className` | `string` | None | Classes on the readout's span. |

### Labels

Both components merge partial overrides into `DEFAULT_SESSION_GUARD_LABELS`. Every label is a string. Use one `{remaining}` placeholder in `warning`: the countdown goes between the first two parts of that split.

| Label | Default | Where |
|---|---|---|
| `warning` | `Your session ends in {remaining}.` | Banner sentence |
| `extend` | `Stay signed in` | Banner button |
| `expiredTitle` / `expiredDescription` | `Your session has ended` / `Sign in again to carry on. Nothing on the desk has been lost.` | Dialog heading and description |
| `reauthenticate` | `Sign in again` | Dialog button |
| `pending` | `Signing in…` | Either button while pending |
| `failed` | `That did not work. Try again.` | Alert beside either button |
| `session` | `Session` | Readout prefix and countdown's accessible name |
| `live` / `ending` | `signed in` / `ending soon` | Readout's accessible phase names |
| `ended` / `noSession` | `ended` / `no session` | Visible and accessible readout text |

### What it does not do

The guard holds no token, reads no cookie, and does not refresh credentials or redirect. It displays the time you give it; your session service owns authentication and server authorization. It does not pause background work or enforce request permissions. Venue trading hours belong to the separate [`session-calendar`](session-calendar.md) module.

### Tokens

The install adds `expiring` and `expiring-soft` if you do not have them, for the banner and the readout's warning phase.
