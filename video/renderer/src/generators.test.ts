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

describe('startMs time origin', () => {
  it('shifts a generator so its curve starts where the document says', () => {
    const params = { from: 0, to: 100, periodMs: 1000, startMs: 2000 }
    // sineOscillation is zero at its own t=0 and peaks a quarter period later.
    expect(evaluateGenerator({ fn: 'sineOscillation', params }, 2000)).toBeCloseTo(0)
    expect(evaluateGenerator({ fn: 'sineOscillation', params }, 2250)).toBeCloseTo(100)
  })

  it('expresses a cosine as a quarter-period shift, no phase param needed', () => {
    const periodMs = 1000
    const cosine = { from: 0, to: 100, periodMs, startMs: -periodMs / 4 }
    expect(evaluateGenerator({ fn: 'sineOscillation', params: cosine }, 0)).toBeCloseTo(100)
  })

  it('rebases countUp so a late scene still counts from zero', () => {
    const params = { target: 50, durationMs: 1000, startMs: 5000 }
    expect(evaluateGenerator({ fn: 'countUp', params }, 5000)).toBe(0)
    expect(evaluateGenerator({ fn: 'countUp', params }, 6000)).toBe(50)
  })

  it('is a no-op when absent or zero, for every generator', () => {
    const fns = ['sine', 'sineStrokes', 'sineOscillation', 'pulse', 'countUp']
    for (const fn of fns) {
      const params = { from: 0, to: 100, periodMs: 700, strokes: 3, target: 20, durationMs: 700 }
      for (const t of [0, 123, 456, 900]) {
        expect(evaluateGenerator({ fn, params }, t)).toBe(
          evaluateGenerator({ fn, params: { ...params, startMs: 0 } }, t),
        )
      }
    }
  })
})

describe('pulse before its time origin', () => {
  it('stays inside [from, to) rather than ramping negative', () => {
    const params = { from: 0, to: 1, periodMs: 1000, startMs: 2000 }
    for (let t = 0; t < 2000; t += 50) {
      const v = evaluateGenerator({ fn: 'pulse', params }, t)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})
