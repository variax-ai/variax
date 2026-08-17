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
