import { describe, expect, it } from 'vitest'
import { createFrame, type Frame, type Planar } from './frame'
import { applyResidual, upscaleResidual, watermarkRegion } from './pixels'
import { resizePlanar, type CropBox } from './resize'

/**
 * The reference formula, in the [-1, 1] space the Python implementation works
 * in: normalise the pixel, add the residual, clip, scale back to a byte.
 *
 * `applyResidual` does this in byte space instead, which is faster and should
 * be arithmetically identical. This function is what "identical" is measured
 * against, so it is written from the reference rather than from the code under
 * test — and takes the *unscaled* residual, since folding `strength` into the
 * residual is part of what is being checked.
 */
function reference(
  frame: Frame,
  residual: Planar,
  region: CropBox,
  strength: number,
): void {
  const plane = region.width * region.height

  for (let y = 0; y < region.height; y++) {
    for (let x = 0; x < region.width; x++) {
      const src = y * region.width + x
      const dst = ((region.y + y) * frame.width + (region.x + x)) * 4

      for (let c = 0; c < 3; c++) {
        const base = frame.data[dst + c] / 127.5 - 1
        const value = base + residual.data[c * plane + src] * strength
        const clipped = value < -1 ? -1 : value > 1 ? 1 : value
        frame.data[dst + c] = clipped * 127.5 + 127.5
      }
    }
  }
}

/** Deterministic pseudo-random source, so a failure is reproducible. */
function random(seed: number): () => number {
  let state = seed
  return () => (state = (state * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
}

function noisyFrame(width: number, height: number, rnd: () => number): Frame {
  const frame = createFrame(width, height)
  for (let i = 0; i < frame.data.length; i++) frame.data[i] = Math.floor(rnd() * 256)
  return frame
}

/** A model-sized residual, at the amplitude the encoder actually produces. */
function modelResidual(rnd: () => number, amplitude = 0.04): Planar {
  const size = 256
  const data = new Float32Array(3 * size * size)
  for (let i = 0; i < data.length; i++) data[i] = (rnd() - 0.5) * 2 * amplitude
  return { width: size, height: size, channels: 3, data }
}

function copy(frame: Frame): Frame {
  return { ...frame, data: new Uint8ClampedArray(frame.data) }
}

describe('applyResidual', () => {
  it('matches the reference [-1, 1] formula byte for byte', () => {
    const rnd = random(20260901)
    const frame = noisyFrame(160, 90, rnd)
    const residual = modelResidual(rnd)
    const region = watermarkRegion(frame.width, frame.height)
    const strength = 1.0

    const expected = copy(frame)
    reference(expected, resizePlanar(residual, region.width, region.height), region, strength)

    const actual = copy(frame)
    applyResidual(actual, upscaleResidual(residual, region, strength), region)

    expect(Array.from(actual.data)).toEqual(Array.from(expected.data))
  })

  it('clips rather than wrapping at both ends', () => {
    const frame = createFrame(4, 4)
    frame.data.fill(128)
    const plane = 16
    const region = { x: 0, y: 0, width: 4, height: 4 }

    // Far beyond what the encoder produces, in both directions.
    const residual: Planar = {
      width: 4,
      height: 4,
      channels: 3,
      data: new Float32Array(3 * plane),
    }
    for (let i = 0; i < plane; i++) {
      const sign = i % 2 === 0 ? 5 : -5
      for (let c = 0; c < 3; c++) residual.data[c * plane + i] = sign
    }

    applyResidual(frame, upscaleResidual(residual, region, 1.0), region)

    for (let i = 0; i < plane; i++) {
      const expected = i % 2 === 0 ? 255 : 0
      for (let c = 0; c < 3; c++) expect(frame.data[i * 4 + c]).toBe(expected)
    }
  })

  it('leaves alpha and everything outside the region untouched', () => {
    const rnd = random(7)
    // 3:1, so `watermarkRegion` centre-crops and the region is a strict subset.
    const frame = noisyFrame(96, 32, rnd)
    for (let i = 3; i < frame.data.length; i += 4) frame.data[i] = 200

    const region = watermarkRegion(frame.width, frame.height)
    expect(region).toEqual({ x: 32, y: 0, width: 32, height: 32 })

    const before = copy(frame)
    applyResidual(frame, upscaleResidual(modelResidual(rnd), region, 1.0), region)

    for (let y = 0; y < frame.height; y++) {
      for (let x = 0; x < frame.width; x++) {
        const p = (y * frame.width + x) * 4
        expect(frame.data[p + 3]).toBe(before.data[p + 3])
        if (x >= region.x && x < region.x + region.width) continue
        for (let c = 0; c < 3; c++) expect(frame.data[p + c]).toBe(before.data[p + c])
      }
    }
  })

  it('gives a cropped region the same result as the whole-frame path', () => {
    const rnd = random(99)
    const region = { x: 8, y: 4, width: 32, height: 16 }
    const frame = noisyFrame(64, 32, rnd)
    const residual = modelResidual(rnd)
    const upscaled = upscaleResidual(residual, region, 1.0)

    const cropped = copy(frame)
    applyResidual(cropped, upscaled, region)

    // The same pixels, lifted out into a frame of their own, so the fast path
    // runs over them instead.
    const lifted = createFrame(region.width, region.height)
    for (let y = 0; y < region.height; y++) {
      for (let x = 0; x < region.width; x++) {
        const from = ((region.y + y) * frame.width + region.x + x) * 4
        const to = (y * region.width + x) * 4
        for (let c = 0; c < 4; c++) lifted.data[to + c] = frame.data[from + c]
      }
    }
    applyResidual(lifted, upscaled, { ...region, x: 0, y: 0 })

    for (let y = 0; y < region.height; y++) {
      for (let x = 0; x < region.width; x++) {
        const a = ((region.y + y) * frame.width + region.x + x) * 4
        const b = (y * region.width + x) * 4
        for (let c = 0; c < 3; c++) expect(cropped.data[a + c]).toBe(lifted.data[b + c])
      }
    }
  })

  it('refuses a residual that has not been upscaled to the region', () => {
    const frame = createFrame(64, 64)
    const region = watermarkRegion(64, 64)
    const residual = modelResidual(random(1))

    expect(() => applyResidual(frame, residual, region)).toThrow(/upscale it first/)
  })
})

describe('upscaleResidual', () => {
  it('folds strength in, so zero strength leaves the frame alone', () => {
    const rnd = random(3)
    const frame = noisyFrame(64, 64, rnd)
    const region = watermarkRegion(frame.width, frame.height)
    const before = copy(frame)

    applyResidual(frame, upscaleResidual(modelResidual(rnd), region, 0), region)

    expect(Array.from(frame.data)).toEqual(Array.from(before.data))
  })

  it('scales linearly with strength', () => {
    const rnd = random(4)
    const region = { x: 0, y: 0, width: 32, height: 32 }
    const residual = modelResidual(rnd)

    const half = upscaleResidual(residual, region, 0.5)
    const full = upscaleResidual(residual, region, 1.0)

    for (let i = 0; i < full.data.length; i++) {
      expect(half.data[i]).toBeCloseTo(full.data[i] / 2, 5)
    }
  })
})
