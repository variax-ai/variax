import type { ShapeLayer } from '@variax-ai/video-schema'
import type { RenderContext } from '../types'
import { resolveColor } from '../resolve'

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

export function drawShapeLayer(
  ctx: CanvasRenderingContext2D,
  layer: ShapeLayer,
  _tMs: number,
  rctx: RenderContext,
): void {
  const [w, h] = layer.size ?? [0, 0]
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
