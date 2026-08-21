import { describe, it, expect } from 'vitest'
import type { VideoDocument } from '@variax-ai/video-schema'
import { requiredFonts, buildFontRegistry } from './fonts'
import { createDocumentDrawer } from './index'
import { createStubCtx } from './test-helpers'

function docWith(assets: VideoDocument['assets']): VideoDocument {
  return {
    version: 1,
    width: 100,
    height: 100,
    fps: 30,
    durationMs: 1000,
    assets,
    scenes: [{ id: 's', startMs: 0, endMs: 1000, layers: [] }],
  }
}

describe('requiredFonts', () => {
  it('returns nothing for a document with no assets', () => {
    expect(requiredFonts(docWith(undefined))).toEqual([])
  })

  it('reports family, weight, src and the stack the renderer will use', () => {
    const fonts = requiredFonts(
      docWith({
        display: {
          type: 'font',
          family: 'Lilita One',
          weight: 700,
          src: 'https://fonts.example/lilita.woff2',
          fallback: ['Impact'],
        },
      }),
    )
    expect(fonts).toEqual([
      {
        asset: 'display',
        family: 'Lilita One',
        weight: 700,
        src: 'https://fonts.example/lilita.woff2',
        fallback: ['Impact'],
        stack: "'Lilita One', 'Impact', sans-serif",
      },
    ])
  })

  it('defaults weight to 400 and omits fallback when the document declares none', () => {
    const [font] = requiredFonts(
      docWith({ body: { type: 'font', family: 'Inter', src: 'inter.woff2' } }),
    )
    expect(font.weight).toBe(400)
    expect(font).not.toHaveProperty('fallback')
    expect(font.stack).toBe("'Inter', sans-serif")
  })

  it('skips image assets', () => {
    const fonts = requiredFonts(
      docWith({
        photo: { type: 'image', src: 'photo.png' },
        body: { type: 'font', family: 'Inter', src: 'inter.woff2' },
      }),
    )
    expect(fonts.map(f => f.asset)).toEqual(['body'])
  })

  it('reports a declared face no layer binds to, since binding can depend on vars', () => {
    const fonts = requiredFonts(
      docWith({ unused: { type: 'font', family: 'Inter', src: 'inter.woff2' } }),
    )
    expect(fonts.map(f => f.asset)).toEqual(['unused'])
  })
})

describe('buildFontRegistry', () => {
  it('keys the render context lookup by asset id', () => {
    const registry = buildFontRegistry(
      docWith({
        photo: { type: 'image', src: 'photo.png' },
        display: { type: 'font', family: 'Lilita One', weight: 700, src: 'lilita.woff2' },
      }),
    )
    expect(registry).toEqual({
      display: { family: 'Lilita One', weight: 700, stack: "'Lilita One', sans-serif" },
    })
  })
})

describe('createDocumentDrawer', () => {
  it('draws text in the declared family without ever fetching src', () => {
    const doc = docWith({
      display: { type: 'font', family: 'Lilita One', src: 'https://fonts.example/lilita.woff2' },
    })
    doc.scenes[0].layers = [
      {
        type: 'text',
        content: 'hi',
        font: { size: 40, asset: 'display' },
        position: [10, 10],
      },
    ]
    const ctx = createStubCtx()
    createDocumentDrawer(doc, { vars: {}, images: {} })(ctx, 0)
    expect(ctx.font).toBe("400 40px 'Lilita One', sans-serif")
  })
})
