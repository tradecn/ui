// A clock shared by everything that ticks: one interval, running only while someone listens.
//
// Feed ages and countdowns both want "now" once a second, and a screen with forty of them wants one
// timer, not forty. `now()` is the time of the last tick and is stable between ticks, which is what
// useSyncExternalStore needs from a snapshot: two reads with no tick between them agree.

export interface Clock {
  subscribe(cb: () => void): () => void
  /** The time of the last tick; stable between ticks. */
  now(): number
  /** Read the source for an event timestamp without changing the tick snapshot or starting a timer. */
  sample?(): number
}

/** One interval shared by every subscriber; it runs only while someone is listening. An interval that is not a positive number of milliseconds a timer can hold, up to 2^31 − 1, ticks once a second. */
export function createClock(intervalMs = 1000, source: () => number = Date.now): Clock {
  // A zero, negative, NaN, or overlong interval (a timer holds 2^31 − 1 ms and fires at once past it) would run as
  // fast as the timer allows and re-render every subscriber each time.
  const every = intervalMs > 0 && intervalMs <= 2_147_483_647 ? intervalMs : 1000
  let current = source()
  let timer: ReturnType<typeof setInterval> | null = null
  const listeners = new Set<() => void>()
  return {
    now: () => current,
    sample: source,
    subscribe(cb) {
      listeners.add(cb)
      if (timer === null) {
        current = source()
        timer = setInterval(() => {
          current = source()
          for (const l of listeners) l()
        }, every)
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
