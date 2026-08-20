import { describe, it, expect } from 'vitest'
import type { VideoDocument } from '@variax-ai/video-schema'
import { indexLayersById } from './layer-index'

function doc(layers: unknown[]): VideoDocument {
  return {
    version: 1,
    width: 10,
    height: 10,
    fps: 30,
    durationMs: 1000,
    scenes: [{ id: 's', startMs: 0, endMs: 1000, layers }],
  } as unknown as VideoDocument
}

describe('indexLayersById', () => {
  it('indexes only the layers that declared an id', () => {
    const index = indexLayersById(
      doc([
        { type: 'shape', shape: 'rect', id: 'card', size: [1, 1] },
        { type: 'shape', shape: 'rect', size: [1, 1] },
      ]),
    )
    expect(Object.keys(index)).toEqual(['card'])
  })

  it('reaches layers nested in groups, repeaters and composite masks', () => {
    const index = indexLayersById(
      doc([
        { type: 'group', children: [{ type: 'text', id: 'inGroup', content: 'x' }] },
        { type: 'repeater', count: 2, child: { type: 'text', id: 'inRepeater', content: 'x' } },
        {
          type: 'compositeMask',
          source: { type: 'text', id: 'inSource', content: 'x' },
          mask: { type: 'shape', shape: 'ellipse', id: 'inMask', size: [1, 1] },
        },
      ]),
    )
    expect(Object.keys(index).sort()).toEqual(['inGroup', 'inMask', 'inRepeater', 'inSource'])
  })

  it('does not trip over a string source on a composite mask', () => {
    expect(() =>
      indexLayersById(
        doc([{ type: 'compositeMask', source: 'photo', mask: { type: 'shape', shape: 'ellipse', size: [1, 1] } }]),
      ),
    ).not.toThrow()
  })

  it('keeps the first of a duplicated id, in document order', () => {
    const index = indexLayersById(
      doc([
        { type: 'text', id: 'dup', content: 'first' },
        { type: 'text', id: 'dup', content: 'second' },
      ]),
    )
    expect((index.dup as { content: string }).content).toBe('first')
  })
})
