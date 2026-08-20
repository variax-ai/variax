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

  // Non-finite and non-positive declared values are discarded before the floor
  // is applied, never after: a document that says `shrink: -1` or animates
  // `radius` to NaN must fall back to the floor, not escape it.
  const declaredRadius = finiteOr(declared?.radius, 0)
  const declaredShrink = positiveOr(declared?.shrink, DEFAULT_SHRINK)

  const radius = Math.max(finiteOr(constraints?.minDownscaleBlurPx, 0), declaredRadius)
  const shrink = Math.max(positiveOr(constraints?.minDownscaleShrink, 0), declaredShrink)

  if (radius <= 0) return null
  return { radius, shrink }
}

const DEFAULT_SHRINK = 20

function finiteOr(v: number | undefined, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function positiveOr(v: number | undefined, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : fallback
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
  const w = pick('naturalWidth', 'videoWidth', 'displayWidth', 'codedWidth', 'width')
  const h = pick('naturalHeight', 'videoHeight', 'displayHeight', 'codedHeight', 'height')
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
    const size = intrinsicSize(image)
    if (size) {
      drawSmudgedImage(ctx, image, { x: 0, y: 0, w: size.w, h: size.h }, dsb.radius, dsb.shrink, rctx)
      return
    }
    // The box is unknowable. If a host floor is in force, fail closed — nothing
    // is drawn rather than something sharp. If the blur was only the document's
    // own request, honour the pre-existing behaviour and draw it unblurred
    // rather than making the layer disappear.
    if (rctx.options.constraints?.minDownscaleBlurPx !== undefined) return
    ctx.drawImage(image, 0, 0)
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
