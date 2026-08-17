import { describe, it, expect } from 'vitest'
import { linear, easeOutCubic, easeInCubic, easeInOut, easeOutBack, resolveEasing } from './easing'

describe('easing functions', () => {
  it('linear returns clamped identity', () => {
    expect(linear(0)).toBe(0)
    expect(linear(0.5)).toBe(0.5)
    expect(linear(1)).toBe(1)
    expect(linear(-1)).toBe(0)
    expect(linear(2)).toBe(1)
  })

  it('easeOutCubic starts at 0 and ends at 1', () => {
    expect(easeOutCubic(0)).toBe(0)
    expect(easeOutCubic(1)).toBe(1)
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5)
  })

  it('easeInCubic starts at 0 and ends at 1', () => {
    expect(easeInCubic(0)).toBe(0)
    expect(easeInCubic(1)).toBe(1)
    expect(easeInCubic(0.5)).toBeLessThan(0.5)
  })

  it('easeInOut is symmetric', () => {
    expect(easeInOut(0)).toBe(0)
    expect(easeInOut(1)).toBe(1)
    expect(easeInOut(0.5)).toBeCloseTo(0.5)
  })

  it('easeOutBack overshoots past 1', () => {
    expect(easeOutBack(0)).toBeCloseTo(0)
    expect(easeOutBack(1)).toBeCloseTo(1)
    const peak = easeOutBack(0.7)
    expect(peak).toBeGreaterThan(1)
  })
})

describe('resolveEasing', () => {
  it('returns linear for undefined', () => {
    const fn = resolveEasing(undefined)
    expect(fn(0.5)).toBe(0.5)
  })

  it('resolves named easings', () => {
    expect(resolveEasing('easeOutCubic')(0.5)).toBe(easeOutCubic(0.5))
  })

  it('resolves cubic bezier', () => {
    const fn = resolveEasing({ bezier: [0.25, 0.1, 0.25, 1] })
    expect(fn(0)).toBeCloseTo(0)
    expect(fn(1)).toBeCloseTo(1)
    expect(fn(0.5)).toBeGreaterThan(0)
    expect(fn(0.5)).toBeLessThan(1)
  })

  it('caches bezier functions', () => {
    const fn1 = resolveEasing({ bezier: [0.42, 0, 0.58, 1] })
    const fn2 = resolveEasing({ bezier: [0.42, 0, 0.58, 1] })
    expect(fn1).toBe(fn2)
  })
})
