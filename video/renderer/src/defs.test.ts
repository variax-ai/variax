import { describe, it, expect } from 'vitest'
import type { VideoDocument } from '@variax-ai/video-schema'
import { resolveDocumentDefs, CyclicDefError } from './defs'
import { createDocumentDrawer } from './index'
import { createStubCtx, getCalls } from './test-helpers'

function doc(over: Record<string, unknown>): VideoDocument {
  return {
    version: 1,
    width: 100,
    height: 100,
    fps: 30,
    durationMs: 1000,
    scenes: [{ id: 's', startMs: 0, endMs: 1000, layers: [] }],
    ...over,
  } as unknown as VideoDocument
}

const path = { keyframes: [{ t: 0, value: [0, 0] }, { t: 1000, value: [100, 50] }] }

describe('resolveDocumentDefs', () => {
  it('returns the document untouched when it defines nothing', () => {
    const d = doc({})
    expect(resolveDocumentDefs(d)).toBe(d)
  })

  it('substitutes a reference wherever it appears', () => {
    const resolved = resolveDocumentDefs(
      doc({
        defs: { path },
        scenes: [
          {
            id: 's',
            startMs: 0,
            endMs: 1000,
            layers: [{ type: 'trail', source: '$def:path', windowMs: 100, samples: 2, radius: 5 }],
          },
        ],
      }),
    )
    expect((resolved.scenes[0].layers[0] as { source: unknown }).source).toEqual(path)
  })

  it('gives every reference the same value, not a copy of it', () => {
    const resolved = resolveDocumentDefs(
      doc({
        defs: { path },
        scenes: [
          {
            id: 's',
            startMs: 0,
            endMs: 1000,
            layers: [
              { type: 'trail', source: '$def:path', windowMs: 100, samples: 2, radius: 5 },
              { type: 'group', children: [], transform: { position: '$def:path' } },
            ],
          },
        ],
      }),
    )
    const [trail, group] = resolved.scenes[0].layers as unknown as [
      { source: unknown },
      { transform: { position: unknown } },
    ]
    expect(trail.source).toBe(group.transform.position)
  })

  it('resolves a def that references another def', () => {
    const resolved = resolveDocumentDefs(
      doc({
        defs: { path, hand: { type: 'trail', source: '$def:path', windowMs: 100, samples: 2, radius: 5 } },
        scenes: [{ id: 's', startMs: 0, endMs: 1000, layers: [{ type: 'use', def: 'hand' }] }],
      }),
    )
    expect(resolved.scenes[0].layers[0]).toEqual({
      type: 'trail',
      source: path,
      windowMs: 100,
      samples: 2,
      radius: 5,
    })
  })

  it('splices a def holding several layers into the layer list, in order', () => {
    const resolved = resolveDocumentDefs(
      doc({
        defs: {
          pair: [
            { type: 'shape', shape: 'rect', size: [1, 1] },
            { type: 'shape', shape: 'rect', size: [2, 2] },
          ],
        },
        scenes: [
          {
            id: 's',
            startMs: 0,
            endMs: 1000,
            layers: [
              { type: 'shape', shape: 'rect', size: [0, 0] },
              { type: 'use', def: '$def:pair' },
              { type: 'shape', shape: 'rect', size: [3, 3] },
            ],
          },
        ],
      }),
    )
    expect((resolved.scenes[0].layers as unknown as { size: number[] }[]).map(l => l.size[0])).toEqual([0, 1, 2, 3])
  })

  it('leaves an unknown reference alone rather than guessing', () => {
    const resolved = resolveDocumentDefs(
      doc({
        defs: { path },
        scenes: [
          {
            id: 's',
            startMs: 0,
            endMs: 1000,
            layers: [
              { type: 'trail', source: '$def:missing', windowMs: 100, samples: 2, radius: 5 },
              { type: 'use', def: 'alsoMissing' },
            ],
          },
        ],
      }),
    )
    const layers = resolved.scenes[0].layers as unknown as [{ source: unknown }, { type: string }]
    expect(layers[0].source).toBe('$def:missing')
    expect(layers[1].type).toBe('use')
  })

  it('substitutes a use layer in a single-layer slot, not just in a list', () => {
    const resolved = resolveDocumentDefs(
      doc({
        defs: {
          spotlight: { type: 'shape', shape: 'ellipse', size: [50, 50], fill: '#fff' },
          photo: { type: 'image', asset: 'photo', frame: { x: 0, y: 0, w: 10, h: 10 } },
        },
        scenes: [
          {
            id: 's',
            startMs: 0,
            endMs: 1000,
            layers: [
              {
                type: 'compositeMask',
                source: { type: 'use', def: 'photo' },
                mask: { type: 'use', def: '$def:spotlight' },
              },
              { type: 'repeater', count: 2, child: { type: 'use', def: 'spotlight' } },
            ],
          },
        ],
      }),
    )
    const [mask, repeater] = resolved.scenes[0].layers as unknown as [
      { source: { type: string }; mask: { type: string } },
      { child: { type: string } },
    ]
    expect(mask.source.type).toBe('image')
    expect(mask.mask.type).toBe('shape')
    expect(repeater.child.type).toBe('shape')
  })

  it('leaves a use alone when a multi-layer def lands in a single-layer slot', () => {
    const resolved = resolveDocumentDefs(
      doc({
        defs: { pair: [{ type: 'shape', shape: 'rect', size: [1, 1] }, { type: 'shape', shape: 'rect', size: [2, 2] }] },
        scenes: [
          {
            id: 's',
            startMs: 0,
            endMs: 1000,
            layers: [{ type: 'repeater', count: 2, child: { type: 'use', def: 'pair' } }],
          },
        ],
      }),
    )
    // Nothing sensible to splice into one slot, so it stays a `use` and draws
    // nothing rather than becoming an array where a layer belongs.
    expect((resolved.scenes[0].layers[0] as unknown as { child: { type: string } }).child.type).toBe('use')
  })

  it('does not resolve a name that only exists on Object.prototype', () => {
    const resolved = resolveDocumentDefs(
      doc({
        defs: { real: [1, 2] },
        scenes: [
          {
            id: 's',
            startMs: 0,
            endMs: 1000,
            layers: [
              { type: 'trail', source: '$def:toString', windowMs: 100, samples: 2, radius: 5 },
              { type: 'use', def: 'constructor' },
            ],
          },
        ],
      }),
    )
    const layers = resolved.scenes[0].layers as unknown as [{ source: unknown }, { type: string }]
    expect(layers[0].source).toBe('$def:toString')
    expect(layers[1].type).toBe('use')
  })

  it('throws on a cycle, naming it', () => {
    const cyclic = doc({
      defs: { a: { x: '$def:b', y: 0 }, b: { x: '$def:a', y: 0 } },
      scenes: [
        {
          id: 's',
          startMs: 0,
          endMs: 1000,
          layers: [{ type: 'trail', source: '$def:a', windowMs: 100, samples: 2, radius: 5 }],
        },
      ],
    })
    expect(() => resolveDocumentDefs(cyclic)).toThrow(CyclicDefError)
    expect(() => resolveDocumentDefs(cyclic)).toThrow(/a → b → a/)
  })

  it('throws on a def that references itself', () => {
    expect(() =>
      resolveDocumentDefs(
        doc({
          defs: { loop: { x: '$def:loop', y: 0 } },
          scenes: [
            {
              id: 's',
              startMs: 0,
              endMs: 1000,
              layers: [{ type: 'trail', source: '$def:loop', windowMs: 100, samples: 2, radius: 5 }],
            },
          ],
        }),
      ),
    ).toThrow(CyclicDefError)
  })

  it('keeps subtrees it did not touch, rather than copying the document', () => {
    const untouched = { id: 'two', startMs: 1000, endMs: 2000, layers: [{ type: 'shape', shape: 'rect', size: [1, 1] }] }
    const resolved = resolveDocumentDefs(
      doc({
        durationMs: 2000,
        defs: { path },
        scenes: [
          {
            id: 'one',
            startMs: 0,
            endMs: 1000,
            layers: [{ type: 'trail', source: '$def:path', windowMs: 100, samples: 2, radius: 5 }],
          },
          untouched,
        ],
      }),
    )
    expect(resolved.scenes[1]).toBe(untouched)
  })
})

describe('defs through the drawer', () => {
  it('draws a shared path in step with the layer that casts it', () => {
    const shared = { keyframes: [{ t: 0, value: [10, 10] }, { t: 1000, value: [90, 90] }] }
    const d = doc({
      defs: { finger: shared },
      scenes: [
        {
          id: 's',
          startMs: 0,
          endMs: 1000,
          layers: [
            { type: 'trail', source: '$def:finger', windowMs: 1, samples: 1, radius: 4, fill: '#fff' },
            { type: 'group', transform: { position: '$def:finger' }, children: [{ type: 'shape', shape: 'rect', size: [2, 2], fill: '#fff' }] },
          ],
        },
      ],
    })
    const ctx = createStubCtx()
    createDocumentDrawer(d, { vars: {}, images: {} })(ctx, 500)

    // The trail's freshest circle and the group's translate must agree.
    const arc = getCalls(ctx, 'arc')[0].args
    const translate = getCalls(ctx, 'translate')[0].args
    expect([arc[0], arc[1]]).toEqual(translate)
    expect(translate).toEqual([50, 50])
  })

  it('draws a use layer as the layer it names', () => {
    const d = doc({
      defs: { badge: { type: 'shape', shape: 'rect', size: [8, 8], fill: '#fff', position: [20, 30] } },
      scenes: [{ id: 's', startMs: 0, endMs: 1000, layers: [{ type: 'use', def: '$def:badge' }] }],
    })
    const ctx = createStubCtx()
    createDocumentDrawer(d, { vars: {}, images: {} })(ctx, 0)
    expect(getCalls(ctx, 'translate')[0].args).toEqual([20, 30])
    expect(getCalls(ctx, 'fill')).toHaveLength(1)
  })

  it('draws nothing for a use layer whose def is missing', () => {
    const d = doc({
      defs: { other: { type: 'shape', shape: 'rect', size: [8, 8] } },
      scenes: [{ id: 's', startMs: 0, endMs: 1000, layers: [{ type: 'use', def: 'nope' }] }],
    })
    const ctx = createStubCtx()
    expect(() => createDocumentDrawer(d, { vars: {}, images: {} })(ctx, 0)).not.toThrow()
    expect(ctx.calls).toHaveLength(0)
  })
})
