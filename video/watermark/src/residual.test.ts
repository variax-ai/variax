import { describe, expect, it } from 'vitest'
import { createFrame, type Frame } from './frame'
import {
  computeResidual,
  frameSignature,
  signatureDistance,
} from './residual'

const SIZE = 8
const PLANE = SIZE * SIZE

function constant(value: number): Float32Array {
  return new Float32Array(3 * PLANE).fill(value)
}

describe('computeResidual', () => {
  it('is zero when the encoder returns the cover unchanged', () => {
    const cover = constant(0.25)
    const residual = computeResidual(cover, cover, SIZE)

    for (const v of residual.data) expect(v).toBeCloseTo(0, 6)
  })

  it('removes the per-channel mean', () => {
    const cover = constant(0)
    const stego = new Float32Array(3 * PLANE)
    // Each channel gets a different constant offset — pure colour shift, which
    // is exactly what mean removal exists to strip.
    for (let c = 0; c < 3; c++) {
      stego.fill(0.1 * (c + 1), c * PLANE, (c + 1) * PLANE)
    }

    const residual = computeResidual(cover, stego, SIZE)
    for (const v of residual.data) expect(v).toBeCloseTo(0, 6)
  })

  it('keeps structure while removing the offset', () => {
    const cover = constant(0)
    const stego = new Float32Array(3 * PLANE)
    for (let c = 0; c < 3; c++) {
      for (let i = 0; i < PLANE; i++) {
        // A constant offset plus alternating detail.
        stego[c * PLANE + i] = 0.5 + (i % 2 === 0 ? 0.1 : -0.1)
      }
    }

    const residual = computeResidual(cover, stego, SIZE)
    for (let c = 0; c < 3; c++) {
      let sum = 0
      for (let i = 0; i < PLANE; i++) sum += residual.data[c * PLANE + i]
      expect(sum / PLANE).toBeCloseTo(0, 5)

      expect(residual.data[c * PLANE]).toBeCloseTo(0.1, 5)
      expect(residual.data[c * PLANE + 1]).toBeCloseTo(-0.1, 5)
    }
  })

  it('clamps the encoder output to [-1, 1] before differencing', () => {
    const cover = constant(0)
    const stego = constant(5) // far outside the valid range
    const residual = computeResidual(cover, stego, SIZE)

    // Clamped to 1, then mean-removed, so everything collapses to zero rather
    // than propagating a 5.0 residual into the frame.
    for (const v of residual.data) expect(v).toBeCloseTo(0, 6)
  })

  it('rejects mismatched tensor sizes', () => {
    expect(() =>
      computeResidual(constant(0), new Float32Array(10), SIZE),
    ).toThrow(/expected/)
  })

  it('reports the model input size', () => {
    const residual = computeResidual(constant(0), constant(0), SIZE)
    expect(residual.width).toBe(SIZE)
    expect(residual.height).toBe(SIZE)
    expect(residual.channels).toBe(3)
  })
})

describe('frameSignature', () => {
  const WIDTH = 64
  const HEIGHT = 64
  const REGION = { x: 0, y: 0, width: WIDTH, height: HEIGHT }

  function flatFrame(grey: number): Frame {
    const frame = createFrame(WIDTH, HEIGHT)
    for (let i = 0; i < WIDTH * HEIGHT; i++) {
      frame.data[i * 4] = grey
      frame.data[i * 4 + 1] = grey
      frame.data[i * 4 + 2] = grey
      frame.data[i * 4 + 3] = 255
    }
    return frame
  }

  it('gives identical frames a distance of zero', () => {
    const frame = flatFrame(90)
    const distance = signatureDistance(
      frameSignature(frame, REGION),
      frameSignature(frame, REGION),
    )
    expect(distance).toBeCloseTo(0, 6)
  })

  it('separates a cut from a small change', () => {
    const base = flatFrame(90)
    const nudged = flatFrame(91) // ~0.008 in [-1, 1] units
    const cut = flatFrame(220)

    const small = signatureDistance(
      frameSignature(base, REGION),
      frameSignature(nudged, REGION),
    )
    const large = signatureDistance(
      frameSignature(base, REGION),
      frameSignature(cut, REGION),
    )

    // The default scene-change threshold is 0.05, and it has to sit between
    // these two for `sharedResidual` to recompute on cuts but not on drift.
    expect(small).toBeLessThan(0.05)
    expect(large).toBeGreaterThan(0.05)
  })

  it('reads only inside the region', () => {
    // Everything outside the region differs; the signature must not notice.
    const a = flatFrame(90)
    const b = flatFrame(90)
    const region = { x: 0, y: 0, width: 8, height: 8 }
    for (let i = 8 * WIDTH; i < WIDTH * HEIGHT; i++) b.data[i * 4] = 255

    expect(
      signatureDistance(frameSignature(a, region), frameSignature(b, region)),
    ).toBeCloseTo(0, 6)
  })
})
