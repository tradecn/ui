import { useRef, useState } from "react"
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { SessionGuardDialog, SessionGuardError, SessionGuardProvider, SessionGuardRemaining, SessionGuardWarning, useSessionGuard } from "@/registry/tradecn/ui/session-guard"

export default function SessionGuardInlineDemo() {
  const [expiresAt, setExpiresAt] = useState(() => Date.now() + 45_000)
  const [note, setNote] = useState("")
  const draft = useRef<HTMLTextAreaElement>(null)
  return (
    <SessionGuardProvider expiresAt={expiresAt} onReauthenticate={async () => { setExpiresAt(Date.now() + 300_000); return true }}>
      <div className="w-sm max-w-full space-y-3 text-xs">
        <label className="flex flex-col gap-1.5">Desk note<textarea ref={draft} value={note} onChange={event => setNote(event.target.value)} className="min-h-20 rounded border border-input bg-background p-2" /></label>
        <SessionGuardWarning className="grid gap-3 p-3">
          <p className="font-medium">Trading desk session</p>
          <div className="flex flex-wrap items-center justify-between gap-3"><RenewSession /><SessionGuardRemaining /></div>
          <aside><SessionGuardError /></aside>
        </SessionGuardWarning>
        <button type="button" className="rounded border border-border px-2 py-1" onClick={() => setExpiresAt(0)}>Lock desk</button>
      </div>
      <SessionGuardDialog fallbackFocusRef={draft} className="sm:max-w-xl sm:grid-cols-2">
        <DialogHeader><DialogTitle>Unlock this desk</DialogTitle><DialogDescription>Your draft stays here while you sign in.</DialogDescription></DialogHeader>
        <div className="space-y-3"><p className="text-sm">This example renews the session immediately.</p><SessionGuardError /><RenewSession /></div>
      </SessionGuardDialog>
    </SessionGuardProvider>
  )
}

function RenewSession() {
  const { pending, reauthenticate } = useSessionGuard()
  return <button type="button" disabled={pending} onClick={() => void reauthenticate()} className="rounded border border-border bg-background px-3 py-1.5 disabled:opacity-50">{pending ? "Connecting…" : "Renew session"}</button>
}
