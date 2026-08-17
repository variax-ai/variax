import type { CaptionSequenceLayer, CaptionEntry } from '@variax-ai/video-schema'
import type { RenderContext } from '../types'
import { resolveColor } from '../resolve'
import { buildFontString, fillFittedText } from '../text'
import { easeOutCubic, easeOutBack } from '../easing'

function clamp01(t: number): number {
  return Math.min(1, Math.max(0, t))
}

function spanProgress(tMs: number, start: number, end: number): number {
  return clamp01((tMs - start) / (end - start))
}

function captionAt(tMs: number, captions: CaptionEntry[]): CaptionEntry {
  let current = captions[0]
  for (const caption of captions) {
    if (caption.t <= tMs) current = caption
  }
  return current
}

export function drawCaptionSequenceLayer(
  ctx: CanvasRenderingContext2D,
  layer: CaptionSequenceLayer,
  tMs: number,
  rctx: RenderContext,
): void {
  const captions = layer.captions
  const caption = captionAt(tMs, captions)
  if (!caption) return

  const idx = captions.indexOf(caption)
  const nextStartMs = captions[idx + 1]?.t
  const entranceDurationMs = layer.entrance?.durationMs ?? 250
  const exitDurationMs = layer.exit?.durationMs ?? 200
  const risePx = layer.entrance?.risePx ?? 20

  const pop = easeOutCubic(spanProgress(tMs, caption.t, caption.t + entranceDurationMs))
  const popScale = 0.7 + 0.3 * easeOutBack(spanProgress(tMs, caption.t, caption.t + entranceDurationMs))

  let fade = 1
  if (nextStartMs !== undefined) {
    fade = 1 - easeOutCubic(spanProgress(tMs, nextStartMs - exitDurationMs, nextStartMs))
  }

  ctx.save()
  ctx.globalAlpha *= pop * fade
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  const fontStr = buildFontString(layer.font, rctx)
  ctx.font = fontStr

  const color = resolveColor(layer.color, rctx.resolve) ?? '#ffffff'
  ctx.fillStyle = color

  const yOffset = risePx * (1 - pop)
  ctx.translate(0, yOffset)
  ctx.scale(popScale, popScale)

  if (layer.shrinkToFit && layer.maxWidth && layer.font) {
    const weight = layer.font.weight ?? (rctx.fonts[layer.font.asset ?? '']?.weight ?? 400)
    const family = layer.font.asset
      ? `'${rctx.fonts[layer.font.asset]?.family ?? 'sans-serif'}', sans-serif`
      : 'sans-serif'
    fillFittedText(ctx, caption.text, 0, 0, layer.maxWidth, layer.font.size, weight, family)
  } else {
    ctx.fillText(caption.text, 0, 0)
  }

  ctx.restore()
}
