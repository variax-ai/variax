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

import type { Planar } from './frame'

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

/**
 * A cheap perceptual signature, used to notice scene changes so a shared
 * residual can be recomputed when the frame it was derived from stops
 * resembling the frame it is being applied to.
 */
export function frameSignature(tensor: Float32Array, size: number): Float32Array {
  const cells = 16
  const step = Math.max(1, Math.floor(size / cells))
  const plane = size * size
  const signature = new Float32Array(cells * cells)

  for (let cy = 0; cy < cells; cy++) {
    for (let cx = 0; cx < cells; cx++) {
      let sum = 0
      let count = 0
      for (let y = cy * step; y < Math.min((cy + 1) * step, size); y++) {
        for (let x = cx * step; x < Math.min((cx + 1) * step, size); x++) {
          const i = y * size + x
          // Rec. 601 luma, on data already in [-1, 1].
          sum +=
            0.299 * tensor[i] +
            0.587 * tensor[plane + i] +
            0.114 * tensor[2 * plane + i]
          count += 1
        }
      }
      signature[cy * cells + cx] = count ? sum / count : 0
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
