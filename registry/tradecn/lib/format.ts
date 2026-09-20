// Number formatting for trading screens. Pure functions, no React, no dependencies.
// Every formatter returns NULL_TOKEN for null, undefined, NaN, and infinities, so a grid
// never prints "NaN" or "undefined" while a feed is warming up.

export const NULL_TOKEN = "–"
const MINUS = "−"

export type Nullable = number | null | undefined

export interface Locale {
  /** BCP 47 tag; defaults to en-US. */
  locale?: string
}

export type PriceConvention =
  /** Fixed decimals, e.g. equities at 2. */
  | { kind: "decimal"; decimals: number }
  /** Decimals derived from the instrument's tick size, e.g. 0.001 gives 3. */
  | { kind: "tick"; tick: number }
  /**
   * Fractional quoting. `denominator` 32 or 64; `half` renders a half tick as "+" (99-16+) or "5" (99-165);
   * `eighths` renders eighths of a tick as a trailing digit (99-162 is 99 and 16 2/8 thirty-seconds).
   */
  | { kind: "fraction"; denominator: 32 | 64; half: "+" | "5"; eighths?: boolean }

export interface InstrumentConvention {
  price: PriceConvention
  /** Smallest price increment, used for stepping and rounding. */
  tick: number
  yieldDecimals?: number
  quantityUnit?: "notional" | "contracts"
}

function isNil(v: Nullable): v is null | undefined {
  return v === null || v === undefined || !Number.isFinite(v)
}

// One Intl.NumberFormat per locale and option set; construction is the expensive part.
const formatters = new Map<string, Intl.NumberFormat>()

export function numberFormat(locale: string | undefined, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${locale ?? "en-US"}|${JSON.stringify(options)}`
  let nf = formatters.get(key)
  if (!nf) {
    nf = new Intl.NumberFormat(locale ?? "en-US", options)
    formatters.set(key, nf)
  }
  return nf
}

function fixed(v: number, decimals: number, locale?: string, extra: Intl.NumberFormatOptions = {}): string {
  return numberFormat(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals, ...extra }).format(v)
}

function typographicMinus(s: string): string {
  return s.replace(/-/g, MINUS)
}

/** Decimal places needed to show a price on this tick grid. 0.001 gives 3, 1/32 gives 5, 1 gives 0. Capped at `max`. */
export function decimalsFromTick(tick: number, max = 8): number {
  if (!Number.isFinite(tick) || tick <= 0) return 0
  for (let d = 0; d <= max; d++) {
    const scaled = tick * 10 ** d
    if (Math.abs(scaled - Math.round(scaled)) < 1e-9 * Math.max(1, scaled)) return d
  }
  return max
}

/** Nearest price on the tick grid, cleaned of float noise. */
export function roundToTick(v: number, tick: number): number {
  if (!Number.isFinite(v) || !Number.isFinite(tick) || tick <= 0) return v
  return Number((Math.round(v / tick) * tick).toFixed(decimalsFromTick(tick)))
}

/** Move `steps` ticks (negative allowed) from the nearest grid price. */
export function stepByTick(v: number, tick: number, steps: number): number {
  return roundToTick(roundToTick(v, tick) + steps * tick, tick)
}

/** Whole-number and sub-tick decomposition on an integer grid so 32nds never drift. */
function decomposeFraction(v: number, c: Extract<PriceConvention, { kind: "fraction" }>) {
  const sub = c.eighths ? 8 : 2
  const unitsPerWhole = c.denominator * sub
  const total = Math.round(Math.abs(v) * unitsPerWhole)
  const whole = Math.floor(total / unitsPerWhole)
  const rem = total - whole * unitsPerWhole
  const ticks = Math.floor(rem / sub)
  const subticks = rem - ticks * sub
  return { negative: v < 0 && total > 0, whole, ticks, subticks, sub }
}

/** 99.515625 as "99-16+" (32nds, half "+"), "99-165" (half "5"), or "99-164" with eighths. */
export function formatFraction(v: Nullable, c: Extract<PriceConvention, { kind: "fraction" }>): string {
  if (isNil(v)) return NULL_TOKEN
  const { negative, whole, ticks, subticks, sub } = decomposeFraction(v, c)
  let tail = ""
  if (subticks !== 0) {
    if (c.eighths) tail = String(subticks)
    else tail = c.half
  }
  void sub
  return `${negative ? MINUS : ""}${whole}-${String(ticks).padStart(2, "0")}${tail}`
}

export function formatPrice(v: Nullable, c: PriceConvention, l?: Locale): string {
  if (isNil(v)) return NULL_TOKEN
  switch (c.kind) {
    case "decimal":
      return typographicMinus(fixed(v, c.decimals, l?.locale))
    case "tick":
      return typographicMinus(fixed(roundToTick(v, c.tick), decimalsFromTick(c.tick), l?.locale))
    case "fraction":
      return formatFraction(v, c)
  }
}

/**
 * Inverse of formatPrice for ticket entry. Accepts the convention's own notation and a plain decimal.
 * Returns null when the text is not a price. Fraction input: "99-16+", "99-165", "99-162", "99-16", "99".
 */
export function parsePrice(s: string, c: PriceConvention): number | null {
  const text = s.trim().replace(/−/g, "-").replace(/,/g, "")
  if (!text) return null
  if (c.kind === "fraction") {
    const m = /^([+-]?)(\d+)(?:-(\d{1,2})([+0-9])?)?$/.exec(text)
    if (m) {
      const [, sign, wholeText, ticksText, tail] = m
      const ticks = ticksText ? Number(ticksText) : 0
      if (ticks >= c.denominator) return null
      let subFraction = 0
      if (tail === "+") subFraction = 0.5
      else if (tail !== undefined) {
        const digit = Number(tail)
        if (c.eighths) {
          if (digit > 7) return null
          subFraction = digit / 8
        } else if (c.half === "5" && digit === 5) subFraction = 0.5
        else if (digit === 0) subFraction = 0
        else return null
      }
      const value = Number(wholeText) + (ticks + subFraction) / c.denominator
      return sign === "-" ? -value : value
    }
  }
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(text)) return null
  const n = Number(text)
  if (!Number.isFinite(n)) return null
  if (c.kind === "tick") return roundToTick(n, c.tick)
  if (c.kind === "decimal") return Number(n.toFixed(c.decimals))
  return n
}

/** 4.2531 as "4.253%". */
export function formatYield(v: Nullable, o: { decimals?: number; suffix?: "%" | "" } & Locale = {}): string {
  if (isNil(v)) return NULL_TOKEN
  return typographicMinus(fixed(v, o.decimals ?? 3, o.locale)) + (o.suffix ?? "%")
}

/** 12.5 as "12.5 bp"; signed gives "+12.5 bp". */
export function formatBps(v: Nullable, o: { decimals?: number; signed?: boolean; unit?: "bp" | "bps" | "" } & Locale = {}): string {
  if (isNil(v)) return NULL_TOKEN
  const unit = o.unit ?? "bp"
  const body = o.signed ? formatSigned(v, { decimals: o.decimals ?? 1, locale: o.locale }) : typographicMinus(fixed(v, o.decimals ?? 1, o.locale))
  return unit ? `${body} ${unit}` : body
}

/** Dollar value of a basis point as whole currency; compact gives "$1.23K". */
export function formatDv01(v: Nullable, o: { currency?: string; compact?: boolean } & Locale = {}): string {
  if (isNil(v)) return NULL_TOKEN
  const currency = o.currency ?? "USD"
  if (o.compact) {
    const symbol = numberFormat(o.locale, { style: "currency", currency, currencyDisplay: "narrowSymbol", maximumFractionDigits: 0 })
      .formatToParts(0)
      .find((p) => p.type === "currency")?.value ?? ""
    return `${v < 0 ? MINUS : ""}${symbol}${formatNotional(Math.abs(v), { compact: true, locale: o.locale })}`
  }
  return typographicMinus(numberFormat(o.locale, { style: "currency", currency, currencyDisplay: "narrowSymbol", maximumFractionDigits: 0 }).format(v))
}

/** 1250000 as "1.25M" (compact) or "1,250,000.00". Suffixes K, M, B, T. */
export function formatNotional(v: Nullable, o: { compact?: boolean; decimals?: number } & Locale = {}): string {
  if (isNil(v)) return NULL_TOKEN
  const decimals = o.decimals ?? 2
  if (!o.compact) return typographicMinus(fixed(v, decimals, o.locale))
  const abs = Math.abs(v)
  const [divisor, suffix] = abs >= 1e12 ? [1e12, "T"] : abs >= 1e9 ? [1e9, "B"] : abs >= 1e6 ? [1e6, "M"] : abs >= 1e3 ? [1e3, "K"] : [1, ""]
  return typographicMinus(fixed(v / divisor, suffix ? decimals : 0, o.locale)) + suffix
}

/** "+0.12", "−0.12" (U+2212), and "0.00" for zero: flat carries no sign. */
export function formatSigned(v: Nullable, o: { decimals?: number } & Locale = {}): string {
  if (isNil(v)) return NULL_TOKEN
  return typographicMinus(fixed(v, o.decimals ?? 2, o.locale, { signDisplay: "exceptZero" }))
}

/** 1.234 as "1.23%"; signed gives "+1.23%". */
export function formatPercent(v: Nullable, o: { decimals?: number; signed?: boolean } & Locale = {}): string {
  if (isNil(v)) return NULL_TOKEN
  const decimals = o.decimals ?? 2
  return (o.signed ? formatSigned(v, { decimals, locale: o.locale }) : typographicMinus(fixed(v, decimals, o.locale))) + "%"
}

/** Whole quantities with grouping: 1000000 as "1,000,000". */
export function formatQuantity(v: Nullable, l?: Locale): string {
  if (isNil(v)) return NULL_TOKEN
  return typographicMinus(fixed(Math.round(v), 0, l?.locale))
}

/** Bind a convention once per instrument; a grid column calls `formatters[row.instrumentId].price(v)`. */
export function createInstrumentFormatter(c: InstrumentConvention, l?: Locale) {
  return {
    tick: c.tick,
    price: (v: Nullable) => formatPrice(v, c.price, l),
    yield: (v: Nullable) => formatYield(v, { decimals: c.yieldDecimals ?? 3, locale: l?.locale }),
    step: (v: number, steps: number) => stepByTick(v, c.tick, steps),
    parsePrice: (s: string) => parsePrice(s, c.price),
    quantity: (v: Nullable) => formatQuantity(v, l),
  }
}
