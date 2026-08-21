import type { TrailLayer } from '@variax-ai/video-schema'
import type { RenderContext } from '../types'
import { evaluateNumber, evaluatePoint } from '../animate'
import { resolveColor } from '../resolve'

export interface TrailSample {
  x: number
  y: number
  r: number
}

/**
 * The age schedule: sample i sits `i * windowMs / samples` in the past with
 * radius `radius * (1 - falloff * i / samples)`. `take` draws only the N
 * freshest while leaving the schedule intact, which is what lets a sharp core
 * and a soft trail share one decay curve.
 *
 * Samples older than `startMs` are dropped rather than clamped — clamping would
 * pile concentric circles onto the start point instead of shortening the trail.
 */
/**
 * The last schedule computed for a layer. A trail used as a compositeMask has
 * its samples asked for twice in a frame — once to derive the crop, once to
 * draw — and the schedule is a pure function of the layer and the time, so the
 * second ask is free. Callers must treat the array as read-only.
 */
const scheduleCache = new WeakMap<TrailLayer, { tMs: number; samples: TrailSample[] }>()

export function trailSamples(layer: TrailLayer, tMs: number): TrailSample[] {
  const cached = scheduleCache.get(layer)
  if (cached && cached.tMs === tMs) return cached.samples
  const samples = computeTrailSamples(layer, tMs)
  scheduleCache.set(layer, { tMs, samples })
  return samples
}

function computeTrailSamples(layer: TrailLayer, tMs: number): TrailSample[] {
  const samples = Math.max(1, Math.floor(layer.samples))
  const take = layer.take === undefined ? samples : Math.min(samples, Math.max(1, Math.floor(layer.take)))
  const falloff = layer.falloff ?? 0
  const step = layer.windowMs / samples
  const floorMs = layer.startMs

  const out: TrailSample[] = []
  for (let i = 0; i < take; i++) {
    const ts = tMs - i * step
    if (floorMs !== undefined && ts < floorMs) break
    const p = evaluatePoint(layer.source, ts)
    const r = evaluateNumber(layer.radius, ts) * (1 - (falloff * i) / samples)
    // `!(r > 0)` rather than `r <= 0`, so NaN is rejected too: a non-finite
    // radius silently empties the path, and an empty mask erases everything
    // it was meant to reveal.
    if (!(r > 0) || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue

    // A source that clamp-holds (keyframes starting after the sampled time)
    // repeats its endpoint. Those samples are geometrically inside the one
    // before them, so they cost evaluation and a subpath to draw nothing.
    const prev = out[out.length - 1]
    if (prev && prev.x === p[0] && prev.y === p[1] && r <= prev.r) continue

    out.push({ x: p[0], y: p[1], r })
  }
  return out
}

export function drawTrailLayer(
  ctx: CanvasRenderingContext2D,
  layer: TrailLayer,
  tMs: number,
  rctx: RenderContext,
): void {
  const samples = trailSamples(layer, tMs)
  if (samples.length === 0) return

  // Default to an opaque fill so a bare trail is usable as a mask without
  // spelling out a colour that only its alpha matters for.
  const fill = layer.fill ?? (layer.stroke ? undefined : '#ffffff')

  if (fill) {
    // One path, one fill: overlapping circles must not composite twice.
    ctx.beginPath()
    for (const s of samples) {
      ctx.moveTo(s.x + s.r, s.y)
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
    }
    ctx.fillStyle = resolveColor(fill, rctx.resolve) ?? fill
    ctx.fill()
  }

  if (layer.stroke) {
    ctx.strokeStyle = resolveColor(layer.stroke.color, rctx.resolve) ?? layer.stroke.color
    ctx.lineWidth = layer.stroke.width
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    samples.forEach((s, i) => {
      if (i === 0) ctx.moveTo(s.x, s.y)
      else ctx.lineTo(s.x, s.y)
    })
    ctx.stroke()
  }
}
