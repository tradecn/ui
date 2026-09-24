import { useState } from "react"
import { SessionGuard } from "@/registry/tradecn/ui/session-guard"

export default function SessionGuardDemo() {
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
