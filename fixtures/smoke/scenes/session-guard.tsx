import { useEffect, useRef, useState } from "react"
import { SessionStatus } from "@/components/ui/session-guard"

import { SessionNotice } from "./session-notice"

// A session ninety seconds from its end, so the banner is up at once; a note under the guard; the buttons end
// the session or make the next sign-in fail, once. The sign-in answers after 100 ms.
export function SessionGuardScene() {
  const draft = useRef<HTMLInputElement>(null)
  const [expiresAt, setExpiresAt] = useState<number | null>(() => Date.now() + 90_000)
  const [refuseNext, setRefuseNext] = useState(false)
  const [asked, setAsked] = useState(0)
  const request = useRef<{ timer: ReturnType<typeof setTimeout>; resolve: (value: boolean) => void } | null>(null)
  useEffect(() => () => {
    if (!request.current) return
    clearTimeout(request.current.timer)
    request.current.resolve(false)
  }, [])
  const reauthenticate = () => new Promise<boolean>(resolve => {
    const timer = setTimeout(() => {
      request.current = null
      setAsked(n => n + 1)
      if (refuseNext) { setRefuseNext(false); resolve(false); return }
      setExpiresAt(Date.now() + 10 * 60_000)
      resolve(true)
    }, 100)
    request.current = { timer, resolve }
  })
  return (
    <div className="flex flex-col gap-1">
      <SessionNotice fallbackFocusRef={draft} expiresAt={expiresAt} onReauthenticate={reauthenticate}>
        <p data-session-children="">Your sign-in goes here.</p>
        <button type="button" onClick={() => setExpiresAt(null)}>Clear session</button>
      </SessionNotice>
      <input ref={draft} aria-label="A half-typed note" defaultValue="" className="max-w-xs rounded border border-input px-1" />
      <SessionStatus expiresAt={expiresAt} />
      <output data-session-asked="">{asked}</output>
      <button type="button" onClick={() => setExpiresAt(Date.now() - 1)}>
        session ends
      </button>
      <button type="button" onClick={() => setExpiresAt(Date.now() + 50)}>expire on next tick</button>
      <button type="button" aria-pressed={refuseNext} onClick={() => setRefuseNext(true)}>
        refuse the next sign-in
      </button>
    </div>
  )
}
