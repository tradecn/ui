import { useState } from "react"
import { StatusBar, StatusBarClocks, StatusBarClockReadout, StatusBarEnvironmentBadge, StatusBarUser } from "@/registry/tradecn/ui/status-bar"

export default function StatusBarCardDemo() {
  const [user, setUser] = useState<string | null>("jdoe")
  return (
    <StatusBar aria-label="London desk" className="grid w-80 max-w-full gap-3 rounded border p-4 whitespace-normal">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {user ? <StatusBarUser user={user} /> : <span>Session ended</span>}
        <button type="button" className="rounded border border-border px-2 py-1" onClick={() => setUser(user ? null : "jdoe")}>
          {user ? "Sign out" : "Sign in"}
        </button>
      </div>
      <StatusBarClocks aria-label="Market hours" className="grid">
        <StatusBarClockReadout label="London" zone="Europe/London" seconds={false} className="justify-between" />
        <StatusBarClockReadout label="New York" zone="America/New_York" seconds={false} className="justify-between" />
      </StatusBarClocks>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>{user ? "Order entry enabled" : "Sign in to trade"}</span>
        <StatusBarEnvironmentBadge label="PRODUCTION" tone="destructive" />
      </div>
    </StatusBar>
  )
}
