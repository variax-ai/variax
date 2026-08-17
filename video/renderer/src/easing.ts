import type { EasingName } from '@variax-ai/video-schema'

const clamp01 = (t: number): number => Math.min(1, Math.max(0, t))

export const linear = (t: number): number => clamp01(t)

export const easeOutCubic = (t: number): number => {
  const c = clamp01(t)
  return 1 - Math.pow(1 - c, 3)
}

export const easeInCubic = (t: number): number => {
  const c = clamp01(t)
  return c * c * c
}

export const easeInOut = (t: number): number => {
  const c = clamp01(t)
  return c * c * (3 - 2 * c)
}

export const easeOutBack = (t: number): number => {
  const c = clamp01(t)
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(c - 1, 3) + c1 * Math.pow(c - 1, 2)
}

function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  return (t: number) => {
    const ct = clamp01(t)
    let lo = 0
    let hi = 1
    for (let i = 0; i < 16; i++) {
      const mid = (lo + hi) / 2
      const x = 3 * (1 - mid) * (1 - mid) * mid * x1 + 3 * (1 - mid) * mid * mid * x2 + mid * mid * mid
      if (x < ct) lo = mid
      else hi = mid
    }
    const mid = (lo + hi) / 2
    return 3 * (1 - mid) * (1 - mid) * mid * y1 + 3 * (1 - mid) * mid * mid * y2 + mid * mid * mid
  }
}

const namedEasings: Record<string, (t: number) => number> = {
  linear,
  easeOutCubic,
  easeInCubic,
  easeInOut,
  easeOutBack,
}

const bezierCache = new Map<string, (t: number) => number>()

export function resolveEasing(easing: EasingName | undefined): (t: number) => number {
  if (!easing) return linear
  if (typeof easing === 'string') return namedEasings[easing] ?? linear
  const key = easing.bezier.join(',')
  let fn = bezierCache.get(key)
  if (!fn) {
    fn = cubicBezier(easing.bezier[0], easing.bezier[1], easing.bezier[2], easing.bezier[3])
    bezierCache.set(key, fn)
  }
  return fn
}
