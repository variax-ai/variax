import { describe, it, expect, vi } from 'vitest'
import { createDocumentDrawer } from './index'
import { createStubCtx, getCalls } from './test-helpers'
import type { VideoDocument } from '@variax-ai/video-schema'

function makeDoc(overrides: Partial<VideoDocument> & { scenes: VideoDocument['scenes'] }): VideoDocument {
  return {
    version: 1,
    width: 1920,
    height: 1080,
    fps: 30,
    durationMs: 10000,
    ...overrides,
  } as VideoDocument
}

describe('createDocumentDrawer', () => {
  it('returns a function', () => {
    const draw = createDocumentDrawer(
      makeDoc({ scenes: [{ id: 's1', startMs: 0, endMs: 1000, layers: [] }] }),
      { vars: {}, images: {} },
    )
    expect(typeof draw).toBe('function')
  })

  it('indexes font assets from the document', () => {
    const doc = makeDoc({
      assets: {
        heading: { type: 'font', family: 'Inter', weight: 700, src: 'inter.woff2' },
      },
      scenes: [{
        id: 's1', startMs: 0, endMs: 5000,
        layers: [{
          type: 'text',
          content: 'Hello',
          position: [960, 540],
          color: '#ffffff',
          font: { size: 48, asset: 'heading' },
        }],
      }],
    })
    const ctx = createStubCtx()
    const draw = createDocumentDrawer(doc, { vars: {}, images: {} })
    draw(ctx, 1000)
    const fontSets = getCalls(ctx, 'set:font')
    expect(fontSets.some(c => (c.args[0] as string).includes('Inter'))).toBe(true)
  })
})

describe('shape layer rendering', () => {
  it('draws a rect with fill', () => {
    const ctx = createStubCtx()
    const doc = makeDoc({
      scenes: [{
        id: 's1', startMs: 0, endMs: 5000,
        layers: [{ type: 'shape', shape: 'rect', size: [200, 100], position: [0, 0], fill: '#ff0000' }],
      }],
    })
    createDocumentDrawer(doc, { vars: {}, images: {} })(ctx, 500)
    expect(getCalls(ctx, 'rect')).toHaveLength(1)
    expect(getCalls(ctx, 'fill')).toHaveLength(1)
    expect(ctx.calls.some(c => c.method === 'set:fillStyle' && c.args[0] === '#ff0000')).toBe(true)
  })

  it('draws an ellipse', () => {
    const ctx = createStubCtx()
    const doc = makeDoc({
      scenes: [{
        id: 's1', startMs: 0, endMs: 5000,
        layers: [{ type: 'shape', shape: 'ellipse', size: [100, 50], position: [0, 0], fill: '#00ff00' }],
      }],
    })
    createDocumentDrawer(doc, { vars: {}, images: {} })(ctx, 500)
    expect(getCalls(ctx, 'ellipse')).toHaveLength(1)
  })

  it('draws stroke when specified', () => {
    const ctx = createStubCtx()
    const doc = makeDoc({
      scenes: [{
        id: 's1', startMs: 0, endMs: 5000,
        layers: [{
          type: 'shape', shape: 'rect', size: [100, 100], position: [0, 0],
          stroke: { color: '#0000ff', width: 2 },
        }],
      }],
    })
    createDocumentDrawer(doc, { vars: {}, images: {} })(ctx, 500)
    expect(getCalls(ctx, 'stroke')).toHaveLength(1)
  })

  it('resolves token colors', () => {
    const ctx = createStubCtx()
    const doc = makeDoc({
      tokens: { accent: '#e84393' },
      scenes: [{
        id: 's1', startMs: 0, endMs: 5000,
        layers: [{ type: 'shape', shape: 'rect', size: [100, 100], position: [0, 0], fill: '$token:accent' }],
      }],
    })
    createDocumentDrawer(doc, { vars: {}, images: {} })(ctx, 500)
    expect(ctx.calls.some(c => c.method === 'set:fillStyle' && c.args[0] === '#e84393')).toBe(true)
  })
})

describe('text layer rendering', () => {
  it('draws simple text', () => {
    const ctx = createStubCtx()
    const doc = makeDoc({
      scenes: [{
        id: 's1', startMs: 0, endMs: 5000,
        layers: [{ type: 'text', content: 'Hello World', position: [960, 540], color: '#ffffff' }],
      }],
    })
    createDocumentDrawer(doc, { vars: {}, images: {} })(ctx, 500)
    const fillTexts = getCalls(ctx, 'fillText')
    expect(fillTexts.some(c => c.args[0] === 'Hello World')).toBe(true)
  })

  it('resolves var references in text content', () => {
    const ctx = createStubCtx()
    const doc = makeDoc({
      scenes: [{
        id: 's1', startMs: 0, endMs: 5000,
        layers: [{ type: 'text', content: '$var:greeting', position: [0, 0], color: '#fff' }],
      }],
    })
    createDocumentDrawer(doc, { vars: { greeting: 'Hi there' }, images: {} })(ctx, 500)
    expect(getCalls(ctx, 'fillText').some(c => c.args[0] === 'Hi there')).toBe(true)
  })
})

describe('group layer rendering', () => {
  it('draws children of a group', () => {
    const ctx = createStubCtx()
    const doc = makeDoc({
      scenes: [{
        id: 's1', startMs: 0, endMs: 5000,
        layers: [{
          type: 'group',
          position: [0, 0],
          children: [
            { type: 'shape', shape: 'rect', size: [50, 50], position: [0, 0], fill: '#aaa' },
            { type: 'shape', shape: 'rect', size: [50, 50], position: [100, 0], fill: '#bbb' },
          ],
        }],
      }],
    })
    createDocumentDrawer(doc, { vars: {}, images: {} })(ctx, 500)
    expect(getCalls(ctx, 'rect')).toHaveLength(2)
  })
})

describe('ref layer rendering', () => {
  it('calls the registered component drawer', () => {
    const ctx = createStubCtx()
    const componentFn = vi.fn()
    const doc = makeDoc({
      scenes: [{
        id: 's1', startMs: 0, endMs: 5000,
        layers: [{ type: 'ref', src: '#myComponent', position: [0, 0] }],
      }],
    })
    createDocumentDrawer(doc, {
      vars: {},
      images: {},
      components: { myComponent: componentFn },
    })(ctx, 500)
    expect(componentFn).toHaveBeenCalledTimes(1)
  })

  it('silently skips missing components', () => {
    const ctx = createStubCtx()
    const doc = makeDoc({
      scenes: [{
        id: 's1', startMs: 0, endMs: 5000,
        layers: [{ type: 'ref', src: '#missing', position: [0, 0] }],
      }],
    })
    expect(() => {
      createDocumentDrawer(doc, { vars: {}, images: {} })(ctx, 500)
    }).not.toThrow()
  })
})

describe('repeater layer rendering', () => {
  it('draws child N times', () => {
    const ctx = createStubCtx()
    const doc = makeDoc({
      scenes: [{
        id: 's1', startMs: 0, endMs: 5000,
        layers: [{
          type: 'repeater',
          count: 3,
          child: { type: 'shape', shape: 'rect', size: [10, 10], position: [0, 0], fill: '#fff' },
        }],
      }],
    })
    createDocumentDrawer(doc, { vars: {}, images: {} })(ctx, 500)
    expect(getCalls(ctx, 'rect')).toHaveLength(3)
  })
})

describe('layer timing', () => {
  it('skips layers before their startMs', () => {
    const ctx = createStubCtx()
    const doc = makeDoc({
      scenes: [{
        id: 's1', startMs: 0, endMs: 5000,
        layers: [{ type: 'shape', shape: 'rect', size: [100, 100], position: [0, 0], fill: '#fff', startMs: 2000 }],
      }],
    })
    createDocumentDrawer(doc, { vars: {}, images: {} })(ctx, 1000)
    expect(getCalls(ctx, 'rect')).toHaveLength(0)
  })

  it('skips layers at or after their endMs', () => {
    const ctx = createStubCtx()
    const doc = makeDoc({
      scenes: [{
        id: 's1', startMs: 0, endMs: 5000,
        layers: [{ type: 'shape', shape: 'rect', size: [100, 100], position: [0, 0], fill: '#fff', endMs: 1000 }],
      }],
    })
    createDocumentDrawer(doc, { vars: {}, images: {} })(ctx, 1000)
    expect(getCalls(ctx, 'rect')).toHaveLength(0)
  })

  it('draws layers within their time window', () => {
    const ctx = createStubCtx()
    const doc = makeDoc({
      scenes: [{
        id: 's1', startMs: 0, endMs: 5000,
        layers: [{ type: 'shape', shape: 'rect', size: [100, 100], position: [0, 0], fill: '#fff', startMs: 500, endMs: 2000 }],
      }],
    })
    createDocumentDrawer(doc, { vars: {}, images: {} })(ctx, 1000)
    expect(getCalls(ctx, 'rect')).toHaveLength(1)
  })
})

describe('animation integration', () => {
  it('interpolates transform opacity across time', () => {
    const doc = makeDoc({
      scenes: [{
        id: 's1', startMs: 0, endMs: 5000,
        layers: [{
          type: 'shape', shape: 'rect', size: [100, 100], position: [0, 0], fill: '#fff',
          transform: {
            opacity: {
              keyframes: [
                { t: 0, value: 0 },
                { t: 1000, value: 1 },
              ],
            },
          },
        }],
      }],
    })
    const draw = createDocumentDrawer(doc, { vars: {}, images: {} })

    const ctx0 = createStubCtx()
    draw(ctx0, 0)
    const alpha0 = getCalls(ctx0, 'set:globalAlpha').find(c => (c.args[0] as number) < 0.1)
    expect(alpha0).toBeDefined()

    const ctx1 = createStubCtx()
    draw(ctx1, 1000)
    const alpha1 = getCalls(ctx1, 'set:globalAlpha').find(c => (c.args[0] as number) >= 0.99)
    expect(alpha1).toBeDefined()
  })

  it('applies generator-driven rotation', () => {
    const doc = makeDoc({
      scenes: [{
        id: 's1', startMs: 0, endMs: 5000,
        layers: [{
          type: 'shape', shape: 'rect', size: [100, 100], position: [0, 0], fill: '#fff',
          transform: {
            rotation: { generator: { fn: 'pulse', params: { from: 0, to: 360, periodMs: 1000 } } },
          },
        }],
      }],
    })
    const draw = createDocumentDrawer(doc, { vars: {}, images: {} })

    const ctx = createStubCtx()
    draw(ctx, 500)
    const rotates = getCalls(ctx, 'rotate')
    expect(rotates).toHaveLength(1)
    expect(rotates[0].args[0]).toBeCloseTo((180 * Math.PI) / 180)
  })
})

describe('trail layer rendering', () => {
  it('renders a trail through the public API', () => {
    const doc = makeDoc({
      scenes: [
        {
          id: 's',
          startMs: 0,
          endMs: 2000,
          layers: [
            {
              type: 'trail',
              source: { x: { keyframes: [{ t: 0, value: 0 }, { t: 2000, value: 2000 }] }, y: 500 },
              windowMs: 400,
              samples: 4,
              radius: 60,
              falloff: 0.5,
              fill: '#ffffff',
            },
          ],
        },
      ],
    } as never)

    const ctx = createStubCtx()
    createDocumentDrawer(doc, { vars: {}, images: {} })(ctx, 1000)

    expect(getCalls(ctx, 'arc')).toHaveLength(4)
    expect(getCalls(ctx, 'fill')).toHaveLength(1)
  })

  it('clips a masked image re-draw to a trail', () => {
    const image = { width: 400, height: 400 } as unknown as CanvasImageSource
    const offscreens: number[][] = []
    const doc = makeDoc({
      scenes: [
        {
          id: 's',
          startMs: 0,
          endMs: 2000,
          layers: [
            {
              type: 'compositeMask',
              source: {
                type: 'image',
                asset: 'photo',
                frame: { x: 0, y: 0, w: 400, h: 400 },
                effects: [{ type: 'downscaleBlur', radius: 28, shrink: 20 }],
              },
              mask: {
                type: 'trail',
                source: [100, 100],
                windowMs: 400,
                samples: 4,
                radius: 60,
              },
            },
          ],
        },
      ],
    } as never)

    const ctx = createStubCtx()
    createDocumentDrawer(doc, {
      vars: {},
      images: { photo: image },
      createCanvas: (width, height) => {
        offscreens.push([width, height])
        return { width, height, getContext: () => createStubCtx() } as unknown as HTMLCanvasElement
      },
    })(ctx, 1000)

    // Mask canvas, source canvas, then the source image layer's own downscale
    // buffer — proof the masked re-draw goes through the image pipeline. The
    // first two are the trail's own extent (120px across, plus a guard band),
    // not the document: nothing outside the mask survives the composite.
    expect(offscreens).toEqual([[124, 124], [124, 124], [20, 20]])
    expect(getCalls(ctx, 'drawImage')).toHaveLength(1)
  })
})

describe('renderer constraints', () => {
  const doc = makeDoc({
    scenes: [
      {
        id: 's',
        startMs: 0,
        endMs: 2000,
        layers: [{ type: 'image', asset: 'photo', frame: { x: 0, y: 0, w: 400, h: 400 } }],
      },
    ],
  } as never)
  const image = { width: 400, height: 400 } as unknown as CanvasImageSource

  it('leaves rendering alone when no constraints are given', () => {
    const ctx = createStubCtx()
    createDocumentDrawer(doc, { vars: {}, images: { photo: image } })(ctx, 500)
    expect(getCalls(ctx, 'drawImage')[0].args.slice(1)).toEqual([0, 0, 400, 400])
  })

  it('a document declaring no blur still renders through the downscale path', () => {
    const sizes: number[][] = []
    const ctx = createStubCtx()
    createDocumentDrawer(doc, {
      vars: {},
      images: { photo: image },
      constraints: { minDownscaleBlurPx: 48, minDownscaleShrink: 20 },
      createCanvas: (width, height) => {
        sizes.push([width, height])
        return { width, height, getContext: () => createStubCtx() } as unknown as HTMLCanvasElement
      },
    })(ctx, 500)
    expect(sizes).toEqual([[20, 20]])
  })
})

/**
 * The four document-level features landed separately; this is the document that
 * uses all of them at once — a card defined once in `defs`, placed with `use`,
 * sized to text that comes from a var, and shown or hidden by a condition on
 * the group that holds it.
 */
describe('defs, use, visibleIf and sizeTo together', () => {
  const doc = makeDoc({
    defs: {
      card: [
        {
          type: 'shape',
          shape: 'roundedRect',
          radius: 40,
          fill: '#111111',
          position: [960, 540],
          sizeTo: { layer: 'message', padding: [40, 20], minWidth: 100 },
        },
        {
          type: 'text',
          id: 'message',
          content: '$var:message',
          font: { size: 100 },
          wrap: true,
          maxWidth: 100,
          position: [960, 540],
        },
      ],
    },
    scenes: [
      {
        id: 's',
        startMs: 0,
        endMs: 1000,
        layers: [
          // `use` is substitution and carries nothing of its own, so the
          // condition goes on a group around it.
          { type: 'group', visibleIf: '$var:showCard', children: [{ type: 'use', def: '$def:card' }] },
          { type: 'shape', shape: 'rect', size: [10, 10], fill: '#fff', position: [10, 10] },
        ],
      },
    ],
  } as never)

  function drawWith(vars: Record<string, string | number | boolean>) {
    const ctx = createStubCtx()
    createDocumentDrawer(doc, { vars, images: {} })(ctx, 0)
    return ctx
  }

  /** Where the rounded rect's path starts: `x + radius` of the measured box. */
  function cardLeft(ctx: ReturnType<typeof createStubCtx>): number {
    return Math.abs((getCalls(ctx, 'moveTo')[0].args as number[])[0])
  }

  it('sizes the spliced card to the text the vars supply', () => {
    // 'hello there' measures 110 against a maxWidth of 100, so it wraps to two
    // 50-wide lines; the box is 50 + 40 of padding a side.
    const ctx = drawWith({ showCard: true, message: 'hello there' })
    expect(getCalls(ctx, 'fillText').map(c => c.args[0])).toEqual(['hello', 'there'])
    expect(cardLeft(ctx)).toBe(25)
    // The sibling layer is untouched by any of it.
    expect(getCalls(ctx, 'rect')[0].args).toEqual([-5, -5, 10, 10])
  })

  it('grows the card with a longer message', () => {
    expect(cardLeft(drawWith({ showCard: true, message: 'hi' }))).toBeLessThan(
      cardLeft(drawWith({ showCard: true, message: 'hello there' })),
    )
  })

  it('drops the whole spliced card when the condition does not hold', () => {
    const ctx = drawWith({ showCard: false, message: 'hello there' })
    expect(getCalls(ctx, 'arcTo')).toHaveLength(0)
    expect(getCalls(ctx, 'fillText')).toHaveLength(0)
    // The sibling still draws where it always did: nothing reflows.
    expect(getCalls(ctx, 'rect')[0].args).toEqual([-5, -5, 10, 10])
  })
})
