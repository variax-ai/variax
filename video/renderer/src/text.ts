import type { Font, TemplateString, TextLayer } from '@variax-ai/video-schema'
import type { RenderContext } from './types'
import { resolveString } from './resolve'
import { evaluateGenerator } from './generators'

/**
 * Escapes a family name for a quoted CSS string. An unescaped apostrophe makes
 * the whole `ctx.font` value unparseable, and the canvas ignores an invalid
 * font assignment silently — the text then renders in whatever face happened
 * to be set, at the wrong size.
 */
function escapeFamily(name: string): string {
  return name.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

/** CSS generic families, which are keywords and must not be quoted. */
const GENERIC_FAMILIES = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded',
  'math',
  'emoji',
  'fangsong',
])

/**
 * Builds the CSS font stack from a family plus its fallbacks. A generic family
 * always terminates the stack, so a glyph missing from every named face still
 * has somewhere to land.
 */
export function buildFamilyStack(family: string, fallback: string[] | undefined): string {
  const names = [family, ...(fallback ?? [])].filter(name => name.length > 0)
  if (names.length === 0 || !GENERIC_FAMILIES.has(names[names.length - 1])) {
    names.push('sans-serif')
  }
  return names
    .map(name => (GENERIC_FAMILIES.has(name) ? name : `'${escapeFamily(name)}'`))
    .join(', ')
}

/**
 * The CSS font stack for a font asset id. The single place any caller should
 * derive a family from — deriving it inline is how the value and label of one
 * layer ended up in different faces.
 */
export function resolveFamilyStack(asset: string | undefined, rctx: RenderContext): string {
  if (!asset) return 'sans-serif'
  return rctx.fonts[asset]?.stack ?? 'sans-serif'
}

export function buildFontString(font: Font | undefined, rctx: RenderContext): string {
  if (!font) return '400 48px sans-serif'
  const weight = font.weight ?? 400
  let family = 'sans-serif'
  if (font.asset) {
    const asset = rctx.fonts[font.asset]
    if (asset) {
      family = asset.stack
      if (!font.weight && asset.weight) {
        return `${asset.weight} ${font.size}px ${family}`
      }
    }
  }
  return `${weight} ${font.size}px ${family}`
}

export function resolveContent(content: string | TemplateString, rctx: RenderContext, tMs: number): string {
  if (typeof content === 'string') return resolveString(content, rctx.resolve)

  let result = content.template
  if (content.bindings) {
    for (const [key, binding] of Object.entries(content.bindings)) {
      let value: string
      if (typeof binding === 'object' && binding !== null && 'type' in binding) {
        const b = binding as { type: string; target?: unknown; easing?: string; durationMs?: number }
        if (b.type === 'countUp') {
          let target = typeof b.target === 'number' ? b.target : 0
          if (typeof b.target === 'string') {
            target = resolveNumberFromString(b.target, rctx)
          }
          const sceneTMs = tMs - rctx.sceneStartMs
          value = String(
            evaluateGenerator({ fn: 'countUp', params: { target, durationMs: b.durationMs ?? 1000 } }, sceneTMs),
          )
        } else {
          value = String(binding)
        }
      } else if (typeof binding === 'string') {
        value = resolveString(binding, rctx.resolve)
      } else {
        value = String(binding)
      }
      result = result.replaceAll(`{${key}}`, value)
    }
  }
  return result
}

function resolveNumberFromString(s: string, rctx: RenderContext): number {
  if (s.startsWith('$var:')) {
    const v = rctx.resolve.vars[s.slice(5)]
    return typeof v === 'number' ? v : 0
  }
  return 0
}

export function wrapText(
  measure: (text: string) => number,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (current && measure(candidate) > maxWidth) {
      lines.push(current)
      current = word
    } else {
      current = candidate
    }
  }
  if (current) lines.push(current)
  return lines
}

const fittedCache = new Map<string, number>()
const FITTED_CACHE_MAX = 128

/**
 * The size `text` has to shrink to in order to fit `maxWidth`, floored at
 * `minPx`. Cached: the same string, font and box give the same answer on every
 * frame of the shot it appears in.
 */
export function fittedFontSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  basePx: number,
  weight: string | number,
  family: string,
  minPx = 24,
): number {
  const key = `${weight}|${family}|${basePx}|${maxWidth}|${minPx}|${text}`
  const cached = fittedCache.get(key)
  if (cached !== undefined) return cached

  ctx.font = `${weight} ${basePx}px ${family}`
  const measured = ctx.measureText(text).width
  const px = measured > maxWidth ? Math.max(minPx, Math.floor((basePx * maxWidth) / measured)) : basePx
  if (fittedCache.size >= FITTED_CACHE_MAX) fittedCache.clear()
  fittedCache.set(key, px)
  return px
}

export function fillFittedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  basePx: number,
  weight: string | number,
  family: string,
  minPx = 24,
): void {
  const px = fittedFontSize(ctx, text, maxWidth, basePx, weight, family, minPx)
  ctx.font = `${weight} ${px}px ${family}`
  ctx.fillText(text, x, y)
}

/** How a text layer is laid out, before anything is painted. */
export interface TextLayout {
  /** The wrapped lines, in order. A layer that does not wrap has one. */
  lines: string[]
  /** Distance between line baselines, and the height of a single line. */
  lineHeight: number
  /** The `ctx.font` the lines are drawn with, after any shrink-to-fit. */
  font: string
  /** `lines.length * lineHeight`, the vertical box the lines occupy. */
  height: number
}

/**
 * Lays out a text layer without drawing it: the wrapping, the shrink-to-fit
 * size and the resulting height, all from the one place that knows them.
 *
 * `drawTextLayer` paints exactly this, and a shape's `sizeTo` measures exactly
 * this, so a card and the text it backs cannot disagree about how many lines
 * there are. Sets `ctx.font` to the layout's font, which is what the caller
 * needs next in both cases.
 *
 * Width is deliberately not part of it: measuring every line costs a
 * `measureText` per frame that only `sizeTo` needs. Ask for it with
 * `measureLayoutWidth`.
 */
/**
 * Layouts already computed for a render context, so a shape that sizes itself
 * to a text layer and the text layer itself do not lay the same text out twice
 * in one frame.
 *
 * Keyed per render context rather than globally: two drawers over one document
 * can hold different `vars`, and `resolveDocumentDefs` makes shared layer
 * objects likely. `sceneStartMs` is part of the key because a `countUp` binding
 * resolves against it, and a persisted layer is drawn with its own scene's
 * value inside the same frame.
 */
const layoutCache = new WeakMap<
  RenderContext,
  Map<TextLayer, { tMs: number; sceneStartMs: number; layout: TextLayout | null }>
>()

export function layoutTextLayer(
  ctx: CanvasRenderingContext2D,
  layer: TextLayer,
  rctx: RenderContext,
  tMs: number,
): TextLayout | null {
  let cache = layoutCache.get(rctx)
  if (!cache) {
    cache = new Map()
    layoutCache.set(rctx, cache)
  }
  const hit = cache.get(layer)
  if (hit && hit.tMs === tMs && hit.sceneStartMs === rctx.sceneStartMs) {
    // Callers rely on the font being current, cache hit or not.
    if (hit.layout) ctx.font = hit.layout.font
    return hit.layout
  }

  const layout = computeTextLayout(ctx, layer, rctx, tMs)
  cache.set(layer, { tMs, sceneStartMs: rctx.sceneStartMs, layout })
  return layout
}

function computeTextLayout(
  ctx: CanvasRenderingContext2D,
  layer: TextLayer,
  rctx: RenderContext,
  tMs: number,
): TextLayout | null {
  const content = resolveContent(layer.content, rctx, tMs)
  if (!content) return null

  const basePx = layer.font?.size ?? 48

  if (layer.shrinkToFit && layer.maxWidth) {
    const weight = layer.font?.weight ?? (rctx.fonts[layer.font?.asset ?? '']?.weight ?? 400)
    const family = resolveFamilyStack(layer.font?.asset, rctx)
    const px = fittedFontSize(ctx, content, layer.maxWidth, basePx, weight, family, layer.minSize)
    const font = `${weight} ${px}px ${family}`
    const lineHeight = layer.lineHeight ?? px * LINE_HEIGHT_RATIO
    ctx.font = font
    return { lines: [content], lineHeight, font, height: lineHeight }
  }

  const font = buildFontString(layer.font, rctx)
  ctx.font = font
  const lines =
    layer.wrap && layer.maxWidth
      ? wrapText(t => ctx.measureText(t).width, content, layer.maxWidth)
      : [content]
  const lineHeight = layer.lineHeight ?? basePx * LINE_HEIGHT_RATIO
  return { lines, lineHeight, font, height: lines.length * lineHeight }
}

/** The widest line of a layout. Leaves the context as it was found. */
export function measureLayoutWidth(ctx: CanvasRenderingContext2D, layout: TextLayout): number {
  ctx.save()
  try {
    ctx.font = layout.font
    let width = 0
    for (const line of layout.lines) width = Math.max(width, ctx.measureText(line).width)
    return width
  } finally {
    ctx.restore()
  }
}

/** The default line box, when a layer declares no `lineHeight`. */
const LINE_HEIGHT_RATIO = 1.2
