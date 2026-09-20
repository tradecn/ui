# feed-health

`npx shadcn add tradecn/ui/feed-health` puts `feed-health.tsx` in your `ui` alias, adds the `stale` and `up` tokens, and brings your own `badge`, `separator`, `spinner`, and `tooltip` if you do not have them. Dependency: `cn`.

```tsx
<FeedHealth
  thresholds={{ agingMs: 2000, staleMs: 10_000 }}
  feeds={[
    { id: "md", label: "Market data", state: "connected", lane: "coalesced", lastMessageAt, dropped },
    { id: "rfq", label: "RFQ", state: "connected", lane: "ordered", lastMessageAt, seq, gap },
    { id: "vpn", label: "VPN", state: "connecting", lane: "ordered", lastMessageAt: null },
  ]}
/>
```

A number that admits it is two seconds old can be worked with; a frozen screen cannot. Each feed shows a state dot, its label, a tier, and the age of its last message. The tiers are `live`, `aging`, `stale`, `offline` (disconnected, whatever the hour), and `closed` (the session is shut, so silence is not staleness). `stalenessTier(feed, now, thresholds, session)` is a pure function if you want the tier elsewhere, for instance to gray out a grid.

The two lanes fail differently, so they report differently. A coalesced lane drops stale ticks on purpose and shows the count. An ordered lane never drops, so what it shows is a gap: how long it has been open and a spinner while the replay runs. Map a `row-store`'s `useStoreMeta` to a `FeedDescriptor` and the strip needs nothing else.

The default thresholds are placeholders and are named `PROVISIONAL_THRESHOLDS` so nobody mistakes them for a decision. `session` is a `SessionCalendar` with one method, `status(now)`; the default is always open. Real exchange calendars are yours to supply.

Only the leaves subscribe to the clock. One shared one-second interval runs while anything is mounted and stops when nothing is; the strip and the app around it do not re-render per second. Ages are hidden from assistive tech, and a polite live region speaks only when a tier changes ("Market data stale, 10s"), never on a plain tick.
