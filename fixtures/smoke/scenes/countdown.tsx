import { Countdown } from "@/components/ui/countdown"

const NOW = Date.now()

export function CountdownScene() {
  return (
    <div className="flex items-end gap-4">
      <Countdown expiresAt={NOW + 90_000} startsAt={NOW} label="Long" />
      <Countdown expiresAt={NOW + 4_000} startsAt={NOW - 26_000} label="Soon" />
      <Countdown expiresAt={NOW - 1_000} startsAt={NOW - 31_000} label="Over" />
      <Countdown expiresAt={NOW + 90_000} compact announce={false} label="Compact" />
    </div>
  )
}
