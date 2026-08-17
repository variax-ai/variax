import type { Background } from '@variax-ai/video-schema'
import type { ResolveContext } from './types'
import { resolveString } from './resolve'

export function drawBackground(
  ctx: CanvasRenderingContext2D,
  background: Background | undefined,
  width: number,
  height: number,
  rctx: ResolveContext,
): void {
  if (!background) return

  if (typeof background === 'string') {
    ctx.fillStyle = resolveString(background, rctx)
    ctx.fillRect(0, 0, width, height)
    return
  }

  const stops = background.stops.map((s) => resolveString(s, rctx) || 'transparent')

  let gradient: CanvasGradient
  if (background.type === 'radialGradient') {
    const cx = width / 2
    const cy = height / 2
    const r = Math.max(width, height) / 2
    gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
  } else {
    const angle = background.angle ?? 180
    const rad = ((angle - 90) * Math.PI) / 180
    const dx = Math.cos(rad)
    const dy = Math.sin(rad)
    const len = (Math.abs(dx) * width + Math.abs(dy) * height) / 2
    gradient = ctx.createLinearGradient(
      width / 2 - dx * len,
      height / 2 - dy * len,
      width / 2 + dx * len,
      height / 2 + dy * len,
    )
  }

  stops.forEach((color, i) => {
    gradient.addColorStop(i / (stops.length - 1), color)
  })

  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)
}
