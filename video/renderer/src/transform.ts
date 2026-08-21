import type { Point, Transform } from '@variax-ai/video-schema'
import { evaluateNumber, evaluatePoint, evaluateScale } from './animate'

/**
 * A 2×3 affine matrix, `[a, b, c, d, e, f]`, matching the canvas convention:
 * `x' = a·x + c·y + e`, `y' = b·x + d·y + f`.
 */
export type Matrix = [number, number, number, number, number, number]

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0]

/** `a` applied after `b` — the same order `ctx.translate`/`scale` compose in. */
function multiply(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ]
}

function translated(m: Matrix, tx: number, ty: number): Matrix {
  return multiply(m, [1, 0, 0, 1, tx, ty])
}

/**
 * The matrix `applyTransform` below leaves on the context for this layer.
 *
 * It mirrors that function step for step, and lives beside it so the two are
 * read and changed together: a bounds box computed from a stale copy of the
 * transform rules sizes a buffer for geometry the renderer no longer draws,
 * which clips the render rather than raising anything.
 */
export function layerMatrix(position: Point | undefined, transform: Transform | undefined, tMs: number): Matrix {
  let m: Matrix = IDENTITY
  if (position) m = translated(m, position[0], position[1])
  if (!transform) return m

  const anchor = transform.anchor
  if (anchor) m = translated(m, anchor[0], anchor[1])
  if (transform.position) {
    const p = evaluatePoint(transform.position, tMs)
    m = translated(m, p[0], p[1])
  }
  if (transform.scale) {
    const s = evaluateScale(transform.scale, tMs)
    m = multiply(m, [s[0], 0, 0, s[1], 0, 0])
  }
  if (transform.rotation) {
    const r = (evaluateNumber(transform.rotation, tMs) * Math.PI) / 180
    const cos = Math.cos(r)
    const sin = Math.sin(r)
    m = multiply(m, [cos, sin, -sin, cos, 0, 0])
  }
  if (anchor) m = translated(m, -anchor[0], -anchor[1])
  return m
}

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
    ctx.rotate((r * Math.PI) / 180)
  }

  if (anchor) {
    ctx.translate(-anchor[0], -anchor[1])
  }

  if (transform.opacity !== undefined) {
    const o = evaluateNumber(transform.opacity, tMs)
    ctx.globalAlpha *= o
  }
}
