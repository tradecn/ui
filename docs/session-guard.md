# SessionGuard

A banner with a countdown as a session nears its end, and at expiry a dialog that walls off every action underneath while unmounting nothing, so a half-typed ticket and the layout survive a sign-in.

## Usage

```tsx
import { SessionGuard, SessionStatus } from "@/components/ui/session-guard"
```

```tsx
<SessionGuard expiresAt={session.expiresAt} warnMs={120_000} onReauthenticate={() => auth.refresh()}>
  <SignInWithToken />
</SessionGuard>

<StatusBar right={<SessionStatus expiresAt={session.expiresAt} />} />
```

`expiresAt` is milliseconds since the epoch. `onReauthenticate` is your sign-in: resolve `true` when there is a new session and pass the new `expiresAt`, and the guard steps back.

## API Reference

The guard holds no token and knows no protocol. It reads one number, when the session ends, and does three things with it: shows a banner in the warning window, opens a wall at expiry, and reports the phase for a status bar. Your sign-in is the dialog's children, and `onReauthenticate` is how it is asked.

### Props

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `expiresAt` | `number \| null \| undefined` | Required | When the session ends. Null or undefined while there is no session. |
| `warnMs` | `number` | `120_000` | How long before the end the banner shows. |
| `onReauthenticate` | `() => Promise<boolean>` | Required | Ask for a new session. Resolve `true` when there is one. |
| `children` | `ReactNode` | None | Your re-authentication, shown in the dialog above the button. |
| `onExpire` | `() => void` | None | The session ended. Called once per expiry. |
| `labels` | `Partial<SessionGuardLabels>` | `DEFAULT_SESSION_GUARD_LABELS` | Override the words listed below. |
| `clock` | `Clock` | `sharedClock()` | The one-second clock the phases tick on; `createClock(1000, () => t)` for tests. |
| `className` | `string` | None | Classes on the banner. |

### Phases

The root carries `data-session-phase`; `sessionStatus(expiresAt, now, warnMs)` is the rule and `useSessionStatus(expiresAt, { warnMs, clock })` the hook, both returning `{ phase, remainingMs, expiresAt }`.

| Phase | When | What shows |
|---|---|---|
| `none` | No `expiresAt` | Nothing |
| `live` | More than `warnMs` left | Nothing |
| `warning` | `warnMs` or less left, above zero | The banner |
| `expired` | Zero or less | The dialog |

The phases move on the shared one-second clock from [`countdown`](countdown.md); nothing else re-renders when the guard ticks.

### The banner

A `role="status"` strip with the warning sentence around a compact [`Countdown`](countdown.md) in the `expiring` token, and a button that calls `onReauthenticate`. The button reads `Signing in…` and is disabled while the promise is out (`data-pending`); a resolution of `false` or a rejection prints `That did not work. Try again.` as an alert, cleared when the session is live again.

### The wall

At expiry the guard opens the consumer's `Dialog`, controlled and without a close button: Escape and a click outside ask to close and are refused, because the session is what opens and closes it. It is a modal, so nothing underneath takes a pointer, and it is a `role="dialog"`, so the hotkey dispatcher from [`use-hotkeys`](use-hotkeys.md) treats it as a wall: only scopes declared inside it are active. Nothing underneath unmounts; the drafts, the layout, and the stores stay exactly as they were, and the desk carries on where it left off when `expiresAt` moves.

The dialog holds the title, the description, your `children`, and the button, with the same pending and failed states as the banner.

### Re-authentication

`onReauthenticate` is called on the banner's button and on the dialog's. It is yours: a password field, an SSO round trip, a hardware token. The guard closes when `expiresAt` moves, not when the promise resolves, because the token is what it is until the server says otherwise; resolve `true` and pass the new time together. A second press while one is out does nothing.

### The status readout

`SessionStatus` is the phase for a status bar: the word `Session`, the time left as `1:59:30` or `0:45`, and `ended` past the end, on `data-session-status` with the phase in words in its accessible name (`Session: ending soon, 1:30`). The warning phase sets in the `expiring` token and expiry in `destructive`, over the words that say the same.

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `expiresAt` | `number \| null \| undefined` | Required | When the session ends. |
| `warnMs` | `number` | `120_000` | When the readout turns to the warning phase. |
| `clock` | `Clock` | `sharedClock()` | The clock. |
| `labels` | `Partial<SessionGuardLabels>` | Defaults | The words. |
| `className` | `string` | None | Classes on the readout. |

### Labels

`labels` merges partial overrides into `DEFAULT_SESSION_GUARD_LABELS`:

| Label | Default | Where |
|---|---|---|
| `warning` | `Your session ends in {remaining}.` | The banner; `{remaining}` is the countdown |
| `extend` | `Stay signed in` | The banner's button |
| `expiredTitle` / `expiredDescription` | `Your session has ended` / `Sign in again to carry on. Nothing on the desk has been lost.` | The dialog |
| `reauthenticate` | `Sign in again` | The dialog's button |
| `pending` / `failed` | `Signing in…` / `That did not work. Try again.` | Both buttons |
| `session` | `Session` | The readout's word and the countdown's name |
| `live` / `ending` / `ended` / `noSession` | `signed in` / `ending soon` / `ended` / `no session` | The readout's phase, in words |

### What it does not do

It does not refresh a token, read a cookie, redirect to a login page, or time anything but the number it is given. Your session service decides when the session ends and what signing in again means.

### Tokens

The install adds `expiring` and its soft variant if you do not have them, for the banner and the readout's warning phase.
