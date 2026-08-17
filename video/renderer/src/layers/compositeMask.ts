import type { CompositeMaskLayer } from '@variax-ai/video-schema'
import type { RenderContext } from '../types'
import { applyPreDrawEffects } from '../effects'

export function drawCompositeMaskLayer(
  ctx: CanvasRenderingContext2D,
  layer: CompositeMaskLayer,
  tMs: number,
  rctx: RenderContext,
): void {
  const image = rctx.options.images[layer.source]
  if (!image) return

  const w = rctx.width
  const h = rctx.height

  const maskCanvas = document.createElement('canvas')
  maskCanvas.width = w
  maskCanvas.height = h
  const maskCtx = maskCanvas.getContext('2d')
  if (!maskCtx) return

  rctx.drawLayer(maskCtx, layer.mask, tMs)

  const sourceCanvas = document.createElement('canvas')
  sourceCanvas.width = w
  sourceCanvas.height = h
  const sourceCtx = sourceCanvas.getContext('2d')
  if (!sourceCtx) return

  if (layer.maskEffect) {
    applyPreDrawEffects(sourceCtx, [layer.maskEffect], tMs)
  }
  sourceCtx.drawImage(image, 0, 0, w, h)

  sourceCtx.globalCompositeOperation = 'destination-in'
  sourceCtx.drawImage(maskCanvas, 0, 0)

  ctx.drawImage(sourceCanvas, 0, 0)
}
