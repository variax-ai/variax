import type { Effect } from '@variax-ai/video-schema'
import { evaluateNumber } from './animate'

export function applyPreDrawEffects(
  ctx: CanvasRenderingContext2D,
  effects: Effect[] | undefined,
  tMs: number,
): void {
  if (!effects) return

  const filters: string[] = []

  for (const effect of effects) {
    if (effect.type === 'gaussianBlur') {
      const radius = evaluateNumber(effect.radius, tMs)
      if (radius > 0) filters.push(`blur(${radius}px)`)
    } else if (effect.type === 'dropShadow') {
      const blur = evaluateNumber(effect.blur, tMs)
      const ox = effect.offsetX ? evaluateNumber(effect.offsetX, tMs) : 0
      const oy = effect.offsetY ? evaluateNumber(effect.offsetY, tMs) : 0
      ctx.shadowColor = effect.color
      ctx.shadowBlur = blur
      ctx.shadowOffsetX = ox
      ctx.shadowOffsetY = oy
    }
  }

  if (filters.length > 0) {
    ctx.filter = filters.join(' ')
  }
}

export function hasDownscaleBlur(effects: Effect[] | undefined): boolean {
  if (!effects) return false
  return effects.some((e) => e.type === 'downscaleBlur')
}

export function getDownscaleBlurParams(
  effects: Effect[],
  tMs: number,
): { radius: number; shrink: number } | null {
  for (const effect of effects) {
    if (effect.type === 'downscaleBlur') {
      return {
        radius: evaluateNumber(effect.radius, tMs),
        shrink: evaluateNumber(effect.shrink, tMs),
      }
    }
  }
  return null
}
