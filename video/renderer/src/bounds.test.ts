import { describe, it, expect } from 'vitest'
import type { Layer } from '@variax-ai/video-schema'
import { alignToPixels, intersectBounds, isEmptyBounds, layerBounds, subtreeEffectExtent, unionBounds } from './bounds'

const resolve = { vars: {}, tokens: {} }

function bounds(layer: Layer, tMs = 0, vars: Record<string, string | number | boolean> = {}) {
  return layerBounds(layer, tMs, { ...resolve, vars })
}

describe('layerBounds', () => {
  it('centres a shape on its position', () => {
    expect(bounds({ type: 'shape', shape: 'rect', size: [100, 60], position: [500, 300] } as Layer)).toEqual({
      x: 450,
      y: 270,
      w: 100,
      h: 60,
    })
  })

  it('includes half the stroke width, which straddles the edge', () => {
    expect(bounds({ type: 'shape', shape: 'ellipse', size: [100, 100], stroke: { color: '#fff', width: 20 } } as Layer)).toEqual({
      x: -60,
      y: -60,
      w: 120,
      h: 120,
    })
  })

  it('reaches past the geometry for a shadow, offset included', () => {
    const b = bounds({
      type: 'shape',
      shape: 'rect',
      size: [100, 100],
      shadow: { color: '#000', blur: 20, offsetX: 10, offsetY: -6 },
    } as Layer)!
    expect(b.x).toBeLessThanOrEqual(-50 + 10 - 20)
    expect(b.y + b.h).toBeGreaterThanOrEqual(50 - 6 + 20)
  })

  it('reaches past the geometry for a blur', () => {
    const b = bounds({ type: 'shape', shape: 'rect', size: [100, 100], effects: [{ type: 'gaussianBlur', radius: 10 }] } as Layer)!
    expect(b.x).toBeLessThanOrEqual(-80)
    expect(b.w).toBeGreaterThanOrEqual(160)
  })

  it('follows scale and rotation', () => {
    const square = { type: 'shape', shape: 'rect', size: [100, 100], position: [200, 200] } as Layer
    expect(bounds({ ...square, transform: { scale: 2 } } as Layer)).toEqual({ x: 100, y: 100, w: 200, h: 200 })

    // A square rotated 45° needs a box √2 wider than the square itself.
    const rotated = bounds({ ...square, transform: { rotation: 45 } } as Layer)!
    expect(rotated.w).toBeCloseTo(100 * Math.SQRT2, 5)
    expect(rotated.x + rotated.w / 2).toBeCloseTo(200, 5)
  })

  it('scales about the anchor, in the layer\'s own space', () => {
    // `anchor` is layer-local and sits inside `position`: a point p lands at
    // position + anchor + scale·(p − anchor). Bounds has to agree with
    // applyTransform exactly, including that ordering.
    const scaled = bounds({
      type: 'shape',
      shape: 'rect',
      size: [100, 100],
      position: [200, 200],
      transform: { anchor: [200, 200], scale: 2 },
    } as Layer)
    expect(scaled).toEqual({ x: -100, y: -100, w: 200, h: 200 })
  })

  it('unions a group over its children, in the group\'s own space', () => {
    expect(
      bounds({
        type: 'group',
        position: [1000, 1000],
        children: [
          { type: 'shape', shape: 'rect', size: [100, 100], position: [0, 0] },
          { type: 'shape', shape: 'rect', size: [100, 100], position: [200, 0] },
        ],
      } as Layer),
    ).toEqual({ x: 950, y: 950, w: 300, h: 100 })
  })

  it('covers every trail sample plus its radius', () => {
    const b = bounds({
      type: 'trail',
      source: { keyframes: [{ t: 0, value: [100, 100] }, { t: 1000, value: [500, 100] }] },
      windowMs: 1000,
      samples: 4,
      radius: 50,
    } as Layer, 1000)!
    // Samples land at t = 1000, 750, 500, 250, so x runs 500 down to 200.
    expect(b.x).toBeLessThanOrEqual(150)
    expect(b.x + b.w).toBeGreaterThanOrEqual(550)
    expect(b.y).toBeLessThanOrEqual(50)
    expect(b.y + b.h).toBeGreaterThanOrEqual(150)
  })

  it('is empty for a layer outside its own time window', () => {
    const layer = { type: 'shape', shape: 'rect', size: [100, 100], startMs: 1000 } as Layer
    expect(isEmptyBounds(bounds(layer, 500)!)).toBe(true)
    expect(isEmptyBounds(bounds(layer, 1500)!)).toBe(false)
  })

  it('does not stretch a group back to the origin for a child that paints nothing', () => {
    const b = bounds({
      type: 'group',
      position: [900, 1600],
      children: [
        { type: 'shape', shape: 'rect', size: [100, 100], position: [0, 0] },
        { type: 'shape', shape: 'rect', size: [100, 100], position: [0, 0], startMs: 2000 },
      ],
    } as Layer, 0)!
    expect(b).toEqual({ x: 850, y: 1550, w: 100, h: 100 })
  })

  it('is empty for a layer whose condition does not hold', () => {
    const layer = { type: 'shape', shape: 'rect', size: [100, 100], visibleIf: '$var:show' } as Layer
    expect(isEmptyBounds(bounds(layer, 0, { show: false })!)).toBe(true)
    expect(isEmptyBounds(bounds(layer, 0, { show: true })!)).toBe(false)
  })

  it('is empty for a trail with no live samples', () => {
    const layer = { type: 'trail', source: [10, 10], windowMs: 100, samples: 2, radius: 0 } as Layer
    expect(isEmptyBounds(bounds(layer)!)).toBe(true)
  })

  it('gives up on layers whose extent needs measurement or host state', () => {
    expect(bounds({ type: 'text', content: 'hi', font: { size: 40 }, position: [0, 0] } as Layer)).toBeNull()
    expect(bounds({ type: 'shape', shape: 'path', path: 'M0 0 L10 10' } as Layer)).toBeNull()
    expect(bounds({ type: 'image', asset: 'photo' } as Layer)).toBeNull()
    expect(bounds({ type: 'ref', src: '#thing' } as Layer)).toBeNull()
  })

  it('gives up on a group with one unknowable child rather than clipping it', () => {
    expect(
      bounds({
        type: 'group',
        children: [
          { type: 'shape', shape: 'rect', size: [10, 10] },
          { type: 'text', content: 'hi', font: { size: 40 }, position: [0, 0] },
        ],
      } as Layer),
    ).toBeNull()
  })

  it('gives up rather than returning a non-finite box', () => {
    expect(bounds({ type: 'shape', shape: 'rect', size: [Number.NaN, 10] } as Layer)).toBeNull()
  })

  it('takes a frameless image as unknowable but a framed one as its frame', () => {
    expect(bounds({ type: 'image', asset: 'photo', frame: { x: 10, y: 20, w: 30, h: 40 } } as Layer)).toEqual({
      x: 10,
      y: 20,
      w: 30,
      h: 40,
    })
  })
})

describe('subtreeEffectExtent', () => {
  it('finds the largest blur anywhere below a layer', () => {
    const layer = {
      type: 'group',
      children: [
        { type: 'shape', shape: 'rect', size: [10, 10], effects: [{ type: 'gaussianBlur', radius: 4 }] },
        {
          type: 'repeater',
          count: 2,
          child: { type: 'shape', shape: 'rect', size: [10, 10], effects: [{ type: 'gaussianBlur', radius: 9 }] },
        },
      ],
    } as Layer
    expect(subtreeEffectExtent(layer, 0)).toBe(27)
  })

  it('is zero for a layer with no effects', () => {
    expect(subtreeEffectExtent({ type: 'shape', shape: 'rect', size: [10, 10] } as Layer, 0)).toBe(0)
  })
})

describe('box arithmetic', () => {
  it('unions and intersects', () => {
    const a = { x: 0, y: 0, w: 10, h: 10 }
    const b = { x: 5, y: 5, w: 10, h: 10 }
    expect(unionBounds(a, b)).toEqual({ x: 0, y: 0, w: 15, h: 15 })
    expect(intersectBounds(a, b)).toEqual({ x: 5, y: 5, w: 5, h: 5 })
  })

  it('reports a non-overlapping intersection as empty', () => {
    expect(isEmptyBounds(intersectBounds({ x: 0, y: 0, w: 10, h: 10 }, { x: 40, y: 0, w: 10, h: 10 }))).toBe(true)
  })

  it('grows to whole pixels rather than rounding', () => {
    expect(alignToPixels({ x: 10.4, y: -0.2, w: 5.3, h: 9.9 })).toEqual({ x: 10, y: -1, w: 6, h: 11 })
  })
})
