import { StatusBar } from "@/registry/tradecn/ui/status-bar"

export default function StatusBarDemo() {
  return (
    <div className="w-xl max-w-full">
      <StatusBar
        environment={{ label: "PRODUCTION", tone: "destructive" }}
        clocks={[{ label: "New York", zone: "America/New_York" }]}
        user="jdoe"
      />
    </div>
  )
}
