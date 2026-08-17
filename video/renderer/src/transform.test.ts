import { describe, it, expect } from 'vitest'
import { applyTransform } from './transform'
import { createStubCtx, getCalls } from './test-helpers'

describe('applyTransform', () => {
  it('does nothing when transform is undefined and no position', () => {
    const ctx = createStubCtx()
    applyTransform(ctx, undefined, undefined, 0)
    expect(ctx.calls).toHaveLength(0)
  })

  it('translates by static position', () => {
    const ctx = createStubCtx()
    applyTransform(ctx, undefined, [100, 200], 0)
    const translates = getCalls(ctx, 'translate')
    expect(translates).toHaveLength(1)
    expect(translates[0].args).toEqual([100, 200])
  })

  it('applies animated position from transform', () => {
    const ctx = createStubCtx()
    const transform = {
      position: {
        keyframes: [
          { t: 0, value: [0, 0] as [number, number] },
          { t: 1000, value: [200, 400] as [number, number] },
        ] as [{ t: number; value: [number, number] }, ...{ t: number; value: [number, number] }[]],
      },
    }
    applyTransform(ctx, transform, undefined, 500)
    const translates = getCalls(ctx, 'translate')
    expect(translates).toHaveLength(1)
    expect(translates[0].args[0]).toBeCloseTo(100)
    expect(translates[0].args[1]).toBeCloseTo(200)
  })

  it('applies scale', () => {
    const ctx = createStubCtx()
    applyTransform(ctx, { scale: [2, 3] }, undefined, 0)
    const scales = getCalls(ctx, 'scale')
    expect(scales).toHaveLength(1)
    expect(scales[0].args).toEqual([2, 3])
  })

  it('converts rotation from degrees to radians', () => {
    const ctx = createStubCtx()
    applyTransform(ctx, { rotation: 90 }, undefined, 0)
    const rotates = getCalls(ctx, 'rotate')
    expect(rotates).toHaveLength(1)
    expect(rotates[0].args[0]).toBeCloseTo(Math.PI / 2)
  })

  it('applies opacity by multiplying globalAlpha', () => {
    const ctx = createStubCtx()
    applyTransform(ctx, { opacity: 0.5 }, undefined, 0)
    const alphaSet = getCalls(ctx, 'set:globalAlpha')
    expect(alphaSet.length).toBeGreaterThan(0)
    expect(alphaSet[alphaSet.length - 1].args[0]).toBeCloseTo(0.5)
  })

  it('applies anchor as translate-around pattern', () => {
    const ctx = createStubCtx()
    applyTransform(ctx, { anchor: [50, 50], rotation: 180 }, undefined, 0)
    const translates = getCalls(ctx, 'translate')
    expect(translates).toHaveLength(2)
    expect(translates[0].args).toEqual([50, 50])
    expect(translates[1].args).toEqual([-50, -50])
  })

  it('applies all transforms in correct order', () => {
    const ctx = createStubCtx()
    applyTransform(
      ctx,
      {
        anchor: [10, 10],
        position: [100, 200] as [number, number],
        scale: [2, 2] as [number, number],
        rotation: 45,
        opacity: 0.8,
      },
      [50, 60],
      0,
    )

    const methodOrder = ctx.calls.map(c => c.method)
    const translateIdx = methodOrder.indexOf('translate')
    const scaleIdx = methodOrder.indexOf('scale')
    const rotateIdx = methodOrder.indexOf('rotate')

    expect(translateIdx).toBeLessThan(scaleIdx)
    expect(scaleIdx).toBeLessThan(rotateIdx)
  })
})
