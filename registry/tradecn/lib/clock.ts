// A clock shared by everything that ticks: one interval, running only while someone listens.
//
// Feed ages and countdowns both want "now" once a second, and a screen with forty of them wants one
// timer, not forty. `now()` is the time of the last tick and is stable between ticks, which is what
// useSyncExternalStore needs from a snapshot: two reads with no tick between them agree.

export interface Clock {
  subscribe(cb: () => void): () => void
  /** The time of the last tick; stable between ticks. */
  now(): number
}

/** One interval shared by every subscriber; it runs only while someone is listening. */
export function createClock(intervalMs = 1000, source: () => number = Date.now): Clock {
  let current = source()
  let timer: ReturnType<typeof setInterval> | null = null
  const listeners = new Set<() => void>()
  return {
    now: () => current,
    subscribe(cb) {
      listeners.add(cb)
      if (timer === null) {
        current = source()
        timer = setInterval(() => {
          current = source()
          for (const l of listeners) l()
        }, intervalMs)
      }
      return () => {
        listeners.delete(cb)
        if (!listeners.size && timer !== null) {
          clearInterval(timer)
          timer = null
        }
      }
    },
  }
}

let shared: Clock | null = null

/** The one-second clock every tradecn item ticks on unless it is given another. Made on first use. */
export function sharedClock(): Clock {
  return (shared ??= createClock(1000))
}
