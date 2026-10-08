import { cn } from "cn"
import { useRef, useState, type ReactNode, type RefObject } from "react"
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { SessionGuardActionLabel, SessionGuardDialog, SessionGuardError, SessionGuardProvider, SessionGuardReauthenticate, SessionGuardWarning, SessionGuardWarningText, useSessionGuard, type SessionGuardProviderProps } from "@/registry/tradecn/ui/session-guard"

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
      <SessionGuardWarning fallbackFocusRef={fallbackFocusRef}>
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
