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
