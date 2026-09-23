import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SessionGuard, SessionStatus } from "@/registry/tradecn/ui/session-guard"

// A session that ends forty-five seconds from now, with the warning window set to a minute so the banner
// is already up. When the countdown reaches zero the dialog opens over everything and the note below,
// half-typed, stays exactly as it was; Sign in again is the pretend sign-in, which answers after a second
// and gives the session another forty-five seconds. Tick the box to see it refused instead.

const SESSION_MS = 45_000

export default function SessionGuardDemo() {
  const [expiresAt, setExpiresAt] = useState(() => Date.now() + SESSION_MS)
  const [refuse, setRefuse] = useState(false)
  const [note, setNote] = useState("")
  // Your sign-in: an SSO round trip, a hardware token. Here a second's wait, then a new session or a refusal.
  const reauthenticate = () =>
    new Promise<boolean>((resolve) =>
      setTimeout(() => {
        if (refuse) return resolve(false)
        setExpiresAt(Date.now() + SESSION_MS)
        resolve(true)
      }, 1000),
    )
  return (
    <div className="w-full flex min-h-72 flex-col gap-3 text-xs">
      <SessionGuard expiresAt={expiresAt} warnMs={60_000} onReauthenticate={reauthenticate}>
        <p className="text-sm text-muted-foreground">Your desk would put its sign-in here: a password, a token prompt, or one button to the identity provider.</p>
      </SessionGuard>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="session-guard-note">A half-typed note</Label>
        <Input id="session-guard-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Type here, let the session end, sign in again: it is still here" />
      </div>
      <label className="flex items-center gap-2 text-muted-foreground">
        <input type="checkbox" checked={refuse} onChange={(e) => setRefuse(e.target.checked)} />
        Refuse the next sign-in
      </label>
      <div className="flex items-center gap-2 border-t border-border pt-2 text-muted-foreground">
        <span>What the status bar shows:</span>
        <SessionStatus expiresAt={expiresAt} warnMs={60_000} />
      </div>
    </div>
  )
}
