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
 * Add an upscaled residual back into a frame, in place.
 *
 * Mirrors the reference: the residual is scaled by `strength`, added in [-1, 1]
 * space, clipped, and converted back to bytes. Alpha is left untouched, and so
 * is everything outside `region`.
 */
export function applyResidual(
  frame: Frame,
  residual: Planar,
  region: CropBox,
  strength: number,
): void {
  const upscaled = resizePlanar(residual, region.width, region.height)
  const plane = region.width * region.height

  for (let y = 0; y < region.height; y++) {
    for (let x = 0; x < region.width; x++) {
      const src = y * region.width + x
      const dst = ((region.y + y) * frame.width + (region.x + x)) * 4

      for (let c = 0; c < 3; c++) {
        const base = frame.data[dst + c] / 127.5 - 1
        const value = base + upscaled.data[c * plane + src] * strength
        const clipped = value < -1 ? -1 : value > 1 ? 1 : value
        // Uint8ClampedArray rounds half-to-even on assignment, matching the
        // reference's uint8 cast closely enough for the model.
        frame.data[dst + c] = clipped * 127.5 + 127.5
      }
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
