import { describe, it, expect } from 'vitest'
import type { Condition, Layer, VideoDocument } from '@variax-ai/video-schema'
import { conditionHolds, layerIsVisible } from './condition'
import { createDocumentDrawer } from './index'
import { createStubCtx, getCalls } from './test-helpers'

function holds(condition: Condition | undefined, vars: Record<string, string | number | boolean>): boolean {
  return conditionHolds(condition, { vars, tokens: {} })
}

describe('conditionHolds', () => {
  it('holds when there is no condition at all', () => {
    expect(holds(undefined, {})).toBe(true)
  })

  it('reads a $var: reference and a bare name the same way', () => {
    expect(holds('$var:hasImage', { hasImage: true })).toBe(true)
    expect(holds('hasImage', { hasImage: true })).toBe(true)
  })

  it('treats an unset var as false rather than as present', () => {
    expect(holds('$var:missing', {})).toBe(false)
  })

  it.each([
    [true, true],
    [false, false],
    [1, true],
    [0, false],
    [-1, true],
    [Number.NaN, false],
    ['yes', true],
    ['', false],
    ['false', false],
    ['0', false],
    ['true', true],
  ])('reads %o as %o', (value, expected) => {
    expect(holds('$var:flag', { flag: value as string | number | boolean })).toBe(expected)
  })

  it('compares equals across the string/number divide', () => {
    expect(holds({ var: 'tier', equals: 'gold' }, { tier: 'gold' })).toBe(true)
    expect(holds({ var: 'tier', equals: 'gold' }, { tier: 'silver' })).toBe(false)
    expect(holds({ var: 'count', equals: 3 }, { count: '3' })).toBe(true)
    expect(holds({ var: 'on', equals: true }, { on: 'true' })).toBe(true)
  })

  it('never matches equals against an unset var', () => {
    expect(holds({ var: 'tier', equals: '' }, {})).toBe(false)
  })

  it('tests membership with in', () => {
    expect(holds({ var: 'tier', in: ['gold', 'platinum'] }, { tier: 'platinum' })).toBe(true)
    expect(holds({ var: 'tier', in: ['gold', 'platinum'] }, { tier: 'bronze' })).toBe(false)
  })

  it('inverts every form with not', () => {
    expect(holds({ var: 'hasImage', not: true }, { hasImage: false })).toBe(true)
    expect(holds({ var: 'tier', equals: 'gold', not: true }, { tier: 'gold' })).toBe(false)
    expect(holds({ var: 'tier', in: ['gold'], not: true }, { tier: 'bronze' })).toBe(true)
  })

  it('falls back to truthiness when the object form only names a var', () => {
    expect(holds({ var: 'hasImage' }, { hasImage: 1 })).toBe(true)
    expect(holds({ var: 'hasImage' }, { hasImage: 0 })).toBe(false)
  })

  it('does not read a var name off Object.prototype', () => {
    // `'constructor' in vars` is true for every document; a ref that landed on
    // the prototype would resolve to a function, which is truthy and would
    // draw a layer whose var was never set.
    expect(holds('$var:constructor', {})).toBe(false)
    expect(holds('$var:toString', {})).toBe(false)
    expect(holds({ var: 'toString', equals: 'x' }, {})).toBe(false)
    expect(holds({ var: 'valueOf', not: true }, {})).toBe(true)
  })

  it('still reads a var the document actually set under such a name', () => {
    expect(holds('$var:constructor', { constructor: true })).toBe(true)
  })

  it('hides rather than shows when the predicate is malformed', () => {
    expect(holds({} as Condition, { anything: true })).toBe(false)
    expect(holds(42 as unknown as Condition, {})).toBe(false)
  })
})

describe('layerIsVisible', () => {
  const layer = (over: Record<string, unknown>): Layer =>
    ({ type: 'shape', shape: 'rect', size: [10, 10], ...over }) as Layer

  it('requires both the time window and the condition', () => {
    const resolve = { vars: { on: true }, tokens: {} }
    expect(layerIsVisible(layer({ startMs: 100, visibleIf: '$var:on' }), 200, resolve)).toBe(true)
    expect(layerIsVisible(layer({ startMs: 100, visibleIf: '$var:on' }), 50, resolve)).toBe(false)
    expect(layerIsVisible(layer({ startMs: 100, visibleIf: '$var:off' }), 200, resolve)).toBe(false)
  })
})

describe('conditional layers end to end', () => {
  function doc(layers: unknown[]): VideoDocument {
    return {
      version: 1,
      width: 100,
      height: 100,
      fps: 30,
      durationMs: 1000,
      scenes: [{ id: 's', startMs: 0, endMs: 1000, layers }],
    } as unknown as VideoDocument
  }

  const thumb = { type: 'image', asset: 'photo', frame: { x: 0, y: 0, w: 10, h: 10 }, visibleIf: '$var:hasImage' }
  const headline = { type: 'shape', shape: 'rect', size: [10, 10], fill: '#fff' }

  it('draws an optional layer when its var is set and skips it when it is not', () => {
    const image = { width: 10, height: 10 } as unknown as CanvasImageSource

    const shown = createStubCtx()
    createDocumentDrawer(doc([thumb, headline]), { vars: { hasImage: true }, images: { photo: image } })(shown, 0)
    expect(getCalls(shown, 'drawImage')).toHaveLength(1)

    const hidden = createStubCtx()
    createDocumentDrawer(doc([thumb, headline]), { vars: { hasImage: false }, images: { photo: image } })(hidden, 0)
    expect(getCalls(hidden, 'drawImage')).toHaveLength(0)
    // The layers around it are untouched: nothing moves to fill the gap.
    expect(getCalls(hidden, 'fill')).toHaveLength(1)
  })

  it('applies to a child of a group, not just a top-level layer', () => {
    const group = {
      type: 'group',
      position: [0, 0],
      children: [
        { type: 'shape', shape: 'rect', size: [10, 10], fill: '#fff', visibleIf: '$var:a' },
        { type: 'shape', shape: 'rect', size: [10, 10], fill: '#fff', visibleIf: '$var:b' },
      ],
    }
    const ctx = createStubCtx()
    createDocumentDrawer(doc([group]), { vars: { a: true, b: false }, images: {} })(ctx, 0)
    expect(getCalls(ctx, 'fill')).toHaveLength(1)
  })

  it('lets an author supply both variants and pick one', () => {
    const withThumb = { type: 'shape', shape: 'rect', size: [10, 10], fill: '#111', position: [50, 80], visibleIf: '$var:hasImage' }
    const withoutThumb = { type: 'shape', shape: 'rect', size: [10, 10], fill: '#111', position: [50, 20], visibleIf: { var: 'hasImage', not: true } }
    const ctx = createStubCtx()
    createDocumentDrawer(doc([withThumb, withoutThumb]), { vars: { hasImage: false }, images: {} })(ctx, 0)
    const translates = getCalls(ctx, 'translate')
    expect(translates).toHaveLength(1)
    expect(translates[0].args).toEqual([50, 20])
  })
})
