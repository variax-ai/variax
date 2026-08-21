import type { TextLayer } from '@variax-ai/video-schema'
import type { RenderContext } from '../types'
import { resolveColor } from '../resolve'
import { layoutTextLayer } from '../text'

export function drawTextLayer(
  ctx: CanvasRenderingContext2D,
  layer: TextLayer,
  tMs: number,
  rctx: RenderContext,
): void {
  // The same layout a shape's `sizeTo` measures, so the card and the text
  // inside it cannot disagree about how many lines there are.
  const layout = layoutTextLayer(ctx, layer, rctx, tMs)
  if (!layout) return

  // layoutTextLayer has already set the font it measured with.
  ctx.textAlign = layer.align ?? 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = resolveColor(layer.color, rctx.resolve) ?? '#ffffff'

  // One line lands at y=0, which is what the general case computes for it:
  // height === lineHeight makes `top` zero.
  const top = -layout.height / 2 + layout.lineHeight / 2
  layout.lines.forEach((line, i) => {
    ctx.fillText(line, 0, top + i * layout.lineHeight)
  })
}
