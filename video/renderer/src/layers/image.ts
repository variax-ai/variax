import type { ImageLayer } from '@variax-ai/video-schema'
import type { RenderContext } from '../types'
import { getDownscaleBlurParams } from '../effects'

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

let smudgeBuffer: HTMLCanvasElement | null = null

function drawSmudgedImage(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  box: { x: number; y: number; w: number; h: number; radius?: number },
  blurPx: number,
  shrink: number,
): void {
  ctx.save()
  if (box.radius) {
    roundRectPath(ctx, box.x, box.y, box.w, box.h, box.radius)
    ctx.clip()
  }

  const tiny = (smudgeBuffer ??= document.createElement('canvas'))
  tiny.width = Math.max(1, Math.round(box.w / shrink))
  tiny.height = Math.max(1, Math.round(box.h / shrink))
  const tctx = tiny.getContext('2d')
  if (tctx) {
    tctx.filter = `blur(${blurPx / shrink}px)`
    tctx.drawImage(image, 0, 0, tiny.width, tiny.height)
    ctx.imageSmoothingEnabled = true
    ctx.drawImage(tiny, box.x, box.y, box.w, box.h)
  }

  ctx.restore()
}

export function drawImageLayer(
  ctx: CanvasRenderingContext2D,
  layer: ImageLayer,
  tMs: number,
  rctx: RenderContext,
): void {
  const image = rctx.options.images[layer.asset]
  if (!image) return

  const frame = layer.frame
  if (!frame) {
    ctx.drawImage(image, 0, 0)
    return
  }

  const dsb = layer.effects ? getDownscaleBlurParams(layer.effects, tMs) : null
  if (dsb && dsb.radius > 0) {
    drawSmudgedImage(ctx, image, frame, dsb.radius, dsb.shrink || 20)
    return
  }

  ctx.save()
  if (frame.radius) {
    roundRectPath(ctx, frame.x, frame.y, frame.w, frame.h, frame.radius)
    ctx.clip()
  }
  ctx.drawImage(image, frame.x, frame.y, frame.w, frame.h)
  ctx.restore()
}
