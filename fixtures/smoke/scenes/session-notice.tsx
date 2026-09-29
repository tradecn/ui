import { cn } from "cn"
import { type ReactNode, type RefObject } from "react"
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { SessionGuardActionLabel, SessionGuardDialog, SessionGuardError, SessionGuardProvider, SessionGuardReauthenticate, SessionGuardWarning, SessionGuardWarningText, useSessionGuard, type SessionGuardProviderProps } from "@/components/ui/session-guard"

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
