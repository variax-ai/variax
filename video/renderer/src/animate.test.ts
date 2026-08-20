import { describe, it, expect } from 'vitest'
import type { AnimatedPoint } from '@variax-ai/video-schema'
import { evaluateNumber, evaluatePoint, evaluateScale } from './animate'

describe('evaluateNumber', () => {
  it('returns static value', () => {
    expect(evaluateNumber(42, 0)).toBe(42)
  })

  it('interpolates keyframes', () => {
    const animated = {
      keyframes: [
        { t: 0, value: 0 },
        { t: 1000, value: 100 },
      ] as [{ t: number; value: number }, { t: number; value: number }],
    }
    expect(evaluateNumber(animated, 0)).toBe(0)
    expect(evaluateNumber(animated, 500)).toBe(50)
    expect(evaluateNumber(animated, 1000)).toBe(100)
  })

  it('holds first value before first keyframe', () => {
    const animated = {
      keyframes: [
        { t: 500, value: 10 },
        { t: 1000, value: 20 },
      ] as [{ t: number; value: number }, { t: number; value: number }],
    }
    expect(evaluateNumber(animated, 0)).toBe(10)
  })

  it('holds last value after last keyframe', () => {
    const animated = {
      keyframes: [
        { t: 0, value: 0 },
        { t: 500, value: 50 },
      ] as [{ t: number; value: number }, { t: number; value: number }],
    }
    expect(evaluateNumber(animated, 1000)).toBe(50)
  })

  it('applies easing', () => {
    const animated = {
      keyframes: [
        { t: 0, value: 0, easing: 'easeOutCubic' as const },
        { t: 1000, value: 100 },
      ] as [{ t: number; value: number; easing: 'easeOutCubic' }, { t: number; value: number }],
    }
    const mid = evaluateNumber(animated, 500)
    expect(mid).toBeGreaterThan(50)
  })

  it('evaluates generators', () => {
    const gen = { generator: { fn: 'countUp' as const, params: { target: 100, durationMs: 1000 } } }
    expect(evaluateNumber(gen, 0)).toBe(0)
    expect(evaluateNumber(gen, 1000)).toBe(100)
  })
})

describe('evaluatePoint', () => {
  it('returns static point', () => {
    expect(evaluatePoint([10, 20], 0)).toEqual([10, 20])
  })

  it('interpolates point keyframes', () => {
    const animated = {
      keyframes: [
        { t: 0, value: [0, 0] as [number, number] },
        { t: 1000, value: [100, 200] as [number, number] },
      ] as [{ t: number; value: [number, number] }, { t: number; value: [number, number] }],
    }
    const result = evaluatePoint(animated, 500)
    expect(result[0]).toBeCloseTo(50)
    expect(result[1]).toBeCloseTo(100)
  })
})

describe('evaluateScale', () => {
  it('returns uniform scale from number', () => {
    expect(evaluateScale(2, 0)).toEqual([2, 2])
  })

  it('returns point scale', () => {
    expect(evaluateScale([1.5, 2.0], 0)).toEqual([1.5, 2.0])
  })

  it('interpolates number keyframes as uniform scale', () => {
    const animated = {
      keyframes: [
        { t: 0, value: 1 },
        { t: 1000, value: 2 },
      ] as [{ t: number; value: number }, { t: number; value: number }],
    }
    const result = evaluateScale(animated, 500)
    expect(result[0]).toBeCloseTo(1.5)
    expect(result[1]).toBeCloseTo(1.5)
  })
})

describe('evaluatePoint per-axis form', () => {
  it('drives each axis from its own track', () => {
    const value = {
      x: { generator: { fn: 'sineOscillation', params: { from: 0, to: 100, periodMs: 1000 } } },
      y: { keyframes: [{ t: 0, value: 0 }, { t: 1000, value: 500 }] },
    } as unknown as AnimatedPoint

    const [x0, y0] = evaluatePoint(value, 0)
    expect(x0).toBeCloseTo(0)
    expect(y0).toBeCloseTo(0)

    const [x1, y1] = evaluatePoint(value, 250)
    expect(x1).toBeCloseTo(100)
    expect(y1).toBeCloseTo(125)
  })

  it('accepts a bare number on an axis', () => {
    const value = { x: 42, y: 7 } as unknown as AnimatedPoint
    expect(evaluatePoint(value, 500)).toEqual([42, 7])
  })

  it('leaves the existing forms untouched', () => {
    const bare = [10, 20] as unknown as AnimatedPoint
    expect(evaluatePoint(bare, 500)).toEqual([10, 20])

    const kfs = {
      keyframes: [
        { t: 0, value: [0, 0] },
        { t: 1000, value: [100, 200] },
      ],
    } as unknown as AnimatedPoint
    expect(evaluatePoint(kfs, 500)).toEqual([50, 100])

    const gen = { generator: { fn: 'sine', params: { from: 0, to: 10, periodMs: 1000 } } } as unknown as AnimatedPoint
    const [gx, gy] = evaluatePoint(gen, 250)
    expect(gx).toBeCloseTo(10)
    expect(gx).toBe(gy)
  })
})
