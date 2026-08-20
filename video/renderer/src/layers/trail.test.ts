import { describe, it, expect } from 'vitest'
import type { TrailLayer } from '@variax-ai/video-schema'
import { drawTrailLayer, trailSamples } from './trail'
import { createStubCtx, createTestRctx, getCalls } from '../test-helpers'

/** A point moving right at 1px/ms, so a sample's x reads back its timestamp. */
const linearSource = {
  x: { keyframes: [{ t: 0, value: 0 }, { t: 10000, value: 10000 }] },
  y: 500,
} as unknown as TrailLayer['source']

function makeTrail(overrides: Partial<TrailLayer> = {}): TrailLayer {
  return {
    type: 'trail',
    source: linearSource,
    windowMs: 500,
    samples: 10,
    radius: 78,
    falloff: 0.6,
    ...overrides,
  } as TrailLayer
}

describe('trailSamples', () => {
  it('spaces samples windowMs/samples apart, freshest first', () => {
    const samples = trailSamples(makeTrail(), 2000)
    expect(samples).toHaveLength(10)
    expect(samples[0].x).toBeCloseTo(2000)
    expect(samples[1].x).toBeCloseTo(1950)
    expect(samples[9].x).toBeCloseTo(1550)
  })

  it('shrinks radius with age by falloff', () => {
    const samples = trailSamples(makeTrail(), 2000)
    expect(samples[0].r).toBeCloseTo(78)
    expect(samples[5].r).toBeCloseTo(78 * (1 - 0.6 * 5 / 10))
    expect(samples[9].r).toBeCloseTo(78 * (1 - 0.6 * 9 / 10))
  })

  it('holds radius constant when falloff is absent', () => {
    const samples = trailSamples(makeTrail({ falloff: undefined }), 2000)
    expect(samples.every(s => Math.abs(s.r - 78) < 1e-9)).toBe(true)
  })

  it('take truncates the draw but leaves the age schedule intact', () => {
    const full = trailSamples(makeTrail(), 2000)
    const taken = trailSamples(makeTrail({ take: 3 }), 2000)
    expect(taken).toHaveLength(3)
    expect(taken.map(s => s.r)).toEqual(full.slice(0, 3).map(s => s.r))
    expect(taken.map(s => s.x)).toEqual(full.slice(0, 3).map(s => s.x))
  })

  it('drops samples older than startMs rather than clamping them', () => {
    const samples = trailSamples(makeTrail({ startMs: 1900 }), 2000)
    expect(samples).toHaveLength(3)
    expect(samples[2].x).toBeCloseTo(1900)
  })

  it('re-evaluates a generator source at past times', () => {
    const layer = makeTrail({
      source: { generator: { fn: 'sineOscillation', params: { from: 0, to: 100, periodMs: 1000 } } },
      samples: 4,
      windowMs: 1000,
      falloff: 0,
    })
    const samples = trailSamples(layer, 1000)
    // A generator on a bare AnimatedPoint broadcasts to both axes, so x tracks
    // the curve: t=1000 -> 0, t=750 -> -100, t=500 -> 0, t=250 -> 100.
    expect(samples.map(s => Math.round(s.x))).toEqual([-0, -100, 0, 100])
  })

  it('skips samples whose radius has collapsed to zero', () => {
    const layer = makeTrail({
      samples: 4,
      windowMs: 400,
      falloff: 0,
      // Radius ramps to zero going back in time, so only the freshest sample
      // of the t=200 window contributes anything.
      radius: { keyframes: [{ t: 100, value: 0 }, { t: 200, value: 40 }] },
    })
    expect(trailSamples(layer, 200)).toEqual([{ x: 200, y: 500, r: 40 }])
  })
})

describe('drawTrailLayer', () => {
  it('unions the circles into a single filled path', () => {
    const ctx = createStubCtx()
    drawTrailLayer(ctx, makeTrail({ samples: 3, take: 3 }), 2000, createTestRctx())
    expect(getCalls(ctx, 'beginPath')).toHaveLength(1)
    expect(getCalls(ctx, 'arc')).toHaveLength(3)
    expect(getCalls(ctx, 'fill')).toHaveLength(1)
    expect(getCalls(ctx, 'stroke')).toHaveLength(0)
  })

  it('defaults the fill to opaque white so a bare trail works as a mask', () => {
    const ctx = createStubCtx()
    drawTrailLayer(ctx, makeTrail(), 2000, createTestRctx())
    expect(ctx.calls.some(c => c.method === 'set:fillStyle' && c.args[0] === '#ffffff')).toBe(true)
  })

  it('resolves a token fill', () => {
    const ctx = createStubCtx()
    const rctx = createTestRctx({ tokens: { smear: '#6c4df6' } })
    drawTrailLayer(ctx, makeTrail({ fill: '$token:smear' }), 2000, rctx)
    expect(ctx.calls.some(c => c.method === 'set:fillStyle' && c.args[0] === '#6c4df6')).toBe(true)
  })

  it('strokes a rounded polyline through the sample centres', () => {
    const ctx = createStubCtx()
    const layer = makeTrail({ samples: 4, take: 4, stroke: { color: '#ffffff', width: 90 } })
    drawTrailLayer(ctx, layer, 2000, createTestRctx())
    expect(getCalls(ctx, 'moveTo')).toHaveLength(1)
    expect(getCalls(ctx, 'lineTo')).toHaveLength(3)
    expect(getCalls(ctx, 'stroke')).toHaveLength(1)
    expect(ctx.calls.some(c => c.method === 'set:lineCap' && c.args[0] === 'round')).toBe(true)
  })

  it('draws stroke only when a stroke is given without a fill', () => {
    const ctx = createStubCtx()
    const layer = makeTrail({ stroke: { color: '#ffffff', width: 90 } })
    drawTrailLayer(ctx, layer, 2000, createTestRctx())
    expect(getCalls(ctx, 'fill')).toHaveLength(0)
    expect(getCalls(ctx, 'stroke')).toHaveLength(1)
  })

  it('draws nothing when every sample falls before startMs', () => {
    const ctx = createStubCtx()
    drawTrailLayer(ctx, makeTrail({ startMs: 3000 }), 2000, createTestRctx())
    expect(ctx.calls).toHaveLength(0)
  })
})

describe('trail robustness', () => {
  it('rejects samples with a non-finite radius', () => {
    const layer = makeTrail({
      radius: { generator: { fn: 'sine', params: { periodMs: 0 } } },
    })
    expect(trailSamples(layer, 2000)).toHaveLength(0)
  })

  it('rejects samples with a non-finite position', () => {
    const layer = makeTrail({
      source: { x: { generator: { fn: 'sine', params: { periodMs: 0 } } }, y: 500 },
    } as Partial<TrailLayer>)
    expect(trailSamples(layer, 2000)).toHaveLength(0)
  })

  it('drops repeated samples a clamp-holding source produces', () => {
    // Keyframes start at t=1900, so everything older clamps onto one point.
    const layer = makeTrail({
      source: { keyframes: [{ t: 1900, value: [100, 100] }, { t: 5000, value: [900, 100] }] },
      falloff: 0,
    } as Partial<TrailLayer>)
    const samples = trailSamples(layer, 1950)
    expect(samples).toHaveLength(2)
    expect(samples[1]).toEqual({ x: 100, y: 100, r: 78 })
  })
})
