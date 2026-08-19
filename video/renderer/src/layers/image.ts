import type { ImageLayer } from '@variax-ai/video-schema'
import type { RenderContext } from '../types'
import { getDownscaleBlurParams } from '../effects'
import { createOffscreenCanvas } from '../canvas'

export interface Box {
  x: number
  y: number
  w: number
  h: number
  radius?: number
}

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

export function drawSmudgedImage(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  box: Box,
  blurPx: number,
  shrink: number,
  rctx: RenderContext,
): void {
  ctx.save()
  if (box.radius) {
    roundRectPath(ctx, box.x, box.y, box.w, box.h, box.radius)
    ctx.clip()
  }

  const tinyW = Math.max(1, Math.round(box.w / shrink))
  const tinyH = Math.max(1, Math.round(box.h / shrink))
  const tiny = createOffscreenCanvas(tinyW, tinyH, rctx)
  const tctx = tiny.getContext('2d')
  if (tctx) {
    tctx.filter = `blur(${blurPx / shrink}px)`
    tctx.drawImage(image, 0, 0, tinyW, tinyH)
    ctx.imageSmoothingEnabled = true
    ctx.drawImage(tiny, box.x, box.y, box.w, box.h)
  }

  ctx.restore()
}

/**
 * Folds the document's declared downscale blur together with the host's floors.
 *
 * The floors are a safety boundary, so they cannot merely clamp a blur the
 * document chose to declare — omitting the effect, or setting `radius: 0`, would
 * be a trivial way out. Once `minDownscaleBlurPx` is configured, every image
 * draw is pushed through the downscale path at or above the floor.
 *
 * Returns null when no blur applies at all.
 */
export function resolveDownscaleBlur(
  declared: { radius: number; shrink: number } | null,
  rctx: RenderContext,
): { radius: number; shrink: number } | null {
  const constraints = rctx.options.constraints
  let radius = declared?.radius ?? 0
  let shrink = declared?.shrink || 20

  if (constraints?.minDownscaleBlurPx !== undefined) {
    radius = Math.max(constraints.minDownscaleBlurPx, radius)
  }
  if (constraints?.minDownscaleShrink !== undefined) {
    shrink = Math.max(constraints.minDownscaleShrink, shrink)
  }

  if (!(radius > 0) || !(shrink > 0)) return null
  return { radius, shrink }
}

/**
 * The size `drawImage(image, 0, 0)` would paint at. Returns null when it cannot
 * be determined — the caller then declines to draw rather than risk painting an
 * unconstrained image.
 */
function intrinsicSize(image: CanvasImageSource): { w: number; h: number } | null {
  const src = image as unknown as Record<string, unknown>
  const pick = (...keys: string[]): number | undefined => {
    for (const key of keys) {
      const v = src[key]
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v
    }
    return undefined
  }
  const w = pick('naturalWidth', 'videoWidth', 'codedWidth', 'width')
  const h = pick('naturalHeight', 'videoHeight', 'codedHeight', 'height')
  if (w === undefined || h === undefined) return null
  return { w, h }
}

export function drawImageLayer(
  ctx: CanvasRenderingContext2D,
  layer: ImageLayer,
  tMs: number,
  rctx: RenderContext,
): void {
  const image = rctx.options.images[layer.asset]
  if (!image) return

  const declared = layer.effects ? getDownscaleBlurParams(layer.effects, tMs) : null
  const dsb = resolveDownscaleBlur(declared, rctx)

  const frame = layer.frame
  if (!frame) {
    if (!dsb) {
      ctx.drawImage(image, 0, 0)
      return
    }
    // Fail closed: a floor is configured but we cannot work out the box to
    // smudge into, so nothing is drawn rather than something sharp.
    const size = intrinsicSize(image)
    if (!size) return
    drawSmudgedImage(ctx, image, { x: 0, y: 0, w: size.w, h: size.h }, dsb.radius, dsb.shrink, rctx)
    return
  }

  if (dsb) {
    drawSmudgedImage(ctx, image, frame, dsb.radius, dsb.shrink, rctx)
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
