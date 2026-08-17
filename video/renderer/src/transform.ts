import type { Point, Transform } from '@variax-ai/video-schema'
import { evaluateNumber, evaluatePoint, evaluateScale } from './animate'

export function applyTransform(
  ctx: CanvasRenderingContext2D,
  transform: Transform | undefined,
  position: Point | undefined,
  tMs: number,
): void {
  if (position) {
    ctx.translate(position[0], position[1])
  }

  if (!transform) return

  const anchor = transform.anchor
  if (anchor) {
    ctx.translate(anchor[0], anchor[1])
  }

  if (transform.position) {
    const pos = evaluatePoint(transform.position, tMs)
    ctx.translate(pos[0], pos[1])
  }

  if (transform.scale) {
    const s = evaluateScale(transform.scale, tMs)
    ctx.scale(s[0], s[1])
  }

  if (transform.rotation) {
    const r = evaluateNumber(transform.rotation, tMs)
    ctx.rotate(r)
  }

  if (anchor) {
    ctx.translate(-anchor[0], -anchor[1])
  }

  if (transform.opacity !== undefined) {
    const o = evaluateNumber(transform.opacity, tMs)
    ctx.globalAlpha *= o
  }
}
