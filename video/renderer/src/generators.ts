import { easeOutCubic } from './easing'

type GeneratorFn = (tMs: number, params: Record<string, unknown>) => number

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

const sine: GeneratorFn = (tMs, params) => {
  const from = num(params.from, 0)
  const to = num(params.to, 1)
  const periodMs = num(params.periodMs, 1000)
  const t = (Math.sin((2 * Math.PI * tMs) / periodMs) + 1) / 2
  return from + (to - from) * t
}

const sineStrokes: GeneratorFn = (tMs, params) => {
  const from = num(params.from, 0)
  const to = num(params.to, 1)
  const periodMs = num(params.periodMs, 1000)
  const strokes = num(params.strokes, 7)
  const t = Math.sin(Math.PI * 2 * strokes * (tMs / periodMs))
  return from + (to - from) * (t + 1) / 2
}

const sineOscillation: GeneratorFn = (tMs, params) => {
  const from = num(params.from, 0)
  const to = num(params.to, 1)
  const periodMs = num(params.periodMs, 1000)
  const t = Math.sin((2 * Math.PI * tMs) / periodMs)
  return from + (to - from) * t
}

const pulse: GeneratorFn = (tMs, params) => {
  const from = num(params.from, 0)
  const to = num(params.to, 1)
  const periodMs = num(params.periodMs, 1000)
  const t = (tMs / periodMs) % 1
  return from + (to - from) * t
}

const countUp: GeneratorFn = (tMs, params) => {
  const target = num(params.target, 0)
  const durationMs = num(params.durationMs, 1000)
  const t = Math.min(1, Math.max(0, tMs / durationMs))
  return Math.round(target * easeOutCubic(t))
}

const registry: Record<string, GeneratorFn> = {
  sine,
  sineStrokes,
  sineOscillation,
  pulse,
  countUp,
}

export function evaluateGenerator(
  gen: { fn: string; params?: Record<string, unknown> },
  tMs: number,
): number {
  const fn = registry[gen.fn]
  if (!fn) return 0
  return fn(tMs, gen.params ?? {})
}
