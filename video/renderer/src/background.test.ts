import { describe, it, expect } from 'vitest'
import { drawBackground } from './background'
import { createStubCtx, getCalls } from './test-helpers'
import type { ResolveContext } from './types'

const rctx: ResolveContext = { vars: {}, tokens: { primary: '#6c4df6' } }

describe('drawBackground', () => {
  it('does nothing when background is undefined', () => {
    const ctx = createStubCtx()
    drawBackground(ctx, undefined, 1920, 1080, rctx)
    expect(ctx.calls).toHaveLength(0)
  })

  it('fills solid color background', () => {
    const ctx = createStubCtx()
    drawBackground(ctx, '#ff0000', 1920, 1080, rctx)
    expect(getCalls(ctx, 'set:fillStyle')[0].args[0]).toBe('#ff0000')
    expect(getCalls(ctx, 'fillRect')[0].args).toEqual([0, 0, 1920, 1080])
  })

  it('resolves token references in solid backgrounds', () => {
    const ctx = createStubCtx()
    drawBackground(ctx, '$token:primary', 1920, 1080, rctx)
    expect(getCalls(ctx, 'set:fillStyle')[0].args[0]).toBe('#6c4df6')
  })

  it('creates linear gradient with stops', () => {
    const ctx = createStubCtx()
    const bg = { type: 'linearGradient' as any, stops: ['#ff0000', '#0000ff'] as [string, string], angle: 180 }
    drawBackground(ctx, bg, 1920, 1080, rctx)
    expect(getCalls(ctx, 'createLinearGradient')).toHaveLength(1)
    const colorStops = getCalls(ctx, 'addColorStop')
    expect(colorStops).toHaveLength(2)
    expect(colorStops[0].args).toEqual([0, '#ff0000'])
    expect(colorStops[1].args).toEqual([1, '#0000ff'])
  })

  it('creates radial gradient', () => {
    const ctx = createStubCtx()
    const bg = { type: 'radialGradient' as any, stops: ['#fff', '#000'] as [string, string] }
    drawBackground(ctx, bg, 1920, 1080, rctx)
    expect(getCalls(ctx, 'createRadialGradient')).toHaveLength(1)
  })

  it('resolves token references in gradient stops', () => {
    const ctx = createStubCtx()
    const bg = { type: 'linearGradient' as any, stops: ['$token:primary', '#000000'] as [string, string] }
    drawBackground(ctx, bg, 1920, 1080, rctx)
    const colorStops = getCalls(ctx, 'addColorStop')
    expect(colorStops[0].args[1]).toBe('#6c4df6')
  })

  it('uses transparent for unresolvable gradient stops', () => {
    const ctx = createStubCtx()
    const bg = { type: 'linearGradient' as any, stops: ['$token:missing', '#000'] as [string, string] }
    drawBackground(ctx, bg, 1920, 1080, rctx)
    const colorStops = getCalls(ctx, 'addColorStop')
    expect(colorStops[0].args[1]).toBe('transparent')
  })

  it('distributes 3 stops evenly', () => {
    const ctx = createStubCtx()
    const bg = { type: 'linearGradient' as any, stops: ['#a', '#b', '#c'] as [string, string, string] }
    drawBackground(ctx, bg, 1920, 1080, rctx)
    const colorStops = getCalls(ctx, 'addColorStop')
    expect(colorStops[0].args[0]).toBeCloseTo(0)
    expect(colorStops[1].args[0]).toBeCloseTo(0.5)
    expect(colorStops[2].args[0]).toBeCloseTo(1)
  })
})
