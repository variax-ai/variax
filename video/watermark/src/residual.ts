/**
 * Turning the encoder's output into a residual that can be added to a frame.
 *
 * This follows the Python reference rather than the Rust port, which differ
 * here: Python subtracts the per-channel mean and leaves the magnitude alone,
 * while Rust clamps to +/-0.2 and does a boundary-artifact pass instead. Python
 * is the implementation the models were trained and tuned against, so it wins.
 *
 * Subtracting the per-channel mean matters more than it looks. Without it the
 * residual carries a constant colour offset, which on the large flat fields
 * typical of motion graphics reads as a visible tint over the whole frame —
 * exactly the content where a watermark most needs to stay invisible.
 */

import type { CropBox } from './resize'
import type { Frame, Planar } from './frame'

/**
 * `clamp(stego, -1, 1) - cover`, then per-channel mean removal.
 *
 * Both inputs are NCHW `[1, 3, size, size]` tensors normalised to [-1, 1].
 */
export function computeResidual(
  cover: Float32Array,
  stego: Float32Array,
  size: number,
): Planar {
  const plane = size * size
  if (cover.length !== 3 * plane || stego.length !== 3 * plane) {
    throw new Error(
      `expected ${3 * plane} values per tensor, got cover ${cover.length} and stego ${stego.length}`,
    )
  }

  const data = new Float32Array(3 * plane)
  for (let c = 0; c < 3; c++) {
    const base = c * plane

    let sum = 0
    for (let i = 0; i < plane; i++) {
      const s = stego[base + i]
      const clamped = s < -1 ? -1 : s > 1 ? 1 : s
      const value = clamped - cover[base + i]
      data[base + i] = value
      sum += value
    }

    const mean = sum / plane
    for (let i = 0; i < plane; i++) data[base + i] -= mean
  }

  return { width: size, height: size, channels: 3, data }
}

/** Grid resolution of a frame signature, per axis. */
const SIGNATURE_CELLS = 16

/**
 * A cheap perceptual signature, used to notice scene changes so a shared
 * residual can be recomputed when the frame it was derived from stops
 * resembling the frame it is being applied to.
 *
 * Sampled straight from the RGBA frame rather than from the model tensor, and
 * on a sparse grid rather than every pixel. That is the whole point: deciding
 * whether the residual can be reused must not cost more than reusing it. This
 * reads 1024 pixels regardless of resolution, so most frames of a shot never
 * pay for the full-frame resample the model input would need.
 */
export function frameSignature(frame: Frame, region: CropBox): Float32Array {
  const cells = SIGNATURE_CELLS
  const signature = new Float32Array(cells * cells)

  for (let cy = 0; cy < cells; cy++) {
    for (let cx = 0; cx < cells; cx++) {
      let sum = 0
      // Four samples per cell: one pixel would be too easily fooled by a
      // single moving element, a full average too expensive.
      for (let sy = 0; sy < 2; sy++) {
        for (let sx = 0; sx < 2; sx++) {
          const fx =
            region.x +
            Math.min(
              region.width - 1,
              Math.floor(((cx + (sx + 0.5) / 2) / cells) * region.width),
            )
          const fy =
            region.y +
            Math.min(
              region.height - 1,
              Math.floor(((cy + (sy + 0.5) / 2) / cells) * region.height),
            )
          const p = (fy * frame.width + fx) * 4

          // Rec. 601 luma, rescaled to [-1, 1] so the scene-change threshold
          // keeps the same meaning as the model's normalised range.
          const luma =
            0.299 * frame.data[p] +
            0.587 * frame.data[p + 1] +
            0.114 * frame.data[p + 2]
          sum += luma / 127.5 - 1
        }
      }
      signature[cy * cells + cx] = sum / 4
    }
  }
  return signature
}

/** Mean absolute difference between two signatures, in [-1, 1] units. */
export function signatureDistance(a: Float32Array, b: Float32Array): number {
  let total = 0
  for (let i = 0; i < a.length; i++) total += Math.abs(a[i] - b[i])
  return total / a.length
}
