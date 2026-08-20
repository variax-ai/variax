import type { CompositeMaskLayer, Layer } from '@variax-ai/video-schema'
import type { RenderContext } from '../types'
import { applyPreDrawEffects, getDownscaleBlurParams } from '../effects'
import { createOffscreenCanvas } from '../canvas'
import { drawSmudgedImage, resolveDownscaleBlur } from './image'

/** Mirrors drawLayer's own gate, so an invisible source costs no canvases. */
function isVisible(layer: Layer, tMs: number): boolean {
  if (layer.startMs !== undefined && tMs < layer.startMs) return false
  if (layer.endMs !== undefined && tMs >= layer.endMs) return false
  return true
}

export function drawCompositeMaskLayer(
  ctx: CanvasRenderingContext2D,
  layer: CompositeMaskLayer,
  tMs: number,
  rctx: RenderContext,
): void {
  const w = rctx.width
  const h = rctx.height

  // Resolve the source before allocating anything: both forms have a cheap way
  // to know they will draw nothing, and each allocates two full-size canvases.
  let image: CanvasImageSource | undefined
  let sourceLayer: Layer | undefined
  if (typeof layer.source === 'string') {
    image = rctx.options.images[layer.source]
    if (!image) return
  } else if (typeof layer.source === 'object' && layer.source !== null) {
    sourceLayer = layer.source
    if (!isVisible(sourceLayer, tMs)) return
  } else {
    // Malformed document. Every other guard here no-ops rather than throwing,
    // and one bad layer must not take the whole frame down with it.
    return
  }

  const maskCanvas = createOffscreenCanvas(w, h, rctx)
  const maskCtx = maskCanvas.getContext('2d') as CanvasRenderingContext2D | null
  if (!maskCtx) return

  rctx.drawLayer(maskCtx, layer.mask, tMs)

  const sourceCanvas = createOffscreenCanvas(w, h, rctx)
  const sourceCtx = sourceCanvas.getContext('2d') as CanvasRenderingContext2D | null
  if (!sourceCtx) return

  if (image) {
    // A downscaleBlur maskEffect used to be dropped silently, because
    // applyPreDrawEffects has no branch for it. Route it — and the host's
    // floors — through the same path image layers use. Any other effect still
    // goes through the filter pipeline, including when a floor is in force.
    const declared = layer.maskEffect ? getDownscaleBlurParams([layer.maskEffect], tMs) : null
    const dsb = resolveDownscaleBlur(declared, rctx)
    const filterEffect = declared ? undefined : layer.maskEffect

    // Scoped, so a maskEffect filter cannot leak into the destination-in
    // composite below and feather the mask's own alpha.
    sourceCtx.save()
    if (filterEffect) {
      applyPreDrawEffects(sourceCtx, [filterEffect], tMs)
    }
    if (dsb) {
      drawSmudgedImage(sourceCtx, image, { x: 0, y: 0, w, h }, dsb.radius, dsb.shrink, rctx)
    } else {
      sourceCtx.drawImage(image, 0, 0, w, h)
    }
    sourceCtx.restore()
  } else if (sourceLayer) {
    // Layer form: drawn through the normal pipeline on a pristine full-size
    // context, so `frame` and `downscaleBlur` apply and its coordinates are
    // absolute document coordinates — the same basis as `mask`.
    rctx.drawLayer(sourceCtx, sourceLayer, tMs)
  }

  sourceCtx.globalCompositeOperation = 'destination-in'
  sourceCtx.drawImage(maskCanvas, 0, 0)

  ctx.drawImage(sourceCanvas, 0, 0)
}
