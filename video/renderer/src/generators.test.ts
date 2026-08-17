import { describe, it, expect } from 'vitest'
import { evaluateGenerator } from './generators'

describe('generators', () => {
  describe('pulse', () => {
    it('starts at from value', () => {
      const v = evaluateGenerator({ fn: 'pulse', params: { from: 0, to: 1, periodMs: 1000 } }, 0)
      expect(v).toBeCloseTo(0)
    })

    it('wraps around at period boundary', () => {
      const v = evaluateGenerator({ fn: 'pulse', params: { from: 10, to: 20, periodMs: 1000 } }, 500)
      expect(v).toBeCloseTo(15)
    })
  })

  describe('sine', () => {
    it('oscillates between from and to', () => {
      const at0 = evaluateGenerator({ fn: 'sine', params: { from: 0, to: 100, periodMs: 1000 } }, 0)
      const atQuarter = evaluateGenerator(
        { fn: 'sine', params: { from: 0, to: 100, periodMs: 1000 } },
        250,
      )
      expect(at0).toBeCloseTo(50)
      expect(atQuarter).toBeCloseTo(100)
    })
  })

  describe('sineStrokes', () => {
    it('oscillates with multiple strokes per period', () => {
      const params = { from: 0, to: 1, periodMs: 1000, strokes: 7 }
      const v = evaluateGenerator({ fn: 'sineStrokes', params }, 0)
      expect(v).toBeCloseTo(0.5)
    })

    it('stays within from-to range', () => {
      const params = { from: 10, to: 20, periodMs: 1000, strokes: 5 }
      for (let t = 0; t < 1000; t += 50) {
        const v = evaluateGenerator({ fn: 'sineStrokes', params }, t)
        expect(v).toBeGreaterThanOrEqual(9.99)
        expect(v).toBeLessThanOrEqual(20.01)
      }
    })
  })

  describe('sineOscillation', () => {
    it('oscillates using raw sine (can go below from)', () => {
      const params = { from: 0, to: 10, periodMs: 1000 }
      const atThreeQuarter = evaluateGenerator({ fn: 'sineOscillation', params }, 750)
      expect(atThreeQuarter).toBeLessThan(0)
    })

    it('reaches to value at quarter period', () => {
      const params = { from: 0, to: 1, periodMs: 1000 }
      const v = evaluateGenerator({ fn: 'sineOscillation', params }, 250)
      expect(v).toBeCloseTo(1)
    })
  })

  describe('countUp', () => {
    it('starts at 0', () => {
      expect(evaluateGenerator({ fn: 'countUp', params: { target: 100, durationMs: 1000 } }, 0)).toBe(0)
    })

    it('reaches target at duration', () => {
      expect(
        evaluateGenerator({ fn: 'countUp', params: { target: 100, durationMs: 1000 } }, 1000),
      ).toBe(100)
    })

    it('eases through intermediate values', () => {
      const mid = evaluateGenerator({ fn: 'countUp', params: { target: 100, durationMs: 1000 } }, 500)
      expect(mid).toBeGreaterThan(50)
      expect(mid).toBeLessThan(100)
    })
  })

  describe('unknown generator', () => {
    it('returns 0', () => {
      expect(evaluateGenerator({ fn: 'nonexistent' }, 500)).toBe(0)
    })
  })
})
