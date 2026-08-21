import type { Effect, Layer } from '@variax-ai/video-schema'
import type { ResolveContext } from './types'
import { layerIsVisible } from './condition'
import { evaluateNumber } from './animate'
import { layerMatrix, type Matrix } from './transform'
import { trailSamples } from './layers/trail'

/** An axis-aligned box in the coordinate space of the layer's parent. */
export interface Bounds {
  x: number
  y: number
  w: number
  h: number
}

/** The axis-aligned box containing `b`'s four corners after `m`. */
function transformBounds(b: Bounds, m: Matrix): Bounds {
  const xs: number[] = []
  const ys: number[] = []
  for (const [px, py] of [
    [b.x, b.y],
    [b.x + b.w, b.y],
    [b.x, b.y + b.h],
    [b.x + b.w, b.y + b.h],
  ]) {
    xs.push(m[0] * px + m[2] * py + m[4])
    ys.push(m[1] * px + m[3] * py + m[5])
  }
  return boundsFrom(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys))
}

function boundsFrom(left: number, top: number, right: number, bottom: number): Bounds {
  return { x: left, y: top, w: right - left, h: bottom - top }
}

export function expandBounds(b: Bounds, by: number): Bounds {
  if (by <= 0) return b
  return { x: b.x - by, y: b.y - by, w: b.w + by * 2, h: b.h + by * 2 }
}

export function unionBounds(a: Bounds, b: Bounds): Bounds {
  return boundsFrom(
    Math.min(a.x, b.x),
    Math.min(a.y, b.y),
    Math.max(a.x + a.w, b.x + b.w),
    Math.max(a.y + a.h, b.y + b.h),
  )
}

export function intersectBounds(a: Bounds, b: Bounds): Bounds {
  return boundsFrom(
    Math.max(a.x, b.x),
    Math.max(a.y, b.y),
    Math.min(a.x + a.w, b.x + b.w),
    Math.min(a.y + a.h, b.y + b.h),
  )
}

/** Grows a box to whole pixels, so a caller can translate by integers. */
export function alignToPixels(b: Bounds): Bounds {
  return boundsFrom(
    Math.floor(b.x),
    Math.floor(b.y),
    Math.ceil(b.x + b.w),
    Math.ceil(b.y + b.h),
  )
}

export function isEmptyBounds(b: Bounds): boolean {
  return !(b.w > 0) || !(b.h > 0)
}

const EMPTY: Bounds = { x: 0, y: 0, w: 0, h: 0 }

/**
 * How far a shadow reaches past the geometry casting it. `shadowBlur` is twice
 * the gaussian's standard deviation, and the tail is faint but not nothing, so
 * the padding is deliberately generous — a mask clipped a pixel short is a
 * visible seam, while a box a few pixels too large costs almost nothing.
 */
function shadowPadding(blur: number): number {
  return blur * 1.5
}

/** The extent a filter effect adds, in the space it is applied in. */
export function effectExtent(effects: Effect[] | undefined, tMs: number): number {
  if (!effects) return 0
  let pad = 0
  for (const effect of effects) {
    if (effect.type === 'gaussianBlur') {
      pad = Math.max(pad, evaluateNumber(effect.radius, tMs) * 3)
    } else if (effect.type === 'dropShadow') {
      const blur = evaluateNumber(effect.blur, tMs)
      const ox = effect.offsetX ? evaluateNumber(effect.offsetX, tMs) : 0
      const oy = effect.offsetY ? evaluateNumber(effect.offsetY, tMs) : 0
      pad = Math.max(pad, shadowPadding(blur) + Math.max(Math.abs(ox), Math.abs(oy)))
    }
  }
  return pad
}

/**
 * The layer's extent before its own transform is applied, or null when it is
 * not cheaply knowable.
 */
function localBounds(layer: Layer, tMs: number, resolve: ResolveContext): Bounds | null {
  switch (layer.type) {
    case 'shape': {
      // Shapes are drawn centred on the origin; `position` is the translation.
      if (layer.shape === 'path') return null
      if (!layer.size) return EMPTY
      const [w, h] = layer.size
      if (!Number.isFinite(w) || !Number.isFinite(h)) return null
      let b =
        layer.shape === 'line'
          ? { x: -w / 2, y: 0, w, h: 0 }
          : { x: -w / 2, y: -h / 2, w, h }
      if (layer.stroke) b = expandBounds(b, layer.stroke.width / 2)
      if (layer.shadow) {
        const pad = shadowPadding(layer.shadow.blur)
        const ox = layer.shadow.offsetX ?? 0
        const oy = layer.shadow.offsetY ?? 0
        b = unionBounds(b, expandBounds({ ...b, x: b.x + ox, y: b.y + oy }, pad))
      }
      return b
    }

    case 'trail': {
      const samples = trailSamples(layer, tMs)
      if (samples.length === 0) return EMPTY
      const pad = layer.stroke ? layer.stroke.width / 2 : 0
      let b: Bounds | null = null
      for (const s of samples) {
        const circle = { x: s.x - s.r, y: s.y - s.r, w: s.r * 2, h: s.r * 2 }
        b = b ? unionBounds(b, circle) : circle
      }
      return expandBounds(b as Bounds, pad)
    }

    case 'image':
      // A frameless image paints at its intrinsic size, which depends on the
      // host's registry rather than the document.
      return layer.frame ? { x: layer.frame.x, y: layer.frame.y, w: layer.frame.w, h: layer.frame.h } : null

    case 'group': {
      let b: Bounds | null = null
      for (const child of layer.children) {
        const cb = layerBounds(child, tMs, resolve)
        if (!cb) return null
        // A child that paints nothing has an empty box at the origin. Unioning
        // it would stretch the group all the way back to (0, 0) — a crop the
        // size of the document for a group that moved somewhere else.
        if (isEmptyBounds(cb)) continue
        b = b ? unionBounds(b, cb) : cb
      }
      return b ?? EMPTY
    }

    default:
      // text needs measurement; ref, repeater, captionSequence, dataViz,
      // statBeat and compositeMask can each paint anywhere their contents do.
      return null
  }
}

/**
 * The region a layer can paint into, in document coordinates, or null when that
 * cannot be derived without drawing it.
 *
 * A null is not a failure — it means "assume the whole document". A non-null
 * box is a promise the layer paints nothing outside it, so every contributor to
 * a layer's extent (stroke, shadow, blur, transform) has to be accounted for
 * here, generously. Callers use it to size buffers, so a box that is too small
 * clips the render while one that is too large only costs pixels.
 */
export function layerBounds(layer: Layer, tMs: number, resolve: ResolveContext): Bounds | null {
  // drawLayer's own gate, not a copy of it: a layer outside its window, or one
  // whose `visibleIf` does not hold, paints nothing at all — a known, and
  // maximally useful, extent. A second copy of this rule would size buffers for
  // layers the renderer no longer draws.
  if (!layerIsVisible(layer, tMs, resolve)) return EMPTY

  const local = localBounds(layer, tMs, resolve)
  if (!local) return null
  // Nothing to place: a layer that paints nowhere paints nowhere transformed.
  if (local.w === 0 && local.h === 0) return EMPTY

  const effects = 'effects' in layer ? layer.effects : undefined
  const pad = effectExtent(effects, tMs)

  const position = layer.type === 'ref' ? undefined : 'position' in layer ? layer.position : undefined
  const m = layerMatrix(position, layer.transform, tMs)

  // Whether a canvas filter is applied before or after the current transform is
  // implementation-defined, so the padding is applied in both spaces rather
  // than guessing which one the host uses.
  const b = transformBounds(expandBounds(local, pad), m)
  const out = expandBounds(b, pad)
  return Number.isFinite(out.x) && Number.isFinite(out.y) && Number.isFinite(out.w) && Number.isFinite(out.h)
    ? out
    : null
}

/**
 * The largest filter extent anywhere in a layer subtree.
 *
 * A canvas filter is applied to the thing being drawn, and implementations
 * bound that work by the destination surface — so a blurred draw near the edge
 * of a small buffer pulls in transparency that a full-size buffer would have
 * filled with real content. Anything drawing into a cropped buffer has to grow
 * it by this much for the result inside the crop to match.
 */
export function subtreeEffectExtent(layer: Layer, tMs: number): number {
  let extent = 'effects' in layer ? effectExtent(layer.effects, tMs) : 0
  if (layer.type === 'group') {
    for (const child of layer.children) extent = Math.max(extent, subtreeEffectExtent(child, tMs))
  } else if (layer.type === 'repeater') {
    extent = Math.max(extent, subtreeEffectExtent(layer.child, tMs))
  } else if (layer.type === 'compositeMask') {
    extent = Math.max(extent, subtreeEffectExtent(layer.mask, tMs))
    if (typeof layer.source === 'object' && layer.source !== null) {
      extent = Math.max(extent, subtreeEffectExtent(layer.source, tMs))
    }
  }
  return extent
}
