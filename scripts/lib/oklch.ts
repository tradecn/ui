// oklch() to a WCAG contrast ratio, for checking theme colors that were picked by hand.
// The matrices are Björn Ottosson's OKLab reference ones. Alpha is composited over a backdrop first.

export interface Oklch {
  l: number
  c: number
  h: number
  alpha: number
}

/** `oklch(0.74 0.15 165)` or `oklch(0.74 0.15 165 / 18%)`. Null for anything else, a var() included. */
export function parseOklch(value: string): Oklch | null {
  const m = /^oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/.exec(value.trim())
  if (!m) return null
  const unit = (s: string) => (s.endsWith("%") ? Number(s.slice(0, -1)) / 100 : Number(s))
  return { l: unit(m[1]!), c: Number(m[2]), h: Number(m[3]), alpha: m[4] === undefined ? 1 : unit(m[4]) }
}

/** Linear-light sRGB, each channel clipped to the gamut. */
export function toLinearSrgb({ l, c, h }: Oklch): [number, number, number] {
  const a = c * Math.cos((h * Math.PI) / 180)
  const b = c * Math.sin((h * Math.PI) / 180)
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3
  const clip = (v: number) => Math.min(1, Math.max(0, v))
  return [clip(4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_), clip(-1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_), clip(-0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_)]
}

const encode = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)
const decode = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)

/** WCAG relative luminance of `color` over `backdrop`. */
export function luminance(color: Oklch, backdrop?: Oklch): number {
  let rgb = toLinearSrgb(color)
  if (color.alpha < 1 && backdrop) {
    const under = toLinearSrgb(backdrop)
    // A browser composites in gamma-encoded sRGB, so the blend happens there and comes back to linear light. Blending
    // in linear light reads a light tint lighter than it shows, and a dark one darker.
    rgb = rgb.map((v, i) => decode(encode(v) * color.alpha + encode(under[i]!) * (1 - color.alpha))) as [number, number, number]
  }
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]
}

/** WCAG contrast ratio, 1 to 21. */
export function contrast(foreground: Oklch, background: Oklch): number {
  const a = luminance(foreground, background)
  const b = luminance(background)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}
