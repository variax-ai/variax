import { describe, it, expect } from 'vitest'
import { buildFontString, resolveContent, wrapText } from './text'
import { createTestRctx } from './test-helpers'

describe('buildFontString', () => {
  it('returns default when font is undefined', () => {
    const rctx = createTestRctx()
    expect(buildFontString(undefined, rctx)).toBe('400 48px sans-serif')
  })

  it('builds from weight and size', () => {
    const rctx = createTestRctx()
    expect(buildFontString({ size: 32, weight: 700 }, rctx)).toBe('700 32px sans-serif')
  })

  it('defaults weight to 400', () => {
    const rctx = createTestRctx()
    expect(buildFontString({ size: 24 }, rctx)).toBe('400 24px sans-serif')
  })

  it('uses font asset family when available', () => {
    const rctx = createTestRctx({ fonts: { heading: { family: 'Inter', weight: 600 } } })
    const result = buildFontString({ size: 48, weight: 700, asset: 'heading' }, rctx)
    expect(result).toBe("700 48px 'Inter', sans-serif")
  })

  it('uses asset weight when font weight is not specified', () => {
    const rctx = createTestRctx({ fonts: { heading: { family: 'Inter', weight: 600 } } })
    const result = buildFontString({ size: 48, asset: 'heading' }, rctx)
    expect(result).toBe("600 48px 'Inter', sans-serif")
  })
})

describe('resolveContent', () => {
  it('resolves plain strings', () => {
    const rctx = createTestRctx()
    expect(resolveContent('hello', rctx, 0)).toBe('hello')
  })

  it('resolves $var references in plain strings', () => {
    const rctx = createTestRctx({ vars: { name: 'World' } })
    expect(resolveContent('$var:name', rctx, 0)).toBe('World')
  })

  it('resolves template with string bindings', () => {
    const rctx = createTestRctx({ vars: { city: 'NYC' } })
    const content = { template: 'Welcome to {place}', bindings: { place: '$var:city' } }
    expect(resolveContent(content, rctx, 0)).toBe('Welcome to NYC')
  })

  it('replaces all occurrences of a binding', () => {
    const rctx = createTestRctx({ vars: { x: 'A' } })
    const content = { template: '{v} and {v}', bindings: { v: '$var:x' } }
    expect(resolveContent(content, rctx, 0)).toBe('A and A')
  })

  it('resolves countUp binding', () => {
    const rctx = createTestRctx()
    rctx.sceneStartMs = 0
    const content = {
      template: 'Count: {n}',
      bindings: { n: { type: 'countUp', target: 100, durationMs: 1000 } },
    }
    expect(resolveContent(content as any, rctx, 0)).toBe('Count: 0')
    expect(resolveContent(content as any, rctx, 1000)).toBe('Count: 100')
  })

  it('resolves countUp with $var target', () => {
    const rctx = createTestRctx({ vars: { total: 50 } })
    rctx.sceneStartMs = 0
    const content = {
      template: '{n}',
      bindings: { n: { type: 'countUp', target: '$var:total', durationMs: 1000 } },
    }
    expect(resolveContent(content as any, rctx, 1000)).toBe('50')
  })

  it('stringifies non-string non-object bindings', () => {
    const rctx = createTestRctx()
    const content = { template: 'Value: {n}', bindings: { n: 42 } }
    expect(resolveContent(content as any, rctx, 0)).toBe('Value: 42')
  })

  it('returns template unchanged when no bindings', () => {
    const rctx = createTestRctx()
    const content = { template: 'Static text' }
    expect(resolveContent(content as any, rctx, 0)).toBe('Static text')
  })
})

describe('wrapText', () => {
  const measure = (text: string) => text.length * 10

  it('returns single line when text fits', () => {
    expect(wrapText(measure, 'short', 200)).toEqual(['short'])
  })

  it('wraps text at word boundaries', () => {
    const lines = wrapText(measure, 'one two three four', 100)
    expect(lines.length).toBeGreaterThan(1)
    expect(lines.join(' ')).toBe('one two three four')
  })

  it('returns empty array for empty string', () => {
    expect(wrapText(measure, '', 100)).toEqual([])
  })

  it('puts each word on its own line when maxWidth is tiny', () => {
    const lines = wrapText(measure, 'a b c', 15)
    expect(lines).toEqual(['a', 'b', 'c'])
  })

  it('keeps single long word on one line', () => {
    const lines = wrapText(measure, 'superlongword', 50)
    expect(lines).toEqual(['superlongword'])
  })
})
