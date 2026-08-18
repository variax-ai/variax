import { describe, it, expect } from 'vitest'
import { validateDocument } from './validate'

function makeValidDoc(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    width: 1920,
    height: 1080,
    fps: 30,
    durationMs: 10000,
    scenes: [
      { id: 'scene-0', startMs: 0, endMs: 10000, layers: [] },
    ],
    ...overrides,
  }
}

describe('validateDocument', () => {
  it('accepts a valid document', () => {
    const doc = makeValidDoc()
    const result = validateDocument(doc)
    expect(result.version).toBe(1)
    expect(result.width).toBe(1920)
    expect(result.height).toBe(1080)
    expect(result.fps).toBe(30)
    expect(result.durationMs).toBe(10000)
    expect(result.scenes).toHaveLength(1)
  })

  it('forces version to 1', () => {
    const result = validateDocument(makeValidDoc({ version: 99 }))
    expect(result.version).toBe(1)
  })

  it('preserves tokens', () => {
    const result = validateDocument(makeValidDoc({ tokens: { brand: '#ff0000' } }))
    expect(result.tokens).toEqual({ brand: '#ff0000' })
  })

  it('preserves assets', () => {
    const assets = { img: { type: 'image', src: 'test.png' } }
    const result = validateDocument(makeValidDoc({ assets }))
    expect(result.assets).toEqual(assets)
  })

  it('preserves vars', () => {
    const vars = { name: { type: 'string', required: true } }
    const result = validateDocument(makeValidDoc({ vars }))
    expect(result.vars).toEqual(vars)
  })

  it('throws on null input', () => {
    expect(() => validateDocument(null)).toThrow('non-null object')
  })

  it('throws on non-object input', () => {
    expect(() => validateDocument('string')).toThrow('non-null object')
  })

  it('throws on missing width', () => {
    const doc = makeValidDoc()
    delete (doc as Record<string, unknown>).width
    expect(() => validateDocument(doc)).toThrow('width')
  })

  it('throws on zero width', () => {
    expect(() => validateDocument(makeValidDoc({ width: 0 }))).toThrow('width')
  })

  it('throws on non-integer width', () => {
    expect(() => validateDocument(makeValidDoc({ width: 1.5 }))).toThrow('width')
  })

  it('throws on missing height', () => {
    const doc = makeValidDoc()
    delete (doc as Record<string, unknown>).height
    expect(() => validateDocument(doc)).toThrow('height')
  })

  it('throws on negative fps', () => {
    expect(() => validateDocument(makeValidDoc({ fps: -1 }))).toThrow('fps')
  })

  it('throws on zero durationMs', () => {
    expect(() => validateDocument(makeValidDoc({ durationMs: 0 }))).toThrow('durationMs')
  })

  it('throws on empty scenes', () => {
    expect(() => validateDocument(makeValidDoc({ scenes: [] }))).toThrow('at least one scene')
  })

  it('throws on non-array scenes', () => {
    expect(() => validateDocument(makeValidDoc({ scenes: 'bad' }))).toThrow('at least one scene')
  })

  it('generates scene id if missing', () => {
    const doc = makeValidDoc({
      scenes: [{ startMs: 0, endMs: 5000, layers: [] }],
    })
    const result = validateDocument(doc)
    expect(result.scenes[0].id).toBe('scene-0')
  })

  it('filters out layers with invalid types', () => {
    const doc = makeValidDoc({
      scenes: [{
        id: 's1',
        startMs: 0,
        endMs: 5000,
        layers: [
          { type: 'shape', shape: 'rect' },
          { type: 'invalid' },
          { type: 'text', content: 'hello' },
        ],
      }],
    })
    const result = validateDocument(doc)
    expect(result.scenes[0].layers).toHaveLength(2)
    expect(result.scenes[0].layers[0].type).toBe('shape')
    expect(result.scenes[0].layers[1].type).toBe('text')
  })

  it('preserves scene background', () => {
    const doc = makeValidDoc({
      scenes: [{ id: 's', startMs: 0, endMs: 5000, layers: [], background: '#000000' }],
    })
    const result = validateDocument(doc)
    expect(result.scenes[0].background).toBe('#000000')
  })
})
