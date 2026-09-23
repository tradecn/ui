import { useState } from "react"
import { SessionGuard, SessionStatus } from "@/components/ui/session-guard"

// A session ninety seconds from its end, so the banner is up at once; a note under the guard; the buttons end
// the session or make the next sign-in fail, once. The sign-in answers after 100 ms.
export function SessionGuardScene() {
  const [expiresAt, setExpiresAt] = useState<number | null>(() => Date.now() + 90_000)
  const [refuseNext, setRefuseNext] = useState(false)
  const [asked, setAsked] = useState(0)
  const reauthenticate = () =>
    new Promise<boolean>((resolve) =>
      setTimeout(() => {
        setAsked((n) => n + 1)
        if (refuseNext) {
          setRefuseNext(false)
          return resolve(false)
        }
        setExpiresAt(Date.now() + 10 * 60_000)
        resolve(true)
      }, 100),
    )
  return (
    <div className="flex flex-col gap-1">
      <SessionGuard expiresAt={expiresAt} onReauthenticate={reauthenticate}>
        <p data-session-children="">Your sign-in goes here.</p>
      </SessionGuard>
      <input aria-label="A half-typed note" defaultValue="" className="max-w-xs rounded border border-input px-1" />
      <SessionStatus expiresAt={expiresAt} />
      <output data-session-asked="">{asked}</output>
      <button type="button" onClick={() => setExpiresAt(Date.now() - 1)}>
        session ends
      </button>
      <button type="button" aria-pressed={refuseNext} onClick={() => setRefuseNext(true)}>
        refuse the next sign-in
      </button>
    </div>
  )
}
