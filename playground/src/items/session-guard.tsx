import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SessionGuard, SessionStatus } from "@/registry/tradecn/ui/session-guard"

// A session guard over a note field, with the clock in your hands: end the session now, extend it, or make
// the next sign-in fail. The banner shows inside the warning window, the dialog at expiry, and the note
// stays through both. The readout is what a status bar would show.

const MINUTE = 60_000

export function SessionGuardScene() {
  const [expiresAt, setExpiresAt] = useState<number | null>(() => Date.now() + 90_000)
  const [refuse, setRefuse] = useState(false)
  const [note, setNote] = useState("")
  const [asked, setAsked] = useState(0)
  const [expired, setExpired] = useState(0)
  const reauthenticate = () =>
    new Promise<boolean>((resolve) =>
      setTimeout(() => {
        setAsked((n) => n + 1)
        if (refuse) return resolve(false)
        setExpiresAt(Date.now() + 5 * MINUTE)
        resolve(true)
      }, 800),
    )
  return (
    <main className="flex h-screen flex-col gap-3 p-4 text-xs">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-sm font-semibold">session-guard</h1>
        <span className="text-muted-foreground">A banner two minutes out, a wall at zero, and nothing underneath unmounts.</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setExpiresAt(Date.now() + 5 * MINUTE)}>
          Five minutes left
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setExpiresAt(Date.now() + 20_000)}>
          Twenty seconds left
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setExpiresAt(Date.now() - 1)}>
          End it now
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setExpiresAt(null)}>
          No session
        </Button>
        <label className="ml-3 flex items-center gap-2 text-muted-foreground">
          <input type="checkbox" checked={refuse} onChange={(e) => setRefuse(e.target.checked)} />
          Refuse the next sign-in
        </label>
      </div>
      <SessionGuard expiresAt={expiresAt} onReauthenticate={reauthenticate} onExpire={() => setExpired((n) => n + 1)}>
        <p className="text-sm text-muted-foreground">Your sign-in goes here.</p>
      </SessionGuard>
      <div className="flex max-w-md flex-col gap-1.5">
        <Label htmlFor="session-guard-scene-note">A half-typed note</Label>
        <Input id="session-guard-scene-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Still here after the wall" />
      </div>
      <div className="flex items-center gap-4 border-t border-border pt-2 text-muted-foreground">
        <SessionStatus expiresAt={expiresAt} />
        <span>
          sign-ins asked: {asked} · expiries: {expired}
        </span>
      </div>
    </main>
  )
}
