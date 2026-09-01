/**
 * Conversions between RGBA frames and the planar float tensors the models want.
 *
 * Two conventions come from the reference implementation and must not drift:
 * pixels are normalised to **[-1, 1]** (not [0, 1] — `x / 127.5 - 1`), and the
 * model tensor is NCHW, `[1, 3, size, size]`.
 */

import type { Frame, Planar } from './frame'
import { resizePlanar, type CropBox } from './resize'

/** Aspect ratios beyond this are centre-cropped before the model sees them. */
export const ASPECT_RATIO_LIMIT = 2.0

/**
 * The region of a frame the watermark is applied to.
 *
 * Normally the whole frame. Very wide or very tall frames are reduced to a
 * centre square first: squashing a 21:9 banner into a 256x256 input distorts it
 * past what the model handles, and the mark does not survive.
 */
export function watermarkRegion(width: number, height: number): CropBox {
  const aspect = width > height ? width / height : height / width
  if (aspect <= ASPECT_RATIO_LIMIT) {
    return { x: 0, y: 0, width, height }
  }
  const size = Math.min(width, height)
  return {
    x: Math.floor((width - size) / 2),
    y: Math.floor((height - size) / 2),
    width: size,
    height: size,
  }
}

/** Split an RGBA frame into three float planes of 0..255 values, dropping alpha. */
export function frameToPlanar(frame: Frame): Planar {
  const { width, height, data } = frame
  const plane = width * height
  const out = new Float32Array(3 * plane)

  for (let i = 0; i < plane; i++) {
    const p = i * 4
    out[i] = data[p]
    out[plane + i] = data[p + 1]
    out[2 * plane + i] = data[p + 2]
  }
  return { width, height, channels: 3, data: out }
}

/**
 * Resample the region to the model's input size and normalise to [-1, 1],
 * yielding an NCHW tensor ready for inference.
 */
export function toModelTensor(
  frame: Frame,
  size: number,
  region: CropBox,
): Float32Array {
  const planar = frameToPlanar(frame)
  const resized = resizePlanar(planar, size, size, region)

  const out = new Float32Array(resized.data.length)
  for (let i = 0; i < out.length; i++) {
    out[i] = resized.data[i] / 127.5 - 1
  }
  return out
}

/**
 * Resample a model-sized residual up to the region it will be applied to, and
 * scale it into the byte space of the frames it will be added to.
 *
 * Split out from `applyResidual` so a residual shared across a shot is
 * upscaled once rather than once per frame — for a 30s 1080p clip that is one
 * resample instead of nine hundred identical ones. `strength` is folded in for
 * the same reason: it turns the per-frame loop into a single add per channel,
 * which at 1080p is six million multiplies that no longer happen per frame.
 *
 * Folding the conversion in costs a little precision, since the scaled value is
 * stored back into the residual's `Float32Array` rather than staying in a
 * double until it meets the pixel. The deltas are small — a few byte units —
 * so the error is around 1e-7 of a byte, which only matters for a value sitting
 * that close to a rounding boundary.
 */
export function upscaleResidual(
  residual: Planar,
  region: CropBox,
  strength: number,
): Planar {
  const upscaled = resizePlanar(residual, region.width, region.height)
  const factor = strength * 127.5
  const data = upscaled.data
  for (let i = 0; i < data.length; i++) data[i] *= factor
  return upscaled
}

/**
 * Add an upscaled, strength-scaled residual into a frame, in place.
 *
 * The reference adds the residual in [-1, 1] space, clips, and converts back to
 * bytes. This does the same arithmetic in byte space instead, which is
 * identical rather than merely close: the mapping between the two is linear, so
 * clipping to [-1, 1] before scaling and clamping to [0, 255] after are the
 * same operation, and `Uint8ClampedArray` already clamps and rounds
 * half-to-even on assignment. What is left is one add per channel.
 *
 * Alpha is left untouched, and so is everything outside `region`.
 */
export function applyResidual(
  frame: Frame,
  upscaled: Planar,
  region: CropBox,
): void {
  // The clipping the reference does explicitly now lives in the array type, so
  // the type has become load-bearing at runtime. A plain `Uint8Array` — a
  // Buffer from a decoder, or anything a JavaScript caller hands in — wraps
  // instead of clamping, turning a highlight at 250 into 6 rather than 255.
  // Marking through `cloneFrame` never sees this; marking `inPlace` does.
  if (!(frame.data instanceof Uint8ClampedArray)) {
    throw new Error(
      'frame data must be a Uint8ClampedArray: the residual is added in byte ' +
        'space and relies on its clamping, where a plain Uint8Array wraps',
    )
  }
  const plane = region.width * region.height
  if (
    upscaled.width !== region.width ||
    upscaled.height !== region.height ||
    upscaled.data.length < 3 * plane
  ) {
    throw new Error(
      `residual is ${upscaled.width}x${upscaled.height}x${upscaled.channels} but the region needs ${region.width}x${region.height}x3; upscale it first`,
    )
  }
  const data = frame.data
  const delta = upscaled.data

  // The common case — no centre crop — is one contiguous walk of both arrays,
  // with no per-pixel address arithmetic at all.
  if (
    region.x === 0 &&
    region.y === 0 &&
    region.width === frame.width &&
    region.height === frame.height
  ) {
    for (let i = 0, p = 0; i < plane; i++, p += 4) {
      data[p] += delta[i]
      data[p + 1] += delta[plane + i]
      data[p + 2] += delta[2 * plane + i]
    }
    return
  }

  for (let y = 0; y < region.height; y++) {
    let src = y * region.width
    let dst = ((region.y + y) * frame.width + region.x) * 4

    for (let x = 0; x < region.width; x++, src++, dst += 4) {
      data[dst] += delta[src]
      data[dst + 1] += delta[plane + src]
      data[dst + 2] += delta[2 * plane + src]
    }
  }
}

/** Copy a frame so embedding can return a new one without mutating the input. */
export function cloneFrame(frame: Frame): Frame {
  return {
    width: frame.width,
    height: frame.height,
    data: new Uint8ClampedArray(frame.data),
  }
}
