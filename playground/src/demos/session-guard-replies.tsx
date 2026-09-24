import { useEffect, useRef, useState } from "react"
import { SessionGuard, SessionStatus } from "@/registry/tradecn/ui/session-guard"

export default function SessionGuardRepliesDemo() {
  const [expiresAt, setExpiresAt] = useState<number | null>(null)
  const [waiting, setWaiting] = useState(false)
  const reply = useRef<((ok: boolean) => void) | null>(null)

  useEffect(() => () => {
    reply.current?.(false)
    reply.current = null
  }, [])

  function answer(ok: boolean) {
    const resolve = reply.current
    if (!resolve) return
    reply.current = null
    if (ok) setExpiresAt(Date.now() + 300_000)
    setWaiting(false)
    resolve(ok)
  }

  return (
    <>
      <div data-demo-controls className="flex flex-wrap gap-2 text-xs">
        <button type="button" className="rounded border border-border px-2 py-1" onClick={() => setExpiresAt(0)}>Show expired session</button>
      </div>
      <div className="flex min-h-96 w-fit max-w-full items-center justify-center text-xs">
        <SessionStatus expiresAt={expiresAt} warnMs={0} />
        <SessionGuard expiresAt={expiresAt} warnMs={0} onReauthenticate={() => new Promise<boolean>((resolve) => {
          reply.current = resolve
          setWaiting(true)
        })}>
          <fieldset className="space-y-2 text-xs" disabled={!waiting}>
            <legend className="mb-2">Simulated identity provider</legend>
            <p>Choose Sign in again, then send its reply.</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="rounded border border-border px-2 py-1 disabled:opacity-50" onClick={() => answer(true)}>Accept sign-in</button>
              <button type="button" className="rounded border border-border px-2 py-1 disabled:opacity-50" onClick={() => answer(false)}>Refuse sign-in</button>
            </div>
          </fieldset>
        </SessionGuard>
      </div>
    </>
  )
}
