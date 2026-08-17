import type { StatBeatLayer } from '@variax-ai/video-schema'
import type { RenderContext } from '../types'
import { resolveColor } from '../resolve'
import { resolveNumberVar } from '../resolve'
import { buildFontString, fillFittedText } from '../text'
import { easeOutCubic, easeOutBack, resolveEasing } from '../easing'

function clamp01(t: number): number {
  return Math.min(1, Math.max(0, t))
}

function spanProgress(tMs: number, start: number, end: number): number {
  return clamp01((tMs - start) / (end - start))
}

export function drawStatBeatLayer(
  ctx: CanvasRenderingContext2D,
  layer: StatBeatLayer,
  tMs: number,
  rctx: RenderContext,
): void {
  const valueColor = resolveColor(layer.valueColor, rctx.resolve) ?? '#ffffff'
  const labelColor = resolveColor(layer.labelColor, rctx.resolve) ?? '#ffffff'
  const valueFontStr = buildFontString(layer.valueFont, rctx)
  const entranceEasing = layer.easing ? resolveEasing(layer.easing) : easeOutBack
  const isSlamIn = layer.entrance === 'slamIn'

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  const sceneStart = rctx.sceneStartMs

  for (const beat of layer.beats) {
    const offset = beat.offsetMs ?? 0
    const beatStartMs = sceneStart + offset
    if (tMs < beatStartMs) continue

    const enter = easeOutCubic(spanProgress(tMs, beatStartMs, beatStartMs + 300))
    let scale = 1
    if (isSlamIn) {
      scale = 0.7 + 0.3 * entranceEasing(spanProgress(tMs, beatStartMs, beatStartMs + 300))
    }

    const target = typeof beat.value === 'string'
      ? resolveNumberVar(beat.value, rctx.resolve)
      : beat.value
    const countUpMs = beat.countUpMs ?? 600
    const counted = Math.round(
      target * easeOutCubic(spanProgress(tMs, beatStartMs, beatStartMs + countUpMs)),
    )

    ctx.save()
    ctx.globalAlpha *= enter
    ctx.translate(beat.position[0], beat.position[1])
    ctx.scale(scale, scale)

    ctx.font = valueFontStr
    ctx.fillStyle = valueColor
    ctx.fillText(`${counted}`, 0, 0)

    if (layer.labelFont) {
      const labelWeight = layer.labelFont.weight ?? (rctx.fonts[layer.labelFont.asset ?? '']?.weight ?? 400)
      const labelFamily = layer.labelFont.asset
        ? `'${rctx.fonts[layer.labelFont.asset]?.family ?? 'sans-serif'}', sans-serif`
        : 'sans-serif'
      ctx.fillStyle = labelColor
      fillFittedText(
        ctx,
        beat.label,
        0,
        (layer.valueFont?.size ?? 48) * 0.875,
        rctx.width - 160,
        layer.labelFont.size,
        labelWeight,
        labelFamily,
      )
    }

    ctx.restore()
  }
}
