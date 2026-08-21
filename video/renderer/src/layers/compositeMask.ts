import type { CompositeMaskLayer, Layer } from '@variax-ai/video-schema'
import type { RenderContext } from '../types'
import { applyPreDrawEffects, getDownscaleBlurParams } from '../effects'
import { createOffscreenCanvas } from '../canvas'
import {
  alignToPixels,
  effectExtent,
  expandBounds,
  intersectBounds,
  isEmptyBounds,
  layerBounds,
  subtreeEffectExtent,
} from '../bounds'
import { drawSmudgedImage, resolveDownscaleBlur } from './image'

/**
 * Slack around the crop. Bounds are geometric, and a rasteriser's antialiased
 * fringe reaches about half a pixel past the geometry it is drawn from, so the
 * buffer is given room for the fringe rather than cutting a hard edge through
 * it.
 */
const GUARD_PX = 2

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

  // Only the region the mask can paint into survives `destination-in`, so
  // everything here — allocation, the source draw, both composites — is confined
  // to it. A mask whose extent is not derivable falls back to the whole
  // document, which is what this always used to do.
  const mask = layerBounds(layer.mask, tMs)
  // A mask with a known-empty extent erases the source entirely, so there is
  // genuinely nothing to composite — and no guard band can bring it back.
  if (mask && isEmptyBounds(mask)) return

  // The source is filtered inside this buffer, and a filter cannot see past the
  // buffer's edge, so the crop is grown by the source's own blur reach. Without
  // it a blurred source samples transparency where a full-size buffer had
  // image, and the mask's own edge darkens.
  const sourcePad = sourceLayer
    ? subtreeEffectExtent(sourceLayer, tMs)
    : effectExtent(layer.maskEffect ? [layer.maskEffect] : undefined, tMs)
  const region = alignToPixels(
    mask
      ? intersectBounds(expandBounds(mask, sourcePad + GUARD_PX), { x: 0, y: 0, w, h })
      : { x: 0, y: 0, w, h },
  )
  // Nothing on-document survives: the mask lies entirely outside the frame.
  if (isEmptyBounds(region)) return

  const maskCanvas = createOffscreenCanvas(region.w, region.h, rctx)
  const maskCtx = maskCanvas.getContext('2d') as CanvasRenderingContext2D | null
  if (!maskCtx) return

  // The mask and the source are both drawn in absolute document coordinates —
  // the offset is what makes a sub-region buffer stand in for a full-size one.
  maskCtx.translate(-region.x, -region.y)
  rctx.drawLayer(maskCtx, layer.mask, tMs)

  const sourceCanvas = createOffscreenCanvas(region.w, region.h, rctx)
  const sourceCtx = sourceCanvas.getContext('2d') as CanvasRenderingContext2D | null
  if (!sourceCtx) return

  sourceCtx.save()
  sourceCtx.translate(-region.x, -region.y)

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
    // Layer form: drawn through the normal pipeline on a pristine context, so
    // `frame` and `downscaleBlur` apply and its coordinates are absolute
    // document coordinates — the same basis as `mask`.
    rctx.drawLayer(sourceCtx, sourceLayer, tMs)
  }

  // Back to buffer coordinates: the two buffers share an origin, and the
  // composite must line up with it rather than with the document.
  sourceCtx.restore()

  sourceCtx.globalCompositeOperation = 'destination-in'
  sourceCtx.drawImage(maskCanvas, 0, 0)

  ctx.drawImage(sourceCanvas, region.x, region.y)
}
