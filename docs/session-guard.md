# SessionGuardProvider

Compose session warnings and sign-in dialogs while keeping surrounding drafts mounted. <a id="sessionguard"></a>

## Usage

```tsx
import { cn } from "cn"
import { useRef, useState, type ReactNode, type RefObject } from "react"
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { SessionGuardActionLabel, SessionGuardDialog, SessionGuardError, SessionGuardProvider, SessionGuardReauthenticate, SessionGuardWarning, SessionGuardWarningText, useSessionGuard, type SessionGuardProviderProps } from "@/components/ui/session-guard"

export default function SessionGuardDemo() {
  const [expiresAt, setExpiresAt] = useState(() => Date.now() + 30_000)
  const [note, setNote] = useState("")
  const draft = useRef<HTMLInputElement>(null)

  return (
    <>
      <div data-demo-controls className="flex flex-wrap gap-2 text-xs">
        <button type="button" className="rounded border border-border px-2 py-1" onClick={() => setExpiresAt(0)}>Expire session</button>
      </div>
      <div className="flex min-h-72 w-sm max-w-full flex-col justify-center gap-3 text-xs">
        <SessionNotice expiresAt={expiresAt} warnMs={60_000} fallbackFocusRef={draft} onReauthenticate={async () => {
          setExpiresAt(Date.now() + 300_000)
          return true
        }}>
          <p className="text-sm text-muted-foreground">This example signs in immediately.</p>
        </SessionNotice>
        <label className="flex flex-col gap-1.5">
          Draft note
          <input ref={draft} className="rounded border border-border bg-background px-3 py-2" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Kept through sign-in" />
        </label>
      </div>
    </>
  )
}

export interface SessionNoticeProps extends Omit<SessionGuardProviderProps, "children"> {
  children?: ReactNode
  className?: string
  fallbackFocusRef: RefObject<HTMLElement | null>
}

export function SessionNotice({ children, className, fallbackFocusRef, ...props }: SessionNoticeProps) {
  return <SessionGuardProvider {...props}><SessionNoticeContent className={className} fallbackFocusRef={fallbackFocusRef}>{children}</SessionNoticeContent></SessionGuardProvider>
}

function SessionNoticeContent({ children, className, fallbackFocusRef }: Pick<SessionNoticeProps, "children" | "className" | "fallbackFocusRef">) {
  const { phase, labels, pending } = useSessionGuard()
  return (
    <div data-session-phase={phase} className={cn(phase === "warning" ? "block" : "contents", className)}>
      <SessionGuardWarning>
        <SessionGuardWarningText />
        <SessionGuardReauthenticate size="sm" variant="outline" className="h-7"><SessionGuardActionLabel /></SessionGuardReauthenticate>
        <SessionGuardError />
      </SessionGuardWarning>
      <SessionGuardDialog fallbackFocusRef={fallbackFocusRef}>
        <DialogHeader>
          <DialogTitle>{labels.expiredTitle}</DialogTitle>
          <DialogDescription>{labels.expiredDescription}</DialogDescription>
        </DialogHeader>
        {children}
        <div className="flex flex-wrap items-center gap-2">
          <SessionGuardReauthenticate>{pending ? labels.pending : labels.reauthenticate}</SessionGuardReauthenticate>
          <SessionGuardError />
        </div>
      </SessionGuardDialog>
    </div>
  )
}
```

Save this example as `session-guard.tsx`, outside `components/ui` so it cannot overwrite the installed component, beside examples that import `SessionNotice`. It uses the Button, Dialog and `cn` dependencies included by the session-guard installation. Keep application drafts outside conditional warning and dialog content.

Your application owns authentication. Await your session service, update `expiresAt` on success, and return its boolean result from `onReauthenticate`. Returning `true` alone does not close the dialog.

## Composition

Use the following composition to build a `SessionGuardProvider`:

```text
SessionGuardProvider
├── SessionGuardWarning
│   ├── SessionGuardWarningText
│   │   └── SessionGuardRemaining
│   ├── SessionGuardReauthenticate
│   │   └── SessionGuardActionLabel
│   └── SessionGuardError
└── SessionGuardDialog
    ├── DialogHeader
    │   ├── DialogTitle
    │   └── DialogDescription
    ├── Application sign-in content
    ├── SessionGuardReauthenticate
    └── SessionGuardError
```

The provider adds no markup. Arrange the warning, readings, actions and sign-in content yourself, or reuse `SessionNotice` from Usage. `SessionGuardRemaining` places the countdown without the default warning sentence; `useSessionGuard` supplies the same request behavior to custom controls.

## Custom layout

Use `SessionGuardRemaining` and `useSessionGuard` to move the reading and replace the sign-in controls.

<!-- demo: session-guard-inline -->

## Pending and refused sign-ins

Keep the action pending until the simulated service accepts or refuses the request. Copy `session-guard.tsx` from Usage into the same directory first; this example imports its `SessionNotice` composition.

<!-- demo: session-guard-replies -->

## Session status readouts

Use `SessionStatus` independently of a provider. This comparison supplies a fixed clock; live readouts use the shared clock by default. Install [`StatusBar`](status-bar.md) separately to place a readout in its children.

<!-- demo: session-guard-status -->

## API Reference

### Props

`SessionGuardProvider` coordinates one expiry and one request. It requires composition through `children` and has no native element, `className` or ref.

| Prop | Type | Default | Description |
|---|---|---|---|
| `expiresAt` | `number \| null \| undefined` | Required | Expiry in epoch milliseconds. Null, undefined and non-finite numbers mean no session. |
| `onReauthenticate` | `() => Promise<boolean>` | Required | Request a session; the result does not change the expiry. |
| `children` | `ReactNode` | Required | Warnings, dialogs, controls and application content. |
| `warnMs` | `number` | `120_000` | Warning window in milliseconds, exported as `DEFAULT_WARN_MS`. |
| `onExpire` | `() => void` | - | Effect notification on entering expired, including an expired mount. |
| `labels` | `Partial<SessionGuardLabels>` | Default labels | Text used by readings and the supplied composition. |
| `clock` | `Clock` | `sharedClock()` from `@/lib/clock` | Shared clock for phase and remaining-time readings; `createClock` lives beside it. |

Changing an expired timestamp to another expired timestamp, or replacing `onExpire` while still expired, does not notify again. Leaving and reentering expired does. Remounts and development Strict Mode effect replay can repeat the callback.

### Parts

All rendered parts accept the native props, ref, classes and events of the element listed below. Classes merge with defaults. The action and dialog use the corresponding installed shadcn component's props, subject to the owned behavior below.

| Part | Element | Children | Description |
|---|---|---|---|
| `SessionGuardWarning` | `div` | Required | Warning-only status region with wrapping strip styles. |
| `SessionGuardWarningText` | `span` | Not accepted | Localized warning sentence containing `SessionGuardRemaining`. |
| `SessionGuardRemaining` | `span` | Not accepted | Timer reading using the provider's expiry, warning window and clock. |
| `SessionGuardReauthenticate` | Installed `Button` | Required | Shared sign-in action; defaults to `type="button"`. |
| `SessionGuardActionLabel` | `span` | Not accepted | Pending, extension or sign-in text for an action. |
| `SessionGuardError` | `span` | Optional | Failure alert; omitted children use `labels.failed`. |
| `SessionGuardDialog` | Installed `DialogContent` | Required | Expiry-controlled modal content. Requires `fallbackFocusRef`. |

The warning carries `data-slot="tradecn-session-guard"` and `data-session-banner`. Remaining, action and error use the slots `tradecn-session-guard-remaining`, `tradecn-session-guard-reauthenticate` and `tradecn-session-guard-error`. The dialog has `data-session-dialog`; the error has `data-session-failed`. `SessionNotice` places `data-session-phase` on its own wrapper.

### useSessionGuard

Call `useSessionGuard()` inside the provider for custom controls and layouts. It returns `SessionGuardValue`:

| Field | Type | Description |
|---|---|---|
| `phase` | `SessionPhase` | Current session phase. |
| `expiresAt` | `number \| null` | Normalized expiry. |
| `warnMs` | `number` | Configured warning window. |
| `clock` | `Clock` | Clock shared by the provider and its readings. |
| `labels` | `SessionGuardLabels` | Merged labels. |
| `pending` / `failed` | `boolean` | State shared by every action in the provider. |
| `reauthenticate` | `() => Promise<void>` | Start a request; ignored while pending or after provider unmount. |

A duplicate call resolves without waiting for the active request. Read `pending` and `failed` to display request state. The hook does not subscribe to remaining milliseconds: ordinary ticks update only `SessionGuardRemaining` and standalone time hooks or readouts.

### Phases

`sessionStatus` and `useSessionStatus` retain the standalone `SessionStatusValue` contract:

| API | Inputs | Result |
|---|---|---|
| `sessionStatus(expiresAt, now, warnMs?)` | Expiry, epoch milliseconds, optional warning window | Status at the supplied time. |
| `useSessionStatus(expiresAt, options?)` | Expiry and optional `UseSessionStatusOptions` | Status updated on clock ticks. Options are `warnMs?: number` and `clock?: Clock`. |

| Field | Type | Meaning |
|---|---|---|
| `phase` | `SessionPhase` | `"none"`, `"live"`, `"warning"`, or `"expired"`. |
| `remainingMs` | `number \| null` | Expiry minus clock time; negative after expiry, null with no session. |
| `expiresAt` | `number \| null` | Supplied finite expiry, or null with no session. |

| Phase | When | Conditional parts |
|---|---|---|
| `none` | Null, undefined, `NaN`, or infinite expiry | Warning and dialog hidden |
| `live` | More than `warnMs` left, above zero | Warning and dialog hidden |
| `warning` | `warnMs` or less left, above zero | Warning mounted |
| `expired` | Zero or less left | Dialog open |

`warnMs` is compared directly; zero or negative values skip warning. Both APIs default to `DEFAULT_WARN_MS` and the hook uses the shared one-second clock from [`countdown`](countdown.md). For tests, pass `createClock(1000, () => t)` and advance both `t` and the timer.

### The banner

`SessionGuardWarning` supplies `role="status"` and the `expiring` and `expiring-soft` strip styles. Place optional controls, account information and errors in its children. `SessionGuardWarningText` inserts the remaining-time reading into `labels.warning`.

`SessionGuardRemaining` uses the same rounded-up countdown format as [`Countdown`](countdown.md), including `data-tier` and numeric typography. It has `role="timer"` and the session label, with no separate live region. Place one warning sentence per session to avoid duplicate announcements.

### The wall

`SessionGuardDialog` owns a modal `Dialog` and its content. It opens when expired, has no close button, and ignores Escape and outside close requests. Renewing to a future expiry or clearing the expiry closes it. Content scrolls within the viewport by default; use `className` for another width or layout.

| Prop | Type | Default | Description |
|---|---|---|---|
| `children` | `ReactNode` | Required | A heading, description, sign-in content and actions. |
| `fallbackFocusRef` | `RefObject<HTMLElement \| null>` | Required | Persistent, focusable application control to receive focus if native restoration leaves it on the body or closing dialog. |
| `className` | `string` | - | Additional classes to apply to the dialog content. |

Use the installed `DialogTitle` and `DialogDescription` to name and describe the dialog. Keep the fallback target mounted outside conditional content. A valid native return target takes precedence. The part owns final focus, so `finalFocus` and `onCloseAutoFocus` are reserved, along with root control props, `showCloseButton`, `forceMount` and `keepMounted`. Use `useSessionGuard` when replacing the whole dialog and its focus policy.

The modal blocks pointer interaction underneath. For events inside its `role="dialog"`, [`use-hotkeys`](use-hotkeys.md) considers only scopes declared inside that dialog. Surrounding drafts and stores stay mounted; authentication fields inside dialog content follow the installed primitive's normal close/unmount lifecycle.

### Re-authentication

Every action and custom hook control shares one request lock. `SessionGuardReauthenticate` is disabled while pending and carries `data-pending="true"`; `SessionGuardActionLabel` shows `Signing in…`. A caller's `disabled` also disables the action. The caller's `onClick` runs first and can cancel the request with `preventDefault()`.

Changing phase, expiry, clock or callback does not cancel an active request. The next attempt uses the latest committed callback. Unmounting the provider stops its old completion from updating a new provider; cancellation of application work belongs to the session service.

Resolving `true` clears failure without changing expiry. Resolving `false`, throwing or rejecting sets failure. `SessionGuardError` displays it as an alert wherever mounted; the supplied composition limits it to the warning or open dialog.

Starting another attempt clears failure. Entering `live` or `none` also clears a prior failure; moving between `warning` and `expired` preserves it. A request that fails after recovery can set failure again. In the ordinary composition that error becomes visible when warning or expired returns.

### The status readout

`SessionStatus` displays `Session` followed by the time left (`1:59:30` or `0:45`), `ended` at expiry, or `no session` without a finite expiry. Remaining time rounds up to the next second. It exposes the phase through `data-session-status` and speaks through visually hidden text, such as `Session: ending soon, 1:30`, since a generic element cannot carry an accessible name of its own. Warning uses `expiring`; expiry uses `destructive`.

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `expiresAt` | `number \| null \| undefined` | Required | Expiry time in epoch milliseconds; the same no-session values as the guard. |
| `warnMs` | `number` | `120_000` | Warning window in milliseconds. |
| `clock` | `Clock` | `sharedClock()` | Clock for the phase and remaining time. |
| `labels` | `Partial<SessionGuardLabels>` | Default labels | Readout text, visible and hidden. |
| `className` | `string` | None | Classes on the readout's span. |

### Labels

The provider and standalone readout merge partial overrides into `DEFAULT_SESSION_GUARD_LABELS`. Every label is a string. Use one `{remaining}` placeholder in `warning`: the countdown goes between the first two parts of that split.

| Label | Default | Where |
|---|---|---|
| `warning` | `Your session ends in {remaining}.` | Banner sentence |
| `extend` | `Stay signed in` | Banner button |
| `expiredTitle` / `expiredDescription` | `Your session has ended` / `Sign in again to carry on. Nothing on the desk has been lost.` | Dialog heading and description |
| `reauthenticate` | `Sign in again` | Dialog button |
| `pending` | `Signing in…` | Either button while pending |
| `failed` | `That did not work. Try again.` | Alert beside either button |
| `session` | `Session` | Readout prefix, spoken through the hidden text |
| `live` / `ending` | `signed in` / `ending soon` | Phase words in the hidden readout text |
| `ended` / `noSession` | `ended` / `no session` | Visible and accessible readout text |

### What it does not do

The guard holds no token, reads no cookie, and does not refresh credentials or redirect. It displays the time you give it; your session service owns authentication and server authorization. It does not pause background work or enforce request permissions. Venue trading hours belong to the separate [`session-calendar`](session-calendar.md) module.

### Tokens

The install adds `expiring` and `expiring-soft` if you do not have them, for the warning and the readout's warning phase.
