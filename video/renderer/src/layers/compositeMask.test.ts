import { describe, it, expect, vi } from 'vitest'
import type { CompositeMaskLayer, Layer } from '@variax-ai/video-schema'
import { drawCompositeMaskLayer } from './compositeMask'
import { createStubCtx, createTestRctx, getCalls } from '../test-helpers'
import type { RenderContext } from '../types'

const IMAGE = { width: 800, height: 600 } as unknown as CanvasImageSource

function makeRctx(overrides: Parameters<typeof createTestRctx>[0] = {}): RenderContext {
  const rctx = createTestRctx({
    ...overrides,
    createCanvas: (width, height) =>
      ({ width, height, getContext: () => createStubCtx() }) as unknown as HTMLCanvasElement,
  })
  rctx.drawLayer = (ctx, layer, tMs) => {
    // Stand in for the real recursion; enough to prove routing and ordering.
    ;(ctx as unknown as { calls: unknown[] }).calls
    ctx.fillRect(0, 0, (layer as { type: string }).type.length, tMs)
  }
  return rctx
}

const mask: Layer = { type: 'shape', shape: 'ellipse', size: [100, 100] } as Layer

describe('drawCompositeMaskLayer', () => {
  it('composites an images-registry source through the mask', () => {
    const ctx = createStubCtx()
    const layer = { type: 'compositeMask', source: 'photo', mask } as CompositeMaskLayer
    drawCompositeMaskLayer(ctx, layer, 500, makeRctx({ images: { photo: IMAGE } }))
    // The only thing that reaches the caller's context is the composited canvas.
    expect(getCalls(ctx, 'drawImage')).toHaveLength(1)
  })

  it('does nothing when a string source names a missing image', () => {
    const ctx = createStubCtx()
    const layer = { type: 'compositeMask', source: 'missing', mask } as CompositeMaskLayer
    drawCompositeMaskLayer(ctx, layer, 500, makeRctx({ images: {} }))
    expect(ctx.calls).toHaveLength(0)
  })

  it('routes a layer source through drawLayer', () => {
    const ctx = createStubCtx()
    const rctx = makeRctx()
    const drawLayer = vi.fn()
    rctx.drawLayer = drawLayer
    const source = { type: 'image', asset: 'photo', frame: { x: 0, y: 0, w: 10, h: 10 } } as Layer
    const layer = { type: 'compositeMask', source, mask } as CompositeMaskLayer

    drawCompositeMaskLayer(ctx, layer, 500, rctx)

    expect(drawLayer).toHaveBeenCalledTimes(2)
    expect(drawLayer.mock.calls[0][1]).toBe(mask)
    expect(drawLayer.mock.calls[1][1]).toBe(source)
    expect(drawLayer.mock.calls[1][2]).toBe(500)
  })

  it('ignores maskEffect for a layer source, leaving the layer its own pipeline', () => {
    const ctx = createStubCtx()
    const rctx = makeRctx()
    const contexts: ReturnType<typeof createStubCtx>[] = []
    rctx.options.createCanvas = (width, height) => {
      const sub = createStubCtx()
      contexts.push(sub)
      return { width, height, getContext: () => sub } as unknown as HTMLCanvasElement
    }
    const layer = {
      type: 'compositeMask',
      source: { type: 'shape', shape: 'rect', size: [10, 10] } as Layer,
      maskEffect: { type: 'gaussianBlur', radius: 20 },
      mask,
    } as CompositeMaskLayer

    drawCompositeMaskLayer(ctx, layer, 500, rctx)

    expect(contexts.every(c => !c.calls.some(call => call.method === 'set:filter'))).toBe(true)
  })

  it('keeps a non-downscale maskEffect when a blur floor is configured', () => {
    const ctx = createStubCtx()
    const rctx = makeRctx({ images: { photo: IMAGE } })
    rctx.options.constraints = { minDownscaleBlurPx: 48, minDownscaleShrink: 20 }
    const inner: ReturnType<typeof createStubCtx>[] = []
    rctx.options.createCanvas = (width, height) => {
      const sub = createStubCtx()
      inner.push(sub)
      return { width, height, getContext: () => sub } as unknown as HTMLCanvasElement
    }
    const layer = {
      type: 'compositeMask',
      source: 'photo',
      maskEffect: { type: 'gaussianBlur', radius: 120 },
      mask,
    } as CompositeMaskLayer

    drawCompositeMaskLayer(ctx, layer, 500, rctx)

    // The floor raises the downscale blur; it must not swallow the declared effect.
    const filters = inner.flatMap(c => c.calls.filter(x => x.method === 'set:filter').map(x => x.args[0]))
    expect(filters).toContain('blur(120px)')
    expect(filters).toContain('blur(2.4px)')
  })

  it('scopes a maskEffect filter so it cannot feather the mask composite', () => {
    const ctx = createStubCtx()
    const rctx = makeRctx({ images: { photo: IMAGE } })
    const inner: ReturnType<typeof createStubCtx>[] = []
    rctx.options.createCanvas = (width, height) => {
      const sub = createStubCtx()
      inner.push(sub)
      return { width, height, getContext: () => sub } as unknown as HTMLCanvasElement
    }
    const layer = {
      type: 'compositeMask',
      source: 'photo',
      maskEffect: { type: 'gaussianBlur', radius: 60 },
      mask,
    } as CompositeMaskLayer

    drawCompositeMaskLayer(ctx, layer, 500, rctx)

    // restore() must land before destination-in is set on the source context.
    const source = inner.find(c => c.calls.some(x => x.args[0] === 'destination-in'))!
    const restoreAt = source.calls.findIndex(c => c.method === 'restore')
    const compositeAt = source.calls.findIndex(c => c.args[0] === 'destination-in')
    expect(restoreAt).toBeGreaterThan(-1)
    expect(restoreAt).toBeLessThan(compositeAt)
  })

  it('does not allocate canvases for a source layer that is not yet visible', () => {
    const ctx = createStubCtx()
    const sizes: number[][] = []
    const rctx = makeRctx()
    rctx.options.createCanvas = (width, height) => {
      sizes.push([width, height])
      return { width, height, getContext: () => createStubCtx() } as unknown as HTMLCanvasElement
    }
    const layer = {
      type: 'compositeMask',
      source: { type: 'image', asset: 'photo', startMs: 4000, endMs: 6000 } as Layer,
      mask,
    } as CompositeMaskLayer

    drawCompositeMaskLayer(ctx, layer, 500, rctx)

    expect(sizes).toHaveLength(0)
    expect(ctx.calls).toHaveLength(0)
  })

  it('no-ops instead of throwing when source is missing', () => {
    const ctx = createStubCtx()
    const layer = { type: 'compositeMask', mask } as unknown as CompositeMaskLayer
    expect(() => drawCompositeMaskLayer(ctx, layer, 500, makeRctx())).not.toThrow()
    expect(ctx.calls).toHaveLength(0)
  })

  it('honours a downscaleBlur maskEffect on a string source', () => {
    const ctx = createStubCtx()
    const rctx = makeRctx({ images: { photo: IMAGE } })
    const sizes: number[][] = []
    rctx.options.createCanvas = (width, height) => {
      sizes.push([width, height])
      return { width, height, getContext: () => createStubCtx() } as unknown as HTMLCanvasElement
    }
    const layer = {
      type: 'compositeMask',
      source: 'photo',
      maskEffect: { type: 'downscaleBlur', radius: 40, shrink: 20 },
      mask,
    } as CompositeMaskLayer

    drawCompositeMaskLayer(ctx, layer, 500, rctx)

    // Mask canvas, source canvas, then the downscale buffer at 1/20 scale.
    expect(sizes).toEqual([[1920, 1080], [1920, 1080], [96, 54]])
  })
})
