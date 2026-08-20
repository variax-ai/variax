import { describe, it, expect } from 'vitest'
import type { CompositeMaskLayer, ImageLayer, Layer } from '@variax-ai/video-schema'
import { drawImageLayer } from './image'
import { drawCompositeMaskLayer } from './compositeMask'
import { createStubCtx, createTestRctx, getCalls } from '../test-helpers'
import type { RenderContext, RendererConstraints } from '../types'

const IMAGE = { width: 1200, height: 900 } as unknown as CanvasImageSource
const FRAME = { x: 60, y: 200, w: 960, h: 960 }

/** Records the size of every offscreen buffer, which is how the downscale path
 *  makes itself visible: a tiny canvas means the image went through the smudge. */
function makeRctx(constraints?: RendererConstraints, image: CanvasImageSource = IMAGE) {
  const sizes: number[][] = []
  const rctx: RenderContext = createTestRctx({
    images: { photo: image },
    createCanvas: (width, height) => {
      sizes.push([width, height])
      return { width, height, getContext: () => createStubCtx() } as unknown as HTMLCanvasElement
    },
  })
  rctx.options.constraints = constraints
  return { rctx, sizes }
}

function imageLayer(overrides: Partial<ImageLayer> = {}): ImageLayer {
  return { type: 'image', asset: 'photo', frame: FRAME, ...overrides } as ImageLayer
}

describe('drawImageLayer without constraints', () => {
  it('draws a framed image directly', () => {
    const ctx = createStubCtx()
    const { rctx, sizes } = makeRctx()
    drawImageLayer(ctx, imageLayer(), 0, rctx)
    expect(sizes).toHaveLength(0)
    expect(getCalls(ctx, 'drawImage')[0].args.slice(1)).toEqual([60, 200, 960, 960])
  })

  it('draws an unframed image at its natural size', () => {
    const ctx = createStubCtx()
    const { rctx } = makeRctx()
    drawImageLayer(ctx, imageLayer({ frame: undefined }), 0, rctx)
    expect(getCalls(ctx, 'drawImage')[0].args.slice(1)).toEqual([0, 0])
  })

  it('applies a declared downscaleBlur', () => {
    const ctx = createStubCtx()
    const { rctx, sizes } = makeRctx()
    const layer = imageLayer({ effects: [{ type: 'downscaleBlur', radius: 56, shrink: 20 }] })
    drawImageLayer(ctx, layer, 0, rctx)
    expect(sizes).toEqual([[48, 48]])
  })

  it('skips the blur when a declared radius is zero', () => {
    const ctx = createStubCtx()
    const { rctx, sizes } = makeRctx()
    const layer = imageLayer({ effects: [{ type: 'downscaleBlur', radius: 0, shrink: 20 }] })
    drawImageLayer(ctx, layer, 0, rctx)
    expect(sizes).toHaveLength(0)
  })
})

describe('drawImageLayer with a blur floor', () => {
  const floor: RendererConstraints = { minDownscaleBlurPx: 48, minDownscaleShrink: 12 }

  it('forces the downscale path when the document declares no blur at all', () => {
    const ctx = createStubCtx()
    const { rctx, sizes } = makeRctx(floor)
    drawImageLayer(ctx, imageLayer(), 0, rctx)
    expect(sizes).toEqual([[48, 48]])
    // The only draw onto the caller's context is the upscaled tiny buffer.
    expect(getCalls(ctx, 'drawImage')).toHaveLength(1)
  })

  it('forces the downscale path when the document declares radius 0', () => {
    const ctx = createStubCtx()
    const { rctx, sizes } = makeRctx(floor)
    const layer = imageLayer({ effects: [{ type: 'downscaleBlur', radius: 0, shrink: 20 }] })
    drawImageLayer(ctx, layer, 0, rctx)
    expect(sizes).toEqual([[48, 48]])
  })

  it('raises an animated radius that dips below the floor, frame by frame', () => {
    const layer = imageLayer({
      effects: [{
        type: 'downscaleBlur',
        radius: { keyframes: [{ t: 0, value: 200 }, { t: 1000, value: 4 }] },
        shrink: 20,
      }],
    })
    const radii: number[] = []
    for (const t of [0, 500, 1000]) {
      const ctx = createStubCtx()
      const { rctx } = makeRctx(floor)
      // The blur lands on the offscreen ctx, so read it back off a captured one.
      let inner: ReturnType<typeof createStubCtx> | undefined
      rctx.options.createCanvas = (width, height) => {
        inner = createStubCtx()
        return { width, height, getContext: () => inner } as unknown as HTMLCanvasElement
      }
      drawImageLayer(ctx, layer, t, rctx)
      const filter = inner?.calls.find(c => c.method === 'set:filter')?.args[0] as string
      radii.push(Number(/blur\(([\d.]+)px\)/.exec(filter)![1]) * 20)
    }
    expect(radii[0]).toBeCloseTo(200)
    expect(radii[1]).toBeGreaterThanOrEqual(48)
    expect(radii[2]).toBeCloseTo(48)
  })

  it('raises a declared shrink that sits below the floor', () => {
    const ctx = createStubCtx()
    const { rctx, sizes } = makeRctx({ minDownscaleShrink: 30 })
    const layer = imageLayer({ effects: [{ type: 'downscaleBlur', radius: 56, shrink: 4 }] })
    drawImageLayer(ctx, layer, 0, rctx)
    expect(sizes).toEqual([[32, 32]])
  })

  it('forces the downscale path on an unframed image using its intrinsic size', () => {
    const ctx = createStubCtx()
    const { rctx, sizes } = makeRctx(floor)
    drawImageLayer(ctx, imageLayer({ frame: undefined }), 0, rctx)
    // shrink stays at the default 20 — a floor of 12 does not raise it.
    expect(sizes).toEqual([[60, 45]])
  })

  it('fails closed when an unframed image has no derivable size', () => {
    const ctx = createStubCtx()
    const opaque = {} as unknown as CanvasImageSource
    const { rctx, sizes } = makeRctx(floor, opaque)
    drawImageLayer(ctx, imageLayer({ frame: undefined }), 0, rctx)
    expect(sizes).toHaveLength(0)
    expect(ctx.calls).toHaveLength(0)
  })

  it('clamps a compositeMask string source, which has no downscaleBlur of its own', () => {
    const ctx = createStubCtx()
    const { rctx, sizes } = makeRctx(floor)
    rctx.drawLayer = () => {}
    const layer = {
      type: 'compositeMask',
      source: 'photo',
      mask: { type: 'shape', shape: 'ellipse', size: [100, 100] } as Layer,
    } as CompositeMaskLayer
    drawCompositeMaskLayer(ctx, layer, 0, rctx)
    // Mask canvas, source canvas, then the forced downscale buffer.
    expect(sizes).toEqual([[1920, 1080], [1920, 1080], [96, 54]])
  })
})

describe('the blur floor cannot be opted out of', () => {
  const floor: RendererConstraints = { minDownscaleBlurPx: 48 }

  it('ignores a negative shrink instead of dropping the floor', () => {
    const ctx = createStubCtx()
    const { rctx, sizes } = makeRctx(floor)
    const layer = imageLayer({ effects: [{ type: 'downscaleBlur', radius: 0, shrink: -1 }] })
    drawImageLayer(ctx, layer, 0, rctx)
    // Falls back to the default shrink of 20 and still smudges.
    expect(sizes).toEqual([[48, 48]])
  })

  it('ignores a zero shrink instead of dropping the floor', () => {
    const ctx = createStubCtx()
    const { rctx, sizes } = makeRctx(floor)
    drawImageLayer(ctx, imageLayer({ effects: [{ type: 'downscaleBlur', radius: 56, shrink: 0 }] }), 0, rctx)
    expect(sizes).toEqual([[48, 48]])
  })

  it('ignores a NaN radius instead of dropping the floor', () => {
    const ctx = createStubCtx()
    const { rctx } = makeRctx(floor)
    let inner: ReturnType<typeof createStubCtx> | undefined
    rctx.options.createCanvas = (width, height) => {
      inner = createStubCtx()
      return { width, height, getContext: () => inner } as unknown as HTMLCanvasElement
    }
    // periodMs 0 makes Math.sin(Infinity) NaN.
    const layer = imageLayer({
      effects: [{ type: 'downscaleBlur', radius: { generator: { fn: 'sine', params: { periodMs: 0 } } }, shrink: 20 }],
    })
    drawImageLayer(ctx, layer, 100, rctx)
    expect(inner?.calls.some(c => c.method === 'set:filter' && c.args[0] === 'blur(2.4px)')).toBe(true)
  })

  it('still draws an unframed image when the blur was only the document\'s idea', () => {
    const ctx = createStubCtx()
    const opaque = {} as unknown as CanvasImageSource
    const { rctx } = makeRctx(undefined, opaque)
    const layer = imageLayer({ frame: undefined, effects: [{ type: 'downscaleBlur', radius: 30, shrink: 10 }] })
    drawImageLayer(ctx, layer, 0, rctx)
    expect(getCalls(ctx, 'drawImage')).toHaveLength(1)
  })
})
