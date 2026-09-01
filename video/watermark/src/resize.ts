/**
 * Bilinear resampling, matching PIL's `Image.resize(..., BILINEAR)`.
 *
 * The choice of resampler is not cosmetic here. TrustMark's reference pipeline
 * downscales the cover image with PIL, and PIL scales its filter support by the
 * downscale factor — so a 1080p frame reduced to 256px is *area-averaged*, not
 * point-sampled. A naive bilinear sampler throws away most of the frame and
 * feeds the model something it was never trained on, which shows up as a
 * watermark that decodes at chance level rather than as an obvious failure.
 *
 * Upscaling is the same code path: with a scale factor below 1 the support
 * stays at 1.0 and the triangle filter degenerates to ordinary linear
 * interpolation, which is what `torch.nn.functional.interpolate(mode='bilinear',
 * align_corners=False)` does when the reference upscales the residual.
 */

import type { Planar } from './frame'

/** Half-width of the triangle (bilinear) kernel. */
const FILTER_SUPPORT = 1.0

function triangle(x: number): number {
  const a = x < 0 ? -x : x
  return a < 1.0 ? 1.0 - a : 0.0
}

export interface Coefficients {
  /** For each output index, where its support window starts in the input. */
  bounds: Int32Array
  /** Flattened weights, `kernelSize` per output index. */
  weights: Float32Array
  kernelSize: number
}

/**
 * Precompute the filter weights for one axis.
 *
 * @param inSize  input length along this axis
 * @param outSize output length along this axis
 * @param start   start of the region being resampled (for cropping)
 * @param end     end of that region
 */
export function computeCoefficients(
  inSize: number,
  outSize: number,
  start: number,
  end: number,
): Coefficients {
  const scale = (end - start) / outSize
  const filterScale = scale < 1.0 ? 1.0 : scale
  const support = FILTER_SUPPORT * filterScale
  const kernelSize = Math.ceil(support) * 2 + 1

  const bounds = new Int32Array(outSize)
  const weights = new Float32Array(outSize * kernelSize)
  const invScale = 1.0 / filterScale

  for (let out = 0; out < outSize; out++) {
    const center = start + (out + 0.5) * scale

    let min = Math.trunc(center - support + 0.5)
    if (min < 0) min = 0
    let max = Math.trunc(center + support + 0.5)
    if (max > inSize) max = inSize

    const count = max - min
    bounds[out] = min

    let total = 0
    const base = out * kernelSize
    for (let i = 0; i < count; i++) {
      const w = triangle((i + min - center + 0.5) * invScale)
      weights[base + i] = w
      total += w
    }
    // A window can fall entirely outside the image at the very edge; leaving
    // the weights at zero there would produce black borders.
    if (total !== 0) {
      for (let i = 0; i < count; i++) weights[base + i] /= total
    } else if (count > 0) {
      weights[base] = 1
    }
    // Record the usable width by zeroing the tail.
    for (let i = count; i < kernelSize; i++) weights[base + i] = 0
  }

  return { bounds, weights, kernelSize }
}

export interface CropBox {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Resample `src` to `outWidth` x `outHeight`, optionally resampling only the
 * region `box` (used to centre-crop extreme aspect ratios before the model
 * sees them).
 */
export function resizePlanar(
  src: Planar,
  outWidth: number,
  outHeight: number,
  box?: CropBox,
): Planar {
  const region = box ?? { x: 0, y: 0, width: src.width, height: src.height }
  const channels = src.channels

  const horizontal = computeCoefficients(
    src.width,
    outWidth,
    region.x,
    region.x + region.width,
  )
  const vertical = computeCoefficients(
    src.height,
    outHeight,
    region.y,
    region.y + region.height,
  )

  // Horizontal pass: full input height, target width.
  const mid = new Float32Array(channels * src.height * outWidth)
  for (let c = 0; c < channels; c++) {
    const srcPlane = c * src.width * src.height
    const midPlane = c * src.height * outWidth
    for (let y = 0; y < src.height; y++) {
      const srcRow = srcPlane + y * src.width
      const midRow = midPlane + y * outWidth
      for (let x = 0; x < outWidth; x++) {
        const min = horizontal.bounds[x]
        const base = x * horizontal.kernelSize
        let sum = 0
        for (let i = 0; i < horizontal.kernelSize; i++) {
          const w = horizontal.weights[base + i]
          if (w !== 0) sum += src.data[srcRow + min + i] * w
        }
        mid[midRow + x] = sum
      }
    }
  }

  // Vertical pass.
  const out = new Float32Array(channels * outHeight * outWidth)
  for (let c = 0; c < channels; c++) {
    const midPlane = c * src.height * outWidth
    const outPlane = c * outHeight * outWidth
    for (let y = 0; y < outHeight; y++) {
      const min = vertical.bounds[y]
      const base = y * vertical.kernelSize
      const outRow = outPlane + y * outWidth
      for (let x = 0; x < outWidth; x++) {
        let sum = 0
        for (let i = 0; i < vertical.kernelSize; i++) {
          const w = vertical.weights[base + i]
          if (w !== 0) sum += mid[midPlane + (min + i) * outWidth + x] * w
        }
        out[outRow + x] = sum
      }
    }
  }

  return { width: outWidth, height: outHeight, channels, data: out }
}
