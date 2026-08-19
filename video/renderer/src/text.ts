import type { Font, TemplateString } from '@variax-ai/video-schema'
import type { RenderContext } from './types'
import { resolveString } from './resolve'
import { evaluateGenerator } from './generators'

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
function buildFamilyStack(family: string, fallback: string[] | undefined): string {
  const names = [family, ...(fallback ?? [])].filter(name => name.length > 0)
  if (names.length === 0 || !GENERIC_FAMILIES.has(names[names.length - 1])) {
    names.push('sans-serif')
  }
  return names.map(name => (GENERIC_FAMILIES.has(name) ? name : `'${name}'`)).join(', ')
}

export function buildFontString(font: Font | undefined, rctx: RenderContext): string {
  if (!font) return '400 48px sans-serif'
  const weight = font.weight ?? 400
  let family = 'sans-serif'
  if (font.asset) {
    const asset = rctx.fonts[font.asset]
    if (asset) {
      family = buildFamilyStack(asset.family, asset.fallback)
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
  const key = `${weight}|${family}|${basePx}|${maxWidth}|${minPx}|${text}`
  let px = fittedCache.get(key)
  if (px === undefined) {
    ctx.font = `${weight} ${basePx}px ${family}`
    const measured = ctx.measureText(text).width
    px = measured > maxWidth ? Math.max(minPx, Math.floor((basePx * maxWidth) / measured)) : basePx
    if (fittedCache.size >= FITTED_CACHE_MAX) fittedCache.clear()
    fittedCache.set(key, px)
  }
  ctx.font = `${weight} ${px}px ${family}`
  ctx.fillText(text, x, y)
}
