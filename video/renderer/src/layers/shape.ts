import type { ShapeLayer, SizeTo } from '@variax-ai/video-schema'
import type { RenderContext } from '../types'
import { resolveColor } from '../resolve'
import { layoutTextLayer, measureLayoutWidth } from '../text'

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/**
 * The box a `sizeTo` asks for: the text's laid-out extent plus padding on each
 * side, floored by any minimum.
 *
 * Returns null when the target is missing, is not a text layer, or resolves to
 * no text at all. The shape then falls back to its own `size` — a card that
 * cannot measure its message is better as the author's fixed box than as
 * nothing, and better than a box sized to text that is not there.
 */
function measureSizeTo(
  ctx: CanvasRenderingContext2D,
  sizeTo: SizeTo,
  tMs: number,
  rctx: RenderContext,
): [number, number] | null {
  const target = rctx.layersById[sizeTo.layer]
  if (!target || target.type !== 'text') return null

  // Laying the text out sets the font; the shape must not inherit it.
  ctx.save()
  let width: number
  let height: number
  try {
    const layout = layoutTextLayer(ctx, target, rctx, tMs)
    if (!layout) return null
    width = measureLayoutWidth(ctx, layout)
    height = layout.height
  } finally {
    ctx.restore()
  }

  const padding = sizeTo.padding ?? 0
  const [padX, padY] = typeof padding === 'number' ? [padding, padding] : padding
  return [
    Math.max(sizeTo.minWidth ?? 0, width + padX * 2),
    Math.max(sizeTo.minHeight ?? 0, height + padY * 2),
  ]
}

export function drawShapeLayer(
  ctx: CanvasRenderingContext2D,
  layer: ShapeLayer,
  tMs: number,
  rctx: RenderContext,
): void {
  const measured = layer.sizeTo ? measureSizeTo(ctx, layer.sizeTo, tMs, rctx) : null
  const [w, h] = measured ?? layer.size ?? [0, 0]
  const fill = resolveColor(layer.fill, rctx.resolve)

  if (layer.shadow) {
    ctx.shadowColor = layer.shadow.color
    ctx.shadowBlur = layer.shadow.blur
    ctx.shadowOffsetX = layer.shadow.offsetX ?? 0
    ctx.shadowOffsetY = layer.shadow.offsetY ?? 0
  }

  ctx.beginPath()

  switch (layer.shape) {
    case 'rect':
      ctx.rect(-w / 2, -h / 2, w, h)
      break

    case 'roundedRect': {
      const r = layer.radius ?? 0
      roundRectPath(ctx, -w / 2, -h / 2, w, h, r)
      break
    }

    case 'ellipse':
      ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2)
      break

    case 'path':
      if (layer.path) {
        const path = new Path2D(layer.path)
        if (fill) {
          ctx.fillStyle = fill
          ctx.fill(path)
        }
        if (layer.stroke) {
          ctx.strokeStyle = resolveColor(layer.stroke.color, rctx.resolve) ?? layer.stroke.color
          ctx.lineWidth = layer.stroke.width
          ctx.stroke(path)
        }
        return
      }
      break

    case 'line':
      if (layer.size) {
        ctx.moveTo(-w / 2, 0)
        ctx.lineTo(w / 2, 0)
      }
      break
  }

  if (fill) {
    ctx.fillStyle = fill
    ctx.fill()
  }

  if (layer.stroke) {
    ctx.strokeStyle = resolveColor(layer.stroke.color, rctx.resolve) ?? layer.stroke.color
    ctx.lineWidth = layer.stroke.width
    ctx.stroke()
  }
}
