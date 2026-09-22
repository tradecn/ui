import { StatusBar } from "@/components/ui/status-bar"

// The environment in a word and a tone, one clock in UTC on the shared timer, a user, and a child in a slot.
export function StatusBarScene() {
  return (
    <div className="w-[40rem]">
      <StatusBar environment={{ label: "UAT", tone: "stale" }} clocks={[{ label: "UTC", zone: "UTC" }]} user="smoke" left={<span data-status-child>feeds ok</span>} />
    </div>
  )
}
