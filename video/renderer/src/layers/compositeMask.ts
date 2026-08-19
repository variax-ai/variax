import type { CompositeMaskLayer } from '@variax-ai/video-schema'
import type { RenderContext } from '../types'
import { applyPreDrawEffects, getDownscaleBlurParams } from '../effects'
import { createOffscreenCanvas } from '../canvas'
import { drawSmudgedImage, resolveDownscaleBlur } from './image'

export function drawCompositeMaskLayer(
  ctx: CanvasRenderingContext2D,
  layer: CompositeMaskLayer,
  tMs: number,
  rctx: RenderContext,
): void {
  const w = rctx.width
  const h = rctx.height

  // The string form of `source` is looked up before any work is done so a
  // missing image stays the cheap no-op it has always been.
  const image = typeof layer.source === 'string' ? rctx.options.images[layer.source] : undefined
  if (typeof layer.source === 'string' && !image) return

  const maskCanvas = createOffscreenCanvas(w, h, rctx)
  const maskCtx = maskCanvas.getContext('2d') as CanvasRenderingContext2D | null
  if (!maskCtx) return

  rctx.drawLayer(maskCtx, layer.mask, tMs)

  const sourceCanvas = createOffscreenCanvas(w, h, rctx)
  const sourceCtx = sourceCanvas.getContext('2d') as CanvasRenderingContext2D | null
  if (!sourceCtx) return

  if (image) {
    // `maskEffect` is a single Effect; a downscaleBlur there used to be dropped
    // silently because applyPreDrawEffects has no branch for it. Route it —
    // and the host's floors — through the same path image layers use.
    const declared = layer.maskEffect ? getDownscaleBlurParams([layer.maskEffect], tMs) : null
    const dsb = resolveDownscaleBlur(declared, rctx)
    if (dsb) {
      drawSmudgedImage(sourceCtx, image, { x: 0, y: 0, w, h }, dsb.radius, dsb.shrink, rctx)
    } else {
      if (layer.maskEffect) {
        applyPreDrawEffects(sourceCtx, [layer.maskEffect], tMs)
      }
      sourceCtx.drawImage(image, 0, 0, w, h)
    }
  } else {
    // Layer form: drawn through the normal pipeline on a pristine full-size
    // context, so `frame` and `downscaleBlur` apply and its coordinates are
    // absolute document coordinates — the same basis as `mask`.
    rctx.drawLayer(sourceCtx, layer.source as Exclude<CompositeMaskLayer['source'], string>, tMs)
  }

  sourceCtx.globalCompositeOperation = 'destination-in'
  sourceCtx.drawImage(maskCanvas, 0, 0)

  ctx.drawImage(sourceCanvas, 0, 0)
}
