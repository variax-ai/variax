import type { VideoDocument } from '@variax-ai/video-schema'
import type { RenderContext } from './types'
import { buildFamilyStack } from './text'

/**
 * A face a document expects the host to have loaded, with the family and weight
 * the renderer will actually ask the canvas for.
 */
export interface RequiredFont {
  /** The `assets` key text layers bind to via `font.asset`. */
  asset: string
  /** The family name the face must be registered under, matched exactly. */
  family: string
  /** The weight used when a text layer's own `font.weight` is absent. */
  weight: number
  /** The document's `src`. Advisory: the renderer never fetches it. */
  src: string
  fallback?: string[]
  /** The CSS font stack the renderer sets for this asset, fallbacks included. */
  stack: string
}

/**
 * The faces a document needs loaded before it can render correctly.
 *
 * The renderer does not load fonts — `FontAsset.src` is advisory and never
 * fetched — and a family that is not loaded fails silently: the canvas falls
 * through the stack and paints in whatever comes next, at the wrong metrics,
 * with no error. Hosts should preload everything this returns (`FontFace` in
 * the browser, `GlobalFonts` or equivalent in Node) and await it before the
 * first `drawFrame`.
 *
 * Every declared font asset is returned, whether or not a text layer binds to
 * it: which assets a document reaches for can depend on `vars`, so declaration
 * is the document's statement of need.
 */
export function requiredFonts(doc: VideoDocument): RequiredFont[] {
  const fonts: RequiredFont[] = []
  for (const [asset, decl] of Object.entries(doc.assets ?? {})) {
    if (decl.type !== 'font') continue
    fonts.push({
      asset,
      family: decl.family,
      weight: decl.weight ?? 400,
      src: decl.src,
      ...(decl.fallback ? { fallback: decl.fallback } : {}),
      stack: buildFamilyStack(decl.family, decl.fallback),
    })
  }
  return fonts
}

/**
 * The font lookup a `RenderContext` carries. Built once per document: the stack
 * is fixed for the document's lifetime, so it is not rebuilt on every text draw
 * of every frame.
 */
export function buildFontRegistry(doc: VideoDocument): RenderContext['fonts'] {
  const registry: RenderContext['fonts'] = {}
  for (const font of requiredFonts(doc)) {
    registry[font.asset] = {
      family: font.family,
      weight: font.weight,
      stack: font.stack,
    }
  }
  return registry
}
