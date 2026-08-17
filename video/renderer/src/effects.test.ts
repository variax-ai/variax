import { describe, it, expect } from 'vitest'
import { applyPreDrawEffects, getDownscaleBlurParams } from './effects'
import { createStubCtx, getCalls } from './test-helpers'

describe('applyPreDrawEffects', () => {
  it('does nothing when effects is undefined', () => {
    const ctx = createStubCtx()
    applyPreDrawEffects(ctx, undefined, 0)
    expect(ctx.calls).toHaveLength(0)
  })

  it('does nothing for empty effects array', () => {
    const ctx = createStubCtx()
    applyPreDrawEffects(ctx, [], 0)
    expect(ctx.calls).toHaveLength(0)
  })

  it('applies gaussian blur as filter', () => {
    const ctx = createStubCtx()
    applyPreDrawEffects(ctx, [{ type: 'gaussianBlur', radius: 5 }], 0)
    expect(getCalls(ctx, 'set:filter')[0].args[0]).toBe('blur(5px)')
  })

  it('skips blur when radius is 0', () => {
    const ctx = createStubCtx()
    applyPreDrawEffects(ctx, [{ type: 'gaussianBlur', radius: 0 }], 0)
    expect(getCalls(ctx, 'set:filter')).toHaveLength(0)
  })

  it('applies drop shadow properties', () => {
    const ctx = createStubCtx()
    applyPreDrawEffects(ctx, [{
      type: 'dropShadow',
      color: '#000000',
      blur: 10,
      offsetX: 5,
      offsetY: 3,
    }], 0)
    expect(getCalls(ctx, 'set:shadowColor')[0].args[0]).toBe('#000000')
    expect(getCalls(ctx, 'set:shadowBlur')[0].args[0]).toBe(10)
    expect(getCalls(ctx, 'set:shadowOffsetX')[0].args[0]).toBe(5)
    expect(getCalls(ctx, 'set:shadowOffsetY')[0].args[0]).toBe(3)
  })

  it('defaults shadow offsets to 0', () => {
    const ctx = createStubCtx()
    applyPreDrawEffects(ctx, [{ type: 'dropShadow', color: '#000', blur: 5 }], 0)
    expect(getCalls(ctx, 'set:shadowOffsetX')[0].args[0]).toBe(0)
    expect(getCalls(ctx, 'set:shadowOffsetY')[0].args[0]).toBe(0)
  })

  it('combines multiple blur filters', () => {
    const ctx = createStubCtx()
    applyPreDrawEffects(ctx, [
      { type: 'gaussianBlur', radius: 3 },
      { type: 'gaussianBlur', radius: 7 },
    ], 0)
    expect(getCalls(ctx, 'set:filter')[0].args[0]).toBe('blur(3px) blur(7px)')
  })
})

describe('getDownscaleBlurParams', () => {
  it('returns null when no downscaleBlur effect', () => {
    expect(getDownscaleBlurParams([{ type: 'gaussianBlur', radius: 5 }], 0)).toBeNull()
  })

  it('returns null for empty array', () => {
    expect(getDownscaleBlurParams([], 0)).toBeNull()
  })

  it('returns params from downscaleBlur effect', () => {
    const result = getDownscaleBlurParams(
      [{ type: 'downscaleBlur', radius: 4, shrink: 0.5 }],
      0,
    )
    expect(result).toEqual({ radius: 4, shrink: 0.5 })
  })
})
