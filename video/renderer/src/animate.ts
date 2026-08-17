import type {
  AnimatedNumber,
  AnimatedPoint,
  AnimatedScale,
  NumberKeyframe,
  Point,
  PointKeyframe,
} from '@variax-ai/video-schema'
import { resolveEasing } from './easing'
import { evaluateGenerator } from './generators'

function isKeyframeObject(v: unknown): v is { keyframes: unknown[] } {
  return typeof v === 'object' && v !== null && 'keyframes' in v
}

function isGenerator(v: unknown): v is { generator: { fn: string; params?: Record<string, unknown> } } {
  return typeof v === 'object' && v !== null && 'generator' in v
}

function lerpNumber(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function interpolateNumberKeyframes(keyframes: NumberKeyframe[], tMs: number): number {
  if (keyframes.length === 0) return 0
  if (tMs <= keyframes[0].t) return keyframes[0].value
  if (tMs >= keyframes[keyframes.length - 1].t) return keyframes[keyframes.length - 1].value

  for (let i = 0; i < keyframes.length - 1; i++) {
    const a = keyframes[i]
    const b = keyframes[i + 1]
    if (tMs >= a.t && tMs < b.t) {
      const raw = (tMs - a.t) / (b.t - a.t)
      const eased = resolveEasing(a.easing)(raw)
      return lerpNumber(a.value, b.value, eased)
    }
  }
  return keyframes[keyframes.length - 1].value
}

function interpolatePointKeyframes(keyframes: PointKeyframe[], tMs: number): Point {
  if (keyframes.length === 0) return [0, 0]
  if (tMs <= keyframes[0].t) return keyframes[0].value
  if (tMs >= keyframes[keyframes.length - 1].t) return keyframes[keyframes.length - 1].value

  for (let i = 0; i < keyframes.length - 1; i++) {
    const a = keyframes[i]
    const b = keyframes[i + 1]
    if (tMs >= a.t && tMs < b.t) {
      const raw = (tMs - a.t) / (b.t - a.t)
      const eased = resolveEasing(a.easing)(raw)
      return [lerpNumber(a.value[0], b.value[0], eased), lerpNumber(a.value[1], b.value[1], eased)]
    }
  }
  return keyframes[keyframes.length - 1].value
}

export function evaluateNumber(value: AnimatedNumber, tMs: number): number {
  if (typeof value === 'number') return value
  if (isGenerator(value)) return evaluateGenerator(value.generator, tMs)
  if (isKeyframeObject(value)) {
    return interpolateNumberKeyframes(value.keyframes as NumberKeyframe[], tMs)
  }
  return 0
}

export function evaluatePoint(value: AnimatedPoint, tMs: number): Point {
  if (Array.isArray(value)) return value as Point
  if (isGenerator(value)) {
    const v = evaluateGenerator(value.generator, tMs)
    return [v, v]
  }
  if (isKeyframeObject(value)) {
    return interpolatePointKeyframes(value.keyframes as PointKeyframe[], tMs)
  }
  return [0, 0]
}

export function evaluateScale(value: AnimatedScale, tMs: number): Point {
  if (typeof value === 'number') return [value, value]
  if (Array.isArray(value)) return value as Point
  if (isGenerator(value)) {
    const v = evaluateGenerator(value.generator, tMs)
    return [v, v]
  }
  if (isKeyframeObject(value)) {
    const kfs = value.keyframes
    if (kfs.length > 0 && typeof kfs[0].value === 'number') {
      const v = interpolateNumberKeyframes(kfs as NumberKeyframe[], tMs)
      return [v, v]
    }
    return interpolatePointKeyframes(kfs as PointKeyframe[], tMs)
  }
  return [1, 1]
}
