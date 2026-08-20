import { describe, it, expect } from 'vitest'
import type { Layer, ShapeLayer } from '@variax-ai/video-schema'
import { drawShapeLayer } from './shape'
import { createStubCtx, createTestRctx, getCalls } from '../test-helpers'
import type { RenderContext } from '../types'

// The stub measures a string as 10px per character.
const message: Layer = {
  type: 'text',
  id: 'message',
  content: 'hello world',
  font: { size: 100 },
  wrap: true,
  maxWidth: 100,
} as Layer

function rctxWith(layers: Record<string, Layer>, vars: Record<string, string | number | boolean> = {}): RenderContext {
  const rctx = createTestRctx({ vars })
  rctx.layersById = layers
  return rctx
}

function rectOf(layer: ShapeLayer, rctx: RenderContext, tMs = 0) {
  const ctx = createStubCtx()
  drawShapeLayer(ctx, layer, tMs, rctx)
  return { ctx, rect: getCalls(ctx, 'rect')[0]?.args as number[] | undefined }
}

const card = (sizeTo: Record<string, unknown>, over: Record<string, unknown> = {}): ShapeLayer =>
  ({ type: 'shape', shape: 'rect', fill: '#fff', sizeTo, ...over }) as unknown as ShapeLayer

describe('shape sizeTo', () => {
  it('sizes the box to the wrapped text plus padding on each side', () => {
    // 'hello world' wraps to two lines of 50px at a line height of 120.
    const { rect } = rectOf(card({ layer: 'message', padding: [10, 20] }), rctxWith({ message }))
    expect(rect).toEqual([-35, -140, 70, 280])
  })

  it('takes a single padding number on both axes', () => {
    const { rect } = rectOf(card({ layer: 'message', padding: 10 }), rctxWith({ message }))
    expect(rect).toEqual([-35, -130, 70, 260])
  })

  it('grows with a message that comes from a var', () => {
    const bound = { ...message, content: '$var:message', maxWidth: 1000 } as Layer
    const short = rectOf(card({ layer: 'message' }), rctxWith({ message: bound }, { message: 'hi' }))
    const long = rectOf(card({ layer: 'message' }), rctxWith({ message: bound }, { message: 'hi there friend' }))
    expect(short.rect![2]).toBe(20)
    expect(long.rect![2]).toBe(150)
  })

  it('honours minimum dimensions for a short message', () => {
    const { rect } = rectOf(
      card({ layer: 'message', minWidth: 400, minHeight: 400 }),
      rctxWith({ message }),
    )
    expect(rect).toEqual([-200, -200, 400, 400])
  })

  it('falls back to the declared size when the target is missing', () => {
    const { rect } = rectOf(card({ layer: 'nope' }, { size: [300, 100] }), rctxWith({ message }))
    expect(rect).toEqual([-150, -50, 300, 100])
  })

  it('falls back when the target is not a text layer', () => {
    const notText = { type: 'image', id: 'message', asset: 'photo' } as Layer
    const { rect } = rectOf(card({ layer: 'message' }, { size: [300, 100] }), rctxWith({ message: notText }))
    expect(rect).toEqual([-150, -50, 300, 100])
  })

  it('falls back when the target resolves to no text at all', () => {
    const empty = { ...message, content: '$var:missing' } as Layer
    const { rect } = rectOf(card({ layer: 'message' }, { size: [300, 100] }), rctxWith({ message: empty }))
    expect(rect).toEqual([-150, -50, 300, 100])
  })

  it('brackets the measuring in save/restore, so the font cannot leak into the shape', () => {
    const ctx = createStubCtx()
    drawShapeLayer(ctx, card({ layer: 'message' }), 0, rctxWith({ message }))
    const methods = ctx.calls.map(c => c.method)
    const firstFont = methods.indexOf('set:font')
    const drawsAt = methods.indexOf('rect')
    expect(firstFont).toBeGreaterThan(methods.indexOf('save'))
    expect(methods.indexOf('restore')).toBeGreaterThan(firstFont)
    expect(methods.lastIndexOf('restore')).toBeLessThan(drawsAt)
  })

  it('sizes a rounded rect the same way', () => {
    const ctx = createStubCtx()
    drawShapeLayer(
      ctx,
      card({ layer: 'message', padding: 10 }, { shape: 'roundedRect', radius: 20 }) as ShapeLayer,
      0,
      rctxWith({ message }),
    )
    // roundRectPath starts at (x + r, y) of the measured box.
    expect(getCalls(ctx, 'moveTo')[0].args).toEqual([-15, -130])
  })
})
