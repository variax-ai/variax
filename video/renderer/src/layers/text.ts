import type { TextLayer } from '@variax-ai/video-schema'
import type { RenderContext } from '../types'
import { resolveColor } from '../resolve'
import { buildFontString, resolveContent, resolveFamilyStack, wrapText, fillFittedText } from '../text'

export function drawTextLayer(
  ctx: CanvasRenderingContext2D,
  layer: TextLayer,
  tMs: number,
  rctx: RenderContext,
): void {
  const content = resolveContent(layer.content, rctx, tMs)
  if (!content) return

  const fontStr = buildFontString(layer.font, rctx)
  ctx.font = fontStr
  ctx.textAlign = layer.align ?? 'center'
  ctx.textBaseline = 'middle'

  const color = resolveColor(layer.color, rctx.resolve) ?? '#ffffff'
  ctx.fillStyle = color

  const basePx = layer.font?.size ?? 48
  const weight = layer.font?.weight ?? (rctx.fonts[layer.font?.asset ?? '']?.weight ?? 400)
  const family = resolveFamilyStack(layer.font?.asset, rctx)

  if (layer.shrinkToFit && layer.maxWidth) {
    fillFittedText(ctx, content, 0, 0, layer.maxWidth, basePx, weight, family, layer.minSize)
    return
  }

  if (layer.wrap && layer.maxWidth) {
    ctx.font = fontStr
    const lines = wrapText((t) => ctx.measureText(t).width, content, layer.maxWidth)
    const lineH = layer.lineHeight ?? basePx * 1.2
    const totalH = lines.length * lineH
    lines.forEach((line, i) => {
      ctx.fillText(line, 0, -totalH / 2 + lineH / 2 + i * lineH)
    })
    return
  }

  ctx.fillText(content, 0, 0)
}
