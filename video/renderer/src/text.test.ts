import { describe, it, expect } from 'vitest'
import type { TextLayer } from '@variax-ai/video-schema'
import { buildFontString, layoutTextLayer, resolveContent, wrapText } from './text'
import { createStubCtx, createTestRctx, getCalls } from './test-helpers'

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

  it('escapes an apostrophe so the font string stays parseable', () => {
    const rctx = createTestRctx({
      fonts: { heading: { family: 'Inter', weight: 600, fallback: ["Sam's Sans"] } },
    })
    expect(buildFontString({ size: 48, asset: 'heading' }, rctx)).toBe(
      "600 48px 'Inter', 'Sam\\'s Sans', sans-serif",
    )
  })

  it('emits the full fallback stack in order', () => {
    const rctx = createTestRctx({
      fonts: { heading: { family: 'Lilita One', weight: 400, fallback: ['Baloo 2', 'system-ui'] } },
    })
    const result = buildFontString({ size: 96, asset: 'heading' }, rctx)
    expect(result).toBe("400 96px 'Lilita One', 'Baloo 2', system-ui")
  })

  it('terminates a stack of named families with a generic', () => {
    const rctx = createTestRctx({
      fonts: { heading: { family: 'Lilita One', weight: 400, fallback: ['Baloo 2'] } },
    })
    const result = buildFontString({ size: 96, asset: 'heading' }, rctx)
    expect(result).toBe("400 96px 'Lilita One', 'Baloo 2', sans-serif")
  })

  it('keeps explicit weight precedence alongside a fallback stack', () => {
    const rctx = createTestRctx({
      fonts: { heading: { family: 'Inter', weight: 600, fallback: ['monospace'] } },
    })
    expect(buildFontString({ size: 48, weight: 700, asset: 'heading' }, rctx)).toBe(
      "700 48px 'Inter', monospace",
    )
  })

  it('is unchanged for an asset with an empty fallback list', () => {
    const rctx = createTestRctx({ fonts: { heading: { family: 'Inter', weight: 600, fallback: [] } } })
    expect(buildFontString({ size: 48, asset: 'heading' }, rctx)).toBe("600 48px 'Inter', sans-serif")
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

describe('layoutTextLayer memoisation', () => {
  const layer = { type: 'text', content: 'hello world', font: { size: 100 }, wrap: true, maxWidth: 100 } as TextLayer

  it('lays a layer out once per frame, however many callers ask', () => {
    const rctx = createTestRctx()
    const ctx = createStubCtx()
    const first = layoutTextLayer(ctx, layer, rctx, 0)
    const measuresAfterFirst = getCalls(ctx, 'measureText').length
    const second = layoutTextLayer(ctx, layer, rctx, 0)

    expect(second).toBe(first)
    expect(getCalls(ctx, 'measureText')).toHaveLength(measuresAfterFirst)
    // The font is still set for the caller that got the cached layout.
    expect(ctx.font).toBe(first!.font)
  })

  it('lays out again when the time moves', () => {
    const rctx = createTestRctx()
    const ctx = createStubCtx()
    const first = layoutTextLayer(ctx, layer, rctx, 0)
    expect(layoutTextLayer(ctx, layer, rctx, 1)).not.toBe(first)
  })

  it('lays out again when the same frame is drawn for another scene origin', () => {
    // A countUp binding resolves against sceneStartMs, and a persisted layer is
    // drawn with its own scene's origin inside the frame of a later one.
    const counting = {
      type: 'text',
      content: { template: '{n}', bindings: { n: { type: 'countUp', target: 100, durationMs: 1000 } } },
      font: { size: 40 },
    } as TextLayer
    const rctx = createTestRctx()
    const ctx = createStubCtx()

    rctx.sceneStartMs = 0
    const atSceneStart = layoutTextLayer(ctx, counting, rctx, 500)!.lines[0]
    rctx.sceneStartMs = 500
    const atLaterScene = layoutTextLayer(ctx, counting, rctx, 500)!.lines[0]

    expect(atSceneStart).not.toBe(atLaterScene)
  })

  it('keeps two drawers over one layer apart', () => {
    const bound = { type: 'text', content: '$var:message', font: { size: 40 } } as TextLayer
    const ctx = createStubCtx()
    const one = createTestRctx({ vars: { message: 'first' } })
    const two = createTestRctx({ vars: { message: 'second' } })

    expect(layoutTextLayer(ctx, bound, one, 0)!.lines).toEqual(['first'])
    expect(layoutTextLayer(ctx, bound, two, 0)!.lines).toEqual(['second'])
  })
})
